import { create } from 'zustand';
import type { PantryItem } from '@/types';

interface PantryStore {
  items: PantryItem[];
  isLoading: boolean;
  error: string | null;

  setItems: (items: PantryItem[]) => void;
  addItem: (item: PantryItem) => void;
  removeItem: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePantryStore = create<PantryStore>((set) => ({
  items: [],
  isLoading: false,
  error: null,

  setItems: (items) => set({ items }),

  addItem: (item) => set((state) => ({ items: [...state.items, item] })),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
