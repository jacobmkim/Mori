import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe } from '@/types';

const RECIPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cache key includes a goals fingerprint so changing dietary goals gets a fresh deck.
// Bump version to invalidate all prior caches when filtering logic changes.
function recipeCacheKey(dietaryGoals: string[]): string {
  const sorted = [...dietaryGoals].sort().join(',');
  return `mise_recipe_deck_v3_${sorted || 'none'}`;
}

async function loadCachedRecipes(dietaryGoals: string[]): Promise<Recipe[] | null> {
  try {
    const raw = await AsyncStorage.getItem(recipeCacheKey(dietaryGoals));
    if (!raw) return null;
    const { recipes, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > RECIPE_CACHE_TTL_MS) return null; // expired
    return recipes as Recipe[];
  } catch {
    return null;
  }
}

async function saveRecipesToCache(recipes: Recipe[], dietaryGoals: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(recipeCacheKey(dietaryGoals), JSON.stringify({ recipes, savedAt: Date.now() }));
  } catch {
    // Non-critical — cache write failure is fine
  }
}

// Clears the cached recipe deck for specific goals (e.g. on preference save).
// Call this when the user's dietary goals change so Discover reloads.
export async function clearRecipeCache(dietaryGoals?: string[]): Promise<void> {
  try {
    if (dietaryGoals) {
      await AsyncStorage.removeItem(recipeCacheKey(dietaryGoals));
    } else {
      // Clear all recipe deck keys
      const keys = await AsyncStorage.getAllKeys();
      const deckKeys = keys.filter((k) => k.startsWith('mise_recipe_deck_'));
      if (deckKeys.length > 0) await AsyncStorage.multiRemove(deckKeys);
    }
  } catch {
    // Non-critical
  }
}

// Land meat keywords — used for vegan, vegetarian, and pescatarian filtering.
const LAND_MEAT_KEYWORDS = [
  'chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham', 'turkey', 'duck',
  'veal', 'mutton', 'meatball', 'sausage', 'ribs', 'brisket', 'chorizo', 'mince',
  'steak', 'kebab', 'shawarma', 'keema', 'katsu', 'salami', 'pepperoni',
  'venison', 'goat', 'rabbit', 'offal', 'liver', 'kidney', 'tripe',
];

// Seafood keywords — excluded for vegan/vegetarian, allowed for pescatarian.
const SEAFOOD_KEYWORDS = [
  'salmon', 'tuna', 'fish', 'prawn', 'shrimp', 'crab', 'lobster', 'mussel',
  'anchovy', 'cod', 'haddock', 'sardine', 'mackerel', 'halibut', 'tilapia',
  'bass', 'trout', 'catfish', 'clam', 'oyster', 'squid', 'calamari', 'seafood',
];

// All meat + seafood — excluded for vegan/vegetarian.
const ALL_MEAT_KEYWORDS = [...LAND_MEAT_KEYWORDS, ...SEAFOOD_KEYWORDS];

function shouldExclude(title: string, dietaryGoals: string[]): boolean {
  const t = title.toLowerCase();
  if (dietaryGoals.includes('vegan') || dietaryGoals.includes('vegetarian')) {
    return ALL_MEAT_KEYWORDS.some((w) => t.includes(w));
  }
  if (dietaryGoals.includes('pescatarian')) {
    // Allow fish/seafood, exclude land meat only
    return LAND_MEAT_KEYWORDS.some((w) => t.includes(w));
  }
  return false;
}

// All areas TheMealDB supports — used for fetching. 28 areas × 8 recipes ≈ 220+ recipes.
// Spoonacular and Edamam will be added in Phase 2 via Vercel serverless functions.
export const MEAL_AREAS = [
  'American', 'British', 'Canadian', 'Chinese', 'Croatian', 'Dutch',
  'Egyptian', 'Filipino', 'French', 'Greek', 'Indian', 'Irish', 'Italian',
  'Jamaican', 'Japanese', 'Kenyan', 'Malaysian', 'Mexican', 'Moroccan',
  'Polish', 'Portuguese', 'Russian', 'Spanish', 'Thai', 'Tunisian',
  'Turkish', 'Ukrainian', 'Vietnamese',
];

