import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserLeftover } from '@/types';
import {
  getLeftovers, addLeftovers as apiAddLeftovers,
  dismissLeftover as apiDismissLeftover,
  extendLeftover as apiExtendLeftover,
} from '@/lib/api';
import { clearDiscoverCache } from '@/lib/api';

interface LeftoversStore {
  leftovers: UserLeftover[];
  loading: boolean;
  error: string | null;
  loadLeftovers: (userId: string) => Promise<void>;
  addLeftovers: (userId: string, items: { name: string; spoilsAt: string; ingredientId?: string | null }[]) => Promise<void>;
  dismissLeftover: (id: string) => void;
  extendLeftover: (id: string, extraDays: number) => void;
  reset: () => void;
}

export const useLeftoversStore = create<LeftoversStore>()(
  persist(
    (set, get) => ({
      leftovers: [],
      loading: false,
      error: null,

      loadLeftovers: async (userId) => {
        set({ loading: true, error: null });
        try {
          const rows = await getLeftovers(userId);
          set({ leftovers: rows, loading: false });
        } catch {
          set({ loading: false, error: 'Failed to load leftovers' });
        }
      },

      addLeftovers: async (userId, items) => {
        if (!items.length) return;
        const now = new Date().toISOString();
        const optimistic: UserLeftover[] = items.map((item, i) => ({
          id: `optimistic-${Date.now()}-${i}`,
          user_id: userId,
          ingredient_id: item.ingredientId ?? null,
          ingredient_name: item.name,
          added_at: now,
          storage_method: 'fridge',
          spoils_at: item.spoilsAt,
          dismissed_at: null,
          extended_count: 0,
        }));
        set((s) => ({ leftovers: [...s.leftovers, ...optimistic] }));
        clearDiscoverCache();
        try {
          const saved = await apiAddLeftovers(userId, items);
          // Replace optimistic rows with real rows from DB
          set((s) => ({
            leftovers: [
              ...s.leftovers.filter((l) => !l.id.startsWith('optimistic-')),
              ...saved,
            ],
          }));
        } catch {
          // Roll back optimistic rows on failure
          set((s) => ({
            leftovers: s.leftovers.filter((l) => !l.id.startsWith('optimistic-')),
          }));
        }
      },

      dismissLeftover: (id) => {
        const now = new Date().toISOString();
        set((s) => ({
          leftovers: s.leftovers.map((l) =>
            l.id === id ? { ...l, dismissed_at: now } : l
          ),
        }));
        clearDiscoverCache();
        apiDismissLeftover(id).catch(() => {});
      },

      reset: () => set({ leftovers: [], loading: false, error: null }),

      extendLeftover: (id, extraDays) => {
        set((s) => ({
          leftovers: s.leftovers.map((l) => {
            if (l.id !== id) return l;
            const newSpoil = new Date(new Date(l.spoils_at).getTime() + extraDays * 86_400_000);
            return { ...l, spoils_at: newSpoil.toISOString(), extended_count: l.extended_count + 1 };
          }),
        }));
        clearDiscoverCache();
        const updated = get().leftovers.find((l) => l.id === id);
        if (updated) apiExtendLeftover(id, updated.spoils_at, updated.extended_count).catch(() => {});
      },
    }),
    {
      name: 'mori-leftovers-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ leftovers: s.leftovers }),
    }
  )
);
