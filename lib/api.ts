import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Profile, Recipe, SwipeEvent, SavedRecipe, PantryItem, GroceryList, MealPlan, MealSlot, OnboardingState, Macros, AppMode, RecipeNote, Review, CreatorStats } from '@/types';
import type { BadgeStats } from '@/lib/badges';
import { inferDietaryTags } from './dietaryClassifier';
import { getApiBaseUrl } from './apiBaseUrl';

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

// Defensively creates or updates a profile after auth.signUp.
// Handles race condition where the auth trigger may not have fired yet.
// Tries UPDATE first (trigger fired), falls back to INSERT if no rows matched.
export async function createOrUpdateProfile(
  profile: Partial<Profile> & { id: string }
): Promise<Profile> {
  // Try UPDATE first (for when trigger has fired)
  try {
    const { data: updateData, error: updateError } = await supabase
      .from('profiles')
      .update(profile)
      .eq('id', profile.id)
      .select()
      .single();
    if (!updateError && updateData) return updateData;
  } catch {
    // No rows matched or other error — fall through to INSERT
  }

  // Fallback: INSERT if UPDATE affected no rows
  const { data: insertData, error: insertError } = await supabase
    .from('profiles')
    .insert([profile])
    .select()
    .single();
  if (insertError) throw insertError;
  return insertData;
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

// Builds a single lowercase string from all ingredient names for keyword scanning.
// Handles both string[] and {name:string}[] shapes that may exist in DB rows.
function buildIngredientText(ingredients: any[]): string {
  return ingredients
    .map((i) => (typeof i === 'string' ? i : (i?.name ?? '')))
    .join(' ')
    .toLowerCase();
}

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

// Hard-excluded from Meal Prep mode
const MEAL_PREP_SHELLFISH = [
  'clam', 'mussel', 'oyster', 'scallop', 'lobster', 'crab', 'prawn', 'shrimp',
];
// Cooking methods that don't suit meal prep (title-based check)
const MEAL_PREP_EXCLUDE_METHODS = ['steamed', 'poached', 'raw ', 'ceviche', 'tartare', 'sashimi'];
// Delicate fish that don't reheat well — excluded from meal prep
const MEAL_PREP_DELICATE_FISH = [
  'sole', 'flounder', 'tilapia', 'cod', 'halibut', 'sea bass', 'branzino',
  'snapper', 'trout', 'whiting', 'plaice', 'dover sole',
];

// In-memory cache — survives tab switches, cleared on goal change or after 30 min.
let deckCache: { data: Recipe[]; goalsKey: string; at: number } | null = null;
const DECK_CACHE_TTL = 30 * 60 * 1000;

// Trending recipe IDs — recipes with ≥3 right swipes from any user in the past 7 days.
// Cached in-memory for 30 min to avoid hammering swipe_events on every deck load.
let trendingCache: { ids: Set<string>; at: number } | null = null;

export async function fetchTrendingRecipeIds(): Promise<Set<string>> {
  if (trendingCache && Date.now() - trendingCache.at < DECK_CACHE_TTL) {
    return trendingCache.ids;
  }
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('swipe_events')
      .select('recipe_id')
      .eq('direction', 'right')
      .gte('swiped_at', sevenDaysAgo);

    const counts = new Map<string, number>();
    for (const row of (data ?? [])) {
      counts.set(row.recipe_id, (counts.get(row.recipe_id) ?? 0) + 1);
    }
    const ids = new Set<string>();
    for (const [id, count] of counts) {
      if (count >= 3) ids.add(id);
    }
    trendingCache = { ids, at: Date.now() };
    return ids;
  } catch {
    return new Set();
  }
}

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
    .select('id, title, description, cuisine, source_type, dietary_tags, badge, avg_rating, save_count, image_url, external_id, prep_time_mins, cook_time_mins, servings, cost_per_serving, macros, ingredients, steps, meal_prep_friendly, skill_level, is_public, moderation_status, submitted_by, submitter:profiles_public!recipes_submitted_by_fkey(name, avatar_url, username)')
    .or('source_type.neq.community,and(source_type.eq.community,is_public.eq.true,moderation_status.eq.approved)')
    .is('deleted_at', null)
    .limit(2000);

  if (error) throw error;

  const rows = (data ?? []) as any[];
  const filtered = rows
    .filter((r) => {
      const t = r.title.toLowerCase();
      if (DECK_EXCLUDE.some((w) => t.includes(w))) return false;
      if ((r.dietary_tags ?? []).includes('dessert')) return false;
      if (dietaryGoals.includes('vegan') || dietaryGoals.includes('vegetarian')) {
        if (DECK_ALL_MEAT.some((w) => t.includes(w))) return false;
        const ingText = buildIngredientText(r.ingredients ?? []);
        if (DECK_ALL_MEAT.some((w) => ingText.includes(w))) return false;
        return true;
      }
      if (dietaryGoals.includes('pescatarian')) {
        if (DECK_LAND_MEAT.some((w) => t.includes(w))) return false;
        const ingText = buildIngredientText(r.ingredients ?? []);
        if (DECK_LAND_MEAT.some((w) => ingText.includes(w))) return false;
        return true;
      }
      return true;
    })
    .map(
      (r): Recipe => ({
        id: r.external_id ?? r.id,  // TheMealDB id for seeded recipes, UUID for generated
        supabase_id: r.id,          // real UUID — used for swipe history matching in scorer
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
        meal_prep_friendly: r.meal_prep_friendly ?? null,
        skill_level: r.skill_level ?? null,
        is_public: r.is_public ?? true,
        moderation_status: r.moderation_status ?? null,
        submitted_by: r.submitted_by ?? null,
        submitter_name: r.submitter?.name ?? null,
        submitter_avatar: r.submitter?.avatar_url ?? null,
        submitter_username: r.submitter?.username ?? null,
      } as Recipe)
    );

  deckCache = { data: filtered, goalsKey, at: Date.now() };
  return filtered;
}

// ─── Swipe History ────────────────────────────────────────────────────────────

