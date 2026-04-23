/**
 * normalize-ingredient-units.mjs
 *
 * Rewrites recipe ingredients from metric/awkward quantities to standard US
 * grocery amounts using Claude Haiku. Examples:
 *   600g potatoes      → 1.5 lb potatoes
 *   4 salmon fillets   → 1.5 lb salmon fillet
 *   300 ml chicken broth → 1.25 cups chicken broth
 *   12.1 oz chicken    → 12 oz chicken
 *
 * Usage:
 *   node scripts/normalize-ingredient-units.mjs --dry-run        # preview, no writes
 *   node scripts/normalize-ingredient-units.mjs --limit 20       # test on 20 recipes
 *   node scripts/normalize-ingredient-units.mjs --metric-only    # only recipes w/ metric units
 *   node scripts/normalize-ingredient-units.mjs                  # full run (~1506 recipes)
 *
 * Safe to re-run. Skips recipes already tagged units_normalized=true (if column exists).
 * Cost: ~$0.02–0.05 for full run (Haiku, ~150 tokens/recipe).
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

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const METRIC_ONLY = args.includes('--metric-only');
const LIMIT       = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Metric detection ──────────────────────────────────────────────────────────
const METRIC_UNITS = new Set(['g', 'gram', 'grams', 'kg', 'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'litre', 'litres']);
const AWKWARD_QTY  = /^\d+\.\d{1,2}$/; // e.g. "12.1", "0.87"

function needsNormalization(ingredients) {
  return ingredients.some(i => {
    const u = (i.unit ?? '').toLowerCase().trim();
    const q = (i.quantity ?? '').trim();
    if (METRIC_UNITS.has(u)) return true;
    // embedded metric unit in quantity string (MealDB style: "300g", "1.5L")
    if (/^\d[\d./]*\s*(g|kg|ml|l)\b/i.test(q)) return true;
    // awkward decimal in quantity
    if (AWKWARD_QTY.test(q)) return true;
    return false;
  });
}

// ── Normalize via Haiku ───────────────────────────────────────────────────────
async function normalizeIngredients(recipeTitle, ingredients) {
  const input = ingredients.map(i => ({
    name: i.name,
    quantity: i.quantity ?? '',
    unit: i.unit ?? '',
  }));

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are normalizing recipe ingredients to standard US grocery store amounts.

Recipe: ${recipeTitle}

Rules:
- Use oz or lb for weight — never grams or kg
- Use cups, tbsp, tsp for volume — never ml or liters
- Use round numbers that match real grocery package sizes:
  • Meats/fish: prefer lb (e.g. 1 lb, 1.5 lb, 2 lb) or whole oz (6 oz, 8 oz, 12 oz)
  • Produce by weight: 1 lb, 2 lb, 0.5 lb — or whole numbers if sold by piece (3 lemons, 2 avocados)
  • Canned goods: 1 can (state oz if helpful: "1 can (14 oz)")
  • Dairy: standard sizes (1 cup, 2 cups, 8 oz, 1 lb)
  • Liquids/broth: cups or fl oz (1 cup, 2 cups, 1/2 cup)
- Convert "4 salmon fillets" → weight like "1.5 lb salmon fillet"
- Convert "4 chicken breasts" → "1.5 lb chicken breast" or "2 lb chicken breast"
- Keep produce counts as-is when that's how they're sold (3 lemons, 2 garlic cloves)
- If already in clean US units with reasonable amounts, keep exactly as-is
- Never change the ingredient name, only quantity and unit
- quantity must be a string (e.g. "1", "1.5", "1/2", "2"). unit is a string (e.g. "lb", "oz", "cup", "tbsp", "tsp", ""). If no unit (pure count), unit = ""

Return ONLY a JSON array, no explanation:
[{"name":"...","quantity":"...","unit":"..."},...]

Ingredients:
${JSON.stringify(input, null, 2)}`
    }],
  });

  const raw = msg.content[0].text.trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);

  // Validate shape — must return same count with name/quantity/unit
  if (!Array.isArray(parsed) || parsed.length !== ingredients.length) {
    throw new Error(`Expected ${ingredients.length} items, got ${parsed.length}`);
  }
  return parsed.map(p => ({
    name:     String(p.name ?? ''),
    quantity: String(p.quantity ?? ''),
    unit:     String(p.unit ?? ''),
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Filter: ${METRIC_ONLY ? 'metric-only' : 'all'} | Limit: ${isFinite(LIMIT) ? LIMIT : 'none'}`);

  // Paginate all recipes
  const PAGE = 200;
  let offset = 0;
  let all = [];
  while (true) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, ingredients')
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`Fetched ${all.length} recipes`);

  // Filter
  const toProcess = all.filter(r => {
    const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
    if (ings.length === 0) return false;
    return METRIC_ONLY ? needsNormalization(ings) : true;
  });

  const capped = isFinite(LIMIT) ? toProcess.slice(0, LIMIT) : toProcess;
  console.log(`Processing ${capped.length} recipes${METRIC_ONLY ? ' (metric/awkward only)' : ''}`);

  let updated = 0, skipped = 0, errored = 0;

  for (let i = 0; i < capped.length; i++) {
    const recipe = capped[i];
    const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

    process.stdout.write(`[${i + 1}/${capped.length}] ${recipe.title.slice(0, 50).padEnd(50)} `);

    try {
      const normalized = await normalizeIngredients(recipe.title, ings);

      // Show diff
      const changed = normalized.filter((n, idx) => {
        const o = ings[idx];
        return n.quantity !== (o.quantity ?? '') || n.unit !== (o.unit ?? '');
      });

      if (changed.length === 0) {
        console.log('no changes');
        skipped++;
      } else {
        if (DRY_RUN) {
          console.log(`would update ${changed.length} ingredient(s):`);
          changed.forEach(n => {
            const idx = normalized.indexOf(n);
            const o = ings[idx];
            console.log(`    ${o.name}: "${o.quantity} ${o.unit}".trim() → "${n.quantity} ${n.unit}".trim()`);
          });
        } else {
          const { error } = await sb
            .from('recipes')
            .update({ ingredients: normalized })
            .eq('id', recipe.id);
          if (error) throw error;
          console.log(`updated ${changed.length} ingredient(s)`);
        }
        updated++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errored++;
    }

    // Polite rate limiting
    if ((i + 1) % 10 === 0) await sleep(500);
  }

  console.log(`\nDone. Updated: ${updated} | Unchanged: ${skipped} | Errors: ${errored}`);
  if (DRY_RUN) console.log('Dry run — no writes made.');
}

main();
