import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealDBListItem {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

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
  'meringue', 'macaron', 'tiramisu', 'panna cotta', 'creme brulee',
  'sourdough', 'baguette', 'focaccia', 'brioche', 'croissant', 'scone', 'loaf',
];

// Maps TheMealDB area → our 12 app cuisines (for cohort affinity matching)
const AREA_TO_CUISINE: Record<string, string> = {
  American: 'american', British: 'american', Canadian: 'american',
  Irish: 'american', Australian: 'american',
  Chinese: 'chinese',
  French: 'french',
  Greek: 'greek',
  Indian: 'indian', Pakistani: 'indian', Bangladeshi: 'indian',
  Italian: 'italian',
  Japanese: 'japanese',
  Korean: 'korean',
  Mexican: 'mexican', Jamaican: 'mexican',
  Mediterranean: 'mediterranean', Spanish: 'mediterranean',
  Portuguese: 'mediterranean', Croatian: 'mediterranean',
  Thai: 'thai', Malaysian: 'thai', Filipino: 'thai', Vietnamese: 'thai',
  Moroccan: 'middle eastern', Egyptian: 'middle eastern',
  Tunisian: 'middle eastern', Turkish: 'middle eastern',
  Kenyan: 'middle eastern', Dutch: 'french', Polish: 'french',
  Russian: 'french', Ukrainian: 'french',
};

// Adjacency map — cuisines that share flavour profiles.
// Adjacent recipes get a medium affinity score (0.55) for neighbouring cohorts.
const CUISINE_ADJACENCY: Record<string, string[]> = {
  italian: ['mediterranean', 'french', 'greek'],
  french: ['italian', 'mediterranean', 'greek'],
  greek: ['mediterranean', 'italian', 'middle eastern'],
  mediterranean: ['italian', 'french', 'greek', 'middle eastern'],
  mexican: ['american'],
  american: ['mexican'],
  chinese: ['japanese', 'korean', 'thai'],
  japanese: ['chinese', 'korean'],
  korean: ['chinese', 'japanese'],
  thai: ['chinese', 'indian'],
  indian: ['thai', 'middle eastern'],
  'middle eastern': ['mediterranean', 'indian', 'greek'],
};

const SKILL_LEVELS = ['beginner', 'home_cook', 'confident_chef'];
const MAIN_CUISINES = [
  'italian', 'mexican', 'chinese', 'japanese', 'indian',
  'american', 'mediterranean', 'thai', 'french', 'greek', 'korean', 'middle eastern',
];
const EATING_STYLES = ['quick_simple', 'variety', 'favourites_rotation'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

// Generate cohort affinity rows for a recipe given its cuisine.
// High affinity (0.85) for cohorts containing the exact cuisine.
// Medium affinity (0.55) for cohorts containing an adjacent cuisine.
// Base affinity (0.30) for all other cohorts (cold-start fallback).
function buildAffinityRows(
  recipeId: string,
  area: string
): { recipe_id: string; cohort_key: string; affinity_score: number }[] {
  const cuisine = AREA_TO_CUISINE[area]?.toLowerCase() ?? null;
  const adjacent = cuisine ? (CUISINE_ADJACENCY[cuisine] ?? []) : [];

  const rows: { recipe_id: string; cohort_key: string; affinity_score: number }[] = [];

  for (const skill of SKILL_LEVELS) {
    for (let i = 0; i < MAIN_CUISINES.length; i++) {
      for (let j = i + 1; j < MAIN_CUISINES.length; j++) {
        const c1 = MAIN_CUISINES[i];
        const c2 = MAIN_CUISINES[j];
        for (const style of EATING_STYLES) {
          const key = `${skill}_${c1.replace(/\s/g, '_')}_${c2.replace(/\s/g, '_')}_${style}`;
          let score = 0.30; // base — always visible as fallback
          if (cuisine && (c1 === cuisine || c2 === cuisine)) {
            score = 0.85;
          } else if (adjacent.includes(c1) || adjacent.includes(c2)) {
            score = 0.55;
          }
          rows.push({ recipe_id: recipeId, cohort_key: key, affinity_score: score });
        }
      }
    }
  }
  return rows;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Protect with a secret so this can't be called by anyone
  const secret = req.headers['x-seed-secret'];
  if (!secret || secret !== process.env.SEED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = getSupabase();
  let recipesInserted = 0;
  let affinitiesInserted = 0;
  const errors: string[] = [];

  for (const area of MEAL_AREAS) {
    try {
      const data = await fetch(
        `https://www.themealdb.com/api/json/v1/1/filter.php?a=${area}`
      ).then((r) => r.json());

      const meals: MealDBListItem[] = (data.meals ?? []).filter(
        (m: MealDBListItem) =>
          !EXCLUDE_WORDS.some((w) => m.strMeal.toLowerCase().includes(w))
      );

      for (const meal of meals) {
        try {
          // Upsert recipe
          const { data: row, error: recipeErr } = await sb
            .from('recipes')
            .upsert(
              {
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
              },
              { onConflict: 'external_id', ignoreDuplicates: true }
            )
            .select('id')
            .maybeSingle();

          if (recipeErr) { errors.push(`recipe ${meal.strMeal}: ${recipeErr.message}`); continue; }

          // If ignoreDuplicates skipped it, fetch existing ID
          let recipeId = row?.id;
          if (!recipeId) {
            const { data: existing } = await sb
              .from('recipes').select('id').eq('external_id', meal.idMeal).single();
            recipeId = existing?.id;
          }
          if (!recipeId) continue;

          recipesInserted++;

          // Upsert cohort affinity rows in batches of 50
          const affinityRows = buildAffinityRows(recipeId, area);
          for (let i = 0; i < affinityRows.length; i += 50) {
            const batch = affinityRows.slice(i, i + 50);
            const { error: affinityErr } = await sb
              .from('recipe_cohort_affinities')
              .upsert(batch, { onConflict: 'recipe_id,cohort_key', ignoreDuplicates: true });
            if (affinityErr) errors.push(`affinity batch: ${affinityErr.message}`);
            else affinitiesInserted += batch.length;
          }
        } catch (e: any) {
          errors.push(`meal ${meal.strMeal}: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`area ${area}: ${e.message}`);
    }
  }

  return res.json({
    recipesInserted,
    affinitiesInserted,
    errors: errors.slice(0, 20), // cap error list
  });
}