// Fetches the most recent swipes for a user — used by the local scorer.
// Returns most-recent-first so the first occurrence of a recipe_id wins.
export async function getRecentSwipes(userId: string, limit = 500): Promise<{ recipe_id: string; direction: string; swiped_at: string }[]> {
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

export async function getUserRatings(userId: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('saved_recipes')
    .select('recipe_id, user_rating')
    .eq('user_id', userId)
    .not('user_rating', 'is', null);
  const map = new Map<string, number>();
  for (const row of data ?? []) map.set(row.recipe_id, row.user_rating);
  return map;
}

async function getInteractionCounts(userId: string): Promise<Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>> {
  const { data } = await supabase
    .from('recipe_interactions')
    .select('recipe_id, interaction_type, created_at')
    .eq('user_id', userId)
    .in('interaction_type', ['grocery_add', 'cooked', 'unsave', 'view']);
  const map = new Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>();
  for (const row of data ?? []) {
    const cur = map.get(row.recipe_id) ?? { grocery_add: 0, cooked: 0, unsave: 0, view: 0, lastCookedAt: null };
    if (row.interaction_type === 'grocery_add') cur.grocery_add++;
    if (row.interaction_type === 'cooked') {
      cur.cooked++;
      if (!cur.lastCookedAt || row.created_at > cur.lastCookedAt) cur.lastCookedAt = row.created_at;
    }
    if (row.interaction_type === 'unsave') cur.unsave++;
    if (row.interaction_type === 'view') cur.view++;
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
  // most_days cookers unlock adventure cards with half the swipe history — they're ready for variety sooner
  const isFrequentCook = profile.cooking_frequency === 'most_days';
  const minTotal = isFrequentCook ? 10 : 20;
  const minRights = isFrequentCook ? 4 : 8;
  return total >= minTotal && rights >= minRights && total > 0 && rights / total >= 0.3;
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
  dietaryGoals: string[] = [],
): Promise<Recipe | null> {
  const { data } = await supabase
    .from('recipes')
    .select('id, title, description, cuisine, source_type, dietary_tags, badge, avg_rating, save_count, image_url, external_id, prep_time_mins, cook_time_mins, servings, cost_per_serving, macros, ingredients, steps')
    .ilike('cuisine', cuisine)
    .not('external_id', 'is', null)
    .is('deleted_at', null)
    .limit(10);
  const eligible = (data ?? []).filter((r: any) => {
    if (existingSupabaseIds.has(r.id)) return false;
    const t = (r.title ?? '').toLowerCase();
    const ingText = buildIngredientText(r.ingredients ?? []);
    if (dietaryGoals.includes('vegan') || dietaryGoals.includes('vegetarian')) {
      if (DECK_ALL_MEAT.some((w) => t.includes(w) || ingText.includes(w))) return false;
    } else if (dietaryGoals.includes('pescatarian')) {
      if (DECK_LAND_MEAT.some((w) => t.includes(w) || ingText.includes(w))) return false;
    }
    return true;
  });
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

// ─── Unit system preference ────────────────────────────────────────────────────
// 'us' = cups/tbsp/tsp/oz  |  'metric' = ml/g (default: 'us')

const UNIT_SYSTEM_KEY = '@mori_unit_system';

export async function getUnitSystem(): Promise<'us' | 'metric'> {
  try {
    const val = await AsyncStorage.getItem(UNIT_SYSTEM_KEY);
    return val === 'metric' ? 'metric' : 'us';
  } catch {
    return 'us';
  }
}

export async function setUnitSystem(system: 'us' | 'metric'): Promise<void> {
  try {
    await AsyncStorage.setItem(UNIT_SYSTEM_KEY, system);
  } catch {
    // non-critical
  }
}

// ─── Session-level swipe tracking (Bug 7) ────────────────────────────────────
// In-memory: resets on app close. Cross-session left-swipes persisted to AsyncStorage
// with a 14-day TTL so recently-rejected recipes don't resurface immediately.

const sessionLeftSwipes = new Set<string>(); // supabase_ids left-swiped this session
const sessionShownIds = new Set<string>();   // supabase_ids already seen this session

const RECENT_LEFT_SWIPES_KEY = 'mise_recent_left_swipes_v1';
const LEFT_SWIPE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface PersistedLeftSwipe { id: string; at: number; }

async function loadPersistedLeftSwipes(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_LEFT_SWIPES_KEY);
    if (!raw) return;
    const entries: PersistedLeftSwipe[] = JSON.parse(raw);
    const cutoff = Date.now() - LEFT_SWIPE_TTL_MS;
    for (const e of entries) {
      if (e.at > cutoff) sessionLeftSwipes.add(e.id);
    }
  } catch {}
}

async function persistLeftSwipe(supabaseId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_LEFT_SWIPES_KEY);
    const existing: PersistedLeftSwipe[] = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - LEFT_SWIPE_TTL_MS;
    const fresh = existing.filter((e) => e.at > cutoff && e.id !== supabaseId);
    fresh.push({ id: supabaseId, at: Date.now() });
    await AsyncStorage.setItem(RECENT_LEFT_SWIPES_KEY, JSON.stringify(fresh));
  } catch {}
}

// When a user left-swipes an adventure card, suppress adventure cards for the
// next 10 regular swipes so we don't pester users who aren't interested yet.
let adventureCardCooldown = 0;

export function recordAdventureCardLeftSwipe(): void {
  adventureCardCooldown = 10;
}

// Tracks per-cuisine swipe counts within the current session so the scorer can
// boost/penalize recipes sharing a cuisine the user is clearly into or avoiding.
const sessionCuisineSwipes = new Map<string, { right: number; left: number }>();

export function recordSessionSwipe(supabaseId: string, direction: 'left' | 'right', cuisines?: string[]): void {
  sessionShownIds.add(supabaseId);
  if (direction === 'left') {
    sessionLeftSwipes.add(supabaseId);
    persistLeftSwipe(supabaseId); // fire-and-forget — cross-session persistence
  }
  // Accumulate cuisine affinity from swipes (fusion-aware)
  for (const cuisine of (cuisines ?? [])) {
    const cur = sessionCuisineSwipes.get(cuisine) ?? { right: 0, left: 0 };
    if (direction === 'right') cur.right++;
    else cur.left++;
    sessionCuisineSwipes.set(cuisine, cur);
  }
  if (adventureCardCooldown > 0) adventureCardCooldown--;
}

// Called when the user undoes a left swipe — removes the id from the left-swipe
// suppression list so a subsequent right swipe isn't blocked on deck re-fetch.
export async function cancelLeftSwipe(supabaseId: string): Promise<void> {
  sessionLeftSwipes.delete(supabaseId);
  try {
    const raw = await AsyncStorage.getItem(RECENT_LEFT_SWIPES_KEY);
    if (!raw) return;
    const entries: PersistedLeftSwipe[] = JSON.parse(raw);
    await AsyncStorage.setItem(
      RECENT_LEFT_SWIPES_KEY,
      JSON.stringify(entries.filter((e) => e.id !== supabaseId))
    );
  } catch {}
}

export function clearSessionState(): void {
  sessionLeftSwipes.clear();
  sessionShownIds.clear();
  sessionCuisineSwipes.clear();
  adventureCardCooldown = 0;
}

// ─── Leftovers ────────────────────────────────────────────────────────────────

