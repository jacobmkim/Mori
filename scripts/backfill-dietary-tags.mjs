// Dietary tags backfill: uses Claude Haiku to assign dietary_tags to recipes
// that have none. Also normalizes any capitalized/dirty tags from MealDB imports.
//
// Valid tags: high_protein, dairy_free, gluten_free, vegetarian, pescatarian,
//             paleo, halal, vegan, low_carb, keto
//
// Run with: node scripts/backfill-dietary-tags.mjs
// Safe to re-run — only touches recipes with empty/null dietary_tags.

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

const VALID_TAGS = new Set([
  'high_protein', 'dairy_free', 'gluten_free', 'vegetarian',
  'pescatarian', 'paleo', 'halal', 'vegan', 'low_carb', 'keto',
]);

// Tags from MealDB that should be stripped (not dietary info)
const DIRTY_TAGS = new Set([
  'Vegetarian', 'Vegan', 'Seafood', 'Beef', 'Chicken', 'Pork',
  'Dessert', 'Side', 'Lamb', 'Miscellaneous', 'Breakfast', 'Pasta',
  'Starter', 'Goat',
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function classifyTags(title, ingredients, cuisine) {
  const ingredientList = (ingredients ?? [])
    .map(i => `${i.quantity ?? ''} ${i.unit ?? ''} ${i.name}`.trim())
    .join(', ');

  const prompt = `Classify this recipe's dietary tags. Reply ONLY with a JSON array of strings — no explanation.

Recipe: ${title}
Cuisine: ${cuisine ?? 'unknown'}
Ingredients: ${ingredientList || 'not listed'}

Choose ONLY from these tags (use as many as apply, or empty array if none fit):
["high_protein", "dairy_free", "gluten_free", "vegetarian", "pescatarian", "paleo", "halal", "vegan", "low_carb", "keto"]

Rules:
- vegan implies vegetarian and dairy_free — include all three if vegan
- pescatarian = fish/seafood but no meat
- high_protein = main protein source, substantial amount (meat, fish, eggs, legumes)
- low_carb = minimal grains, bread, pasta, starchy veg
- keto = very low carb + high fat
- paleo = no grains, dairy, legumes, processed food
- gluten_free = no wheat, barley, rye
- dairy_free = no milk, cheese, butter, cream

Reply format: ["tag1","tag2"]`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error(`No JSON array in response: ${text}`);

  const parsed = JSON.parse(match[0]);
  return parsed.filter(t => VALID_TAGS.has(t));
}

async function main() {
  // ── Phase 1: Normalize dirty capitalized tags from MealDB imports ─────────────
  console.log('\nPhase 1: Cleaning dirty MealDB tags...');

  const { data: dirtyRecipes, error: dirtyErr } = await sb
    .from('recipes')
    .select('id, title, dietary_tags')
    .not('dietary_tags', 'is', null);

  if (dirtyErr) { console.error(dirtyErr.message); process.exit(1); }

  const toClean = dirtyRecipes.filter(r =>
    r.dietary_tags.some(t => DIRTY_TAGS.has(t))
  );

  console.log(`  ${toClean.length} recipes have dirty tags to clean`);

  let cleaned = 0;
  for (const r of toClean) {
    const cleanedTags = r.dietary_tags.filter(t => !DIRTY_TAGS.has(t));
    const { error } = await sb
      .from('recipes')
      .update({ dietary_tags: cleanedTags })
      .eq('id', r.id);
    if (error) {
      console.error(`  ✗ ${r.title}: ${error.message}`);
    } else {
      cleaned++;
    }
  }
  console.log(`  Cleaned ${cleaned} recipes\n`);

  // ── Phase 2: Backfill missing dietary_tags ────────────────────────────────────
  console.log('Phase 2: Backfilling missing dietary tags...');

  const { data: missing, error: fetchErr } = await sb
    .from('recipes')
    .select('id, title, ingredients, cuisine')
    .or('dietary_tags.is.null,dietary_tags.eq.{}');

  if (fetchErr) { console.error(fetchErr.message); process.exit(1); }

  console.log(`  ${missing.length} recipes need dietary tags\n`);

  if (missing.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const r = missing[i];
    try {
      const tags = await classifyTags(r.title, r.ingredients, r.cuisine);
      const { error } = await sb
        .from('recipes')
        .update({ dietary_tags: tags })
        .eq('id', r.id);
      if (error) throw new Error(error.message);
      success++;
      console.log(`  [${i + 1}/${missing.length}] ✓ ${r.title} → [${tags.join(', ')}]`);
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${missing.length}] ✗ ${r.title}: ${err.message}`);
    }
    if (i < missing.length - 1) await sleep(1500);
  }

  console.log(`\nDone — ${success} tagged, ${failed} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
