// One-shot backfill: normalizes ingredient names across all recipes.
//
// What it does (in order per recipe):
//   1. Split compound staples  ("salt and black pepper" → salt + black pepper)
//   2. Lowercase all names
//   3. Apply CANONICAL_MAP    (garlic → garlic cloves, cumin → ground cumin, etc.)
//   4. Dedup within recipe    (merge identical names after normalization)
//   5. Skip if unchanged      (no write if nothing changed)
//   6. Batch write            (50 recipes per batch)
//
// Run:
//   node scripts/normalize-ingredients.mjs --dry-run   (logs changes, no writes)
//   node scripts/normalize-ingredients.mjs             (live)
//
// Safe to re-run — skip logic ensures already-normalized recipes cost one SELECT.

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── env ───────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }

// Use fetch directly — works with both legacy JWT keys and new sb_secret_... keys
const API = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey': SERVICE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

async function sbSelect(table, columns, rangeFrom, rangeTo) {
  const url = `${API}/${table}?select=${columns}&order=id.asc`;
  const res = await fetch(url, {
    headers: { ...HEADERS, 'Range': `${rangeFrom}-${rangeTo}`, 'Range-Unit': 'items' },
  });
  if (!res.ok) throw new Error(`SELECT failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbUpdate(table, id, body) {
  const res = await fetch(`${API}/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`UPDATE ${id} failed: ${res.status} ${await res.text()}`);
}

// ── flags ─────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('DRY RUN — no writes');

// ── Compound staple splits ────────────────────────────────────────────────────
// Keys are already lowercased. Values: array of [name, quantity, unit] tuples.
const SPLIT_MAP = {
  'salt and black pepper':             [['salt','to taste',''], ['black pepper','to taste','']],
  'salt and pepper':                   [['salt','to taste',''], ['pepper','to taste','']],
  'salt and black pepper to taste':    [['salt','to taste',''], ['black pepper','to taste','']],
  'sea salt and black pepper':         [['sea salt','to taste',''], ['black pepper','to taste','']],
  'salt and white pepper':             [['salt','to taste',''], ['white pepper','to taste','']],
  'salt and turmeric powder to taste': [['salt','to taste',''], ['turmeric powder','to taste','']],
};

// ── Canonical name map (mirror of lib/ingredientAliases.ts) ──────────────────
const CANONICAL_MAP = {
  // Plurals / singulars
  'onions': 'onion',  'onion, medium': 'onion',  'onion, cubed': 'onion',
  'chopped onion': 'onion',
  'red onions': 'red onion',  'shallot': 'shallots',
  'green onion': 'green onions',  'spring onions': 'green onions',
  'spring onion': 'green onions',  'scallions': 'green onions',
  'scallion': 'green onions',  'green onion (scallions)': 'green onions',
  'garlic': 'garlic cloves',  'garlic clove': 'garlic cloves',
  'garlic cloves, smashed': 'garlic cloves',
  'garlic cloves, thinly sliced': 'garlic cloves',
  'garlic cloves, sliced thin': 'garlic cloves',
  'minced garlic': 'garlic cloves',
  'egg': 'eggs',  'large eggs': 'eggs',
  'egg white': 'egg whites',  'egg yolk': 'egg yolks',
  'egg plants': 'eggplant',
  'carrot': 'carrots',  'carrot, cubed': 'carrots',
  'tomato': 'tomatoes',  'tomato, medium': 'tomatoes',  'ripe tomatoes': 'tomatoes',
  'lemons': 'lemon',
  'bay leaf': 'bay leaves',
  'bell peppers': 'bell pepper',  'red bell peppers': 'red bell pepper',
  'chicken breasts': 'chicken breast',
  // Typos / format variants
  'all purpose flour': 'all-purpose flour',
  'tinned tomatos': 'canned tomatoes',
  'chopped tomatoes': 'canned tomatoes',
  'sesame seed oil': 'sesame oil',
  'ground black pepper': 'black pepper',
  'vegetable oil for frying': 'vegetable oil',
  'ground nut oil': 'peanut oil',
  'mirin (sweet rice wine)': 'mirin',
  // UK → US
  'plain flour': 'all-purpose flour',
  'double cream': 'heavy cream',
  'chilli powder': 'chili powder',
  'minced beef': 'ground beef',
  'lamb mince':  'ground lamb',
  'minced pork': 'ground pork',
  // Meat plurals (prep descriptors intentionally NOT merged — they change what you buy)
  'chicken thigh': 'chicken thighs',
  'salmon fillet':  'salmon fillets',
  'red chilli flakes': 'red pepper flakes',
  'dried red chilli flakes': 'red pepper flakes',
  // Stock / broth
  'chicken broth': 'chicken stock',
  'beef broth': 'beef stock',
  'vegetable broth': 'vegetable stock',
  // Fresh herbs
  'parsley': 'fresh parsley',
  'fresh flat-leaf parsley': 'fresh parsley',
  'cilantro': 'fresh cilantro',
  'coriander leaves': 'fresh cilantro',
  'fresh coriander': 'fresh cilantro',
  'fresh coriander leaves': 'fresh cilantro',
  'fresh cilantro leaves': 'fresh cilantro',
  'fresh ginger': 'ginger',
  'ginger, fresh': 'ginger',
  // Spice ground form
  'cumin': 'ground cumin',
  'cumin powder': 'ground cumin',
};