export async function getLeftovers(userId: string): Promise<import('@/types').UserLeftover[]> {
  const { data, error } = await supabase
    .from('user_leftovers')
    .select('*')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('spoils_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as import('@/types').UserLeftover[];
}

export async function addLeftovers(
  userId: string,
  items: { name: string; spoilsAt: string; ingredientId?: string | null }[]
): Promise<import('@/types').UserLeftover[]> {
  const rows = items.map((item) => ({
    user_id: userId,
    ingredient_id: item.ingredientId ?? null,
    ingredient_name: item.name,
    storage_method: 'fridge',
    spoils_at: item.spoilsAt,
  }));
  const { data, error } = await supabase
    .from('user_leftovers')
    .insert(rows)
    .select();
  if (error) throw error;
  return (data ?? []) as import('@/types').UserLeftover[];
}

export async function dismissLeftover(id: string): Promise<void> {
  await supabase
    .from('user_leftovers')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id);
}

export async function extendLeftover(id: string, newSpoilsAt: string, newExtendedCount: number): Promise<void> {
  await supabase
    .from('user_leftovers')
    .update({ spoils_at: newSpoilsAt, extended_count: newExtendedCount })
    .eq('id', id);
}

// Returns saved_at timestamps keyed by supabase recipe_id — used by the scorer
// to apply a save-recency cooldown so just-saved recipes don't immediately
// resurface on the next deck load.
export async function getSavedAtMap(userId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('saved_recipes')
    .select('recipe_id, saved_at')
    .eq('user_id', userId);
  return new Map((data ?? []).map((r: any) => [r.recipe_id as string, r.saved_at as string]));
}

// Returns active (non-expired, non-dismissed) leftover names as a lowercase Set.
// Used by fetchScoredDeck — called once per deck load, passed into scoreRecipe.
export async function fetchLeftoverNames(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('user_leftovers')
    .select('ingredient_name')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .gt('spoils_at', new Date().toISOString());
  return new Set((data ?? []).filter((r: any) => r.ingredient_name).map((r: any) => r.ingredient_name.toLowerCase().trim()));
}

// Looks up shelf-life for a given ingredient name (exact or alias match).
// Prefers days_fridge; falls back to days_room_temp so room-temp-stable items
// (honey, dry spices, oils) don't get the 4-day default and fire a bogus
// 2-day notification. Returns null only if the row is missing or has neither value.
export async function getIngredientStorageDays(name: string): Promise<number | null> {
  const n = name.toLowerCase().trim();
  const { data: exact } = await supabase
    .from('ingredient_storage')
    .select('days_fridge,days_room_temp')
    .eq('canonical_name', n)
    .single();
  if (exact) return exact.days_fridge ?? exact.days_room_temp ?? null;
  const { data: alias } = await supabase
    .from('ingredient_storage')
    .select('days_fridge,days_room_temp')
    .contains('aliases', [n])
    .single();
  return alias ? (alias.days_fridge ?? alias.days_room_temp ?? null) : null;
}

export interface IngredientStorageInfo {
  days_fridge: number | null;
  days_freezer: number | null;
  days_room_temp: number | null;
  tips_text: string | null;
}

