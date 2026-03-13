// Backfill script: fetches TheMealDB detail for every seeded recipe that has no
// ingredients stored yet, then writes ingredients + description to Supabase.
// Run once with: node scripts/backfill-recipe-details.mjs
// Safe to re-run — skips recipes that already have ingredients.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually
const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1200; // TheMealDB is free — stay polite

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDetail(externalId) {
  const url = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${externalId}`;
  const res = await fetch(url);
  const data = await res.json();
  const meal = data.meals?.[0];
  if (!meal) return null;

  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) continue;
    const measure = meal[`strMeasure${i}`]?.trim() ?? '';
    ingredients.push({ name, quantity: measure, unit: '' });
  }

  const area = meal.strArea ?? '';
  const category = meal.strCategory ?? '';
  const top3 = ingredients.slice(0, 3).map(i => i.name.toLowerCase());
  let description = '';
  if (top3.length > 0) {
    const ingList = top3.length === 1
      ? top3[0]
      : top3.slice(0, -1).join(', ') + ' and ' + top3[top3.length - 1];
    const origin = area && area !== 'Unknown' ? `${area} ` : '';
    const cat = category ? category.toLowerCase() : 'dish';
    description = `A ${origin}${cat} made with ${ingList}.`;
  } else if (area && category) {
    description = `${category} · ${area}`;
  }

  return { ingredients, description, category };
}

async function main() {
  // Fetch all recipes that need backfilling (external_id present, ingredients empty)
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, external_id, title, dietary_tags')
    .not('external_id', 'is', null)
    .eq('ingredients', '[]');  // jsonb comparison — only empty arrays

  if (error) {
    console.error('Failed to fetch recipes:', error.message);
    process.exit(1);
  }

  console.log(`Found ${recipes.length} recipes needing backfill.`);
  if (recipes.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
    const batch = recipes.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(recipes.length / BATCH_SIZE)} — processing ${batch.length} recipes...`);

    await Promise.all(batch.map(async (recipe) => {
      try {
        const detail = await fetchDetail(recipe.external_id);
        if (!detail || detail.ingredients.length === 0) {
          console.warn(`  ⚠ No detail found for: ${recipe.title} (${recipe.external_id})`);
          failed++;
          return;
        }

        // Build dietary_tags: preserve existing tags, add category if not already present
        const existingTags = recipe.dietary_tags ?? [];
        const newTags = detail.category && !existingTags.includes(detail.category)
          ? [...existingTags, detail.category]
          : existingTags;

        const { error: updateErr } = await supabase
          .from('recipes')
          .update({
            description: detail.description,
            ingredients: detail.ingredients,
            dietary_tags: newTags,
          })
          .eq('id', recipe.id);

        if (updateErr) {
          console.warn(`  ✗ Update failed for ${recipe.title}: ${updateErr.message}`);
          failed++;
        } else {
          updated++;
          console.log(`  ✓ ${recipe.title}`);
        }
      } catch (err) {
        console.warn(`  ✗ Error for ${recipe.title}: ${err.message}`);
        failed++;
      }
    }));

    if (i + BATCH_SIZE < recipes.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\nDone. ${updated} updated, ${failed} failed.`);
}

main();
