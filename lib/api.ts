import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Profile, Recipe, SwipeEvent, SavedRecipe, PantryItem, GroceryList, MealPlan, MealSlot, OnboardingState, Macros } from '@/types';

// ─── Macro AsyncStorage cache ─────────────────────────────────────────────────
// Persists macro data across sessions so Spoonacular is never called twice for
// the same recipe. Key: recipe title (normalised), Value: Macros JSON.

const MACRO_CACHE_PREFIX = 'mise_macros_v1_';

export async function getCachedMacros(recipeTitle: string): Promise<Macros | null> {
  try {
    const raw = await AsyncStorage.getItem(MACRO_CACHE_PREFIX + recipeTitle.toLowerCase());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function persistMacros(recipeTitle: string, macros: Macros): Promise<void> {
  try {
    await AsyncStorage.setItem(MACRO_CACHE_PREFIX + recipeTitle.toLowerCase(), JSON.stringify(macros));
  } catch {
    // Non-critical
  }
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  // PGRST116 = row not found — not an error, just no profile yet
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Patches specific fields on an existing profile row.
// Safer than upsert for preference updates — guarantees UPDATE semantics,
// never risks inserting a partial row.
export async function patchProfile(id: string, updates: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export async function getRecipes(limit = 20): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

// ─── Discover Deck ────────────────────────────────────────────────────────────

const DECK_EXCLUDE = [
  'cake', 'pudding', 'tart', 'pie', 'biscuit', 'cookie', 'brownie', 'muffin',
  'pancake', 'waffle', 'ice cream', 'sorbet', 'custard', 'fudge', 'candy',
  'cheesecake', 'éclair', 'eclair', 'donut', 'doughnut', 'cobbler', 'crumble',
  'meringue', 'macaron', 'profiterole', 'tiramisu', 'panna cotta', 'creme brulee',
  'bread pudding', 'sticky toffee', 'sourdough', 'baguette', 'focaccia',
  'brioche', 'challah', 'pretzel', 'croissant', 'scone', 'loaf', 'flatbread',
  // desserts that slip through title-only filtering
  'mousse', 'churro', 'baklava', 'halva', 'parfait', 'gelato', 'sundae',
  'trifle', 'syllabub', 'compote', 'praline', 'nougat', 'brittle', 'torte',
  'gateau', 'madeleine', 'financier', 'clafoutis', 'beignet', 'churros',
  'honeycomb', 'roly poly', 'spotted dick', 'treacle', 'jam tart',
];

const DECK_LAND_MEAT = [
  'chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham', 'turkey', 'duck',
  'veal', 'mutton', 'meatball', 'sausage', 'ribs', 'brisket', 'chorizo', 'mince',
  'steak', 'kebab', 'shawarma', 'keema', 'katsu', 'salami', 'pepperoni',
  'venison', 'goat', 'rabbit', 'offal', 'liver', 'kidney', 'tripe',
];

const DECK_SEAFOOD = [
  'salmon', 'tuna', 'fish', 'prawn', 'shrimp', 'crab', 'lobster', 'mussel',
  'anchovy', 'cod', 'haddock', 'sardine', 'mackerel', 'halibut', 'tilapia',
  'bass', 'trout', 'catfish', 'clam', 'oyster', 'squid', 'calamari', 'seafood',
];

const DECK_ALL_MEAT = [...DECK_LAND_MEAT, ...DECK_SEAFOOD];

// In-memory cache — survives tab switches, cleared on goal change or after 30 min.
let deckCache: { data: Recipe[]; goalsKey: string; at: number } | null = null;
const DECK_CACHE_TTL = 30 * 60 * 1000;

export function clearDiscoverCache(): void {
  deckCache = null;
}

// Fetch the Discover deck from Supabase — one DB query instead of 28 TheMealDB
// area calls. Recipes are returned with id = external_id (TheMealDB numeric id)
// so fetchMealDetail and upsertRecipeByExternalId continue to work unchanged.
export async function fetchDiscoverRecipes(dietaryGoals: string[] = []): Promise<Recipe[]> {
  const goalsKey = [...dietaryGoals].sort().join(',');
  if (deckCache && deckCache.goalsKey === goalsKey && Date.now() - deckCache.at < DECK_CACHE_TTL) {
    return deckCache.data;
  }

  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, description, cuisine, source_type, dietary_tags, badge, avg_rating, save_count, image_url, external_id, prep_time_mins, cook_time_mins, servings, cost_per_serving, macros, ingredients, steps')
    .not('external_id', 'is', null)
    .limit(400);

  if (error) throw error;

  const rows = (data ?? []) as any[];
  const filtered = rows
    .filter((r) => {
      const t = r.title.toLowerCase();
      if (DECK_EXCLUDE.some((w) => t.includes(w))) return false;
      if ((r.dietary_tags ?? []).includes('dessert')) return false;
      if (dietaryGoals.includes('vegan') || dietaryGoals.includes('vegetarian')) {
        return !DECK_ALL_MEAT.some((w) => t.includes(w));
      }
      if (dietaryGoals.includes('pescatarian')) {
        return !DECK_LAND_MEAT.some((w) => t.includes(w));
      }
      return true;
    })
    .map(
      (r): Recipe => ({
        id: r.external_id,        // TheMealDB id — fetchMealDetail + logging work unchanged
        supabase_id: r.id,        // real UUID — used for swipe history matching in scorer
        title: r.title,
        description: r.description,
        cuisine: r.cuisine,
        source_type: r.source_type ?? 'curated',
        ingredients: r.ingredients ?? [],
        steps: r.steps ?? [],
        prep_time_mins: r.prep_time_mins,
        cook_time_mins: r.cook_time_mins,
        servings: r.servings,
        cost_per_serving: r.cost_per_serving,
        dietary_tags: r.dietary_tags ?? [],
        macros: r.macros ?? null,
        badge: r.badge ?? 'none',
        avg_rating: r.avg_rating ?? 0,
        save_count: r.save_count ?? 0,
        image_url: r.image_url,
        external_id: r.external_id,
      })
    );

  deckCache = { data: filtered, goalsKey, at: Date.now() };
  return filtered;
}

// ─── Swipe History ────────────────────────────────────────────────────────────

// Fetches the most recent swipes for a user — used by the local scorer.
// Returns most-recent-first so the first occurrence of a recipe_id wins.
export async function getRecentSwipes(userId: string, limit = 150): Promise<{ recipe_id: string; direction: string; swiped_at: string }[]> {
  const { data } = await supabase
    .from('swipe_events')
    .select('recipe_id, direction, swiped_at')
    .eq('user_id', userId)
    .order('swiped_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ─── Local Weighted Scorer ─────────────────────────────────────────────────────

async function getUserCohortKey(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_cohorts')
    .select('cohort_key')
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.cohort_key ?? null;
}

async function getCohortAffinities(cohortKey: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('recipe_cohort_affinities')
    .select('recipe_id, affinity_score')
    .eq('cohort_key', cohortKey);
  const map = new Map<string, number>();
  for (const row of data ?? []) map.set(row.recipe_id, row.affinity_score);
  return map;
}

async function getInteractionCounts(userId: string): Promise<Map<string, { grocery_add: number; cooked: number }>> {
  const { data } = await supabase
    .from('recipe_interactions')
    .select('recipe_id, interaction_type')
    .eq('user_id', userId)
    .in('interaction_type', ['grocery_add', 'cooked']);
  const map = new Map<string, { grocery_add: number; cooked: number }>();
  for (const row of data ?? []) {
    const cur = map.get(row.recipe_id) ?? { grocery_add: 0, cooked: 0 };
    if (row.interaction_type === 'grocery_add') cur.grocery_add++;
    if (row.interaction_type === 'cooked') cur.cooked++;
    map.set(row.recipe_id, cur);
  }
  return map;
}

// ─── Adventure Cards ──────────────────────────────────────────────────────────
// Surfaces niche cuisines adjacent to the user's preferences after ~20 swipes.
// Never shown to beginners. Injected at deck position 6 when gating passes.

const CUISINE_ADJACENCY: Record<string, string[]> = {
  italian:         ['Spanish', 'Moroccan', 'Greek', 'Portuguese', 'French'],
  mexican:         ['Jamaican', 'Spanish', 'American'],
  chinese:         ['Vietnamese', 'Malaysian', 'Filipino', 'Japanese'],
  japanese:        ['Korean', 'Vietnamese', 'Chinese', 'Filipino'],
  indian:          ['Malaysian', 'Moroccan', 'Filipino'],
  american:        ['Canadian', 'Irish', 'British', 'Jamaican'],
  mediterranean:   ['Moroccan', 'Turkish', 'Spanish', 'Greek'],
  thai:            ['Vietnamese', 'Malaysian', 'Filipino'],
  french:          ['Spanish', 'Portuguese', 'Italian', 'Belgian'],
  greek:           ['Turkish', 'Croatian', 'Moroccan', 'Lebanese'],
  korean:          ['Vietnamese', 'Malaysian', 'Japanese'],
  'middle eastern':['Moroccan', 'Egyptian', 'Turkish', 'Tunisian'],
};

function isReadyForAdventureCard(
  profile: Profile | null,
  swipes: { direction: string }[],
): boolean {
  if (!profile || profile.skill_level === 'beginner') return false;
  if (adventureCardCooldown > 0) return false; // recently left-swiped an adventure card
  const total = swipes.length;
  const rights = swipes.filter((s) => s.direction === 'right').length;
  return total >= 20 && rights >= 8 && total > 0 && rights / total >= 0.3;
}

function pickAdventureCuisine(
  profile: Profile | null,
  existingCuisines: Set<string>,
): string | null {
  const prefs = (profile?.cuisine_preferences ?? []).map((c) => c.toLowerCase());
  if (prefs.length === 0) return null;
  const candidates: string[] = [];
  for (const pref of prefs) {
    for (const adj of CUISINE_ADJACENCY[pref] ?? []) {
      if (!existingCuisines.has(adj.toLowerCase())) candidates.push(adj);
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function fetchAdventureRecipe(
  cuisine: string,
  existingSupabaseIds: Set<string>,
): Promise<Recipe | null> {
  const { data } = await supabase
    .from('recipes')
    .select('id, title, description, cuisine, source_type, dietary_tags, badge, avg_rating, save_count, image_url, external_id, prep_time_mins, cook_time_mins, servings, cost_per_serving, macros, ingredients, steps')
    .ilike('cuisine', cuisine)
    .not('external_id', 'is', null)
    .limit(10);
  const eligible = (data ?? []).filter((r: any) => !existingSupabaseIds.has(r.id));
  if (eligible.length === 0) return null;
  const r = eligible[Math.floor(Math.random() * eligible.length)] as any;
  return {
    id: r.external_id,
    supabase_id: r.id,
    title: r.title,
    description: r.description,
    cuisine: r.cuisine,
    source_type: r.source_type ?? 'curated',
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    prep_time_mins: r.prep_time_mins,
    cook_time_mins: r.cook_time_mins,
    servings: r.servings,
    cost_per_serving: r.cost_per_serving,
    dietary_tags: r.dietary_tags ?? [],
    macros: r.macros ?? null,
    badge: r.badge ?? 'none',
    avg_rating: r.avg_rating ?? 0,
    save_count: r.save_count ?? 0,
    image_url: r.image_url,
    external_id: r.external_id,
    isAdventure: true,
  };
}

// ─── Adventure card settings ──────────────────────────────────────────────────
// AsyncStorage-backed toggle so users can opt out of cuisine expansion cards.

const ADVENTURE_CARDS_KEY = 'mise_adventure_cards_enabled';

export async function getAdventureCardsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ADVENTURE_CARDS_KEY);
    return val === null ? true : val === 'true'; // default on
  } catch {
    return true;
  }
}

export async function setAdventureCardsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ADVENTURE_CARDS_KEY, String(enabled));
  } catch {
    // non-critical
  }
}

// ─── Session-level swipe tracking (Bug 7) ────────────────────────────────────
// In-memory only — resets on app close. Prevents left-swiped cards resurfacing
// within the same session when the 30-min deck cache is still active.

const sessionLeftSwipes = new Set<string>(); // supabase_ids left-swiped this session
const sessionShownIds = new Set<string>();   // supabase_ids already seen this session

// When a user left-swipes an adventure card, suppress adventure cards for the
// next 10 regular swipes so we don't pester users who aren't interested yet.
let adventureCardCooldown = 0;

export function recordAdventureCardLeftSwipe(): void {
  adventureCardCooldown = 10;
}

export function recordSessionSwipe(supabaseId: string, direction: 'left' | 'right'): void {
  sessionShownIds.add(supabaseId);
  if (direction === 'left') sessionLeftSwipes.add(supabaseId);
  if (adventureCardCooldown > 0) adventureCardCooldown--;
}

export function clearSessionState(): void {
  sessionLeftSwipes.clear();
  sessionShownIds.clear();
  adventureCardCooldown = 0;
}

// ─── Previously-cooked recipe IDs ─────────────────────────────────────────────
// Fetched on session start to show "Made before" on cards the user has cooked
// in prior sessions — enables the post-cook check-in flow across sessions.

export async function getCookedRecipeIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('recipe_interactions')
    .select('recipe_id')
    .eq('user_id', userId)
    .eq('interaction_type', 'cooked');
  return new Set((data ?? []).map((r: any) => r.recipe_id));
}

// Bug 5 — common staples are worth 0.2 instead of 1.0 in pantry match calculations
// so matching "salt" doesn't inflate the score the same as matching "chicken thighs".
const COMMON_STAPLES = new Set([
  'salt', 'pepper', 'olive oil', 'oil', 'water', 'butter',
  'garlic', 'onion', 'flour', 'sugar', 'eggs',
]);

function scoreRecipe(
  recipe: Recipe,
  profile: Profile | null,
  swipeMap: Map<string, { direction: 'left' | 'right'; swiped_at: string }>,
  savedExternalIds: Set<string>,
  affinityMap: Map<string, number>,
  interactionMap: Map<string, { grocery_add: number; cooked: number }>,
  pantrySet: Set<string>,
): number {
  // Bug 7 — session penalty: instantly exclude anything swiped this session
  const sid = recipe.supabase_id;
  if (sid && (sessionLeftSwipes.has(sid) || sessionShownIds.has(sid))) return -999;

  let score = Math.random() * 0.5; // small jitter so ties never produce a static order

  // Cohort affinity base (0.0–1.0, scaled up) — cold-start signal for new users
  const affinity = affinityMap.get(recipe.supabase_id ?? '');
  if (affinity != null) score += affinity * 4;

  // Cuisine match
  if (profile?.cuisine_preferences?.includes(recipe.cuisine ?? '')) score += 3;

  // Dietary goal alignment — Bug 6: trust macro data over tags when available
  const goals = profile?.dietary_goals ?? [];
  for (const goal of goals) {
    const m = recipe.macros as any;
    if (m) {
      // Verified macro data — full 10 points when recipe genuinely meets the goal
      if (goal === 'high_protein'  && m.protein        >= 25) score += 10;
      else if (goal === 'keto'     && (m.netCarbs ?? m.carbohydrates - (m.fibre ?? 0)) <= 10) score += 10;
      else if (goal === 'low_fat'  && m.fat            <= 10) score += 10;
      else if (goal === 'low_carb' && m.carbohydrates  <= 30) score += 10;
      else if ((recipe.dietary_tags ?? []).includes(goal)) score += 5; // tag-only fallback
    } else {
      // No macro data yet — half points for unverified tags
      if ((recipe.dietary_tags ?? []).includes(goal)) score += 5;
    }
  }

  // Eating style
  if (profile?.eating_style === 'quick_simple') {
    const totalMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);
    if (totalMins > 0 && totalMins <= 30) score += 2;
    if (totalMins > 45) score -= 2;
  }

  // Swipe history with temporal decay — older signals fade over ~30 days
  if (sid) {
    const swipe = swipeMap.get(sid);
    if (swipe) {
      const daysSince = (Date.now() - new Date(swipe.swiped_at).getTime()) / 86_400_000;
      const decay = Math.exp(-daysSince / 30);
      if (swipe.direction === 'right') score += 5 * decay;
      if (swipe.direction === 'left') score -= 15 * decay;
    }

    // Interaction signals — capped at 2 to prevent feedback loop dominating deck
    const ix = interactionMap.get(sid);
    if (ix) {
      score += Math.min(ix.grocery_add, 2) * 3;
      score += Math.min(ix.cooked, 2) * 4;
    }
  }

  // Already saved — soft penalty (user has it, show fresher options first)
  if (savedExternalIds.has(recipe.external_id ?? recipe.id)) score -= 3;

  // Bug 5 — pantry match with specificity weighting (common staples count less)
  if (pantrySet.size > 0) {
    const recipeIngs = (recipe.ingredients ?? []) as { name: string }[];
    if (recipeIngs.length > 0) {
      let weightedMatches = 0;
      let totalWeight = 0;
      for (const ing of recipeIngs) {
        if (!ing?.name) continue;
        const name = ing.name.toLowerCase();
        const weight = COMMON_STAPLES.has(name) ? 0.2 : 1.0;
        totalWeight += weight;
        if (pantrySet.has(name)) weightedMatches += weight;
      }
      const pantryRatio = totalWeight > 0 ? weightedMatches / totalWeight : 0;
      score += pantryRatio * 20;

      // Bug 11 — first session pantry boost: "You can make this tonight" magic moment
      if (profile && profile.total_sessions <= 1 && pantryRatio === 1.0) {
        score += 50;
      }
    }
  }

  return score;
}

// Fetches the discover deck and ranks it locally using a weighted scoring function.
// No Vercel, no API calls — runs entirely on-device after one Supabase query + parallel signals.
export async function fetchScoredDeck(
  userId: string | undefined,
  dietaryGoals: string[],
  profile: Profile | null,
  savedExternalIds: Set<string>,
): Promise<Recipe[]> {
  const [deck, swipes, affinityMap, interactionMap, pantryItems] = await Promise.all([
    fetchDiscoverRecipes(dietaryGoals),
    userId ? getRecentSwipes(userId) : Promise.resolve([]),
    userId
      ? getUserCohortKey(userId).then((key) => (key ? getCohortAffinities(key) : new Map<string, number>()))
      : Promise.resolve(new Map<string, number>()),
    userId ? getInteractionCounts(userId) : Promise.resolve(new Map<string, { grocery_add: number; cooked: number }>()),
    userId ? getPantryItems(userId) : Promise.resolve([]),
  ]);

  const pantrySet = new Set(pantryItems.map((p) => p.ingredient_name.toLowerCase()));

  // Bug 1 fix — ingredient dislike hard filter (never soft-deprioritise, never relaxed)
  const dislikes = (profile?.ingredient_dislikes ?? []).map((d) => d.toLowerCase());
  const afterDislikes = dislikes.length === 0 ? deck : deck.filter((r) => {
    const ingredients = (r.ingredients ?? []) as { name: string }[];
    return !ingredients.some((ing) =>
      ing?.name && dislikes.some((dislike) => ing.name.toLowerCase().includes(dislike))
    );
  });

  // Bug 8 fix — skill level hard cap (filter before scoring, not a score penalty)
  const skillLevel = profile?.skill_level;
  const filtered = !skillLevel ? afterDislikes : afterDislikes.filter((r) => {
    const totalTime = (r.prep_time_mins ?? 0) + (r.cook_time_mins ?? 0);
    if (skillLevel === 'beginner' && totalTime > 0 && totalTime > 60) return false;
    if (skillLevel === 'home_cook' && totalTime > 0 && totalTime > 120) return false;
    return true;
  });

  // Most-recent swipe per recipe wins (desc order from DB)
  const swipeMap = new Map<string, { direction: 'left' | 'right'; swiped_at: string }>();
  for (const s of swipes) {
    if (!swipeMap.has(s.recipe_id)) {
      swipeMap.set(s.recipe_id, { direction: s.direction as 'left' | 'right', swiped_at: s.swiped_at });
    }
  }

  const scored = filtered.map((r) => ({
    recipe: r,
    score: scoreRecipe(r, profile, swipeMap, savedExternalIds, affinityMap, interactionMap, pantrySet),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Bug 3 fix — diversity pass (prevents monoculture for all users, stricter for variety)
  const maxPerCuisine = profile?.eating_style === 'variety' ? 3 : 5;
  const cuisineCounts: Record<string, number> = {};
  const diverse: typeof scored = [];
  for (const entry of scored) {
    const cuisine = entry.recipe.cuisine ?? 'other';
    const count = cuisineCounts[cuisine] ?? 0;
    if (count < maxPerCuisine) {
      diverse.push(entry);
      cuisineCounts[cuisine] = count + 1;
    }
  }

  // Bug 9 fix — graceful relaxation cascade. Hard filters (ingredient dislikes,
  // dietary exclusions) are NEVER relaxed. Relaxation order:
  //   1. Drop diversity constraint
  //   2. Drop skill level cap
  //   3. Serve whatever passes hard filters
  let finalDeck = diverse;
  if (diverse.length < 10 && scored.length > diverse.length) {
    console.warn(`[fetchScoredDeck] diversity pass left only ${diverse.length} recipes — relaxing constraint`);
    finalDeck = scored;
  }
  if (finalDeck.length < 5 && afterDislikes.length > filtered.length) {
    console.warn(`[fetchScoredDeck] skill filter too aggressive (${filtered.length} recipes) — relaxing to ${afterDislikes.length}`);
    const rescored = afterDislikes.map((r) => ({
      recipe: r,
      score: scoreRecipe(r, profile, swipeMap, savedExternalIds, affinityMap, interactionMap, pantrySet),
    }));
    rescored.sort((a, b) => b.score - a.score);
    finalDeck = rescored;
  }
  if (finalDeck.length < 5) {
    console.warn(`[fetchScoredDeck] only ${finalDeck.length} recipes after all filters — very restrictive preferences`);
  }

  console.log(`[fetchScoredDeck] ${finalDeck.length} recipes | top 5: ${finalDeck.slice(0, 5).map((s) => `${s.recipe.title} (${s.score.toFixed(1)})`).join(', ')}`);
  if (dislikes.length > 0) {
    console.log(`[fetchScoredDeck] dislike filter: ${deck.length} → ${afterDislikes.length} | skill filter: → ${filtered.length}`);
  }

  const result = finalDeck.map((s) => s.recipe);

  // Adventure card injection — surfaces a niche adjacent cuisine at position 6
  const adventureEnabled = userId ? await getAdventureCardsEnabled() : false;
  if (adventureEnabled && isReadyForAdventureCard(profile, swipes) && result.length >= 6) {
    const existingCuisines = new Set(result.slice(0, 8).map((r) => (r.cuisine ?? '').toLowerCase()));
    const existingIds = new Set(result.map((r) => r.supabase_id ?? '').filter(Boolean));
    const adventureCuisine = pickAdventureCuisine(profile, existingCuisines);
    if (adventureCuisine) {
      const adventureRecipe = await fetchAdventureRecipe(adventureCuisine, existingIds);
      if (adventureRecipe) {
        result.splice(5, 0, adventureRecipe);
        console.log(`[fetchScoredDeck] adventure card injected: "${adventureRecipe.title}" (${adventureCuisine})`);
      }
    }
  }

  return result;
}

// Fetch a personalised, Claude-ranked deck from /api/recommendations.
// Returns recipes with id = external_id for TheMealDB recipes (downstream compat),
// and supabase_id = the actual Supabase UUID (for fire-and-forget logging).
// Falls back to fetchDiscoverRecipes if the endpoint fails or userId is missing.
export async function fetchRecommendedDeck(
  userId: string | undefined,
  mode: 'spontaneous' | 'meal_prep',
  dietaryGoals: string[] = [],
): Promise<Recipe[]> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl || !userId) return fetchDiscoverRecipes(dietaryGoals);

  try {
    const res = await fetch(`${baseUrl}/api/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, mode, limit: 50 }),
    });

    if (!res.ok) {
      console.warn('[fetchRecommendedDeck] endpoint returned', res.status, '— falling back to shuffle');
      return fetchDiscoverRecipes(dietaryGoals);
    }

    const json = await res.json();
    const { recipeIds, source, reasoning } = json;
    console.log(`[fetchRecommendedDeck] source=${source} ids=${recipeIds?.length ?? 0}`);
    if (reasoning) console.log('[fetchRecommendedDeck] Sonnet reasoning:', reasoning);
    if (!recipeIds?.length) {
      console.warn('[fetchRecommendedDeck] 0 ids — debug:', JSON.stringify(json.debug ?? json).slice(0, 400));
      return fetchDiscoverRecipes(dietaryGoals);
    }

    // Fetch full recipe objects in one query
    const { data } = await supabase
      .from('recipes')
      .select('id, title, description, cuisine, source_type, dietary_tags, badge, avg_rating, save_count, image_url, external_id, prep_time_mins, cook_time_mins, servings, cost_per_serving, macros, ingredients, steps')
      .in('id', recipeIds);

    if (!data?.length) {
      console.warn('[fetchRecommendedDeck] Supabase returned no rows for recipeIds — falling back to shuffle');
      return fetchDiscoverRecipes(dietaryGoals);
    }

    // Re-sort to match Claude's ranked order
    const idOrder = new Map<string, number>(recipeIds.map((id: string, i: number): [string, number] => [id, i]));
    const sorted = [...data].sort((a: any, b: any) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));

    console.log('[fetchRecommendedDeck] top 5 titles:', sorted.slice(0, 5).map((r: any) => r.title));

    return sorted.map((r: any): Recipe => ({
      // TheMealDB recipes: remap id → external_id for fetchMealDetail compat
      // AI-generated recipes: keep Supabase UUID as id (they have ingredients in DB)
      id: r.external_id ?? r.id,
      supabase_id: r.id,  // always keep the real UUID for logging (no upsert needed)
      title: r.title,
      description: r.description,
      cuisine: r.cuisine,
      source_type: r.source_type ?? 'curated',
      ingredients: r.ingredients ?? [],
      steps: r.steps ?? [],
      prep_time_mins: r.prep_time_mins,
      cook_time_mins: r.cook_time_mins,
      servings: r.servings,
      cost_per_serving: r.cost_per_serving,
      dietary_tags: r.dietary_tags ?? [],
      macros: r.macros ?? null,
      badge: r.badge ?? 'none',
      avg_rating: r.avg_rating ?? 0,
      save_count: r.save_count ?? 0,
      image_url: r.image_url,
      external_id: r.external_id,
    }));
  } catch (err) {
    console.warn('[fetchRecommendedDeck] error — falling back to shuffle:', err);
    return fetchDiscoverRecipes(dietaryGoals);
  }
}

// Persist computed macros to the Supabase recipes row.
// Called fire-and-forget after fetchMacros — any user who sees this recipe
// next gets macros from DB instead of burning a Spoonacular/Claude call.
export async function updateRecipeMacros(externalId: string, macros: Macros): Promise<void> {
  await supabase
    .from('recipes')
    .update({ macros })
    .eq('external_id', externalId);
}

// Persist TheMealDB detail (ingredients + blurb) to the Supabase recipes row.
// Called fire-and-forget after fetchMealDetail — subsequent views load from
// Supabase ingredients array instead of hitting TheMealDB again.
export async function updateRecipeDetail(
  externalId: string,
  ingredients: { name: string; measure: string }[],
  blurb: string,
): Promise<void> {
  await supabase
    .from('recipes')
    .update({
      description: blurb,
      ingredients: ingredients.map((i) => ({ name: i.name, quantity: i.measure, unit: '' })),
    })
    .eq('external_id', externalId);
}

// ─── Session ─────────────────────────────────────────────────────────────────

// Increments total_sessions for the user and returns the new count.
// Called once per app open in index.tsx so swipe events can reference session number.
export async function incrementSessionCount(userId: string): Promise<number> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('total_sessions')
    .eq('id', userId)
    .single();
  const newCount = (profile?.total_sessions ?? 0) + 1;
  await supabase
    .from('profiles')
    .update({ total_sessions: newCount })
    .eq('id', userId);
  return newCount;
}

// ─── Swipe Events ─────────────────────────────────────────────────────────────

export async function logSwipe(event: Omit<SwipeEvent, 'id' | 'swiped_at'>): Promise<void> {
  const { error } = await supabase.from('swipe_events').insert(event);
  if (error) throw error;
}

// ─── Recipe Interactions ───────────────────────────────────────────────────────
// Logs views, grocery adds, and cooks — frequency is the AI signal.
// A recipe grocery-listed 3 times is a stronger preference than a right swipe.
// Fire-and-forget: call as interactionBackground(userId, supabaseId, 'grocery_add').

export async function logInteraction(
  userId: string,
  recipeId: string,  // Supabase UUID (not external_id)
  interactionType: 'view' | 'grocery_add' | 'cooked',
  sessionNumber?: number,
): Promise<void> {
  const { error } = await supabase.from('recipe_interactions').insert({
    user_id: userId,
    recipe_id: recipeId,
    interaction_type: interactionType,
    session_number: sessionNumber ?? null,
  });
  if (error) throw error;
}

// ─── Saved Recipes ────────────────────────────────────────────────────────────

export async function getSavedRecipes(userId: string): Promise<SavedRecipe[]> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

export async function saveRecipe(userId: string, recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_recipes')
    .upsert({ user_id: userId, recipe_id: recipeId }, { onConflict: 'user_id,recipe_id', ignoreDuplicates: true });
  if (error) throw error;
}

// Sets the liked flag on a saved_recipes row — used when user hearts a recipe.
// This signal is consumed by Claude's recommendation engine at Phase 2.
export async function setRecipeLiked(userId: string, externalId: string, liked: boolean): Promise<void> {
  const { data: recipeData } = await supabase
    .from('recipes')
    .select('id')
    .eq('external_id', externalId)
    .single();
  if (!recipeData) return; // recipe not in DB yet — skip silently
  await supabase
    .from('saved_recipes')
    .update({ liked })
    .eq('user_id', userId)
    .eq('recipe_id', recipeData.id);
}

// Writes the user's post-cook star rating (1-5) to saved_recipes.user_rating.
export async function rateRecipe(userId: string, recipeSupabaseId: string, rating: number): Promise<void> {
  await supabase
    .from('saved_recipes')
    .update({ user_rating: rating })
    .eq('user_id', userId)
    .eq('recipe_id', recipeSupabaseId);
}

export async function unsaveRecipe(userId: string, recipeExternalId: string, supabaseId?: string): Promise<void> {
  let recipeUuid = supabaseId;
  if (!recipeUuid) {
    const { data: recipeData } = await supabase
      .from('recipes')
      .select('id')
      .eq('external_id', recipeExternalId)
      .single();
    if (!recipeData) return;
    recipeUuid = recipeData.id;
  }
  const { error } = await supabase
    .from('saved_recipes')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeUuid);
  if (error) throw error;
}

// Upserts a TheMealDB recipe into the recipes table by external_id.
// Returns the Supabase UUID for that recipe row.
export async function upsertRecipeByExternalId(recipe: Recipe): Promise<string> {
  const { data, error } = await supabase
    .from('recipes')
    .upsert(
      {
        external_id: recipe.id,
        title: recipe.title,
        description: recipe.description ?? null,
        cuisine: recipe.cuisine ?? null,
        source_type: 'imported',
        ingredients: recipe.ingredients ?? [],
        steps: recipe.steps ?? [],
        prep_time_mins: recipe.prep_time_mins ?? null,
        cook_time_mins: recipe.cook_time_mins ?? null,
        servings: recipe.servings ?? null,
        cost_per_serving: recipe.cost_per_serving ?? null,
        dietary_tags: recipe.dietary_tags ?? [],
        image_url: recipe.image_url ?? null,
      },
      { onConflict: 'external_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle(); // returns null (not error) when ignoreDuplicates skips the row
  if (error) throw error;
  if (data) return data.id;

  // ignoreDuplicates skipped the insert — row already exists, fetch its ID
  const { data: existing, error: fetchErr } = await supabase
    .from('recipes')
    .select('id')
    .eq('external_id', recipe.id)
    .single();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error(`Recipe with external_id ${recipe.id} not found after upsert`);
  return existing.id;
}

// Fetches saved recipes for a user with full recipe details.
// Uses the external_id as the Recipe.id so TheMealDB-sourced IDs match in-memory state.
export async function getSavedRecipesWithDetails(userId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .select(`
      recipe_id,
      recipes (
        id, title, description, cuisine, source_type,
        ingredients, steps, prep_time_mins, cook_time_mins,
        servings, cost_per_serving, dietary_tags, image_url,
        external_id, badge, avg_rating, save_count, macros
      )
    `)
    .eq('user_id', userId);
  if (error) throw error;

  return (data ?? [])
    .map((row: any) => {
      const r = row.recipes;
      if (!r) return null;
      return {
        id: r.external_id ?? r.id,
        supabase_id: r.id,
        title: r.title,
        description: r.description,
        cuisine: r.cuisine,
        source_type: r.source_type,
        ingredients: r.ingredients ?? [],
        steps: r.steps ?? [],
        prep_time_mins: r.prep_time_mins,
        cook_time_mins: r.cook_time_mins,
        servings: r.servings,
        cost_per_serving: r.cost_per_serving,
        dietary_tags: r.dietary_tags ?? [],
        macros: r.macros ?? null,
        image_url: r.image_url,
        badge: r.badge,
        avg_rating: r.avg_rating,
        save_count: r.save_count,
      } as Recipe;
    })
    .filter(Boolean) as Recipe[];
}

// ─── Pantry ──────────────────────────────────────────────────────────────────

export async function getPantryItems(userId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

export async function addPantryItem(item: Omit<PantryItem, 'id' | 'added_at'>): Promise<void> {
  const { error } = await supabase.from('pantry_items').insert(item);
  if (error) throw error;
}

// Bulk insert pantry staples from onboarding payoff screen
export async function addPantryItems(
  userId: string,
  ingredientNames: string[],
  addedVia: PantryItem['added_via'] = 'onboarding'
): Promise<void> {
  if (ingredientNames.length === 0) return;
  const rows = ingredientNames.map((name) => ({
    user_id: userId,
    ingredient_name: name,
    added_via: addedVia,
  }));
  const { error } = await supabase.from('pantry_items').insert(rows);
  if (error) throw error;
}

export async function deletePantryItem(id: string): Promise<void> {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id);
  if (error) throw error;
}

// ─── Grocery Lists ────────────────────────────────────────────────────────────

export async function getActiveGroceryList(userId: string): Promise<GroceryList | null> {
  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function upsertGroceryList(list: Partial<GroceryList> & { user_id: string }): Promise<GroceryList> {
  const { data, error } = await supabase
    .from('grocery_lists')
    .upsert(list)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Meal Plans ───────────────────────────────────────────────────────────────

export async function getCurrentMealPlan(userId: string): Promise<MealPlan | null> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('week_start_date', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getMealPlanForWeek(userId: string, weekStart: string): Promise<MealPlan | null> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start_date', weekStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveMealPlan(
  userId: string,
  weekStart: string,
  slots: MealSlot[],
  existingId?: string,
): Promise<MealPlan> {
  if (existingId) {
    const { data, error } = await supabase
      .from('meal_plans')
      .update({ slots })
      .eq('id', existingId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('meal_plans')
    .insert({ user_id: userId, week_start_date: weekStart, slots })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Fetch full recipe rows by supabase UUIDs — used to hydrate meal plan slots.
export async function getRecipesBySupabaseIds(ids: string[]): Promise<Recipe[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, description, cuisine, source_type, dietary_tags, badge, avg_rating, save_count, image_url, external_id, prep_time_mins, cook_time_mins, servings, cost_per_serving, macros, ingredients, steps')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []).map((r: any): Recipe => ({
    id: r.external_id ?? r.id,
    supabase_id: r.id,
    title: r.title,
    description: r.description,
    cuisine: r.cuisine,
    source_type: r.source_type ?? 'curated',
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    prep_time_mins: r.prep_time_mins,
    cook_time_mins: r.cook_time_mins,
    servings: r.servings,
    cost_per_serving: r.cost_per_serving,
    dietary_tags: r.dietary_tags ?? [],
    macros: r.macros ?? null,
    badge: r.badge ?? 'none',
    avg_rating: r.avg_rating ?? 0,
    save_count: r.save_count ?? 0,
    image_url: r.image_url,
    external_id: r.external_id,
  }));
}

// ─── Macros ───────────────────────────────────────────────────────────────────

// ─── Local macro estimator ────────────────────────────────────────────────────
// Zero-API fallback used when Spoonacular and Claude are unavailable (rate limits,
// dev environment, etc.). Estimates are keyword-based and always marked isEstimated.
// Exported so callers can show an instant pill while the async fetch runs.
export function estimateMacrosLocally(title: string): Macros {
  const t = title.toLowerCase();
  let calories = 420, protein = 25, carbohydrates = 38, fat = 16, fibre = 4;

  if (/chicken|poultry|turkey/.test(t))        { calories = 380; protein = 32; carbohydrates = 15; fat = 13; }
  else if (/beef|steak|burger|mince|meatball/.test(t)) { calories = 460; protein = 28; carbohydrates = 12; fat = 24; }
  else if (/lamb/.test(t))                     { calories = 440; protein = 26; carbohydrates = 10; fat = 26; }
  else if (/pork|bacon|ham/.test(t))           { calories = 430; protein = 27; carbohydrates = 12; fat = 22; }
  else if (/fish|salmon|tuna|cod|prawn|shrimp|seafood/.test(t)) { calories = 310; protein = 30; carbohydrates = 10; fat = 10; }
  else if (/pasta|spaghetti|noodle|lasagna|penne/.test(t)) { calories = 430; protein = 18; carbohydrates = 58; fat = 12; fibre = 3; }
  else if (/rice|risotto|pilaf/.test(t))       { calories = 390; protein = 14; carbohydrates = 55; fat = 10; fibre = 2; }
  else if (/salad/.test(t))                    { calories = 240; protein = 8;  carbohydrates = 22; fat = 14; fibre = 6; }
  else if (/soup|stew|broth/.test(t))          { calories = 290; protein = 18; carbohydrates = 25; fat = 10; fibre = 5; }
  else if (/vegan|vegetarian|veggie|tofu/.test(t)) { calories = 320; protein = 12; carbohydrates = 42; fat = 12; fibre = 8; }
  else if (/pizza/.test(t))                    { calories = 480; protein = 20; carbohydrates = 52; fat = 20; }
  else if (/curry/.test(t))                    { calories = 410; protein = 24; carbohydrates = 32; fat = 18; fibre = 5; }

  const netCarbs = Math.max(0, carbohydrates - fibre);
  return { calories, protein, carbohydrates, fat, fibre, netCarbs, isEstimated: true };
}

// Fetches macros for a recipe — checks AsyncStorage first, then Vercel/Spoonacular,
// then falls back to local keyword estimation so the macro pill always has data.
export async function fetchMacros(
  recipeTitle: string,
  ingredients: { name: string; quantity: string; unit: string }[],
  options?: { externalId?: string }
): Promise<Macros | null> {
  // Check local AsyncStorage cache first (fastest, zero network)
  const cached = await getCachedMacros(recipeTitle);
  if (cached) return cached;

  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/macros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeTitle,
          ingredients,
          externalId: options?.externalId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const macros: Macros | null = data.macros ?? null;
        if (macros) {
          persistMacros(recipeTitle, macros); // fire-and-forget
          return macros;
        }
      }
    } catch {
      // Fall through to local estimator
    }
  }

  // Local estimator — zero API calls, always works, marked isEstimated: true
  const estimated = estimateMacrosLocally(recipeTitle);
  persistMacros(recipeTitle, estimated); // cache so we don't re-estimate
  return estimated;
}

// ─── Dev Recipe Flagging ──────────────────────────────────────────────────────
// AsyncStorage-backed; dev builds only. Stores recipes flagged for Claude review.

export interface FlaggedRecipe {
  supabase_id: string;
  external_id: string;
  title: string;
  reason: string;
  flagged_at: string;
}

const FLAGGED_KEY = 'mise_flagged_recipes_v1';

export async function flagRecipe(
  recipe: { supabase_id?: string; id: string; title: string },
  reason: string
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FLAGGED_KEY);
    const existing: FlaggedRecipe[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((f) => f.external_id !== recipe.id);
    filtered.push({
      supabase_id: recipe.supabase_id ?? '',
      external_id: recipe.id,
      title: recipe.title,
      reason,
      flagged_at: new Date().toISOString(),
    });
    await AsyncStorage.setItem(FLAGGED_KEY, JSON.stringify(filtered));
  } catch {
    // Non-critical
  }
}

export async function getFlaggedRecipes(): Promise<FlaggedRecipe[]> {
  try {
    const raw = await AsyncStorage.getItem(FLAGGED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearFlaggedRecipes(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FLAGGED_KEY);
  } catch {
    // Non-critical
  }
}

// ─── Cohorts ──────────────────────────────────────────────────────────────────

// Derives a stable cohort key from onboarding answers.
// Format: "{skill_level}_{cuisine1}_{cuisine2}_{eating_style}"
// e.g. "home_cook_italian_mexican_quick_simple"
// Used by the Phase 2 recommendation engine to bootstrap new users
// before they have any swipe history.
export function computeCohortKey(onboarding: OnboardingState): string {
  const parts: string[] = [];

  if (onboarding.skill_level) {
    parts.push(onboarding.skill_level);
  }

  // Top 2 cuisines, lowercased and spaces replaced with underscores
  onboarding.cuisine_preferences.slice(0, 2).forEach((c) => {
    parts.push(c.toLowerCase().replace(/\s+/g, '_'));
  });

  if (onboarding.eating_style) {
    parts.push(onboarding.eating_style);
  }

  return parts.join('_') || 'default';
}

// Inserts the user's cohort key into user_cohorts.
// Called once at the end of onboarding — non-blocking, errors silently ignored.
// Phase 2 recommendation engine reads this to bootstrap the first swipe stack.
export async function upsertUserCohort(userId: string, cohortKey: string): Promise<void> {
  await supabase
    .from('user_cohorts')
    .insert({ user_id: userId, cohort_key: cohortKey });
  // Errors intentionally swallowed — this is non-critical and can only be called
  // once per user (at end of onboarding), so duplicate inserts won't occur.
}
