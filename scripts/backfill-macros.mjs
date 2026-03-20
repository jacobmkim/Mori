// Macro backfill script: uses Claude Haiku to estimate macros for every recipe
// that doesn't yet have recipes.macros populated, then writes the result to Supabase.
//
// Run with: node scripts/backfill-macros.mjs
// Safe to re-run — skips recipes that already have macros stored.

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

const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 2;        // recipes per batch — 50 req/min limit = ~1.2s per req
const BATCH_DELAY_MS = 2500; // ms between batches → ~48 req/min

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Claude estimate ──────────────────────────────────────────────────────────

async function estimateMacros(title, ingredients) {
  const ingredientList = ingredients
    .map(i => `${i.quantity ?? ''} ${i.unit ?? ''} ${i.name}`.trim())
    .filter(Boolean)
    .join(', ');

  const prompt = `Estimate the nutrition per serving for this recipe. Reply ONLY with a JSON object — no explanation, no markdown.

Recipe: ${title}
Ingredients: ${ingredientList || 'not specified'}
Assume 4 servings unless ingredients suggest otherwise.

JSON format:
{"calories":0,"protein":0,"carbohydrates":0,"fat":0,"fibre":0}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error(`No JSON in response: ${text}`);

  const parsed = JSON.parse(match[0]);
  const calories      = Math.round(parsed.calories      ?? 0);
  const protein       = Math.round(parsed.protein       ?? 0);
  const carbohydrates = Math.round(parsed.carbohydrates ?? 0);
  const fat           = Math.round(parsed.fat           ?? 0);
  const fibre         = Math.round(parsed.fibre         ?? 0);

  return {
    calories,
    protein,
    carbohydrates,
    fat,
    fibre,
    netCarbs: Math.max(0, carbohydrates - fibre),
    isEstimated: true,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching recipes without macros...');

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, ingredients')
    .is('macros', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch recipes:', error.message);
    process.exit(1);
  }

  const total = recipes.length;
  console.log(`Found ${total} recipes without macros.\n`);

  if (total === 0) {
    console.log('All recipes already have macros. Nothing to do.');
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = recipes.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (recipe) => {
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      try {
        const macros = await estimateMacros(recipe.title, ingredients);
        const { error: updateError } = await supabase
          .from('recipes')
          .update({ macros })
          .eq('id', recipe.id);

        if (updateError) throw new Error(updateError.message);

        success++;
        console.log(`[${success + failed}/${total}] ✓ ${recipe.title}`);
      } catch (err) {
        failed++;
        console.error(`[${success + failed}/${total}] ✗ ${recipe.title} — ${err.message}`);
      }
    }));

    if (i + BATCH_SIZE < total) await sleep(BATCH_DELAY_MS);
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
  if (failed > 0) console.log('Re-run the script to retry failed recipes.');
}

main();
