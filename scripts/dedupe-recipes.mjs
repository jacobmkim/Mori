/**
 * dedupe-recipes.mjs
 *
 * Removes duplicate recipe rows. Each duplicate group should have:
 *   - canonical: source_type='curated', external_id=NULL
 *   - dupe:      source_type='imported', external_id=canonical.id
 *
 * For each dupe:
 *   1. Re-point recipe_interactions, swipe_events, saved_recipes,
 *      recipe_notes, recipe_cohort_affinities, recipe_flags from dupe → canonical
 *   2. Delete the dupe row
 *
 * Skips groups that don't fit the canonical/dupe pattern (logged for manual review).
 *
 * Usage:
 *   node scripts/dedupe-recipes.mjs --dry-run    # preview
 *   node scripts/dedupe-recipes.mjs              # live
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);

const DRY_RUN = process.argv.includes('--dry-run');

// Tables to remap when collapsing dupe → canonical. saved_recipes has UNIQUE(user_id,recipe_id)
// so handle that one specially.
const REMAP_TABLES = [
  { table: 'recipe_interactions', col: 'recipe_id' },
  { table: 'swipe_events',        col: 'recipe_id' },
  { table: 'recipe_notes',        col: 'recipe_id' },
  { table: 'recipe_cohort_affinities', col: 'recipe_id' },
  { table: 'recipe_flags',        col: 'recipe_id' },
];

async function fetchAllRecipes() {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from('recipes')
      .select('id, title, source_type, external_id, created_at')
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

function findDupeGroups(recipes) {
  const norm = t => t.toLowerCase().trim().replace(/\s+/g, ' ');
  const groups = {};
  recipes.forEach(r => {
    const k = norm(r.title);
    (groups[k] = groups[k] || []).push(r);
  });
  return Object.entries(groups)
    .filter(([_, rows]) => rows.length > 1)
    .map(([_, rows]) => rows);
}

async function remapDupeToCanonical(dupeId, canonicalId) {
  // Standard remaps
  for (const { table, col } of REMAP_TABLES) {
    const { error } = await sb.from(table).update({ [col]: canonicalId }).eq(col, dupeId);
    if (error && !error.message.includes('does not exist')) {
      console.log(`    ⚠ ${table} remap: ${error.message}`);
    }
  }

  // saved_recipes — UNIQUE(user_id, recipe_id). Delete dupe rows where user already has canonical;
  // then update remaining dupe rows to canonical.
  const { data: dupeSaves } = await sb.from('saved_recipes').select('user_id').eq('recipe_id', dupeId);
  if (dupeSaves && dupeSaves.length > 0) {
    const userIds = dupeSaves.map(s => s.user_id);
    const { data: canonSaves } = await sb.from('saved_recipes').select('user_id').eq('recipe_id', canonicalId).in('user_id', userIds);
    const conflictUsers = new Set((canonSaves ?? []).map(s => s.user_id));
    if (conflictUsers.size > 0) {
      // Delete dupe rows that would conflict
      await sb.from('saved_recipes').delete().eq('recipe_id', dupeId).in('user_id', [...conflictUsers]);
    }
    // Update remaining dupe rows
    await sb.from('saved_recipes').update({ recipe_id: canonicalId }).eq('recipe_id', dupeId);
  }
}

async function main() {
  console.log(`dedupe-recipes — mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  const all = await fetchAllRecipes();
  console.log(`Fetched ${all.length} recipes`);

  const dupeGroups = findDupeGroups(all);
  console.log(`Duplicate groups: ${dupeGroups.length}\n`);

  const planned = [];
  const skipped = [];

  for (const group of dupeGroups) {
    const curated = group.filter(r => r.source_type === 'curated' && !r.external_id);
    const imported = group.filter(r => r.source_type === 'imported' && r.external_id);

    if (curated.length === 1 && imported.length === group.length - 1) {
      const canonical = curated[0];
      const dupes = imported.filter(d => d.external_id === canonical.id);
      if (dupes.length === imported.length) {
        planned.push({ canonical, dupes });
        continue;
      }
    }
    skipped.push(group);
  }

  console.log(`Planned for dedupe: ${planned.length} groups (deleting ${planned.reduce((n,g)=>n+g.dupes.length,0)} dupe rows)`);
  console.log(`Skipped (irregular): ${skipped.length} groups`);
  if (skipped.length > 0) {
    console.log('\n=== Skipped groups (manual review needed) ===');
    skipped.forEach(g => {
      console.log(`  "${g[0].title}" — ${g.length} rows`);
      g.forEach(r => console.log(`    ${r.id} | ${r.source_type ?? 'NULL'} | ext=${r.external_id ?? '-'}`));
    });
  }
  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN — no writes. Sample of 5 planned dedupes:');
    planned.slice(0, 5).forEach(p => {
      console.log(`  ✓ "${p.canonical.title}"`);
      console.log(`    keep:   ${p.canonical.id} (curated)`);
      p.dupes.forEach(d => console.log(`    delete: ${d.id} (imported)`));
    });
    return;
  }

  // LIVE
  let done = 0, failed = 0;
  for (const { canonical, dupes } of planned) {
    process.stdout.write(`[${done + failed + 1}/${planned.length}] ${canonical.title.slice(0, 50).padEnd(50)} `);
    try {
      for (const dupe of dupes) {
        await remapDupeToCanonical(dupe.id, canonical.id);
        const { error } = await sb.from('recipes').delete().eq('id', dupe.id);
        if (error) throw error;
      }
      console.log(`✓ deleted ${dupes.length}`);
      done++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Deduplicated: ${done}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Skipped:      ${skipped.length} (manual)`);
}

main().catch(err => { console.error(err); process.exit(1); });