// Full shelf-life row for a given ingredient (exact or alias match).
// Returns null if not found.
export async function getIngredientStorage(name: string): Promise<IngredientStorageInfo | null> {
  const n = name.toLowerCase().trim();
  const cols = 'days_fridge,days_freezer,days_room_temp,tips_text';
  const { data: exact } = await supabase
    .from('ingredient_storage')
    .select(cols)
    .eq('canonical_name', n)
    .single();
  if (exact) return exact as IngredientStorageInfo;
  const { data: alias } = await supabase
    .from('ingredient_storage')
    .select(cols)
    .contains('aliases', [n])
    .single();
  return alias ? (alias as IngredientStorageInfo) : null;
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

export function scoreRecipe(
  recipe: Recipe,
  profile: Profile | null,
  swipeMap: Map<string, { direction: 'left' | 'right'; swiped_at: string }>,
  savedExternalIds: Set<string>,
  affinityMap: Map<string, number>,
  interactionMap: Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>,
  pantrySet: Set<string>,
  leftoversSet?: Set<string>,
  ratingMap?: Map<string, number>,
  savedAtMap?: Map<string, string>,
): number {
  // Bug 7 — session penalty: instantly exclude anything swiped this session
  const sid = recipe.supabase_id;
  if (sid && (sessionLeftSwipes.has(sid) || sessionShownIds.has(sid))) return -999;

  let score = Math.random() * 3; // jitter — shuffles similarly-scored recipes each session

  // Currently-saved check — used by both the favourites_rotation bonus and to
  // suppress double-counting the right-swipe boost on already-saved recipes.
  const savedKey = recipe.external_id ?? recipe.supabase_id ?? '';
  const isCurrentlySaved = !!savedKey && savedExternalIds.has(savedKey);

  // favourites_rotation: +3 for saved recipes so old favourites compete without
  // dominating. Combined with the saved-share cap in fetchScoredDeck, this
  // gives rotation users 1-in-4 saved slots instead of a flooded deck.
  if (profile?.eating_style === 'favourites_rotation' && isCurrentlySaved) {
    score += 3;

    // Save-recency cooldown — mirrors the cooked-recency penalty so users
    // don't see a recipe they just saved on the very next deck reload.
    if (sid && savedAtMap) {
      const savedAtIso = savedAtMap.get(sid);
      if (savedAtIso) {
        const daysSinceSaved = (Date.now() - new Date(savedAtIso).getTime()) / 86_400_000;
        if (daysSinceSaved < 3) score -= 15;
        else if (daysSinceSaved < 14) score -= 6;
      }
    }
  }

  // Cohort affinity base (0.0–1.0, scaled up) — cold-start signal for new users
  const affinity = affinityMap.get(recipe.supabase_id ?? '');
  if (affinity != null) score += affinity * 4;

  // Cuisine match — handles fusion cuisines stored as "cajun,italian"
  const recipeCuisines = (recipe.cuisine ?? '').split(',').map(c => c.trim()).filter(Boolean);
  if (recipeCuisines.some(c => profile?.cuisine_preferences?.includes(c))) score += 3;

  // Session cuisine affinity — boost/penalize based on cuisines swiped this session
  // Capped at 3 swipes per cuisine to avoid runaway feedback loops
  for (const cuisine of recipeCuisines) {
    const swipes = sessionCuisineSwipes.get(cuisine);
    if (swipes) {
      score += Math.min(swipes.right, 3) * 1.5;
      score -= Math.min(swipes.left, 3) * 2;
    }
  }

  // Dietary goal alignment — Bug 6: trust macro data over tags when available
  const goals = profile?.dietary_goals ?? [];
  let dietaryBonus = 0;
  for (const goal of goals) {
    const m = recipe.macros as any;
    if (m) {
      if (goal === 'high_protein' && m.protein >= 25) dietaryBonus += 10;
      else if (goal === 'keto' && (m.netCarbs ?? m.carbohydrates - (m.fibre ?? 0)) <= 10) dietaryBonus += 10;
      else if (goal === 'low_fat' && m.fat <= 10) dietaryBonus += 10;
      else if (goal === 'low_carb' && m.carbohydrates <= 30) dietaryBonus += 10;
      else if ((recipe.dietary_tags ?? []).includes(goal)) dietaryBonus += 5;
    } else {
      if ((recipe.dietary_tags ?? []).includes(goal)) dietaryBonus += 5;
    }
  }
  score += Math.min(dietaryBonus, 20);

  // Eating style
  if (profile?.eating_style === 'quick_simple') {
    const totalMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);
    if (totalMins > 0 && totalMins <= 30) score += 2;
    if (totalMins > 45) score -= 2;
  }

  // Swipe history with temporal decay — older signals fade over ~30 days
  if (sid) {
    const ix = interactionMap.get(sid);
    const swipe = swipeMap.get(sid);
    if (swipe) {
      const daysSince = (Date.now() - new Date(swipe.swiped_at).getTime()) / 86_400_000;
      const decay = Math.exp(-daysSince / 30);
      if (swipe.direction === 'right') {
        // Skip when currently saved — the save bonus already represents this signal,
        // and stacking both was the dominant cause of saved recipes flooding the deck.
        if ((!ix || !ix.unsave) && !isCurrentlySaved) score += 5 * decay;
      }
      if (swipe.direction === 'left') score -= 15 * decay;
    }

    // Interaction signals — capped at 2 to prevent feedback loop dominating deck
    if (ix) {
      score += Math.min(ix.grocery_add, 2) * 3;
      // Cooked signal: penalise recently-cooked recipes so they don't resurface
      // immediately, then restore the favourite bonus once enough time has passed.
      if (ix.cooked > 0) {
        const daysSinceCooked = ix.lastCookedAt
          ? (Date.now() - new Date(ix.lastCookedAt).getTime()) / 86_400_000
          : 365;
        if (daysSinceCooked < 3)  score -= 20; // just cooked — keep off the deck
        else if (daysSinceCooked < 7)  score -= 10;
        else if (daysSinceCooked < 14) score -= 4;
        else if (daysSinceCooked < 30) score += 2;
        else score += Math.min(ix.cooked, 2) * 4; // familiar favourite
      }
      if (ix.unsave > 0) score -= 3;
      if (ix.view > 2 && !ix.grocery_add && !ix.cooked) score -= 2;
    }

    // Personal rating signal — user's own star rating on this recipe.
    // Range: 1★ → -4, 3★ → 0 (neutral), 5★ → +4.
    // Stronger than the community signal since it's a direct personal preference.
    if (ratingMap && sid) {
      const userRating = ratingMap.get(sid);
      if (userRating != null) score += (userRating - 3) * 2;
    }
  }

  // Saved recipes are hard-excluded in fetchScoredDeck before scoring reaches here.

  // Leftover ingredient match — +2 per match, cap +10.
  // Promotes recipes that use what the user already has before it spoils.
  if (leftoversSet?.size) {
    let matches = 0;
    for (const ing of (recipe.ingredients ?? []) as { name: string }[]) {
      if (!ing?.name) continue;
      const n = ing.name.toLowerCase().trim();
      for (const left of leftoversSet) {
        if (n === left || n.includes(left) || left.includes(n)) { matches++; break; }
      }
    }
    score += Math.min(matches * 2, 10);
  }

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
        const pantryMatch = [...pantrySet].some(p => name.includes(p) || p.includes(name));
        if (pantryMatch) weightedMatches += weight;
      }
      const pantryRatio = totalWeight > 0 ? weightedMatches / totalWeight : 0;
      score += pantryRatio * 20;
    }
  }

  // Recipe rating quality — only counts when there's enough signal (>=3 reviews)
  // to avoid noise from a single 5★ outlier. Centred on 3★ (neutral); 1★ → -3,
  // 5★ → +3. Modest cap so it competes with cuisine/dietary signals, not dominates.
  if (recipe.rating_count != null && recipe.rating_count >= 3 && recipe.avg_rating != null) {
    score += (recipe.avg_rating - 3) * 1.5;
  }

  return score;
}

// Saved-share cap for favourites_rotation. Splits the scored deck into saved
// vs. unsaved (preserving relative score order within each), then interleaves
// so saved appears every 4th slot up to a 30% absolute ceiling. Excess saved
// recipes are appended at the end so they're still reachable but don't crowd
// out fresh discovery at the top.
function capSavedShare(
  scored: { recipe: Recipe; score: number }[],
  savedExternalIds: Set<string>,
): { recipe: Recipe; score: number }[] {
  const isSaved = (r: Recipe): boolean => {
    const k = r.external_id ?? r.supabase_id ?? '';
    return !!k && savedExternalIds.has(k);
  };
  const saved: { recipe: Recipe; score: number }[] = [];
  const unsaved: { recipe: Recipe; score: number }[] = [];
  for (const s of scored) (isSaved(s.recipe) ? saved : unsaved).push(s);
  if (saved.length === 0 || unsaved.length === 0) return scored;

  const maxSaved = Math.max(1, Math.floor(scored.length * 0.3));
  const savedToShow = saved.slice(0, maxSaved);
  const savedOverflow = saved.slice(maxSaved);

  // Interleave: saved at positions 3, 7, 11, … (every 4th slot ≈ 25%)
  const result: { recipe: Recipe; score: number }[] = [];
  let si = 0;
  let ui = 0;
  for (let pos = 0; ui < unsaved.length || si < savedToShow.length; pos++) {
    const wantSaved = pos > 0 && pos % 4 === 3 && si < savedToShow.length;
    if (wantSaved) result.push(savedToShow[si++]);
    else if (ui < unsaved.length) result.push(unsaved[ui++]);
    else if (si < savedToShow.length) result.push(savedToShow[si++]);
  }
  // Tail: anything trimmed by the 30% ceiling — still reachable on a long session
  result.push(...savedOverflow);
  return result;
}

