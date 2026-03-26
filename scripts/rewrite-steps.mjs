// Rewrites TheMealDB recipe instructions using Claude Haiku.
// TheMealDB steps are scraped web content — inconsistent, sometimes one giant paragraph,
// occasionally contain artifacts like "Add'l ingredients:" or serving-size callouts.
// This script rewrites all 419 TheMealDB recipes into clean, properly broken-down steps.
//
// Usage:
//   node scripts/rewrite-steps.mjs              # rewrite all 419
//   node scripts/rewrite-steps.mjs --limit 10   # test on 10 recipes
//
// Safe to re-run — processes all TheMealDB recipes every time (always improves from source).
// Cost: ~$0.003 per recipe with Haiku batched 5 at a time. 419 recipes ≈ $1.50 total.

import Anthropic from '@anthropic-ai/sdk';
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

const SUPABASE_URL  = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY   = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const sb        = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const BATCH_SIZE = 3;
const DELAY_MS   = 1000;

// ── Args ──────────────────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;

// ── Fetch TheMealDB recipes ───────────────────────────────────────────────────

const query = sb
  .from('recipes')
  .select('id, title, ingredients, steps')
  .not('external_id', 'is', null)
  .order('created_at');

if (limit) query.limit(limit);

const { data: recipes, error } = await query;
if (error) { console.error('Fetch error:', error.message); process.exit(1); }

console.log(`\nRewriting steps for ${recipes.length} TheMealDB recipes in batches of ${BATCH_SIZE}...\n`);

let updated = 0;
let failed  = 0;

// ── Process in batches ────────────────────────────────────────────────────────

for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
  const batch = recipes.slice(i, i + BATCH_SIZE);

  const recipeBlock = batch.map((r, idx) => {
    const ingredientList = (r.ingredients ?? [])
      .map(ing => `${ing.quantity ?? ''} ${ing.unit ?? ''} ${ing.name ?? ''}`.trim())
      .filter(Boolean)
      .join(', ');

    const currentSteps = (r.steps ?? [])
      .map(s => `${s.order}. ${s.instruction}`)
      .join('\n');

    return `RECIPE ${idx + 1}: "${r.title}"
Ingredients: ${ingredientList}
Current steps:
${currentSteps}`;
  }).join('\n\n---\n\n');

  const prompt = `You are rewriting cooking instructions for a recipe app. The instructions below were scraped from the web and may have formatting issues — walls of text, artifacts, or poorly broken-down steps.

Rewrite each recipe's steps so they are:
- Clear and actionable for a home cook
- Properly broken into 5–8 distinct steps (never fewer than 4, never more than 8)
- Specific: include temperatures, timings, and technique cues where relevant
- Free of scraping artifacts (remove things like "Add'l ingredients:", serving-size callouts like "(for 4 servings)", or meta-text)
- Written in second person ("Heat the oil", "Add the onion")

${recipeBlock}

Respond with ONLY valid JSON — an array of ${batch.length} objects in the same order as above. Each object has one key "steps" containing an array of step objects:
[
  { "steps": [{ "order": 1, "instruction": "..." }, { "order": 2, "instruction": "..." }] },
  ...
]
No markdown, no explanation — just the JSON array.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text?.trim() ?? '';
    let results;
    try {
      results = JSON.parse(raw);
    } catch {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
      results = JSON.parse(fenced ? fenced[1].trim() : raw);
    }

    if (!Array.isArray(results) || results.length !== batch.length) {
      throw new Error(`Array length mismatch — got ${results?.length}, expected ${batch.length}`);
    }

    for (let j = 0; j < batch.length; j++) {
      const recipe  = batch[j];
      const newSteps = results[j]?.steps;

      if (!Array.isArray(newSteps) || newSteps.length < 3) {
        console.error(`  ✗ ${recipe.title} — invalid steps returned`);
        failed++;
        continue;
      }

      const { error: updateErr } = await sb
        .from('recipes')
        .update({ steps: newSteps })
        .eq('id', recipe.id);

      if (updateErr) {
        console.error(`  ✗ ${recipe.title}: ${updateErr.message}`);
        failed++;
      } else {
        console.log(`  ✓ ${recipe.title} (${newSteps.length} steps)`);
        updated++;
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

console.log(`\nDone. Updated: ${updated} | Failed: ${failed}`);
