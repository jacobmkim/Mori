// One-time seed script: fetches all TheMealDB recipes → upserts to Supabase → assigns cohort affinities.
// Run with: node scripts/seed-recipes.mjs
// Requires EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually (no dotenv dependency needed)
const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);
const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const MEAL_AREAS = [
  'American', 'British', 'Canadian', 'Chinese', 'Croatian', 'Dutch',
  'Egyptian', 'Filipino', 'French', 'Greek', 'Indian', 'Irish', 'Italian',
  'Jamaican', 'Japanese', 'Kenyan', 'Malaysian', 'Mexican', 'Moroccan',
  'Polish', 'Portuguese', 'Russian', 'Spanish', 'Thai', 'Tunisian',
  'Turkish', 'Ukrainian', 'Vietnamese',
];

const EXCLUDE_WORDS = [
  'cake', 'pudding', 'tart', 'pie', 'biscuit', 'cookie', 'brownie', 'muffin',
  'pancake', 'waffle', 'ice cream', 'sorbet', 'custard', 'fudge', 'candy',
  'cheesecake', 'eclair', 'donut', 'doughnut', 'cobbler', 'crumble',
  'meringue', 'macaron', 'tiramisu', 'sourdough', 'baguette', 'focaccia',
  'brioche', 'croissant', 'scone', 'loaf',
];

const AREA_TO_CUISINE = {
  American: 'american', British: 'american', Canadian: 'american', Irish: 'american',
  Chinese: 'chinese', French: 'french', Greek: 'greek',
  Indian: 'indian', Italian: 'italian', Japanese: 'japanese', Korean: 'korean',
  Mexican: 'mexican', Jamaican: 'mexican',
  Spanish: 'mediterranean', Portuguese: 'mediterranean', Croatian: 'mediterranean',
  Thai: 'thai', Malaysian: 'thai', Filipino: 'thai', Vietnamese: 'thai',
  Moroccan: 'middle eastern', Egyptian: 'middle eastern', Tunisian: 'middle eastern',
  Turkish: 'middle eastern', Kenyan: 'middle eastern',
  Dutch: 'french', Polish: 'french', Russian: 'french', Ukrainian: 'french',
};

const CUISINE_ADJACENCY = {
  italian: ['mediterranean', 'french', 'greek'],
  french: ['italian', 'mediterranean', 'greek'],
  greek: ['mediterranean', 'italian', 'middle eastern'],
  mediterranean: ['italian', 'french', 'greek', 'middle eastern'],
  mexican: ['american'], american: ['mexican'],
  chinese: ['japanese', 'korean', 'thai'], japanese: ['chinese', 'korean'],
  korean: ['chinese', 'japanese'], thai: ['chinese', 'indian'],
  indian: ['thai', 'middle eastern'], 'middle eastern': ['mediterranean', 'indian', 'greek'],
};

const SKILL_LEVELS = ['beginner', 'home_cook', 'confident_chef'];
const MAIN_CUISINES = [
  'italian', 'mexican', 'chinese', 'japanese', 'indian',
  'american', 'mediterranean', 'thai', 'french', 'greek', 'korean', 'middle eastern',
];
const EATING_STYLES = ['quick_simple', 'variety', 'favourites_rotation'];

function buildAffinityRows(recipeId, area) {
  const cuisine = AREA_TO_CUISINE[area]?.toLowerCase() ?? null;
  const adjacent = cuisine ? (CUISINE_ADJACENCY[cuisine] ?? []) : [];
  const rows = [];

  for (const skill of SKILL_LEVELS) {
    for (let i = 0; i < MAIN_CUISINES.length; i++) {
      for (let j = i + 1; j < MAIN_CUISINES.length; j++) {
        const c1 = MAIN_CUISINES[i];
        const c2 = MAIN_CUISINES[j];
        for (const style of EATING_STYLES) {
          const key = `${skill}_${c1.replace(/\s/g, '_')}_${c2.replace(/\s/g, '_')}_${style}`;
          let score = 0.30;
          if (cuisine && (c1 === cuisine || c2 === cuisine)) score = 0.85;
          else if (adjacent.includes(c1) || adjacent.includes(c2)) score = 0.55;
          rows.push({ recipe_id: recipeId, cohort_key: key, affinity_score: score });
        }
      }
    }
  }
  return rows;
}

async function seed() {
  let totalRecipes = 0;
  let totalAffinities = 0;

  for (const area of MEAL_AREAS) {
    process.stdout.write(`Seeding ${area}... `);
    try {
      const data = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=${area}`).then(r => r.json());
      const meals = (data.meals ?? []).filter(m => !EXCLUDE_WORDS.some(w => m.strMeal.toLowerCase().includes(w)));

      for (const meal of meals) {
        // Upsert recipe
        const { data: row } = await sb.from('recipes').upsert({
          external_id: meal.idMeal,
          title: meal.strMeal,
          cuisine: area,
          source_type: 'imported',
          ingredients: [],
          steps: [],
          dietary_tags: [],
          image_url: meal.strMealThumb,
          prep_time_mins: 10 + Math.floor(Math.random() * 20),
          cook_time_mins: 15 + Math.floor(Math.random() * 30),
          servings: 4,
          cost_per_serving: parseFloat((3.5 + Math.random() * 6).toFixed(2)),
          avg_rating: parseFloat((4.0 + Math.random() * 0.9).toFixed(1)),
          badge: 'none',
        }, { onConflict: 'external_id', ignoreDuplicates: true })
          .select('id').maybeSingle();

        let recipeId = row?.id;
        if (!recipeId) {
          const { data: existing } = await sb.from('recipes').select('id').eq('external_id', meal.idMeal).single();
          recipeId = existing?.id;
        }
        if (!recipeId) continue;

        totalRecipes++;

        // Upsert affinity rows in batches
        const affinityRows = buildAffinityRows(recipeId, area);
        for (let i = 0; i < affinityRows.length; i += 100) {
          await sb.from('recipe_cohort_affinities')
            .upsert(affinityRows.slice(i, i + 100), { onConflict: 'recipe_id,cohort_key', ignoreDuplicates: true });
          totalAffinities += Math.min(100, affinityRows.length - i);
        }
      }
      console.log(`${meals.length} recipes`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
  }

  console.log(`\nDone. ${totalRecipes} recipes, ${totalAffinities} affinity rows inserted.`);
}

seed().catch(console.error);