// Curated 12 cuisines for UI filter pills (well-known to all users)
export const MAIN_CUISINES = [
  'Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian',
  'American', 'French', 'Greek', 'Thai', 'Korean', 'Middle Eastern', 'Mediterranean',
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

// Fetch recipes for each cuisine area from TheMealDB, filter out desserts/baking
// and recipes that violate the user's dietary goals, then return shuffled.
// Cache key includes goals — changing goals gets a fresh filtered deck.
export async function fetchMealDBRecipes(dietaryGoals: string[] = [], perArea = 3): Promise<Recipe[]> {
  const cached = await loadCachedRecipes(dietaryGoals);
  if (cached && cached.length > 0) return cached;

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
    .filter((r) => !EXCLUDE_WORDS.some((w) => r.title.toLowerCase().includes(w)))
    .filter((r) => !shouldExclude(r.title, dietaryGoals));

  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  saveRecipesToCache(all, dietaryGoals); // fire-and-forget
  return all;
}

// Food-type categories for the Recipes screen filter bar.
// Each recipe fetched by category stores that category in dietary_tags[0].
export const MEAL_CATEGORIES = [
  'Beef', 'Chicken', 'Lamb', 'Pork', 'Seafood',
  'Pasta', 'Vegetarian', 'Vegan', 'Starter', 'Breakfast',
];

// Fetch recipes by food category — used by the Recipes screen so the filter
// bar shows "Chicken", "Seafood", "Pasta" etc. instead of country names.
// Category is stored in dietary_tags[0] for filtering.
export async function fetchMealDBRecipesByCategory(perCategory = 8): Promise<Recipe[]> {
  const promises = MEAL_CATEGORIES.map((cat) =>
    fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${cat}`)
      .then((r) => r.json())
      .then((data) =>
        (data.meals ?? []).slice(0, perCategory).map((m: any): Recipe => ({
          id: m.idMeal,
          title: m.strMeal,
          description: '',
          cuisine: null,
          source_type: 'curated',
          ingredients: [],
          steps: [],
          prep_time_mins: 10 + Math.floor(Math.random() * 20),
          cook_time_mins: 15 + Math.floor(Math.random() * 30),
          servings: 4,
          cost_per_serving: parseFloat((3.5 + Math.random() * 6).toFixed(2)),
          dietary_tags: [cat],
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

export interface IngredientWithMeasure {
  name: string;
  measure: string; // raw TheMealDB measure string e.g. "1 cup", "500g", "2 tbsp"
}

export interface MealDetail {
  blurb: string;
  ingredients: IngredientWithMeasure[];
}

// Fetch full detail (ingredients + measures + blurb) for a single TheMealDB recipe by id
export async function fetchMealDetail(id: string): Promise<MealDetail | null> {
  try {
    const data = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`).then((r) => r.json());
    const meal = data.meals?.[0];
    if (!meal) return null;

    const ingredients: IngredientWithMeasure[] = [];
    for (let i = 1; i <= 20; i++) {
      const name = meal[`strIngredient${i}`]?.trim();
      if (!name) continue;
      const measure = meal[`strMeasure${i}`]?.trim() ?? '';
      ingredients.push({ name, measure });
    }

    const area: string = meal.strArea ?? '';
    const category: string = meal.strCategory ?? '';

    // Build a human-readable blurb. TheMealDB has no description field — the
    // instructions are pure cooking steps, so we synthesise from metadata.
    // Template: "{Title} is a {area} {category} dish featuring {ingredient1},
    // {ingredient2}, and {ingredient3}." — concise and always accurate.
    const topIngredients = ingredients.slice(0, 3).map((i) => i.name.toLowerCase());
    let blurb = '';
    if (topIngredients.length > 0) {
      const ingList =
        topIngredients.length === 1
          ? topIngredients[0]
          : topIngredients.slice(0, -1).join(', ') + ' and ' + topIngredients[topIngredients.length - 1];
      const origin = area && area !== 'Unknown' ? `${area} ` : '';
      const cat = category ? category.toLowerCase() : 'dish';
      blurb = `A ${origin}${cat} made with ${ingList}.`;
    } else if (area && category) {
      blurb = `${category} · ${area}`;
    } else {
      blurb = area || category || '';
    }

    return { blurb, ingredients };
  } catch {
    return null;
  }
}
