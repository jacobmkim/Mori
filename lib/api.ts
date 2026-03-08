import { supabase } from './supabase';
import type { Profile, Recipe, SwipeEvent, SavedRecipe, PantryItem, GroceryList, MealPlan } from '@/types';

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
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
    .upsert({ user_id: userId, recipe_id: recipeId });
  if (error) throw error;
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
      { onConflict: 'external_id' }
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
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
