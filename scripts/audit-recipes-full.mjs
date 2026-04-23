/**
 * audit-recipes-full.mjs
 *
 * Comprehensive recipe audit using Claude Haiku.
 * Checks BOTH ingredients AND steps for every recipe.
 *
 * Ingredient checks (same as validate-recipe-ratios):
 *   - Quantities plausible for serving count
 *   - Units appropriate for ingredient type
 *   - No metric slip-throughs (g, ml, kg, L)
 *   - Sensible ratios between ingredients
 *
 * Step checks:
 *   - Logical order (prep → cook → plate)
 *   - Cook times and temperatures are realistic
 *   - Steps reference only ingredients that exist
 *   - No missing critical steps (e.g. "bring to boil" before simmering)
 *   - Recipe produces what the title promises
 *
 * Threshold: 85. Anything below gets corrected and written back.
 * Recipes that already pass are a no-op (confirmed cookable).
 *
 * Usage:
 *   node scripts/audit-recipes-full.mjs --dry-run         # preview, no writes
 *   node scripts/audit-recipes-full.mjs --limit 20        # test on 20
 *   node scripts/audit-recipes-full.mjs --id <uuid>       # single recipe
 *   node scripts/audit-recipes-full.mjs --offset 500      # resume
 *   node scripts/audit-recipes-full.mjs --verbose         # show all issues
 *   node scripts/audit-recipes-full.mjs                   # full run (~1539)
 *
 * Cost estimate: ~$1.50–2.00 for full run (Haiku, ~1200 tokens/recipe avg).
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const SUPABASE_URL  = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY   = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const sb        = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── CLI args ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const VERBOSE   = args.includes('--verbose');
const LIMIT     = (() => { const i = args.indexOf('--limit');  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const START_OFF = (() => { const i = args.indexOf('--offset'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();
const SINGLE_ID = (() => { const i = args.indexOf('--id');     return i >= 0 ? args[i + 1] : null; })();

const CONFIDENCE_THRESHOLD = 85;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Haiku full audit ──────────────────────────────────────────────────────────
async function auditRecipe(title, servings, ingredients, steps) {
  const servingLabel = servings ? `${servings} servings` : '4 servings (assumed)';
  const ingInput = ingredients.map(i => ({
    name: i.name ?? '', quantity: i.quantity ?? '', unit: i.unit ?? '',
  }));
  const stepInput = steps.map(s => ({
    order: s.order, title: s.title ?? '', instruction: s.instruction ?? '',
  }));

  const prompt = `You are a professional recipe editor performing a full cookability audit.

Recipe: "${title}" (${servingLabel})

Evaluate BOTH the ingredient list AND the cooking steps.

INGREDIENT checks:
- Are quantities realistic for the serving count?
- Are units appropriate? (oil in cups/tbsp, meat in lb/oz, spices in tsp/tbsp)
- Any metric units that should be US? (g→oz/lb, ml→cups/tbsp, kg→lb, L→cups/qt)
- Sensible ratios between ingredients?
- Any ingredient named in the title but missing from the list?

STEP checks:
- Are steps in logical order (prep → cook → assemble → plate)?
- Are cook times and temperatures realistic? (e.g. chicken must reach 165°F, pasta takes 8-12 min)
- Do steps reference ingredients that aren't in the ingredient list?
- Are there missing critical steps? (e.g. no "bring to boil" before simmering, no "preheat oven")
- Does the recipe produce what the title promises?

Respond ONLY with a JSON object. No prose, no markdown fences.

Format when recipe is CORRECT (confidence ≥ 85):
{"confidence":91,"ingredient_issues":[],"step_issues":[],"corrected_ingredients":null,"corrected_steps":null}

Format when recipe needs FIXES (confidence < 85):
{"confidence":68,"ingredient_issues":["3 tbsp cayenne is ~6× too much"],"step_issues":["step 3 says boil for 2 min but chicken needs 165°F internal"],"corrected_ingredients":[{"name":"...","quantity":"...","unit":"..."},...] or null,"corrected_steps":[{"order":1,"title":"...","instruction":"..."},...] or null}

Rules for corrected_ingredients (include only when ingredient fixes needed):
- Return ALL ingredients, same count as input
- quantity: plain string ("1", "1.5", "1/2", "to taste")
- unit: string (e.g. "lb","oz","cup","tbsp","tsp",""); empty string for pure counts
- US customary only — never grams, ml, kg, liters
- Never change ingredient name
- Keep correct ingredients exactly as-is

Rules for corrected_steps (include only when step fixes needed):
- Return ALL steps, same count as input
- order: same integer as original
- title: short title string (max 6 words)
- instruction: corrected instruction text
- Fix only what is wrong — keep correct steps exactly as-is
- Do NOT add new steps or remove steps; fix the content only
- Correct temperatures to °F, times to realistic ranges
- Remove references to ingredients not in the ingredient list

Ingredients (${ingInput.length} total):
${JSON.stringify(ingInput, null, 2)}

Steps (${stepInput.length} total):
${JSON.stringify(stepInput, null, 2)}`;

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw     = msg.content[0].text.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  if (typeof parsed.confidence !== 'number') {
    throw new Error(`Missing confidence: ${raw.slice(0, 200)}`);
  }

  return {
    confidence:           parsed.confidence,
    ingredient_issues:    Array.isArray(parsed.ingredient_issues) ? parsed.ingredient_issues : [],
    step_issues:          Array.isArray(parsed.step_issues)       ? parsed.step_issues       : [],
    corrected_ingredients: parsed.corrected_ingredients ?? null,
    corrected_steps:       parsed.corrected_steps       ?? null,
  };
}

// ── Merge helpers ─────────────────────────────────────────────────────────────
function mergeIngredients(original, corrected) {
  if (!Array.isArray(corrected)) return null;

  if (corrected.length === original.length) {
    return corrected.map((p, i) => ({
      ...original[i],
      name:     String(p.name     ?? original[i].name     ?? ''),
      quantity: String(p.quantity ?? original[i].quantity ?? ''),
      unit:     String(p.unit     ?? original[i].unit     ?? ''),
    }));
  }

  // Name-match fallback
  const nameMap = new Map();
  for (const p of corrected) {
    const key = String(p.name ?? '').trim().toLowerCase();
    if (key) nameMap.set(key, p);
  }
  const merged = original.map(o => {
    const match = nameMap.get(String(o.name ?? '').trim().toLowerCase());
    if (!match) return o;
    return { ...o, quantity: String(match.quantity ?? o.quantity ?? ''), unit: String(match.unit ?? o.unit ?? '') };
  });
  const changed = merged.filter((m, i) => m.quantity !== (original[i].quantity ?? '') || m.unit !== (original[i].unit ?? '')).length;
  return changed > 0 ? merged : null;
}

function mergeSteps(original, corrected) {
  if (!Array.isArray(corrected)) return null;
  if (corrected.length !== original.length) {
    // Order-match fallback
    const orderMap = new Map();
    for (const s of corrected) orderMap.set(s.order, s);
    const merged = original.map(o => {
      const match = orderMap.get(o.order);
      if (!match) return o;
      return { ...o, title: String(match.title ?? o.title ?? ''), instruction: String(match.instruction ?? o.instruction ?? '') };
    });
    const changed = merged.filter((m, i) => m.title !== (original[i].title ?? '') || m.instruction !== (original[i].instruction ?? '')).length;
    return changed > 0 ? merged : null;
  }
  const result = corrected.map((s, i) => ({
    ...original[i],
    order:       s.order       ?? original[i].order,
    title:       String(s.title       ?? original[i].title       ?? ''),
    instruction: String(s.instruction ?? original[i].instruction ?? ''),
  }));
  const changed = result.filter((r, i) => r.title !== (original[i].title ?? '') || r.instruction !== (original[i].instruction ?? '')).length;
  return changed > 0 ? result : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`audit-recipes-full — threshold: ${CONFIDENCE_THRESHOLD} | mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  let recipes;

  if (SINGLE_ID) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, servings, ingredients, steps')
      .eq('id', SINGLE_ID)
      .single();
    if (error || !data) { console.error('Recipe not found:', SINGLE_ID); process.exit(1); }
    recipes = [data];
    console.log(`Single recipe: "${data.title}"`);
  } else {
    const PAGE = 200;
    let offset = START_OFF;
    const all  = [];
    while (true) {
      const { data, error } = await sb
        .from('recipes')
        .select('id, title, servings, ingredients, steps')
        .range(offset, offset + PAGE - 1)
        .order('id');
      if (error) { console.error('Fetch error:', error.message); process.exit(1); }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    console.log(`Fetched ${all.length} recipes${START_OFF > 0 ? ` (from offset ${START_OFF})` : ''}`);

    recipes = all.filter(r =>
      Array.isArray(r.ingredients) && r.ingredients.length > 0 &&
      Array.isArray(r.steps)       && r.steps.length > 0
    );
    const noSteps = all.length - recipes.length;
    if (noSteps > 0) console.log(`Skipped ${noSteps} recipes with no steps`);
    if (isFinite(LIMIT)) recipes = recipes.slice(0, LIMIT);
  }

  console.log(`Auditing ${recipes.length} recipes...\n`);

  let confirmed = 0, ingFixed = 0, stepFixed = 0, bothFixed = 0, noOp = 0, errored = 0;

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    const ings   = recipe.ingredients;
    const steps  = recipe.steps;
    const label  = `[${i + 1}/${recipes.length}] ${recipe.title.slice(0, 52).padEnd(52)}`;

    process.stdout.write(label);

    try {
      const result = await auditRecipe(recipe.title, recipe.servings, ings, steps);

      if (result.confidence >= CONFIDENCE_THRESHOLD) {
        console.log(` ✓ ${result.confidence}`);
        confirmed++;
        if (VERBOSE && (result.ingredient_issues.length || result.step_issues.length)) {
          result.ingredient_issues.forEach(x => console.log(`    ing: ${x}`));
          result.step_issues.forEach(x => console.log(`    step: ${x}`));
        }
        continue;
      }

      // Below threshold — attempt fixes
      const fixedIngs  = result.corrected_ingredients ? mergeIngredients(ings, result.corrected_ingredients) : null;
      const fixedSteps = result.corrected_steps       ? mergeSteps(steps, result.corrected_steps)            : null;

      if (!fixedIngs && !fixedSteps) {
        console.log(` ⚠ ${result.confidence} (issues flagged, no corrections provided)`);
        if (VERBOSE) {
          result.ingredient_issues.forEach(x => console.log(`    ing: ${x}`));
          result.step_issues.forEach(x => console.log(`    step: ${x}`));
        }
        noOp++;
        continue;
      }

      const ingChanged  = !!fixedIngs;
      const stepChanged = !!fixedSteps;
      const tag = ingChanged && stepChanged ? 'FIXED ing+steps' : ingChanged ? 'FIXED ingredients' : 'FIXED steps';

      if (DRY_RUN) {
        console.log(` ${tag} (confidence ${result.confidence})`);
        if (VERBOSE || result.ingredient_issues.length + result.step_issues.length <= 4) {
          result.ingredient_issues.slice(0, 3).forEach(x => console.log(`    ing: ${x}`));
          result.step_issues.slice(0, 3).forEach(x => console.log(`    step: ${x}`));
        }
      } else {
        const update = {};
        if (fixedIngs)  update.ingredients = fixedIngs;
        if (fixedSteps) update.steps       = fixedSteps;
        const { error } = await sb.from('recipes').update(update).eq('id', recipe.id);
        if (error) throw error;
        console.log(` ${tag} (confidence was ${result.confidence})`);
        if (VERBOSE) {
          result.ingredient_issues.slice(0, 3).forEach(x => console.log(`    ing: ${x}`));
          result.step_issues.slice(0, 3).forEach(x => console.log(`    step: ${x}`));
        }
      }

      if (ingChanged && stepChanged) bothFixed++;
      else if (ingChanged) ingFixed++;
      else stepFixed++;

    } catch (err) {
      console.log(` ERROR: ${err.message.slice(0, 80)}`);
      errored++;
    }

    if (!SINGLE_ID && (i + 1) % 10 === 0) await sleep(600);
  }

  console.log(`\n── Summary ──`);
  console.log(`  Confirmed OK        : ${confirmed}`);
  console.log(`  ${DRY_RUN ? 'Would fix' : 'Fixed'} ingredients  : ${ingFixed}`);
  console.log(`  ${DRY_RUN ? 'Would fix' : 'Fixed'} steps         : ${stepFixed}`);
  console.log(`  ${DRY_RUN ? 'Would fix' : 'Fixed'} both           : ${bothFixed}`);
  console.log(`  Flagged (no fix)    : ${noOp}`);
  console.log(`  Errors              : ${errored}`);
  console.log(`  Total fixes         : ${ingFixed + stepFixed + bothFixed}`);
  if (DRY_RUN) console.log('\nDry run — no writes made.');
}

main();
