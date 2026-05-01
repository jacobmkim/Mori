// Uploads generated recipes from a JSONL draft file to Supabase.
// This is Phase 2 of the new-recipe backfill — run after generate-new-recipes.mjs.
// Photos are added later via generate-images.mjs.
//
// Usage:
//   node scripts/upload-new-recipes.mjs                                       # upload all new entries (curated, defaults)
//   node scripts/upload-new-recipes.mjs --dry-run                             # preview without inserting
//   node scripts/upload-new-recipes.mjs --draft scripts/foo.json              # custom draft path
//   node scripts/upload-new-recipes.mjs --source community                    # set source_type (curated|community|imported)
//   node scripts/upload-new-recipes.mjs --moderation-status pending           # set moderation_status (pending|approved|rejected)
//   node scripts/upload-new-recipes.mjs --is-public true                      # set is_public (true|false)
//
// Resume-safe: fetches existing Supabase titles before each run; only inserts rows
// whose title is not already in the DB (case-insensitive).

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Load .env ──────────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Config ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50;

const args     = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

function getFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const DRAFT_PATH = resolve(
  process.cwd(),
  getFlag('--draft') ?? 'scripts/new-recipes-draft.json'
);

const SOURCE_TYPE = getFlag('--source') ?? 'curated';
const MODERATION_STATUS = getFlag('--moderation-status'); // null → omit field
const IS_PUBLIC_RAW = getFlag('--is-public');             // null → omit field
const IS_PUBLIC = IS_PUBLIC_RAW === null
  ? null
  : IS_PUBLIC_RAW === 'true' ? true
  : IS_PUBLIC_RAW === 'false' ? false
  : 'INVALID';

// Validate against schema CHECK constraints (supabase/schema.sql:64 + add-recipe-submission.sql)
const VALID_SOURCES = ['curated', 'community', 'imported'];
const VALID_MOD_STATUS = ['pending', 'approved', 'rejected'];

