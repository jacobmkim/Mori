import { create } from 'zustand';
import { getMealPlanForWeek, saveMealPlan as saveMealPlanApi } from '@/lib/api';
import type { MealPlan, MealSlot, MealType } from '@/types';

const EMPTY_PLAN: MealPlan = {
  id: '', user_id: '', week_start_date: '', is_public: false, slots: [], created_at: '',
};

interface MealPlanStore {
  plan: MealPlan | null;
  isLoading: boolean;
  error: string | null;

  setPlan: (plan: MealPlan | null) => void;
  addSlot: (slot: MealSlot) => void;
  removeSlot: (day: number, mealType: MealType) => void;
  clearSlots: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadPlan: (userId: string, weekStart: string) => Promise<void>;
  savePlan: (userId: string, weekStart: string) => Promise<void>;
}

export const useMealPlanStore = create<MealPlanStore>((set, get) => ({
  plan: null,
  isLoading: false,
  error: null,

  setPlan: (plan) => set({ plan }),

  addSlot: (slot) =>
    set((state) => {
      const base = state.plan ?? EMPTY_PLAN;
      const slots = base.slots.filter(
        (s) => !(s.day === slot.day && s.meal_type === slot.meal_type)
      );
      return { plan: { ...base, slots: [...slots, slot] } };
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

  clearSlots: () =>
    set((state) => state.plan ? { plan: { ...state.plan, slots: [] } } : state),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  loadPlan: async (userId: string, weekStart: string) => {
    set({ isLoading: true, error: null });
    try {
      const plan = await getMealPlanForWeek(userId, weekStart);
      set({ plan, isLoading: false });
    } catch {
      set({ error: 'Failed to load meal plan', isLoading: false });
    }
  },

  savePlan: async (userId: string, weekStart: string) => {
    const { plan } = get();
    try {
      const saved = await saveMealPlanApi(userId, weekStart, plan?.slots ?? [], plan?.id);
      set({ plan: saved, error: null });
    } catch {
      set({ error: 'Failed to save meal plan' });
    }
  },
}));