// Fetches the discover deck and ranks it locally using a weighted scoring function.
// No Vercel, no API calls — runs entirely on-device after one Supabase query + parallel signals.
export async function fetchScoredDeck(
  userId: string | undefined,
  dietaryGoals: string[],
  profile: Profile | null,
  savedExternalIds: Set<string>,
  mode: AppMode = 'spontaneous',
): Promise<Recipe[]> {
  // Load persisted left-swipes from previous sessions into the session Set
  await loadPersistedLeftSwipes();

  const [deck, swipes, affinityMap, interactionMap, pantryItems, trendingIds, leftoversSet, ratingMap, savedAtMap] = await Promise.all([
    fetchDiscoverRecipes(dietaryGoals),
    userId ? getRecentSwipes(userId) : Promise.resolve([]),
    userId
      ? getUserCohortKey(userId).then((key) => (key ? getCohortAffinities(key) : new Map<string, number>()))
      : Promise.resolve(new Map<string, number>()),
    userId ? getInteractionCounts(userId) : Promise.resolve(new Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>()),
    userId ? getPantryItems(userId) : Promise.resolve([]),
    fetchTrendingRecipeIds(),
    userId ? fetchLeftoverNames(userId) : Promise.resolve(new Set<string>()),
    userId ? getUserRatings(userId) : Promise.resolve(new Map<string, number>()),
    userId ? getSavedAtMap(userId) : Promise.resolve(new Map<string, string>()),
  ]);

  const pantrySet = new Set(pantryItems.filter((p) => p.ingredient_name).map((p) => p.ingredient_name.toLowerCase()));

  // Bug 1 fix — ingredient dislike hard filter (never soft-deprioritise, never relaxed)
  const dislikes = (profile?.ingredient_dislikes ?? []).map((d) => d.toLowerCase());
  const afterDislikes = dislikes.length === 0 ? deck : deck.filter((r) => {
    const ingredients = (r.ingredients ?? []) as { name: string }[];
    return !ingredients.some((ing) =>
      ing?.name && dislikes.some((dislike) => ing.name.toLowerCase().includes(dislike))
    );
  });

  // Exclude saved recipes — user already has them in their library.
  // favourites_rotation: saved recipes stay in the pool so the scorer can rank them;
  // a +3 bonus in scoreRecipe surfaces old favourites, a save-recency penalty
  // suppresses just-saved recipes for 14 days, and a 30% saved-share cap below
  // prevents saved from flooding the deck even if their scores top the leaderboard.
  const wantsRotation = profile?.eating_style === 'favourites_rotation';
  const afterSaved = (wantsRotation || savedExternalIds.size === 0) ? afterDislikes : afterDislikes.filter((r) =>
    !savedExternalIds.has(r.external_id ?? r.id ?? '')
  );

  // Hard-exclude recipes cooked in the last 7 days so they can't resurface even on a thin deck
  const recentlyCookedIds = new Set<string>();
  for (const [id, ix] of interactionMap) {
    if (ix.lastCookedAt) {
      const daysSince = (Date.now() - new Date(ix.lastCookedAt).getTime()) / 86_400_000;
      if (daysSince < 7) recentlyCookedIds.add(id);
    }
  }
  const afterCooked = recentlyCookedIds.size === 0
    ? afterSaved
    : afterSaved.filter((r) => !recentlyCookedIds.has(r.supabase_id ?? ''));

  // Bug 8 fix — skill level hard cap (filter before scoring, not a score penalty)
  // Recipe-level skill_level (set at generation from CSV difficulty) takes precedence;
  // time-based cap is the fallback for TheMealDB recipes that lack the field.
  const skillLevel = profile?.skill_level;
  const filtered = !skillLevel ? afterCooked : afterCooked.filter((r) => {
    const recipeSkill = (r as any).skill_level as string | null | undefined;
    if (recipeSkill === 'confident_chef' && skillLevel !== 'confident_chef') return false;
    if (recipeSkill === 'home_cook' && skillLevel === 'beginner') return false;
    if (!recipeSkill) {
      // time-based fallback for recipes without an explicit skill_level
      const totalTime = (r.prep_time_mins ?? 0) + (r.cook_time_mins ?? 0);
      // just_starting cookers get a stricter cap to build confidence on shorter recipes
      const beginnerCap = profile?.cooking_frequency === 'just_starting' ? 45 : 60;
      if (skillLevel === 'beginner' && totalTime > 0 && totalTime > beginnerCap) return false;
      if (skillLevel === 'home_cook' && totalTime > 0 && totalTime > 120) return false;
    }
    return true;
  });

  // Most-recent swipe per recipe wins (desc order from DB)
  const swipeMap = new Map<string, { direction: 'left' | 'right'; swiped_at: string }>();
  for (const s of swipes) {
    if (!swipeMap.has(s.recipe_id)) {
      swipeMap.set(s.recipe_id, { direction: s.direction as 'left' | 'right', swiped_at: s.swiped_at });
    }
  }

  let scored = filtered.map((r) => ({
    recipe: r,
    score: scoreRecipe(r, profile, swipeMap, savedExternalIds, affinityMap, interactionMap, pantrySet, leftoversSet, ratingMap, savedAtMap),
  }));

  // Phase 2.5 — Meal Prep mode: only show explicitly flagged recipes
  if (mode === 'meal_prep') {
    scored = scored.filter(({ recipe }) => recipe.meal_prep_friendly === true);
  }

  scored.sort((a, b) => b.score - a.score);

  // Bug 3 fix — diversity pass (prevents monoculture for all users, stricter for variety)
  // favourites_rotation gets the strictest cap: with +3 saved bonus the scorer would
  // otherwise stack 5 saved recipes per cuisine to the top of the deck.
  const maxPerCuisine = profile?.eating_style === 'variety' ? 3
    : profile?.eating_style === 'favourites_rotation' ? 2
    : 5;
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

  // Graceful relaxation cascade. Hard filters (ingredient dislikes, dietary exclusions)
  // are NEVER relaxed. Saved recipe exclusion is relaxed last (edge case: power user
  // who has saved most of the 419-recipe catalogue). Relaxation order:
  //   1. Drop diversity constraint
  //   2. Drop skill level cap
  //   3. Re-include saved recipes (last resort only)
  let finalDeck = diverse;
  if (diverse.length < 10 && scored.length > diverse.length) {
    console.warn(`[fetchScoredDeck] diversity pass left only ${diverse.length} recipes — relaxing constraint`);
    finalDeck = scored;
  }
  if (finalDeck.length < 5 && afterSaved.length > filtered.length) {
    console.warn(`[fetchScoredDeck] skill filter too aggressive — relaxing`);
    const rescored = afterSaved.map((r) => ({
      recipe: r,
      score: scoreRecipe(r, profile, swipeMap, savedExternalIds, affinityMap, interactionMap, pantrySet, leftoversSet, ratingMap, savedAtMap),
    }));
    rescored.sort((a, b) => b.score - a.score);
    finalDeck = rescored;
  }
  if (finalDeck.length < 5 && afterDislikes.length > afterSaved.length) {
    // Last resort: re-include saved recipes so the deck is never empty
    console.warn(`[fetchScoredDeck] very few unsaved recipes — re-including saved as last resort`);
    const rescored = afterDislikes.map((r) => ({
      recipe: r,
      score: scoreRecipe(r, profile, swipeMap, savedExternalIds, affinityMap, interactionMap, pantrySet, leftoversSet, ratingMap, savedAtMap),
    }));
    rescored.sort((a, b) => b.score - a.score);
    finalDeck = rescored;
  }
  if (finalDeck.length < 5) {
    console.warn(`[fetchScoredDeck] only ${finalDeck.length} recipes after all filters — very restrictive preferences`);
  }

  // Saved-share cap — favourites_rotation only. Prevents saved recipes from
  // monopolising the top of the deck even when their scores top the leaderboard.
  // Caps saved at ≤30% of slots and interleaves so saved appears every 4th slot.
  // Skipped on tiny decks (last-resort relaxation already pulled saved back in
  // because the unsaved pool was exhausted — capping further would empty it).
  if (wantsRotation && savedExternalIds.size > 0 && finalDeck.length >= 8) {
    finalDeck = capSavedShare(finalDeck, savedExternalIds);
  }

  console.log(`[fetchScoredDeck] ${finalDeck.length} recipes | top 5: ${finalDeck.slice(0, 5).map((s) => `${s.recipe.title} (${s.score.toFixed(1)})`).join(', ')}`);
  if (dislikes.length > 0) {
    console.log(`[fetchScoredDeck] dislike filter: ${deck.length} → ${afterDislikes.length} | skill filter: → ${filtered.length}`);
  }

  // Tag trending recipes — isTrending = true when supabase_id is in the trending set
  const result = finalDeck.map((s) => ({
    ...s.recipe,
    isTrending: trendingIds.has(s.recipe.supabase_id ?? ''),
  }));

  // First-session pantry priority — promote top 3 pantry-matched recipes to front.
  // just_starting cookers get this for their first 3 sessions to keep building confidence.
  const pantryPriorityWindow = profile?.cooking_frequency === 'just_starting' ? 3 : 1;
  if (profile && profile.total_sessions <= pantryPriorityWindow && pantrySet.size > 0) {
    const withPantryRatio = result.map((r) => {
      const ings = (r.ingredients ?? []) as { name: string }[];
      if (ings.length === 0) return { recipe: r, pantryRatio: 0 };
      let weightedMatches = 0;
      let totalWeight = 0;
      for (const ing of ings) {
        if (!ing?.name) continue;
        const name = ing.name.toLowerCase();
        const weight = COMMON_STAPLES.has(name) ? 0.2 : 1.0;
        totalWeight += weight;
        if (pantrySet.has(name)) weightedMatches += weight;
      }
      return { recipe: r, pantryRatio: totalWeight > 0 ? weightedMatches / totalWeight : 0 };
    });
    const sorted = [...withPantryRatio].sort((a, b) => b.pantryRatio - a.pantryRatio);
    const promoted = sorted.slice(0, 3).map((e) => e.recipe);
    const promotedIds = new Set(promoted.map((r) => r.id));
    const rest = result.filter((r) => !promotedIds.has(r.id));
    result.splice(0, result.length, ...promoted, ...rest);
    console.log(`[fetchScoredDeck] pantry priority: promoted ${promoted.map((r) => r.title).join(', ')}`);
  }

  // Adventure card injection — surfaces a niche adjacent cuisine at position 6
  const adventureEnabled = userId ? await getAdventureCardsEnabled() : false;
  if (adventureEnabled && isReadyForAdventureCard(profile, swipes) && result.length >= 6) {
    const existingCuisines = new Set(result.slice(0, 8).map((r) => (r.cuisine ?? '').toLowerCase()));
    const existingIds = new Set(result.map((r) => r.supabase_id ?? '').filter(Boolean));
    const adventureCuisine = pickAdventureCuisine(profile, existingCuisines);
    if (adventureCuisine) {
      const adventureRecipe = await fetchAdventureRecipe(adventureCuisine, existingIds, dietaryGoals);
      if (adventureRecipe) {
        result.splice(5, 0, { ...adventureRecipe, isTrending: adventureRecipe.isTrending ?? false });
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
  if (!userId) return fetchDiscoverRecipes(dietaryGoals);

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/recommendations`, {
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
  interactionType: 'view' | 'grocery_add' | 'cooked' | 'unsave',
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

// ─── Streak + Count ───────────────────────────────────────────────────────────
// Called fire-and-forget after every logInteraction(..., 'cooked').
// Updates current_streak, longest_streak, last_cooked_date, meals_cooked_count.

// Returns the streak that should be SHOWN to the user, not the stale DB value.
// The DB only updates current_streak on the next cook (then resets to 1 if broken),
// so without this helper a 10-day streak from 2 weeks ago still displays as "10d".
// Live = last cook was today or yesterday. Anything else → 0 (flame-out).
export function getEffectiveStreak(currentStreak: number | null | undefined, lastCookedDate: string | null | undefined): number {
  if (!currentStreak || !lastCookedDate) return 0;
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  return lastCookedDate === today || lastCookedDate === yesterday ? currentStreak : 0;
}

export async function updateStreakAndCount(
  userId: string,
): Promise<{ current_streak: number; longest_streak: number; meals_cooked_count: number } | null> {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_cooked_date, current_streak, longest_streak, meals_cooked_count')
    .eq('id', userId)
    .single();
  if (!profile) return null;

  const last: string | null = profile.last_cooked_date;
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');

  let newStreak: number;
  if (last === today) {
    // Same-day cook — preserve existing streak, don't double-count
    newStreak = profile.current_streak ?? 1;
  } else if (last === yesterday) {
    newStreak = (profile.current_streak ?? 0) + 1;
  } else {
    // Streak broken or first cook
    newStreak = 1;
  }

  const newLongest = Math.max(profile.longest_streak ?? 0, newStreak);
  const newCount = (profile.meals_cooked_count ?? 0) + (last === today ? 0 : 1);

  await supabase.from('profiles').update({
    current_streak: newStreak,
    longest_streak: newLongest,
    last_cooked_date: today,
    meals_cooked_count: newCount,
  }).eq('id', userId);

  return { current_streak: newStreak, longest_streak: newLongest, meals_cooked_count: newCount };
}

// ─── Badge Stats ──────────────────────────────────────────────────────────────
// Fetches the data needed to compute which badges the user has earned.

// longestStreak + recipesSubmitted are passed in from the already-loaded profile
// so this query doesn't depend on the streak migration columns being present.
export async function fetchBadgeStats(
  userId: string,
  knownStats: { longestStreak: number; recipesSubmitted: number },
): Promise<BadgeStats> {
  const interactionsRes = await supabase
    .from('recipe_interactions')
    .select('recipes(cuisine, meal_prep_friendly)')
    .eq('user_id', userId)
    .eq('interaction_type', 'cooked');

  const rows = (interactionsRes.data ?? []) as unknown as Array<{
    recipes: { cuisine: string | null; meal_prep_friendly: boolean | null } | null;
  }>;
  const cuisines = new Set<string>();
  let cookedMealPrep = false;
  for (const row of rows) {
    const r = row.recipes;
    if (r?.cuisine) r.cuisine.split(',').forEach((c) => cuisines.add(c.trim()));
    if (r?.meal_prep_friendly) cookedMealPrep = true;
  }

  return {
    totalCooked: rows.length,
    longestStreak: knownStats.longestStreak,
    distinctCuisines: cuisines.size,
    cookedMealPrep,
    recipesSubmitted: knownStats.recipesSubmitted,
  };
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

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function fetchRecipeReviews(recipeId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('recipe_reviews')
    .select('*, reviewer:profiles_public!recipe_reviews_user_id_fkey(name, username, avatar_url)')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    recipe_id: r.recipe_id,
    user_id: r.user_id,
    rating: r.rating,
    review_text: r.review_text ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    reviewer_name: r.reviewer?.name ?? null,
    reviewer_username: r.reviewer?.username ?? null,
    reviewer_avatar: r.reviewer?.avatar_url ?? null,
  }));
}

export async function getUserReviewForRecipe(userId: string, recipeId: string): Promise<Review | null> {
  const { data, error } = await supabase
    .from('recipe_reviews')
    .select('*, reviewer:profiles_public!recipe_reviews_user_id_fkey(name, username, avatar_url)')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    recipe_id: data.recipe_id,
    user_id: data.user_id,
    rating: data.rating,
    review_text: data.review_text ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    reviewer_name: data.reviewer?.name ?? null,
    reviewer_username: data.reviewer?.username ?? null,
    reviewer_avatar: data.reviewer?.avatar_url ?? null,
  };
}

export async function hasUserCookedRecipe(userId: string, recipeId: string): Promise<boolean> {
  const { data } = await supabase
    .from('recipe_interactions')
    .select('id')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .eq('interaction_type', 'cooked')
    .limit(1)
    .maybeSingle();
  return data !== null;
}

export async function submitReview(
  userId: string, recipeId: string, rating: number, reviewText: string | null
): Promise<Review> {
  const { data, error } = await supabase
    .from('recipe_reviews')
    .insert({ user_id: userId, recipe_id: recipeId, rating, review_text: reviewText ?? null })
    .select('*, reviewer:profiles_public!recipe_reviews_user_id_fkey(name, username, avatar_url)')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    recipe_id: data.recipe_id,
    user_id: data.user_id,
    rating: data.rating,
    review_text: data.review_text ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    reviewer_name: data.reviewer?.name ?? null,
    reviewer_username: data.reviewer?.username ?? null,
    reviewer_avatar: data.reviewer?.avatar_url ?? null,
  };
}

export async function updateReview(
  reviewId: string, rating: number, reviewText: string | null
): Promise<Review> {
  const { data, error } = await supabase
    .from('recipe_reviews')
    .update({ rating, review_text: reviewText ?? null, updated_at: new Date().toISOString() })
    .eq('id', reviewId)
    .select('*, reviewer:profiles_public!recipe_reviews_user_id_fkey(name, username, avatar_url)')
    .single();
  if (error) throw error;
  return {
    id: data.id,
    recipe_id: data.recipe_id,
    user_id: data.user_id,
    rating: data.rating,
    review_text: data.review_text ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    reviewer_name: data.reviewer?.name ?? null,
    reviewer_username: data.reviewer?.username ?? null,
    reviewer_avatar: data.reviewer?.avatar_url ?? null,
  };
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase.from('recipe_reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

export async function fetchCreatorStats(recipeId: string): Promise<CreatorStats> {
  const [swipesRes, savesRes, interactionsRes, recipeRes] = await Promise.all([
    supabase
      .from('swipe_events')
      .select('direction')
      .eq('recipe_id', recipeId),
    supabase
      .from('saved_recipes')
      .select('id', { count: 'exact', head: true })
      .eq('recipe_id', recipeId),
    supabase
      .from('recipe_interactions')
      .select('interaction_type')
      .eq('recipe_id', recipeId)
      .in('interaction_type', ['cooked', 'view']),
    supabase
      .from('recipes')
      .select('avg_rating, rating_count')
      .eq('id', recipeId)
      .single(),
  ]);

  const swipes = swipesRes.data ?? [];
  const right_swipes = swipes.filter((s: any) => s.direction === 'right').length;
  const left_swipes = swipes.filter((s: any) => s.direction === 'left').length;
  const saves = savesRes.count ?? 0;
  const interactions = interactionsRes.data ?? [];
  const cooks = interactions.filter((i: any) => i.interaction_type === 'cooked').length;
  const views = interactions.filter((i: any) => i.interaction_type === 'view').length;

  return {
    right_swipes,
    left_swipes,
    saves,
    cooks,
    views,
    avg_rating: Number(recipeRes.data?.avg_rating ?? 0),
    rating_count: recipeRes.data?.rating_count ?? 0,
  };
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
  if (recipeUuid) {
    await supabase.from('recipe_interactions').insert({
      user_id: userId,
      recipe_id: recipeUuid,
      interaction_type: 'unsave',
    });
  }
}

// Returns the Supabase UUID for a Recipe loaded into in-memory state.
// In the common case the deck loaders (`fetchDiscoverRecipes`,
// `fetchScoredDeck`) already populate `supabase_id`, so this resolves
// synchronously without a DB hit. Falls back to looking up by external_id
// when the field is missing (rare — e.g. recipes hydrated from a stale
// AsyncStorage cache that pre-dates the supabase_id field).
//
// Throws on failure. Callers that want fire-and-forget logging should
// chain `.catch(() => {})` — interaction logs are non-critical.
export async function resolveSupabaseId(recipe: Recipe): Promise<string> {
  if (recipe.supabase_id) return recipe.supabase_id;
  if (!recipe.external_id) {
    throw new Error('resolveSupabaseId: recipe has neither supabase_id nor external_id');
  }
  const { data, error } = await supabase
    .from('recipes')
    .select('id')
    .eq('external_id', recipe.external_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`resolveSupabaseId: no row for external_id=${recipe.external_id}`);
  return data.id;
}

// Upserts a TheMealDB recipe into the recipes table by external_id.
// Returns the Supabase UUID for that recipe row.
// DEPRECATED — currently unreachable under recipes RLS, which only allows INSERT
// when submitted_by = auth.uid() (see supabase/add-security-hardening-202604.sql).
// Client-side upserts of curated/imported rows will be rejected. Kept for reference;
// any future use must go through a server-side endpoint with the service-role key.
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
      saved_at,
      recipes (
        id, title, description, cuisine, source_type,
        ingredients, steps, prep_time_mins, cook_time_mins,
        servings, cost_per_serving, dietary_tags, image_url,
        external_id, badge, avg_rating, save_count, macros, meal_prep_friendly
      )
    `)
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });
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
        meal_prep_friendly: r.meal_prep_friendly ?? null,
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
export function estimateMacrosLocally(
  title: string,
  ingredients: { name: string }[] = [],
): Macros {
  // Combine title + all ingredient names so keyword matching uses full recipe context
  const t = [title, ...ingredients.map((i) => i.name)].join(' ').toLowerCase();
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
  options?: { externalId?: string; supabaseId?: string }
): Promise<Macros | null> {
  // Check local AsyncStorage cache first (fastest, zero network)
  const cached = await getCachedMacros(recipeTitle);
  if (cached) return cached;

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/macros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipeTitle,
        ingredients,
        externalId: options?.externalId,
        supabaseId: options?.supabaseId,
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

  // Local estimator — zero API calls, always works, marked isEstimated: true
  const estimated = estimateMacrosLocally(recipeTitle, ingredients);
  persistMacros(recipeTitle, estimated); // cache so we don't re-estimate
  return estimated;
}

// ─── Dev Recipe Flagging ──────────────────────────────────────────────────────
// Supabase-backed; dev builds only. Stores recipes flagged for Claude review.

export interface FlaggedRecipe {
  supabase_id: string;
  external_id: string;
  title: string;
  reason: string;
  flagged_at: string;
}

export async function flagRecipe(
  recipe: { supabase_id?: string; id: string; title: string },
  reason: string
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('recipe_flags').insert({
      recipe_id: recipe.supabase_id || null,
      external_id: recipe.id,
      recipe_title: recipe.title,
      reason,
      flagged_by: user?.id ?? null,
    });
  } catch {
    // Non-critical
  }
}

