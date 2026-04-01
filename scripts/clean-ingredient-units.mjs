/**
 * clean-ingredient-units.mjs
 * Strips prep instructions from ingredient fields across all recipes.
 *
 * Fixes three patterns:
 * 1. Generated recipes — prep in name field: "shallot, finely minced" → "shallot"
 * 2. Generated recipes — prep in unit field: "medium, finely chopped" → "medium"
 * 3. TheMealDB recipes — prep in quantity field: "4 Chopped" → "4"
 *
 * Usage: node scripts/clean-ingredient-units.mjs
 * Safe to re-run.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);

const PREP_WORDS = [
  'finely', 'roughly', 'coarsely', 'thinly', 'freshly',
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'beaten',
  'crushed', 'peeled', 'trimmed', 'halved', 'quartered',
  'shredded', 'julienned', 'torn', 'crumbled', 'softened',
  'melted', 'toasted', 'roasted', 'frozen', 'thawed',
  'rinsed', 'drained', 'sifted', 'packed', 'heaped',
];

const PREP_REGEX = new RegExp(
  `(,\\s*)?(\\b(${PREP_WORDS.join('|')})(\\s+(and\\s+)?(${PREP_WORDS.join('|')}))*\\b)\\s*$`,
  'i'
);

// Also strip trailing prep from quantity like "4 Chopped" or "2 cups, drained"
const QTY_PREP_REGEX = new RegExp(
  `[,\\s]+(${PREP_WORDS.join('|')})(\\s+and\\s+(${PREP_WORDS.join('|')}))*\\s*$`,
  'i'
);

function cleanName(name) {
  return name.replace(PREP_REGEX, '').trim();
}

function cleanUnit(unit) {
  return unit.replace(PREP_REGEX, '').trim();
}

function cleanQuantity(qty) {
  return qty.replace(QTY_PREP_REGEX, '').trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Fetch all recipes with ingredients
  const { data: recipes, error } = await sb
    .from('recipes')
    .select('id, title, external_id, ingredients');

  if (error) { console.error(error.message); process.exit(1); }

  console.log(`\nCleaning ingredient fields across ${recipes.length} recipes...\n`);

  let updatedCount = 0;

  for (const recipe of recipes) {
    if (!Array.isArray(recipe.ingredients)) continue;

    let changed = false;
    const cleaned = recipe.ingredients.map(ing => {
      const result = { ...ing };

      if (recipe.external_id) {
        // TheMealDB: fix quantity field
        if (ing.quantity && QTY_PREP_REGEX.test(ing.quantity)) {
          result.quantity = cleanQuantity(ing.quantity);
          changed = true;
        }
      } else {
        // Generated: fix name field (e.g. "shallot, finely minced")
        if (ing.name && PREP_REGEX.test(ing.name)) {
          result.name = cleanName(ing.name);
          changed = true;
        }
        // Generated: fix unit field (e.g. "medium, finely chopped")
        if (ing.unit && PREP_REGEX.test(ing.unit)) {
          result.unit = cleanUnit(ing.unit);
          changed = true;
        }
      }

      return result;
    });

    if (changed) {
      await sb.from('recipes').update({ ingredients: cleaned }).eq('id', recipe.id);
      console.log(`  ✓ ${recipe.title}`);
      updatedCount++;
    }
  }

  console.log(`\nDone — ${updatedCount} recipes cleaned.`);
}

main().catch(err => { console.error(err); process.exit(1); });
