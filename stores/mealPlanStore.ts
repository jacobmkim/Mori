import { create } from 'zustand';
import type { MealPlan, MealSlot, MealType } from '@/types';

interface MealPlanStore {
  plan: MealPlan | null;
  isLoading: boolean;
  error: string | null;

  setPlan: (plan: MealPlan | null) => void;
  addSlot: (slot: MealSlot) => void;
  removeSlot: (day: number, mealType: MealType) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useMealPlanStore = create<MealPlanStore>((set) => ({
  plan: null,
  isLoading: false,
  error: null,

  setPlan: (plan) => set({ plan }),

  addSlot: (slot) =>
    set((state) => {
      if (!state.plan) return state;
      const slots = state.plan.slots.filter(
        (s) => !(s.day === slot.day && s.meal_type === slot.meal_type)
      );
      return { plan: { ...state.plan, slots: [...slots, slot] } };
    }),

  removeSlot: (day, mealType) =>
    set((state) => {
      if (!state.plan) return state;
      return {
        plan: {
          ...state.plan,
          slots: state.plan.slots.filter(
            (s) => !(s.day === day && s.meal_type === mealType)
          ),
        },
      };
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
