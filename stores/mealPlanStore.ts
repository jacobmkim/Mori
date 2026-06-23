import { create } from 'zustand';
import { getMealPlanForWeek, saveMealPlan as saveMealPlanApi } from '@/lib/api';
import type { MealPlan, MealSlot, MealType } from '@/types';

const EMPTY_PLAN: MealPlan = {
  id: '', user_id: '', week_start_date: '', is_public: false, slots: [], created_at: '',
};

// Monotonic token so an out-of-order savePlan resolution (rapid swap/tune fires several
// upserts at once) can't reinstate a stale plan over a newer one in the store.
let saveSeq = 0;

interface MealPlanStore {
  plan: MealPlan | null;
  isLoading: boolean;
  error: string | null;

  setPlan: (plan: MealPlan | null) => void;
  addSlot: (slot: MealSlot) => void;
  removeSlot: (day: number, mealType: MealType) => void;
  setSlotCooked: (day: number, mealType: MealType, cookedAt: string | null) => void;
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

  setSlotCooked: (day, mealType, cookedAt) =>
    set((state) => {
      if (!state.plan) return state;
      return {
        plan: {
          ...state.plan,
          slots: state.plan.slots.map((s) =>
            s.day === day && s.meal_type === mealType ? { ...s, cooked_at: cookedAt } : s
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
    const mySeq = ++saveSeq;
    try {
      const saved = await saveMealPlanApi(userId, weekStart, plan?.slots ?? [], plan?.id);
      // Only the latest save updates the store — a superseded (older) save resolving late
      // must not overwrite the newer plan already in memory. The DB upsert is idempotent on
      // (user_id, week_start_date), so dropping the stale set() is safe.
      if (mySeq === saveSeq) set({ plan: saved, error: null });
    } catch {
      if (mySeq === saveSeq) set({ error: 'Failed to save meal plan' });
    }
  },
}));
