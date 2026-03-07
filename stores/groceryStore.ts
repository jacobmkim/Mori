import { create } from 'zustand';
import type { GroceryList, GroceryItem, Recipe } from '@/types';

interface GroceryStore {
  list: GroceryList | null;
  isLoading: boolean;
  error: string | null;

  setList: (list: GroceryList | null) => void;
  addRecipeIngredients: (recipe: Recipe) => void;
  toggleItem: (ingredientName: string) => void;
  clearChecked: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useGroceryStore = create<GroceryStore>((set) => ({
  list: null,
  isLoading: false,
  error: null,

  setList: (list) => set({ list }),

  addRecipeIngredients: (recipe) =>
    set((state) => {
      const existingItems: GroceryItem[] = state.list?.items ?? [];
      const newItems = [...existingItems];

      for (const ingredient of recipe.ingredients) {
        const existing = newItems.find(
          (i) => i.ingredient_name.toLowerCase() === ingredient.name.toLowerCase()
        );
        if (existing) {
          if (!existing.recipe_ids.includes(recipe.id)) {
            existing.recipe_ids.push(recipe.id);
          }
        } else {
          newItems.push({
            ingredient_name: ingredient.name,
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
              estimated_total_cost: null,
              delivery_partner: null,
              created_at: new Date().toISOString(),
            },
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

  clearChecked: () =>
    set((state) => {
      if (!state.list) return state;
      return {
        list: {
          ...state.list,
          items: state.list.items.filter((i) => !i.checked),
        },
      };
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
