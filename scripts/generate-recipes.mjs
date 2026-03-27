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

const SUPABASE_URL   = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY    = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const API_URL        = envVars['EXPO_PUBLIC_API_URL'];
const UNSPLASH_KEY   = envVars['UNSPLASH_ACCESS_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!API_URL) {
  console.error('Missing EXPO_PUBLIC_API_URL in .env — deploy to Vercel first');
  process.exit(1);
}
if (!UNSPLASH_KEY) {
  console.warn('Warning: UNSPLASH_ACCESS_KEY not set — recipes will save without images.\n');
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Unsplash rate limiter ──────────────────────────────────────────────────────
// Demo tier: 50 req/hour. We cap at 45 and pause until the window resets.

const unsplashCalls = [];   // timestamps of recent calls
const UNSPLASH_LIMIT = 45;  // stay under 50 hard limit
const UNSPLASH_WINDOW = 60 * 60 * 1000; // 1 hour in ms

async function fetchUnsplashImage(title, cuisine) {
  if (!UNSPLASH_KEY) return null;

  // Prune calls older than 1 hour
  const now = Date.now();
  while (unsplashCalls.length && now - unsplashCalls[0] > UNSPLASH_WINDOW) unsplashCalls.shift();

  // If at limit, wait until oldest call expires
  if (unsplashCalls.length >= UNSPLASH_LIMIT) {
    const waitMs = UNSPLASH_WINDOW - (now - unsplashCalls[0]) + 1000;
    const mins = Math.ceil(waitMs / 60000);
    process.stdout.write(`  [Unsplash] Rate limit reached — waiting ${mins}m for window reset...\n`);
    await sleep(waitMs);
    unsplashCalls.shift();
  }

  try {
    const query = encodeURIComponent(`${title} ${cuisine} food dish`);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    unsplashCalls.push(Date.now());
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

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
  // Simple everyday meals — beginner skill, short time, supermarket ingredients only
  { name: 'Simple Weeknight', target: 60, forceSkill: 'beginner', maxMins: 30 },
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

async function getExistingTitles(cuisine) {
  const { data } = await sb
    .from('recipes')
    .select('title')
    .eq('cuisine', cuisine.toLowerCase())
    .eq('source_type', 'curated');
  return (data ?? []).map(r => r.title);
}

async function generateOne(cuisine, index, existingTitles = [], retryAvoid = [], opts = {}) {
  const dietaryGoals = DIETARY_ROTATION[index % DIETARY_ROTATION.length];
  const skillLevel = opts.forceSkill ?? SKILL_ROTATION[index % SKILL_ROTATION.length];
  const avoidDishes = [...existingTitles, ...retryAvoid];

  const body = { cuisine, dietaryGoals, skillLevel, save: true, avoidDishes };
  if (opts.maxMins) body.maxMins = opts.maxMins;

  const response = await fetch(`${API_URL}/api/generate-recipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // 409 = too similar to existing — retry once with the offending title added to avoid list
  if (response.status === 409) {
    const body = await response.json();
    process.stdout.write(`  ↩ Too similar (${body.title}), retrying...\n`);
    await sleep(DELAY_MS);
    return generateOne(cuisine, index + 7, existingTitles, [...retryAvoid, body.title], opts);
  }

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

  for (const { name, target, forceSkill, maxMins } of targets) {
    const existing = await countExisting(name);
    const needed = Math.max(0, (perCuisine ?? target) - existing);

    console.log(`${name}: ${existing} existing → need ${needed} more`);

    if (isDryRun || needed === 0) continue;

    let generated = 0;
    let failed = 0;
    const generatedTitles = await getExistingTitles(name);
    const opts = { forceSkill, maxMins };

    for (let i = 0; i < needed; i++) {
      try {
        const recipe = await generateOne(name, i, generatedTitles, [], opts);
        generated++;
        if (recipe?.title) generatedTitles.push(recipe.title);

        // Fetch image and attach to the saved recipe
        const imageUrl = await fetchUnsplashImage(recipe.title, name);
        if (imageUrl && recipe?.title) {
          await sb.from('recipes')
            .update({ image_url: imageUrl })
            .eq('title', recipe.title)
            .eq('source_type', 'curated')
            .is('external_id', null);
        }

        process.stdout.write(`  ✓ ${recipe?.title ?? 'untitled'}${imageUrl ? ' 📷' : ''}\n`);
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
