import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Profile, Recipe, SwipeEvent, SavedRecipe, PantryItem, GroceryList, MealPlan, OnboardingState, Macros } from '@/types';

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
  if (error) throw error;
  return data;
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

export async function unsaveRecipe(userId: string, recipeExternalId: string): Promise<void> {
  const { data: recipeData } = await supabase
    .from('recipes')
    .select('id')
    .eq('external_id', recipeExternalId)
    .single();
  if (!recipeData) return;
  const { error } = await supabase
    .from('saved_recipes')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeData.id);
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
        external_id, badge, avg_rating, save_count
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
  options?: { spoonacularId?: string; externalId?: string }
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
          spoonacularId: options?.spoonacularId,
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
