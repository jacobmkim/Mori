import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroceryList, GroceryItem, Recipe } from '@/types';
import { normalizeIngredientName } from '@/lib/ingredientAliases';

interface GroceryStore {
  list: GroceryList | null;
  selectedRecipes: Recipe[];
  isLoading: boolean;
  error: string | null;

  // Add a recipe using ingredients with measures (from TheMealDB detail)
  addFromDetail: (recipe: Recipe, ingredients: { name: string; measure: string }[]) => void;
  // Add a recipe with full Ingredient objects (future: Supabase recipes)
  addRecipeIngredients: (recipe: Recipe) => void;
  // Add a single custom item typed by the user (not tied to any recipe)
  addCustomItem: (name: string, quantity?: string) => void;
  removeRecipeFromList: (recipeId: string) => void;
  toggleItem: (ingredientName: string) => void;
  deleteItem: (ingredientName: string) => GroceryItem | null; // returns deleted item for undo
  clearChecked: () => GroceryItem[];   // returns the removed items so caller can undo
  restoreItems: (items: GroceryItem[]) => void;
  clearAll: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useGroceryStore = create<GroceryStore>()(
  persist(
    (set, get) => ({
  list: null,
  selectedRecipes: [],
  isLoading: false,
  error: null,

  addFromDetail: (recipe, ingredients) =>
    set((state) => {
      if (state.selectedRecipes.some((r) => r.id === recipe.id)) return state;

      const existingItems: GroceryItem[] = state.list?.items ?? [];
      const newItems = [...existingItems];

      for (const { name, measure } of ingredients) {
        const trimmed = normalizeIngredientName(name);
        if (!trimmed) continue;
        const existing = newItems.find(
          (i) => i.ingredient_name.toLowerCase() === trimmed
        );
        if (existing) {
          if (!existing.recipe_ids.includes(recipe.id)) {
            existing.recipe_ids.push(recipe.id);
            const newQty = measure.trim();
            if (newQty && existing.quantity) {
              existing.quantity = `${existing.quantity} + ${newQty}`;
            } else if (newQty) {
              existing.quantity = newQty;
            }
          }
        } else {
          newItems.push({
            ingredient_name: trimmed,
            quantity: measure.trim(),
            unit: '',
            checked: false,
            recipe_ids: [recipe.id],
          });
        }
      }

      const newList: GroceryList = state.list
        ? { ...state.list, items: newItems }
        : {
            id: '',
            user_id: '',
            list_type: 'spontaneous',
            status: 'active',
            items: newItems,
            recipe_ids: [recipe.id],
            estimated_total_cost: null,
            combined_macros: null,
            instacart_cart_url: null,
            created_at: new Date().toISOString(),
          };

      return { list: newList, selectedRecipes: [...state.selectedRecipes, recipe] };
    }),

  addCustomItem: (name, quantity = '') =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return state;
      const existingItems: GroceryItem[] = state.list?.items ?? [];
      // Don't duplicate
      if (existingItems.some((i) => i.ingredient_name.toLowerCase() === trimmed.toLowerCase())) {
        return state;
      }
      const newItem: GroceryItem = {
        ingredient_name: trimmed,
        quantity: quantity.trim(),
        unit: '',
        checked: false,
        recipe_ids: [],
      };
      const newList: GroceryList = state.list
        ? { ...state.list, items: [...existingItems, newItem] }
        : {
            id: '',
            user_id: '',
            list_type: 'spontaneous',
            status: 'active',
            items: [newItem],
            recipe_ids: [],
            estimated_total_cost: null,
            combined_macros: null,
            instacart_cart_url: null,
            created_at: new Date().toISOString(),
          };
      return { list: newList };
    }),

  addRecipeIngredients: (recipe) =>
    set((state) => {
      if (state.selectedRecipes.some((r) => r.id === recipe.id)) return state;

      const existingItems: GroceryItem[] = state.list?.items ?? [];
      const newItems = [...existingItems];

      for (const ingredient of recipe.ingredients) {
        const normalizedName = normalizeIngredientName(ingredient.name);
        const existing = newItems.find(
          (i) => i.ingredient_name.toLowerCase() === normalizedName
        );
        if (existing) {
          if (!existing.recipe_ids.includes(recipe.id)) {
            existing.recipe_ids.push(recipe.id);
            const newQty = ingredient.quantity;
            if (newQty && existing.quantity) {
              existing.quantity = `${existing.quantity} + ${newQty}`;
            } else if (newQty) {
              existing.quantity = newQty;
            }
          }
        } else {
          newItems.push({
            ingredient_name: normalizedName,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            checked: false,
            recipe_ids: [recipe.id],
          });
        }
      }

      return {
        list: state.list
          ? { ...state.list, items: newItems }
          : {
              id: '',
              user_id: '',
              list_type: 'spontaneous',
              status: 'active',
              items: newItems,
              recipe_ids: [recipe.id],
              estimated_total_cost: null,
              combined_macros: null,
              instacart_cart_url: null,
              created_at: new Date().toISOString(),
            },
        selectedRecipes: [...state.selectedRecipes, recipe],
      };
    }),

  removeRecipeFromList: (recipeId) =>
    set((state) => {
      // No-op short-circuit so unconditional callers (e.g. onMarkCooked) don't
      // trigger spurious re-renders when the recipe isn't on the list.
      const inSelected = state.selectedRecipes.some((r) => r.id === recipeId);
      const inItems = (state.list?.items ?? []).some((item) =>
        item.recipe_ids.includes(recipeId),
      );
      if (!inSelected && !inItems) return state;

      // Prune only items that BELONGED to a recipe and now belong to none. Custom
      // items (typed by the user or added as a pantry-match shopping gap) start with
      // recipe_ids: [] — filtering on emptiness alone silently wiped every one of
      // them whenever ANY recipe was removed or cooked (2026-07-04 audit, critical).
      const newItems = (state.list?.items ?? [])
        .map((item) => ({
          ...item,
          recipe_ids: item.recipe_ids.filter((id) => id !== recipeId),
        }))
        .filter((item, i) => item.recipe_ids.length > 0 || (state.list?.items ?? [])[i].recipe_ids.length === 0);

      return {
        selectedRecipes: state.selectedRecipes.filter((r) => r.id !== recipeId),
        list: state.list ? { ...state.list, items: newItems } : null,
      };
    }),

  toggleItem: (ingredientName) =>
    set((state) => {
      if (!state.list) return state;
      return {
        list: {
          ...state.list,
          items: state.list.items.map((i) =>
            i.ingredient_name === ingredientName ? { ...i, checked: !i.checked } : i
          ),
        },
      };
    }),

  deleteItem: (ingredientName) => {
    const item = get().list?.items.find((i) => i.ingredient_name === ingredientName) ?? null;
    set((state) => {
      if (!state.list) return state;
      const newItems = state.list.items.filter((i) => i.ingredient_name !== ingredientName);
      // Drop any selectedRecipe whose items were all manually deleted
      const remainingRecipeIds = new Set(newItems.flatMap((i) => i.recipe_ids));
      return {
        list: { ...state.list, items: newItems },
        selectedRecipes: state.selectedRecipes.filter((r) => remainingRecipeIds.has(r.id)),
      };
    });
    return item;
  },

  // Returns the removed items so the caller can offer an undo
  clearChecked: () => {
    const state = get();
    const removed = state.list?.items.filter((i) => i.checked) ?? [];
    set((s) => ({
      list: s.list ? { ...s.list, items: s.list.items.filter((i) => !i.checked) } : null,
    }));
    return removed;
  },

  restoreItems: (items) =>
    set((state) => {
      if (!state.list || items.length === 0) return state;
      // Restore items with their original checked state (true — they were in Done)
      const existing = state.list.items.map((i) => i.ingredient_name.toLowerCase());
      const toAdd = items.filter((i) => !existing.includes(i.ingredient_name.toLowerCase()));
      return {
        list: { ...state.list, items: [...state.list.items, ...toAdd] },
      };
    }),

  clearAll: () => set({ list: null, selectedRecipes: [] }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
    }),
    {
      name: 'mori-grocery-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ list: state.list, selectedRecipes: state.selectedRecipes }),
    }
  )
);
