import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe } from '@/types';
import {
  upsertRecipeByExternalId,
  saveRecipe,
  unsaveRecipe as apiUnsaveRecipe,
  getSavedRecipesWithDetails,
} from '@/lib/api';

interface SavedStore {
  savedRecipes: Recipe[];
  mealPrepIds: string[];       // IDs of recipes saved while in meal_prep mode
  _removedPositions: Record<string, number>;
  addRecipe: (recipe: Recipe, userId?: string) => void;
  removeRecipe: (recipe: Recipe, userId?: string) => void;
  isSaved: (id: string) => boolean;
  loadSavedRecipes: (userId: string) => Promise<void>;
  addMealPrepId: (id: string) => void;
}

export const useSavedStore = create<SavedStore>()(
  persist(
    (set, get) => ({
      savedRecipes: [],
      mealPrepIds: [],
      _removedPositions: {},

      addRecipe: (recipe, userId) => {
        // Optimistic local update — restore to original position if recently removed
        set((state) => {
          if (state.savedRecipes.some((r) => r.id === recipe.id)) return state;
          const pos = state._removedPositions[recipe.id];
          const newList = pos !== undefined
            ? [...state.savedRecipes.slice(0, pos), recipe, ...state.savedRecipes.slice(pos)]
            : [recipe, ...state.savedRecipes];
          const newPositions = { ...state._removedPositions };
          delete newPositions[recipe.id];
          return { savedRecipes: newList, _removedPositions: newPositions };
        });
        // Persist to Supabase in the background; trust optimistic update — reloading
        // here would race with in-flight removeRecipe calls and cause duplicates/lost saves
        if (userId) {
          upsertRecipeByExternalId(recipe)
            .then((supabaseId) => saveRecipe(userId, supabaseId))
            .catch(console.error);
        }
      },

      removeRecipe: (recipe, userId) => {
        set((state) => {
          const pos = state.savedRecipes.findIndex((r) => r.id === recipe.id);
          return {
            savedRecipes: state.savedRecipes.filter((r) => r.id !== recipe.id),
            mealPrepIds: state.mealPrepIds.filter((id) => id !== recipe.id),
            _removedPositions: pos !== -1
              ? { ...state._removedPositions, [recipe.id]: pos }
              : state._removedPositions,
          };
        });
        if (userId) {
          apiUnsaveRecipe(userId, recipe.id, recipe.supabase_id).catch(console.error);
        }
      },

      isSaved: (id) => get().savedRecipes.some((r) => r.id === id),

      loadSavedRecipes: async (userId) => {
        try {
          const recipes = await getSavedRecipesWithDetails(userId);
          const positions = get()._removedPositions;
          if (Object.keys(positions).length > 0) {
            // Re-apply tracked positions so re-saved recipes land back in their original slot
            const result = [...recipes];
            for (const [id, pos] of Object.entries(positions)) {
              const idx = result.findIndex((r) => r.id === id);
              if (idx !== -1) {
                const [r] = result.splice(idx, 1);
                result.splice(Math.min(pos, result.length), 0, r);
              }
            }
            set({ savedRecipes: result, _removedPositions: {} });
          } else {
            set({ savedRecipes: recipes });
          }
        } catch (err) {
          console.error('Failed to load saved recipes:', err);
        }
      },

      addMealPrepId: (id) => set((s) => ({
        mealPrepIds: s.mealPrepIds.includes(id) ? s.mealPrepIds : [...s.mealPrepIds, id],
      })),
    }),
    {
      name: 'mori-saved-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mealPrepIds: state.mealPrepIds }),
    }
  )
);