function normalizeIngredientName(name) {
  const n = name.trim().toLowerCase();
  return CANONICAL_MAP[n] ?? n;
}

// ── Per-ingredient processing ─────────────────────────────────────────────────
function processIngredients(ingredients) {
  const result = [];

  for (const ing of ingredients) {
    const lowName = (ing.name ?? '').trim().toLowerCase();
    const split = SPLIT_MAP[lowName];

    if (split) {
      for (const [name, qty, unit] of split) {
        result.push({ ...ing, name, quantity: qty, unit });
      }
    } else {
      result.push({ ...ing, name: normalizeIngredientName(ing.name ?? '') });
    }
  }

  // Dedup within recipe: group by normalized name, merge quantities
  const seen = new Map();
  for (const ing of result) {
    const key = ing.name;
    if (seen.has(key)) {
      const prev = seen.get(key);
      const prevQty = (prev.quantity ?? '').trim();
      const newQty  = (ing.quantity ?? '').trim();
      if (prevQty && newQty && prevQty !== 'to taste' && newQty !== 'to taste') {
        prev.quantity = `${prevQty} + ${newQty}`;
      } else if (!prevQty && newQty) {
        prev.quantity = newQty;
      }
      // Keep prev unit if available
      if (!prev.unit && ing.unit) prev.unit = ing.unit;
    } else {
      seen.set(key, { ...ing });
    }
  }

  return [...seen.values()];
}

// ── Main ──────────────────────────────────────────────────────────────────────
const PAGE = 200;
let offset = 0;
let totalFetched = 0;
let totalChanged = 0;
let totalSkipped = 0;

console.log('Fetching recipes...');

while (true) {
  let recipes;
  try {
    recipes = await sbSelect('recipes', 'id,ingredients', offset, offset + PAGE - 1);
  } catch (e) { console.error('Fetch error:', e.message); process.exit(1); }
  if (!recipes || recipes.length === 0) break;

  totalFetched += recipes.length;
  const batch = [];

  for (const recipe of recipes) {
    if (!Array.isArray(recipe.ingredients)) { totalSkipped++; continue; }

    const normalized = processIngredients(recipe.ingredients);
    if (JSON.stringify(recipe.ingredients) === JSON.stringify(normalized)) {
      totalSkipped++;
      continue;
    }

    batch.push({ id: recipe.id, ingredients: normalized });
  }

  if (batch.length > 0) {
    if (DRY_RUN) {
      console.log(`[dry-run] Would update ${batch.length} recipes in this batch (offset ${offset})`);
      // Show a sample
      const sample = batch[0];
      const original = recipes.find(r => r.id === sample.id);
      console.log('  Sample before:', JSON.stringify(original.ingredients.slice(0, 3)));
      console.log('  Sample after: ', JSON.stringify(sample.ingredients.slice(0, 3)));
    } else {
      // Update in sub-batches of 50
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        for (const { id, ingredients } of chunk) {
          try {
            await sbUpdate('recipes', id, { ingredients });
          } catch (e) { console.error(`  Error updating ${id}:`, e.message); }
        }
        await new Promise(r => setTimeout(r, 200));
      }
      console.log(`[${offset + recipes.length}/${totalFetched}] Updated ${batch.length} recipes`);
    }
    totalChanged += batch.length;
  }

  if (recipes.length < PAGE) break;
  offset += PAGE;
}

console.log(`\nDone.`);
console.log(`  Fetched:  ${totalFetched}`);
console.log(`  Changed:  ${totalChanged}`);
console.log(`  Skipped:  ${totalSkipped} (already normalized or no ingredients)`);