export async function getFlaggedRecipes(): Promise<FlaggedRecipe[]> {
  try {
    const { data } = await supabase
      .from('recipe_flags')
      .select('*')
      .order('flagged_at', { ascending: false });
    return (data ?? []).map((r) => ({
      supabase_id: r.recipe_id ?? '',
      external_id: r.external_id ?? '',
      title: r.recipe_title,
      reason: r.reason,
      flagged_at: r.flagged_at,
    }));
  } catch {
    return [];
  }
}

export async function clearFlaggedRecipes(): Promise<void> {
  try {
    await supabase.from('recipe_flags').delete().not('id', 'is', null);
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

// ─── Recipe Notes ─────────────────────────────────────────────────────────────

export async function getRecipeNote(userId: string, recipeId: string | undefined): Promise<RecipeNote | null> {
  if (!recipeId) return null;
  const { data, error } = await supabase
    .from('recipe_notes')
    .select('*')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveRecipeNote(
  userId: string,
  recipeId: string | undefined,
  note: Pick<RecipeNote, 'note_text' | 'substitutions' | 'tags' | 'make_again'>
): Promise<void> {
  if (!recipeId) return;
  const { error } = await supabase
    .from('recipe_notes')
    .upsert(
      { user_id: userId, recipe_id: recipeId, ...note, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,recipe_id' }
    );
  if (error) throw error;
}

// ─── Community Recipe Creation ─────────────────────────────────────────────────

const INGREDIENT_NAMES_CACHE_KEY = 'mori_ingredient_names_v1';

export async function fetchIngredientNames(): Promise<string[]> {
  try {
    const cached = await AsyncStorage.getItem(INGREDIENT_NAMES_CACHE_KEY);
    if (cached) return JSON.parse(cached) as string[];
  } catch {
    // cache miss — fall through to fetch
  }
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('ingredients')
      .limit(2000);
    if (error) return [];
    const seen = new Set<string>();
    for (const row of data ?? []) {
      const ings = (row.ingredients ?? []) as { name?: string }[];
      for (const ing of ings) {
        if (ing?.name) seen.add(ing.name);
      }
    }
    const names = Array.from(seen).sort();
    AsyncStorage.setItem(INGREDIENT_NAMES_CACHE_KEY, JSON.stringify(names)).catch(() => {});
    return names;
  } catch {
    return [];
  }
}

interface CommunityRecipeInput {
  title: string;
  description: string | null;
  cuisine: string | null;
  ingredients: { name: string; quantity: string; unit: string }[];
  steps: { order: number; instruction: string; title?: string }[];
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  servings: number | null;
  dietary_tags: string[];
  submitted_by: string;
  image_url: string | null;
  is_public: boolean;
}

export async function updatePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);
  if (error) throw error;
}

export async function insertCommunityRecipe(input: CommunityRecipeInput): Promise<string> {
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      title: input.title,
      description: input.description,
      cuisine: input.cuisine,
      source_type: 'community',
      ingredients: input.ingredients,
      steps: input.steps,
      prep_time_mins: input.prep_time_mins,
      cook_time_mins: input.cook_time_mins,
      servings: input.servings,
      dietary_tags: input.dietary_tags,
      submitted_by: input.submitted_by,
      image_url: input.image_url,
      is_public: input.is_public,
      // Default to 'pending' — admin must approve via Supabase Studio (or future
      // moderation queue UI) before the recipe surfaces in Discover. The submitter
      // still sees their own recipe under Recipes → Mine (filtered by submitted_by).
      // Discover query in fetchDiscoverRecipes filters moderation_status = 'approved'.
      moderation_status: 'pending',
      badge: 'none',
      avg_rating: 0,
      save_count: 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// ─── Community recipe enrichment (post-insert, fire-and-forget) ───────────────
// Computes macros via /api/macros (which caches to DB itself) and infers
// dietary_tags client-side, persisting the tags. Caller should not await —
// failures are non-fatal.
export async function enrichCommunityRecipe(
  recipeId: string,
  payload: {
    title: string;
    ingredients: { name: string; quantity: string; unit: string }[];
    servings?: number | null;
  }
): Promise<void> {
  try {
    const dietary_tags = inferDietaryTags(payload.title, payload.ingredients);
    await supabase.from('recipes').update({ dietary_tags }).eq('id', recipeId);
  } catch {}

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    await fetch(`${getApiBaseUrl()}/api/macros`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supabaseId: recipeId,
        recipeTitle: payload.title,
        ingredients: payload.ingredients,
        servings: payload.servings ?? undefined,
      }),
    });
  } catch {}
}
