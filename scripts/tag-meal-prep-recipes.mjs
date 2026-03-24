// Tag meal-prep-friendly recipes using Claude Haiku.
// Sets meal_prep_friendly: true/false on all 419 recipes in Supabase.
//
// Criteria (evaluated by Claude):
//   TRUE  — batches well, stores 3-5 days, reheats without quality loss
//           (curries, stews, grain bowls, pasta bakes, roasted proteins, soups)
//   FALSE — doesn't reheat well or must be served fresh
//           (delicate fish, dressed salads, fried foods, poached eggs, fresh pasta)
//
// Run with: node scripts/tag-meal-prep-recipes.mjs
// Safe to re-run — skips recipes already tagged (meal_prep_friendly IS NOT NULL).

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Load .env ────────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL  = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY   = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

const supabase   = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic  = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE  = 10;   // recipes per Claude call (cheaper to batch)
const DELAY_MS    = 1200; // ~50 req/min Haiku limit

// ─── Fetch untagged recipes ───────────────────────────────────────────────────

const { data: recipes, error } = await supabase
  .from('recipes')
  .select('id, title, description, dietary_tags, ingredients')
  .is('meal_prep_friendly', null)
  .order('created_at');

if (error) { console.error('Supabase fetch error:', error.message); process.exit(1); }
if (!recipes || recipes.length === 0) {
  console.log('All recipes already tagged. Nothing to do.');
  process.exit(0);
}

console.log(`Tagging ${recipes.length} untagged recipes in batches of ${BATCH_SIZE}…\n`);

let tagged = 0;
let failed = 0;

// ─── Process in batches ───────────────────────────────────────────────────────

for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
  const batch = recipes.slice(i, i + BATCH_SIZE);

  const recipeList = batch.map((r, idx) => {
    const ingredientNames = (r.ingredients ?? [])
      .map(ing => ing.name ?? ing)
      .filter(Boolean)
      .join(', ');
    return `${idx + 1}. "${r.title}" — ingredients: ${ingredientNames || 'unknown'}`;
  }).join('\n');

  const prompt = `You are evaluating recipes for a meal prep app. For each recipe below, decide if it is "meal prep friendly" — meaning it can be batch-cooked, stored in the fridge for 3-5 days, and reheated without significant quality loss.

TRUE examples: curries, stews, soups, chilis, grain bowls, pasta bakes, roasted proteins, casseroles, rice dishes, meatballs, pulled meat.
FALSE examples: delicate fish (must be fresh), dressed salads (go soggy), fried foods (lose crispiness), dishes with poached or soft-boiled eggs, fresh pasta, anything that separates or deteriorates when reheated.

Recipes to evaluate:
${recipeList}

Respond with ONLY a JSON array of booleans in the same order as the recipes above. Example for 3 recipes: [true, false, true]
No explanation, no markdown, just the JSON array.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text?.trim() ?? '';
    let flags;
    try {
      flags = JSON.parse(raw);
    } catch {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: Claude returned invalid JSON: ${raw}`);
      failed += batch.length;
      continue;
    }

    if (!Array.isArray(flags) || flags.length !== batch.length) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: Array length mismatch (got ${flags.length}, expected ${batch.length})`);
      failed += batch.length;
      continue;
    }

    // Write to Supabase
    for (let j = 0; j < batch.length; j++) {
      const recipe = batch[j];
      const isMealPrep = Boolean(flags[j]);

      const { error: updateErr } = await supabase
        .from('recipes')
        .update({ meal_prep_friendly: isMealPrep })
        .eq('id', recipe.id);

      if (updateErr) {
        console.error(`  ✗ ${recipe.title}: ${updateErr.message}`);
        failed++;
      } else {
        console.log(`  ${isMealPrep ? '✓' : '✗'} ${recipe.title} → ${isMealPrep ? 'meal_prep_friendly' : 'not meal prep'}`);
        tagged++;
      }
    }
  } catch (err) {
    console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${err.message}`);
    failed += batch.length;
  }

  if (i + BATCH_SIZE < recipes.length) {
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

console.log(`\nDone. Tagged: ${tagged} | Failed: ${failed}`);
