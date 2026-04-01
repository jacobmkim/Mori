// Bulk recipe generation script — reads dish list from scripts/mori_recipes.csv.
// Haiku receives the dish title, cuisine, skill level, and time limit and writes the recipe.
// No free-form dish invention — every recipe maps to a specific named dish in the CSV.
//
// Usage:
//   node scripts/generate-recipes.mjs                    # generate all missing dishes
//   node scripts/generate-recipes.mjs --cuisine Thai     # one cuisine only
//   node scripts/generate-recipes.mjs --dry-run          # print plan, don't generate
//
// Safe to re-run — skips dishes that already exist in Supabase (matched by title).

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
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const API_URL      = envVars['EXPO_PUBLIC_API_URL'];
const UNSPLASH_KEY = envVars['UNSPLASH_ACCESS_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!API_URL) {
  console.error('Missing EXPO_PUBLIC_API_URL in .env — deploy to Vercel first');
  process.exit(1);
}
if (!UNSPLASH_KEY) console.warn('Warning: UNSPLASH_ACCESS_KEY not set — recipes will save without images.\n');

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Unsplash rate limiter ──────────────────────────────────────────────────────

const unsplashCalls = [];
const UNSPLASH_LIMIT  = 45;
const UNSPLASH_WINDOW = 60 * 60 * 1000;

async function fetchUnsplashImage(title, cuisine) {
  if (!UNSPLASH_KEY) return null;
  const now = Date.now();
  while (unsplashCalls.length && now - unsplashCalls[0] > UNSPLASH_WINDOW) unsplashCalls.shift();
  if (unsplashCalls.length >= UNSPLASH_LIMIT) {
    const waitMs = UNSPLASH_WINDOW - (now - unsplashCalls[0]) + 1000;
    const mins = Math.ceil(waitMs / 60000);
    process.stdout.write(`  [Unsplash] Rate limit — waiting ${mins}m...\n`);
    await sleep(waitMs);
    unsplashCalls.shift();
  }
  try {
    const query = encodeURIComponent(`${title} food dish`);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    unsplashCalls.push(Date.now());
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.urls?.regular ?? null;
  } catch { return null; }
}

// ── Load dish list from CSV ────────────────────────────────────────────────────

const DIFFICULTY_MAP = {
  beginner:     'beginner',
  intermediate: 'home_cook',
  advanced:     'confident_chef',
};

function loadDishes() {
  const csvPath = resolve(process.cwd(), 'scripts', 'mori_recipes.csv');
  const lines = readFileSync(csvPath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      // Split on comma — titles in this CSV don't contain commas
      const values = line.split(',').map(v => v.trim());
      const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
      return {
        title:              row.title,
        cuisine:            row.cuisine,
        skillLevel:         DIFFICULTY_MAP[row.difficulty] ?? 'home_cook',
        maxMins:            parseInt(row.approx_time_mins, 10) || undefined,
        meal_prep_friendly: row.meal_prep_friendly === 'true',
      };
    });
}

const DISHES = loadDishes();

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getExistingTitles() {
  const { data } = await sb.from('recipes').select('title');
  return new Set((data ?? []).map(r => r.title.toLowerCase().trim()));
}

async function generateDish(dish) {
  const body = {
    cuisine:            dish.cuisine,
    dishName:           dish.title,
    skillLevel:         dish.skillLevel,
    meal_prep_friendly: dish.meal_prep_friendly,
    save:               true,
  };
  if (dish.maxMins) body.maxMins = dish.maxMins;

  const response = await fetch(`${API_URL}/api/generate-recipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HTTP ${response.status}: ${err}`);
  }

  return (await response.json()).recipe;
}

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun      = args.includes('--dry-run');
const cuisineFilter = args.includes('--cuisine') ? args[args.indexOf('--cuisine') + 1] : null;
const DELAY_MS      = 1200;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMori Recipe Generator`);
  console.log(`API: ${API_URL}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

  console.log(`Loaded ${DISHES.length} dishes from mori_recipes.csv`);

  const existingTitles = await getExistingTitles();

  const targets = cuisineFilter
    ? DISHES.filter(d => d.cuisine.toLowerCase() === cuisineFilter.toLowerCase())
    : DISHES;

  if (targets.length === 0) {
    console.error(`No dishes matched cuisine "${cuisineFilter}".`);
    process.exit(1);
  }

  const todo = targets.filter(d => !existingTitles.has(d.title.toLowerCase().trim()));
  const skip = targets.length - todo.length;

  console.log(`${targets.length} dishes targeted — ${skip} already exist — ${todo.length} to generate\n`);

  let generated = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i++) {
    const dish = todo[i];
    if (isDryRun) { console.log(`  [ ] ${dish.title} (${dish.cuisine})`); continue; }

    try {
      const recipe = await generateDish(dish);
      generated++;

      const imageUrl = await fetchUnsplashImage(dish.title, dish.cuisine);
      if (imageUrl) {
        await sb.from('recipes')
          .update({ image_url: imageUrl })
          .eq('title', recipe.title)
          .eq('source_type', 'curated')
          .is('external_id', null);
      }

      process.stdout.write(`  ✓ ${dish.title}${imageUrl ? ' 📷' : ''}\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`  ✗ ${dish.title}: ${err.message}\n`);
    }

    if (i < todo.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nDone — ${generated} generated, ${failed} failed, ${skip} skipped.`);
}

main().catch(console.error);
