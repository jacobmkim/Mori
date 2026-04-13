// Generates full recipe content for new-recipes.csv and saves to new-recipes-draft.json (JSONL).
// Nothing is saved to Supabase — this is a staging step before photos are added.
//
// Usage:
//   node scripts/generate-new-recipes.mjs                    # generate all missing
//   node scripts/generate-new-recipes.mjs --cuisine italian  # one cuisine only
//   node scripts/generate-new-recipes.mjs --dry-run          # preview, don't generate
//
// Safe to re-run — skips:
//   1. Titles already in Supabase recipes table
//   2. Titles already saved in new-recipes-draft.json
//
// Once all recipes have photos, run upload-new-recipes.mjs to push to Supabase.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
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
const API_URL      = envVars['EXPO_PUBLIC_API_URL'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!API_URL) {
  console.error('Missing EXPO_PUBLIC_API_URL in .env — deploy to Vercel first');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Load dish list from CSV ────────────────────────────────────────────────────

function loadDishes() {
  const csvPath = resolve(process.cwd(), 'scripts', 'new-recipes.csv');
  const lines = readFileSync(csvPath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  // RFC 4180 CSV parser — handles quoted fields with embedded commas
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCSVLine(line);
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
      return {
        title:              row.title,
        cuisine:            row.cuisine,         // may be comma-separated e.g. "cajun,italian"
        meal_prep_friendly: row.meal_prep_friendly === 'true',
      };
    });
}

const DISHES = loadDishes();

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getExistingTitles() {
  const { data } = await sb.from('recipes').select('title');
  return new Set((data ?? []).map(r => r.title.toLowerCase().trim()));
}

function loadDraftTitles(draftPath) {
  if (!existsSync(draftPath)) return new Set();
  return new Set(
    readFileSync(draftPath, 'utf8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => {
        try { return JSON.parse(l).csvTitle?.toLowerCase().trim(); } catch { return null; }
      })
      .filter(Boolean)
  );
}

// For fusion cuisines like "cajun,italian", send Claude "cajun and italian" in the prompt.
function toApiCuisine(cuisine) {
  if (!cuisine.includes(',')) return cuisine;
  return cuisine.split(',').map(s => s.trim()).join(' and ');
}

async function generateDish(dish) {
  const body = {
    cuisine:            toApiCuisine(dish.cuisine),
    dishName:           dish.title,
    meal_prep_friendly: dish.meal_prep_friendly,
    save:               false,
    // intentionally no skillLevel — let Claude generate the natural recipe
  };

  const response = await fetch(`${API_URL}/api/generate-recipe`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HTTP ${response.status}: ${err}`);
  }

  return (await response.json()).recipe;
}

// ── Args ───────────────────────────────────────────────────────────────────────

const args          = process.argv.slice(2);
const isDryRun      = args.includes('--dry-run');
const cuisineFilter = args.includes('--cuisine') ? args[args.indexOf('--cuisine') + 1] : null;
const DELAY_MS      = 1200;
const DRAFT_PATH    = resolve(process.cwd(), 'scripts', 'new-recipes-draft.json');

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMori New Recipe Generator`);
  console.log(`API:   ${API_URL}`);
  console.log(`Draft: ${DRAFT_PATH}`);
  console.log(`Mode:  ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

  console.log(`Loaded ${DISHES.length} dishes from new-recipes.csv`);

  // Skip titles already in Supabase or already in draft file
  const [dbTitles, draftTitles] = await Promise.all([
    getExistingTitles(),
    Promise.resolve(loadDraftTitles(DRAFT_PATH)),
  ]);

  console.log(`  ${dbTitles.size} recipes already in Supabase`);
  console.log(`  ${draftTitles.size} recipes already in draft file\n`);

  const targets = cuisineFilter
    ? DISHES.filter(d => d.cuisine.toLowerCase().includes(cuisineFilter.toLowerCase()))
    : DISHES;

  if (targets.length === 0) {
    console.error(`No dishes matched cuisine "${cuisineFilter}".`);
    process.exit(1);
  }

  const todo = targets.filter(d => {
    const key = d.title.toLowerCase().trim();
    return !dbTitles.has(key) && !draftTitles.has(key);
  });

  const skipDb    = targets.filter(d => dbTitles.has(d.title.toLowerCase().trim())).length;
  const skipDraft = targets.filter(d => draftTitles.has(d.title.toLowerCase().trim())).length;

  console.log(`${targets.length} dishes targeted`);
  console.log(`  ${skipDb} skipped (already in Supabase)`);
  console.log(`  ${skipDraft} skipped (already in draft)`);
  console.log(`  ${todo.length} to generate\n`);

  if (isDryRun) {
    todo.forEach(d => console.log(`  [ ] ${d.title} (${d.cuisine})`));
    console.log(`\nDry run complete — nothing generated.`);
    return;
  }

  let generated = 0;
  let failed    = 0;

  for (let i = 0; i < todo.length; i++) {
    const dish = todo[i];
    try {
      const recipe = await generateDish(dish);
      const entry  = {
        csvTitle:   dish.title,
        csvCuisine: dish.cuisine,
        csvMealPrep: dish.meal_prep_friendly,
        generatedAt: new Date().toISOString(),
        recipe,
      };
      appendFileSync(DRAFT_PATH, JSON.stringify(entry) + '\n', 'utf8');
      generated++;
      process.stdout.write(`  ✓ [${generated + failed}/${todo.length}] ${dish.title}\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`  ✗ [${generated + failed}/${todo.length}] ${dish.title}: ${err.message}\n`);
    }

    if (i < todo.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nDone — ${generated} generated, ${failed} failed.`);
  console.log(`Draft file: ${DRAFT_PATH}`);
  console.log(`\nNext: add photos, then run: node scripts/upload-new-recipes.mjs`);
}

main().catch(console.error);
