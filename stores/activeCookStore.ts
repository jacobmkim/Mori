import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Persisted across app launches so a user who backgrounds Mori mid-cook can
// land back on the same recipe + step on next foreground / cold launch.
// 4 h staleness window — anything older is auto-cleared on resume.
export const ACTIVE_COOK_STALE_MS = 4 * 60 * 60 * 1000;

interface ActiveCookState {
  recipeId: string | null;
  stepIndex: number;
  ratio: number;
  startedAt: number;
  lastTickAt: number;

  startCook: (recipeId: string, ratio: number) => void;
  setStep: (stepIndex: number) => void;
  endCook: () => void;
  reset: () => void;
}

const initial = {
  recipeId: null,
  stepIndex: 0,
  ratio: 1,
  startedAt: 0,
  lastTickAt: 0,
};

export const useActiveCookStore = create<ActiveCookState>()(
  persist(
    (set) => ({
      ...initial,

      startCook: (recipeId, ratio) => {
        const now = Date.now();
        set({ recipeId, stepIndex: 0, ratio, startedAt: now, lastTickAt: now });
      },

      setStep: (stepIndex) => set({ stepIndex, lastTickAt: Date.now() }),

      endCook: () => set({ ...initial }),

      reset: () => set({ ...initial }),
    }),
    {
      name: 'mori-active-cook-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        recipeId: s.recipeId,
        stepIndex: s.stepIndex,
        ratio: s.ratio,
        startedAt: s.startedAt,
        lastTickAt: s.lastTickAt,
      }),
    }
  )
);

export function isActiveCookStale(lastTickAt: number, now: number = Date.now()): boolean {
  if (!lastTickAt) return true;
  return now - lastTickAt > ACTIVE_COOK_STALE_MS;
}
