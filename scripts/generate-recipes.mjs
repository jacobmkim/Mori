// Bulk recipe generation script using Claude Haiku via /api/generate-recipe.
// Generates original recipes by cuisine and stores them in Supabase.
// Cost: ~$0.004 per recipe with Haiku. 1,200 recipes ≈ $5 total.
//
// Usage:
//   node scripts/generate-recipes.mjs                    # generate all (1,200 recipes)
//   node scripts/generate-recipes.mjs --cuisine Italian  # one cuisine only
//   node scripts/generate-recipes.mjs --count 50         # 50 per cuisine
//   node scripts/generate-recipes.mjs --dry-run          # print plan, don't generate
//
// Requires: EXPO_PUBLIC_API_URL in .env (your Vercel deployment URL)
// Safe to re-run — tracks generated count per cuisine in Supabase

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env ─────────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const API_URL = envVars['EXPO_PUBLIC_API_URL']; // Vercel deployment URL

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!API_URL) {
  console.error('Missing EXPO_PUBLIC_API_URL in .env — deploy to Vercel first');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Config ────────────────────────────────────────────────────────────────────

// Target recipes per cuisine — 100 each = 1,200 total ≈ $5 with Haiku
const CUISINES = [
  { name: 'Italian',        target: 100 },
  { name: 'Mexican',        target: 100 },
  { name: 'Chinese',        target: 100 },
  { name: 'Indian',         target: 100 },
  { name: 'Japanese',       target: 100 },
  { name: 'American',       target: 100 },
  { name: 'Mediterranean',  target: 100 },
  { name: 'Thai',           target: 100 },
  { name: 'French',         target: 100 },
  { name: 'Greek',          target: 100 },
  { name: 'Korean',         target: 100 },
  { name: 'Middle Eastern', target: 100 },
];

// Spread dietary goals across generated recipes for variety
const DIETARY_ROTATION = [
  [],
  ['high_protein'],
  ['meal_prep'],
  ['vegetarian'],
  ['meal_prep'],
  ['gluten_free'],
  ['high_protein'],
  [],
  ['meal_prep'],
  ['vegetarian'],
  ['low_carb'],
  [],
];

const SKILL_ROTATION = ['beginner', 'home_cook', 'home_cook', 'confident_chef'];

const DELAY_MS = 1200; // be polite to Vercel cold starts

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const cuisineFilter = args.includes('--cuisine') ? args[args.indexOf('--cuisine') + 1] : null;
const countOverride = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function countExisting(cuisine) {
  const { count } = await sb
    .from('recipes')
    .select('*', { count: 'exact', head: true })
    .eq('cuisine', cuisine.toLowerCase())
    .eq('source_type', 'curated');
  return count ?? 0;
}

async function generateOne(cuisine, index) {
  const dietaryGoals = DIETARY_ROTATION[index % DIETARY_ROTATION.length];
  const skillLevel = SKILL_ROTATION[index % SKILL_ROTATION.length];

  const response = await fetch(`${API_URL}/api/generate-recipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cuisine, dietaryGoals, skillLevel, save: true }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HTTP ${response.status}: ${err}`);
  }

  const { recipe } = await response.json();
  return recipe;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const targets = cuisineFilter
    ? CUISINES.filter(c => c.name.toLowerCase() === cuisineFilter.toLowerCase())
    : CUISINES;

  if (targets.length === 0) {
    console.error(`No cuisine matched "${cuisineFilter}". Options: ${CUISINES.map(c => c.name).join(', ')}`);
    process.exit(1);
  }

  const perCuisine = countOverride ?? null;

  console.log(`\n🍽  Mise Recipe Generator`);
  console.log(`API: ${API_URL}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

  for (const { name, target } of targets) {
    const existing = await countExisting(name);
    const needed = Math.max(0, (perCuisine ?? target) - existing);

    console.log(`${name}: ${existing} existing → need ${needed} more`);

    if (isDryRun || needed === 0) continue;

    let generated = 0;
    let failed = 0;

    for (let i = 0; i < needed; i++) {
      try {
        const recipe = await generateOne(name, i);
        generated++;
        process.stdout.write(`  ✓ ${recipe?.title ?? 'untitled'}\n`);
      } catch (err) {
        failed++;
        process.stdout.write(`  ✗ Error: ${err.message}\n`);
      }
      if (i < needed - 1) await sleep(DELAY_MS);
    }

    console.log(`  → ${generated} generated, ${failed} failed\n`);
  }

  console.log('Done.');
}

main().catch(console.error);
