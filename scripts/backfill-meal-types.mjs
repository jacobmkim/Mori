// Meal-type backfill (Mori+ Track B1): Haiku classifies every recipe into
// breakfast/lunch/dinner/snack/dessert slots so the week optimizer can route
// candidates into a meal grid. Writes recipes.meal_types text[].
//
// Run with: node scripts/backfill-meal-types.mjs [--dry-run] [--limit N] [--concurrency N]
// Resume-safe — only touches recipes where meal_types IS NULL. Re-run freely.

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL  = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY   = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const VALID_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'dessert']);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
const CONCURRENCY = args.includes('--concurrency') ? parseInt(args[args.indexOf('--concurrency') + 1], 10) : 8;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function classifyMealTypes(recipe) {
  const ingredientList = (recipe.ingredients ?? [])
    .map(i => i.name ?? '')
    .filter(Boolean)
    .slice(0, 20)
    .join(', ');
  const totalMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

  const prompt = `Which meal slots does this recipe fit? Reply ONLY with a JSON array of strings — no explanation.

Recipe: ${recipe.title}
Cuisine: ${recipe.cuisine ?? 'unknown'}
Main ingredients: ${ingredientList || 'not listed'}
Total time: ${totalMins > 0 ? `${totalMins} min` : 'unknown'}

Choose from: ["breakfast", "lunch", "dinner", "snack", "dessert"]

Rules:
- Most savory mains are BOTH lunch and dinner — use ["lunch","dinner"] for them.
- breakfast = typical morning food (eggs, pancakes, oatmeal, smoothies, pastries, breakfast sandwiches). Brunch-y dishes can be ["breakfast","lunch"].
- snack = small bites, dips, finger food, things you would not serve as a main.
- dessert = sweets served after a meal (cakes, cookies, puddings, sweet baked goods).
- A hearty soup, salad with protein, sandwich, or grain bowl = ["lunch","dinner"].
- Light soups/salads without protein lean ["lunch"].
- Always return at least one slot. Never return more than three.

Reply format: ["lunch","dinner"]`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 48,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error(`No JSON array in response: ${text}`);

  const parsed = JSON.parse(match[0]).filter(t => VALID_TYPES.has(t));
  if (parsed.length === 0) throw new Error(`Empty/invalid classification: ${text}`);
  return parsed.slice(0, 3);
}

async function fetchUnclassified() {
  // .range() pagination — the recipes table is >1000 rows and Supabase caps
  // un-ranged selects at 1000 (the upload-script pagination lesson).
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, cuisine, ingredients, prep_time_mins, cook_time_mins')
      .is('meal_types', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function processOne(recipe, stats) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const types = await classifyMealTypes(recipe);
      if (!DRY_RUN) {
        const { error } = await sb.from('recipes').update({ meal_types: types }).eq('id', recipe.id);
        if (error) throw new Error(`DB write failed: ${error.message}`);
      }
      stats.done++;
      types.forEach(t => { stats.dist[t] = (stats.dist[t] ?? 0) + 1; });
      if (DRY_RUN || stats.done <= 25 || stats.done % 100 === 0) {
        console.log(`  [${stats.done}/${stats.total}] ${recipe.title} → ${JSON.stringify(types)}`);
      }
      return;
    } catch (err) {
      if (attempt === 2) {
        stats.failed.push({ id: recipe.id, title: recipe.title, error: err.message });
        console.error(`  FAILED ${recipe.title}: ${err.message}`);
      } else {
        await sleep(2000);
      }
    }
  }
}

async function main() {
  console.log(`Meal-type backfill ${DRY_RUN ? '(DRY RUN — no writes)' : ''}`);
  const all = await fetchUnclassified();
  const todo = all.slice(0, LIMIT);
  const stats = { done: 0, total: todo.length, failed: [], dist: {} };
  console.log(`${all.length} unclassified recipes; processing ${todo.length} (concurrency ${CONCURRENCY})\n`);

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(r => processOne(r, stats)));
    await sleep(150); // stay friendly to the API rate limit
  }

  console.log(`\nDone: ${stats.done}/${stats.total} classified, ${stats.failed.length} failed`);
  console.log('Distribution:', JSON.stringify(stats.dist));
  if (stats.failed.length) {
    console.log('Failures (re-run the script to retry — resume-safe):');
    stats.failed.slice(0, 10).forEach(f => console.log(`  ${f.title}: ${f.error}`));
  }
}

main();
