// Backfill script: fetches TheMealDB strInstructions for every recipe with
// empty steps, parses into { order, instruction }[] and writes to Supabase.
//
// Run with: node scripts/backfill-steps.mjs
// Safe to re-run — skips recipes that already have steps.

import { createClient } from '@supabase/supabase-js';
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 1500; // stay polite to TheMealDB free tier

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Parse instructions ───────────────────────────────────────────────────────
// TheMealDB returns strInstructions as a long text block. We split into steps
// using several heuristics in order of preference.

function parseInstructions(raw) {
  if (!raw || !raw.trim()) return [];

  const text = raw.trim();

  // 1. Try numbered list — "1.", "1)", "Step 1:", "STEP 1"
  const numbered = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const numberedSteps = [];
  let currentStep = '';
  for (const line of numbered) {
    if (/^(step\s*)?\d+[\.\):\-]\s+/i.test(line)) {
      if (currentStep) numberedSteps.push(currentStep.trim());
      currentStep = line.replace(/^(step\s*)?\d+[\.\):\-]\s+/i, '').trim();
    } else {
      currentStep += (currentStep ? ' ' : '') + line;
    }
  }
  if (currentStep) numberedSteps.push(currentStep.trim());
  if (numberedSteps.length >= 2) {
    return numberedSteps
      .filter(s => s.length > 10)
      .map((instruction, i) => ({ order: i + 1, instruction }));
  }

  // 2. Split by double newlines (paragraphs)
  const paragraphs = text
    .split(/\r?\n\r?\n/)
    .map(p => p.replace(/\r?\n/g, ' ').trim())
    .filter(p => p.length > 10);
  if (paragraphs.length >= 2) {
    return paragraphs.map((instruction, i) => ({ order: i + 1, instruction }));
  }

  // 3. Split by single newlines
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 10);
  if (lines.length >= 2) {
    return lines.map((instruction, i) => ({ order: i + 1, instruction }));
  }

  // 4. Single block — return as one step
  if (text.length > 10) {
    return [{ order: 1, instruction: text }];
  }

  return [];
}

// ─── Fetch from TheMealDB ─────────────────────────────────────────────────────

async function fetchInstructions(externalId) {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${externalId}`);
  const data = await res.json();
  const meal = data.meals?.[0];
  if (!meal) return null;
  return meal.strInstructions ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching recipes with empty steps...');

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, external_id, title')
    .not('external_id', 'is', null)
    .eq('steps', '[]');

  if (error) {
    console.error('Failed to fetch recipes:', error.message);
    process.exit(1);
  }

  const total = recipes.length;
  console.log(`Found ${total} recipes needing steps.\n`);

  if (total === 0) {
    console.log('All recipes already have steps. Nothing to do.');
    return;
  }

  let success = 0;
  let failed = 0;
  let noInstructions = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = recipes.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (recipe) => {
      try {
        const raw = await fetchInstructions(recipe.external_id);
        if (!raw || !raw.trim()) {
          noInstructions++;
          console.log(`[${success + failed + noInstructions}/${total}] — ${recipe.title} (no instructions in TheMealDB)`);
          return;
        }

        const steps = parseInstructions(raw);
        if (steps.length === 0) {
          noInstructions++;
          console.log(`[${success + failed + noInstructions}/${total}] — ${recipe.title} (could not parse)`);
          return;
        }

        const { error: updateErr } = await supabase
          .from('recipes')
          .update({ steps })
          .eq('id', recipe.id);

        if (updateErr) throw new Error(updateErr.message);

        success++;
        console.log(`[${success + failed + noInstructions}/${total}] ✓ ${recipe.title} (${steps.length} steps)`);
      } catch (err) {
        failed++;
        console.error(`[${success + failed + noInstructions}/${total}] ✗ ${recipe.title} — ${err.message}`);
      }
    }));

    if (i + BATCH_SIZE < total) await sleep(BATCH_DELAY_MS);
  }

  console.log(`\nDone. ${success} updated, ${noInstructions} had no instructions, ${failed} failed.`);
  if (failed > 0) console.log('Re-run the script to retry failures.');
}

main();
