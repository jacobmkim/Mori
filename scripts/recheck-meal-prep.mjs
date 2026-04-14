/**
 * recheck-meal-prep.mjs
 * Uses Claude Haiku to re-evaluate meal_prep_friendly for recipes in Supabase.
 *
 * Cost: ~$0.10 for all 1890 recipes (Haiku at ~50 tokens/recipe)
 *
 * Usage:
 *   node scripts/recheck-meal-prep.mjs              # only recipes where meal_prep_friendly IS NULL
 *   node scripts/recheck-meal-prep.mjs --all        # re-evaluate every recipe
 *   node scripts/recheck-meal-prep.mjs --false      # only recipes currently marked false
 *   node scripts/recheck-meal-prep.mjs --dry-run    # preview changes without writing
 *
 * Safe to kill and re-run — use the same flag to resume.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ────────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL   = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY    = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY  = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing env vars: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const sb       = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const args    = process.argv.slice(2);
const ALL     = args.includes('--all');
const FALSE   = args.includes('--false');
const DRY_RUN = args.includes('--dry-run');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Classify ──────────────────────────────────────────────────────────────────
async function isMealPrep(recipe) {
  const ingredientNames = (recipe.ingredients ?? [])
    .map(i => i.name)
    .filter(Boolean)
    .slice(0, 15)
    .join(', ');

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 5,
    messages: [{
      role: 'user',
      content: `Is this recipe meal-prep friendly? Answer only "yes" or "no".

Default to YES. Think component-by-component: if the main components can be cooked ahead, stored in the fridge 3–5 days, and reheated or assembled quickly, it is meal-prep friendly.

YES (almost everything): soups, stews, curries, roasted/grilled meats, rice dishes, grain bowls, pasta with sauce, casseroles, stir-fries, sheet pan meals, marinated proteins, overnight oats, salads (dressing stored separately), bowl dishes (components stored separately), taco/burrito fillings, dips and spreads, braised dishes, fried rice, noodle dishes.

NO (only these): deep-fried foods where crunch is the whole point and reheating ruins them (tempura, spring rolls, tonkatsu), delicate egg dishes that must be eaten immediately (soufflés, soft-poached eggs as the main component), fresh pastry meant to be eaten same-day (croissants), raw fish preparations for immediate consumption (sashimi, fresh-assembled sushi rolls).

If in doubt, answer yes.

Recipe: ${recipe.title}
Cuisine: ${recipe.cuisine ?? 'unknown'}
Ingredients: ${ingredientNames}

Answer:`
    }],
  });

  const answer = msg.content[0].text.trim().toLowerCase();
  return answer.startsWith('y');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Build query based on flags
  let query = sb
    .from('recipes')
    .select('id, title, cuisine, meal_prep_friendly, ingredients')
    .order('title', { ascending: true });

  if (ALL) {
    // All recipes
  } else if (FALSE) {
    query = query.eq('meal_prep_friendly', false);
  } else {
    query = query.is('meal_prep_friendly', null);
  }

  const { data: recipes, error } = await query;
  if (error) { console.error('DB error:', error.message); process.exit(1); }

  const mode = ALL ? 'all' : FALSE ? 'meal_prep_friendly = false' : 'meal_prep_friendly IS NULL';
  console.log(`\nRechecking ${recipes.length} recipes (${mode})${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`Estimated cost: ~$${(recipes.length * 0.000025).toFixed(3)}\n`);

  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const changed = [];

  for (const recipe of recipes) {
    try {
      process.stdout.write(`  ${recipe.title}...`);

      const result = await isMealPrep(recipe);
      const prev   = recipe.meal_prep_friendly;
      const flip   = prev !== result;

      if (flip) {
        changed.push({ title: recipe.title, from: prev, to: result });
        process.stdout.write(` ${prev === null ? 'null' : prev} → ${result ? 'YES' : 'NO'} ✓\n`);
        if (!DRY_RUN) {
          await sb.from('recipes').update({ meal_prep_friendly: result }).eq('id', recipe.id);
        }
        updated++;
      } else {
        process.stdout.write(` ${result ? 'yes' : 'no'} (unchanged)\n`);
        unchanged++;
      }

      await sleep(500);
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      failed++;
      await sleep(1000);
    }
  }

  console.log(`\n── Summary ──────────────────────────────────`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Failed:    ${failed}`);

  if (changed.length > 0) {
    console.log(`\n── Changed recipes ──────────────────────────`);
    for (const c of changed) {
      console.log(`  ${c.from === null ? 'null' : c.from ? 'YES' : 'NO '} → ${c.to ? 'YES' : 'NO '}: ${c.title}`);
    }
  }

  if (DRY_RUN && updated > 0) {
    console.log(`\n[DRY RUN] No changes written. Re-run without --dry-run to apply.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
