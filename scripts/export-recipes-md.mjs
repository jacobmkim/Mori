// Exports all non-deleted recipes to a single Markdown file.
// Run with: node scripts/export-recipes-md.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const PAGE = 500;
let all = [];
let from = 0;

while (true) {
  const { data, error } = await supabase
    .from('recipes')
    .select('title, cuisine, prep_time_mins, cook_time_mins, servings, skill_level, meal_prep_friendly, dietary_tags, source_type, macros, badge, is_public')
    .is('deleted_at', null)
    .order('cuisine', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true })
    .range(from, from + PAGE - 1);

  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  all = all.concat(data);
  console.log(`Fetched ${all.length}…`);
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(`Total: ${all.length} recipes`);

const groups = new Map();
for (const r of all) {
  const key = (r.cuisine || 'uncategorized').trim() || 'uncategorized';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const sortedCuisines = [...groups.keys()].sort((a, b) => a.localeCompare(b));

const lines = [];
lines.push(`# Mori — Full Recipe Catalog`);
lines.push('');
lines.push(`_Generated ${new Date().toISOString().slice(0, 10)} · ${all.length} recipes across ${sortedCuisines.length} cuisine groups_`);
lines.push('');
lines.push('## Table of Contents');
lines.push('');
for (const cuisine of sortedCuisines) {
  const slug = cuisine.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  lines.push(`- [${cuisine}](#${slug}) (${groups.get(cuisine).length})`);
}
lines.push('');

for (const cuisine of sortedCuisines) {
  lines.push(`## ${cuisine}`);
  lines.push('');
  lines.push('| # | Title | Time (prep+cook) | Servings | Skill | Meal Prep | Dietary | Source | Macros (cal/p/c/f) |');
  lines.push('|---|-------|------------------|----------|-------|-----------|---------|--------|--------------------|');

  const list = groups.get(cuisine).slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  list.forEach((r, i) => {
    const time = `${r.prep_time_mins ?? '?'}+${r.cook_time_mins ?? '?'} min`;
    const servings = r.servings ?? '?';
    const skill = r.skill_level || '—';
    const mp = r.meal_prep_friendly ? '✓' : '—';
    const tags = Array.isArray(r.dietary_tags) && r.dietary_tags.length
      ? r.dietary_tags.join(', ')
      : '—';
    const src = r.source_type || '—';
    const m = r.macros || {};
    const macros = (m.calories || m.protein_g || m.carbs_g || m.fat_g)
      ? `${m.calories ?? '?'} / ${m.protein_g ?? '?'}p / ${m.carbs_g ?? '?'}c / ${m.fat_g ?? '?'}f`
      : '—';
    const title = (r.title || '').replace(/\|/g, '\\|');
    lines.push(`| ${i + 1} | ${title} | ${time} | ${servings} | ${skill} | ${mp} | ${tags} | ${src} | ${macros} |`);
  });
  lines.push('');
}

const out = resolve(process.cwd(), 'RECIPES.md');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${out}`);