if (!VALID_SOURCES.includes(SOURCE_TYPE)) {
  console.error(`Invalid --source "${SOURCE_TYPE}". Must be one of: ${VALID_SOURCES.join(', ')}`);
  process.exit(1);
}
if (MODERATION_STATUS !== null && !VALID_MOD_STATUS.includes(MODERATION_STATUS)) {
  console.error(`Invalid --moderation-status "${MODERATION_STATUS}". Must be one of: ${VALID_MOD_STATUS.join(', ')}`);
  process.exit(1);
}
if (IS_PUBLIC === 'INVALID') {
  console.error(`Invalid --is-public "${IS_PUBLIC_RAW}". Must be "true" or "false".`);
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getExistingTitles() {
  const titles = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('recipes')
      .select('title')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to fetch existing titles: ${error.message}`);
    if (!data || data.length === 0) break;
    titles.push(...data.map(r => r.title.toLowerCase().trim()));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return new Set(titles);
}

function loadDraft() {
  if (!existsSync(DRAFT_PATH)) {
    console.error(`Draft file not found: ${DRAFT_PATH}`);
    console.error('Run generate-new-recipes.mjs first.');
    process.exit(1);
  }

  const lines = readFileSync(DRAFT_PATH, 'utf8').split('\n').filter(l => l.trim());
  const entries = [];
  const parseErrors = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      // Validate required shape
      if (!entry.recipe || !entry.recipe.title) {
        parseErrors.push(`Line ${i + 1}: missing recipe.title`);
        continue;
      }
      entries.push(entry);
    } catch (err) {
      parseErrors.push(`Line ${i + 1}: invalid JSON — ${err.message}`);
    }
  }

  if (parseErrors.length > 0) {
    console.warn(`\nWarning: ${parseErrors.length} corrupted line(s) in draft file:`);
    parseErrors.forEach(e => console.warn(`  ${e}`));
  }

  return entries;
}

function buildRow(entry) {
  const { csvCuisine, csvMealPrep, recipe } = entry;

  // Prefer recipe.meal_prep_friendly if present, fall back to csvMealPrep
  const mealPrepFriendly =
    recipe.meal_prep_friendly !== undefined ? recipe.meal_prep_friendly : (csvMealPrep ?? false);

  const row = {
    title:              recipe.title,
    description:        recipe.description ?? '',
    cuisine:            csvCuisine,               // preserve as-is (e.g. "cajun,italian")
    source_type:        SOURCE_TYPE,
    ingredients:        recipe.ingredients ?? [],
    steps:              recipe.steps ?? [],
    prep_time_mins:     recipe.prep_time_mins ?? 0,
    cook_time_mins:     recipe.cook_time_mins ?? 0,
    servings:           recipe.servings ?? 4,
    dietary_tags:       recipe.dietary_tags ?? [],
    skill_level:        'home_cook',
    meal_prep_friendly: mealPrepFriendly,
    macros:             recipe.estimated_macros
                          ? { ...recipe.estimated_macros, isEstimated: true }
                          : null,
    badge:              'none',
    avg_rating:         parseFloat((4.0 + Math.random() * 0.9).toFixed(1)),
    cost_per_serving:   parseFloat((3.5 + Math.random() * 6).toFixed(2)),
    image_url:          null,
  };

  if (MODERATION_STATUS !== null) row.moderation_status = MODERATION_STATUS;
  if (IS_PUBLIC !== null) row.is_public = IS_PUBLIC;

  return row;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMori Recipe Uploader`);
  console.log(`Draft:        ${DRAFT_PATH}`);
  console.log(`Source:       ${SOURCE_TYPE}`);
  console.log(`Moderation:   ${MODERATION_STATUS ?? '(omit — DB default)'}`);
  console.log(`Is public:    ${IS_PUBLIC === null ? '(omit — DB default false)' : IS_PUBLIC}`);
  console.log(`Mode:         ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

  const entries = loadDraft();
  console.log(`Loaded ${entries.length} entries from draft file`);

  const existingTitles = await getExistingTitles();
  console.log(`${existingTitles.size} recipes already in Supabase\n`);

  // Partition into skip / todo
  const todo = [];
  const skipped = [];

  for (const entry of entries) {
    const key = entry.recipe.title.toLowerCase().trim();
    if (existingTitles.has(key)) {
      skipped.push(entry.recipe.title);
    } else {
      todo.push(entry);
    }
  }

  console.log(`${entries.length} entries in draft`);
  console.log(`  ${skipped.length} skipped (already in Supabase)`);
  console.log(`  ${todo.length} to insert\n`);

  if (todo.length === 0) {
    console.log('Nothing to insert — all recipes already exist in Supabase.');
    return;
  }

  if (isDryRun) {
    console.log('Recipes that would be inserted:');
    todo.forEach(e => console.log(`  [ ] ${e.recipe.title}  (${e.csvCuisine})`));
    console.log(`\nDry run complete — nothing inserted.`);
    return;
  }

  // Batch inserts
  let inserted = 0;
  let failed   = 0;
  const failedTitles = [];

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const rows  = [];

    // Build rows for this batch, catching per-entry errors
    for (const entry of batch) {
      try {
        rows.push(buildRow(entry));
      } catch (err) {
        failed++;
        failedTitles.push(`${entry.recipe.title}: build error — ${err.message}`);
      }
    }

    if (rows.length === 0) continue;

    const batchStart = i + 1;
    const batchEnd   = Math.min(i + BATCH_SIZE, todo.length);
    process.stdout.write(`Inserting batch ${batchStart}–${batchEnd} (${rows.length} rows)... `);

    const { error } = await sb.from('recipes').insert(rows);

    if (error) {
      // Batch failed — try each row individually so partial progress is preserved
      process.stdout.write(`batch error — retrying individually\n`);
      for (const row of rows) {
        const { error: rowError } = await sb.from('recipes').insert(row);
        if (rowError) {
          failed++;
          failedTitles.push(`${row.title}: ${rowError.message}`);
          process.stdout.write(`  ✗ ${row.title}\n`);
        } else {
          inserted++;
          process.stdout.write(`  ✓ ${row.title}\n`);
        }
      }
    } else {
      inserted += rows.length;
      process.stdout.write(`done\n`);
      rows.forEach(r => process.stdout.write(`  ✓ ${r.title}\n`));
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped.length} (already in Supabase)`);
  console.log(`Failed:   ${failed}`);

  if (failedTitles.length > 0) {
    console.log(`\nFailed entries:`);
    failedTitles.forEach(t => console.log(`  ✗ ${t}`));
  }

  if (inserted > 0) {
    console.log(`\nNext: add photos with: node scripts/generate-images.mjs`);
  }
}

main().catch(console.error);
