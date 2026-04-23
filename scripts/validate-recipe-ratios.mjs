/**
 * validate-recipe-ratios.mjs
 *
 * Uses Claude Haiku to review every recipe's ingredient amounts for cooking
 * plausibility. Haiku scores confidence 0–100; anything below 85 triggers a
 * correction pass where Haiku rewrites the offending quantities/units.
 *
 * What gets caught:
 *   - Wildly wrong quantities  (10 lb salt, 0.1 oz pasta for 4 servings)
 *   - Wrong unit type          (1 lb olive oil → 1 cup, 3 cups salt → 3 tsp)
 *   - Metric slip-throughs     (400g beef → 1 lb beef)
 *   - Implausible ratios       (more sauce than protein in a stir-fry)
 *   - Non-standard pack sizes  (12.1 oz chicken → 12 oz)
 *
 * Usage:
 *   node scripts/validate-recipe-ratios.mjs --dry-run          # preview, no writes
 *   node scripts/validate-recipe-ratios.mjs --limit 20         # test on first 20
 *   node scripts/validate-recipe-ratios.mjs --id <uuid>        # single recipe
 *   node scripts/validate-recipe-ratios.mjs --offset 200       # resume from row 200
 *   node scripts/validate-recipe-ratios.mjs --verbose          # show all issues
 *   node scripts/validate-recipe-ratios.mjs                    # full run (~1506)
 *
 * Cost estimate: ~$0.03–0.07 for full run (Haiku, ~200 tokens/recipe avg).
 * Safe to re-run — unchanged recipes are a no-op.
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

// ── Haiku review ──────────────────────────────────────────────────────────────
async function reviewRecipe(title, servings, ingredients) {
  const servingLabel = servings ? `${servings} servings` : '4 servings (assumed)';
  const input = ingredients.map(i => ({
    name:     i.name     ?? '',
    quantity: i.quantity ?? '',
    unit:     i.unit     ?? '',
  }));

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a professional recipe editor checking whether ingredient amounts are correct and cookable.

Recipe: "${title}" (${servingLabel})

Evaluate the ingredient list below. Ask yourself:
1. Are quantities realistic for the stated serving count?
2. Are units appropriate for each ingredient? (e.g. oil in cups/tbsp, meat in lb/oz, spices in tsp/tbsp)
3. Do the ratios between ingredients make culinary sense?
4. Are there metric units (g, kg, ml, L) that should be US units?
5. Are there awkward decimals that should be rounded (e.g. 12.1 oz → 12 oz)?

Respond ONLY with a JSON object. No prose, no markdown fences, just the object.

Format when recipe looks CORRECT (confidence ≥ 85):
{"confidence":92,"issues":[],"ingredients":null}

Format when recipe needs FIXES (confidence < 85):
{"confidence":71,"issues":["10 lb salt is ~20× too much","pasta qty suspiciously low for 4 servings"],"ingredients":[{"name":"...","quantity":"...","unit":"..."},...]}

Rules for the corrected "ingredients" array (only include when confidence < 85):
- Return ALL ingredients, not just changed ones
- quantity must be a plain string ("1", "1.5", "1/2", "2", "to taste")
- unit is a string (e.g. "lb", "oz", "cup", "tbsp", "tsp", "can", ""); empty string for pure counts
- Use US customary units only — never grams, ml, kg, liters
- Round to nearest sensible grocery amount (8 oz, 12 oz, 1 lb, 1.5 lb)
- Never change the ingredient name
- If an ingredient looks fine, keep its quantity and unit exactly as-is

Ingredients to review:
${JSON.stringify(input, null, 2)}`,
    }],
  });

  const raw = msg.content[0].text.trim();

  // Strip accidental markdown fences
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON object in response: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  if (typeof parsed.confidence !== 'number') {
    throw new Error(`Missing confidence field: ${raw.slice(0, 200)}`);
  }

  return {
    confidence: parsed.confidence,
    issues:     Array.isArray(parsed.issues) ? parsed.issues : [],
    ingredients: parsed.ingredients ?? null,
  };
}

// ── Validate corrected ingredients shape ──────────────────────────────────────
// Primary: positional match (lengths must match).
// Fallback: name-match merge — when Haiku splits or merges ingredients we still
// apply quantity/unit corrections for names that line up exactly.
function validateCorrected(original, corrected) {
  if (!Array.isArray(corrected)) throw new Error('corrected is not an array');

  if (corrected.length === original.length) {
    // Happy path — positional merge
    return corrected.map((p, i) => ({
      ...original[i],
      name:     String(p.name     ?? original[i].name     ?? ''),
      quantity: String(p.quantity ?? original[i].quantity ?? ''),
      unit:     String(p.unit     ?? original[i].unit     ?? ''),
    }));
  }

  // Fallback: name-match merge — preserves original list length/order,
  // applies only qty/unit corrections for names Haiku returned.
  const nameMap = new Map();
  for (const p of corrected) {
    const key = String(p.name ?? '').trim().toLowerCase();
    if (key) nameMap.set(key, p);
  }

  const merged = original.map(o => {
    const key   = String(o.name ?? '').trim().toLowerCase();
    const match = nameMap.get(key);
    if (!match) return o; // no correction — keep original
    return {
      ...o,
      quantity: String(match.quantity ?? o.quantity ?? ''),
      unit:     String(match.unit     ?? o.unit     ?? ''),
    };
  });

  const appliedCount = merged.filter((m, i) => {
    const o = original[i];
    return m.quantity !== (o.quantity ?? '') || m.unit !== (o.unit ?? '');
  }).length;

  if (appliedCount === 0) throw new Error(`Length mismatch (${original.length} vs ${corrected.length}) and no name overlap found`);

  return merged;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`validate-recipe-ratios — threshold: ${CONFIDENCE_THRESHOLD} | mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  let recipes;

  if (SINGLE_ID) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, servings, ingredients')
      .eq('id', SINGLE_ID)
      .single();
    if (error || !data) { console.error('Recipe not found:', SINGLE_ID); process.exit(1); }
    recipes = [data];
    console.log(`Single recipe: "${data.title}"`);
  } else {
    // Paginate all
    const PAGE = 200;
    let offset = START_OFF;
    const all  = [];
    while (true) {
      const { data, error } = await sb
        .from('recipes')
        .select('id, title, servings, ingredients')
        .range(offset, offset + PAGE - 1)
        .order('id');
      if (error) { console.error('Fetch error:', error.message); process.exit(1); }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    console.log(`Fetched ${all.length} recipes${START_OFF > 0 ? ` (starting at offset ${START_OFF})` : ''}`);

    // Filter out recipes with no ingredients
    recipes = all.filter(r => Array.isArray(r.ingredients) && r.ingredients.length > 0);
    console.log(`With ingredients: ${recipes.length}`);

    if (isFinite(LIMIT)) recipes = recipes.slice(0, LIMIT);
  }

  let reviewed = 0, fixed = 0, skipped = 0, errored = 0;

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    const ings   = recipe.ingredients;
    const label  = `[${i + 1}/${recipes.length}] ${recipe.title.slice(0, 55).padEnd(55)}`;

    process.stdout.write(label);

    try {
      const result = await reviewRecipe(recipe.title, recipe.servings, ings);
      reviewed++;

      if (result.confidence >= CONFIDENCE_THRESHOLD) {
        console.log(` ✓ ${result.confidence}`);
        skipped++;
      } else {
        // Need fix
        if (!result.ingredients) {
          // Haiku signalled low confidence but didn't supply corrections
          console.log(` ⚠ ${result.confidence} (no corrections provided, skipping)`);
          if (VERBOSE && result.issues.length) {
            result.issues.forEach(iss => console.log(`    ↳ ${iss}`));
          }
          skipped++;
        } else {
          let corrected;
          try {
            corrected = validateCorrected(ings, result.ingredients);
          } catch (e) {
            console.log(` ERROR validating correction: ${e.message}`);
            errored++;
            continue;
          }

          const changed = corrected.filter((c, idx) => {
            const o = ings[idx];
            return c.quantity !== (o.quantity ?? '') || c.unit !== (o.unit ?? '');
          });

          if (changed.length === 0) {
            console.log(` ~ ${result.confidence} (no actual changes, skipping)`);
            skipped++;
          } else if (DRY_RUN) {
            console.log(` WOULD FIX ${changed.length} ingredient(s) (confidence ${result.confidence})`);
            if (VERBOSE || result.issues.length <= 3) {
              result.issues.forEach(iss => console.log(`    issue: ${iss}`));
              changed.slice(0, 5).forEach(c => {
                const idx = corrected.indexOf(c);
                const o   = ings[idx];
                console.log(`    ${c.name}: "${o.quantity} ${o.unit}".trim() → "${c.quantity} ${c.unit}".trim()`);
              });
            }
            fixed++;
          } else {
            const { error } = await sb
              .from('recipes')
              .update({ ingredients: corrected })
              .eq('id', recipe.id);
            if (error) throw error;
            console.log(` FIXED ${changed.length} ingredient(s) (confidence was ${result.confidence})`);
            if (VERBOSE) {
              result.issues.forEach(iss => console.log(`    issue: ${iss}`));
              changed.slice(0, 5).forEach(c => {
                const idx = corrected.indexOf(c);
                const o   = ings[idx];
                console.log(`    ${c.name}: "${o.quantity} ${o.unit}".trim() → "${c.quantity} ${c.unit}".trim()`);
              });
            }
            fixed++;
          }
        }
      }
    } catch (err) {
      console.log(` ERROR: ${err.message.slice(0, 80)}`);
      errored++;
    }

    // Rate limiting — polite to Haiku
    if (!SINGLE_ID && (i + 1) % 10 === 0) await sleep(600);
  }

  console.log(`\n── Summary ──`);
  console.log(`  Reviewed : ${reviewed}`);
  console.log(`  ${DRY_RUN ? 'Would fix' : 'Fixed'}    : ${fixed}`);
  console.log(`  OK/no-op : ${skipped}`);
  console.log(`  Errors   : ${errored}`);
  if (DRY_RUN) console.log('\nDry run — no writes made.');
}

main();
