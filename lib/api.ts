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
