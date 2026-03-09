import type { Recipe } from '@/types';

// Cuisines TheMealDB covers well — matches our 12 onboarding cuisines
export const MEAL_AREAS = [
  'Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian',
  'American', 'French', 'Greek', 'Thai', 'British',
];

// Words that indicate desserts or baked goods — excluded from the main deck.
// Baking is planned as its own section later (see CLAUDE.md Section 14).
const EXCLUDE_WORDS = [
  'cake', 'pudding', 'tart', 'pie', 'biscuit', 'cookie', 'brownie', 'muffin',
  'pancake', 'waffle', 'ice cream', 'sorbet', 'custard', 'fudge', 'candy',
  'cheesecake', 'éclair', 'eclair', 'donut', 'doughnut',
  'cobbler', 'crumble', 'meringue', 'macaron', 'profiterole', 'tiramisu',
  'panna cotta', 'creme brulee', 'bread pudding', 'sticky toffee',
  'sourdough', 'baguette', 'focaccia', 'brioche', 'challah', 'pretzel',
  'croissant', 'scone', 'loaf', 'flatbread', 'naan bread',
];

// Fetch recipes for each cuisine area from TheMealDB, filter out desserts/baking,
// and return as a shuffled Recipe[] array.
export async function fetchMealDBRecipes(perArea = 3): Promise<Recipe[]> {
  const promises = MEAL_AREAS.map((area) =>
    fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=${area}`)
      .then((r) => r.json())
      .then((data) =>
        (data.meals ?? []).slice(0, perArea).map((m: any): Recipe => ({
          id: m.idMeal,
          title: m.strMeal,
          description: '',
          cuisine: area,
          source_type: 'curated',
          ingredients: [],
          steps: [],
          prep_time_mins: 10 + Math.floor(Math.random() * 20),
          cook_time_mins: 15 + Math.floor(Math.random() * 30),
          servings: 4,
          cost_per_serving: parseFloat((3.5 + Math.random() * 6).toFixed(2)),
          dietary_tags: [],
          badge: 'none',
          submitted_by: null,
          avg_rating: parseFloat((4.0 + Math.random() * 0.9).toFixed(1)),
          rating_count: 0,
          save_count: 0,
          image_url: m.strMealThumb,
          created_at: '',
        }))
      )
      .catch(() => [] as Recipe[])
  );

  const results = await Promise.all(promises);
  const all = results
    .flat()
    .filter((r) => !EXCLUDE_WORDS.some((w) => r.title.toLowerCase().includes(w)));

  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export interface MealDetail {
  blurb: string;
  ingredients: string[];
}

// Fetch full detail (ingredients + blurb) for a single TheMealDB recipe by id
export async function fetchMealDetail(id: string): Promise<MealDetail | null> {
  try {
    const data = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`).then((r) => r.json());
    const meal = data.meals?.[0];
    if (!meal) return null;

    const ingredients: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const ing = meal[`strIngredient${i}`]?.trim();
      if (ing) ingredients.push(ing);
    }

    const area: string = meal.strArea ?? '';
    const category: string = meal.strCategory ?? '';

    // Try the first sentence of the instructions — much more descriptive than
    // a generated string. Skip it if it looks like a step (starts with a digit,
    // bullet, or is too long/short), and fall back to category + area.
    let blurb = '';
    if (meal.strInstructions) {
      const first = meal.strInstructions
        .replace(/\r\n|\r|\n/g, ' ')
        .split(/(?<=[.!?])\s+/)[0]
        .trim();
      const isStep = /^[\d\-\*•]/.test(first);
      if (!isStep && first.length >= 20 && first.length <= 120) {
        blurb = first;
      }
    }
    if (!blurb) {
      blurb = area && category ? `${category} · ${area}` : area || category || '';
    }

    return { blurb, ingredients: ingredients.slice(0, 10) };
  } catch {
    return null;
  }
}
