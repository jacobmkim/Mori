import { create } from 'zustand';
import type { Recipe } from '@/types';
import {
  upsertRecipeByExternalId,
  saveRecipe,
  unsaveRecipe as apiUnsaveRecipe,
  getSavedRecipesWithDetails,
} from '@/lib/api';

interface SavedStore {
  savedRecipes: Recipe[];
  addRecipe: (recipe: Recipe, userId?: string) => void;
  removeRecipe: (id: string, userId?: string) => void;
  isSaved: (id: string) => boolean;
  loadSavedRecipes: (userId: string) => Promise<void>;
}

export const useSavedStore = create<SavedStore>((set, get) => ({
  savedRecipes: [],

  addRecipe: (recipe, userId) => {
    // Optimistic local update
    set((state) => ({
      savedRecipes: state.savedRecipes.some((r) => r.id === recipe.id)
        ? state.savedRecipes
        : [...state.savedRecipes, recipe],
    }));
    // Persist to Supabase in the background
    if (userId) {
      upsertRecipeByExternalId(recipe)
        .then((supabaseId) => saveRecipe(userId, supabaseId))
        .catch(console.error);
    }
  },

  removeRecipe: (id, userId) => {
    set((state) => ({
      savedRecipes: state.savedRecipes.filter((r) => r.id !== id),
    }));
    if (userId) {
      apiUnsaveRecipe(userId, id).catch(console.error);
    }
  },

  isSaved: (id) => get().savedRecipes.some((r) => r.id === id),

  loadSavedRecipes: async (userId) => {
    try {
      const recipes = await getSavedRecipesWithDetails(userId);
      set({ savedRecipes: recipes });
    } catch (err) {
      console.error('Failed to load saved recipes:', err);
    }
  },
}));
