import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DiscoverMode = 'spontaneous' | 'meal_prep';

const MODE_KEY = 'mise_discover_mode_v1';

interface DiscoverStore {
  mode: DiscoverMode;
  setMode: (mode: DiscoverMode) => Promise<void>;
  loadMode: () => Promise<void>;
}

export const useDiscoverStore = create<DiscoverStore>((set) => ({
  mode: 'spontaneous',

  setMode: async (mode) => {
    set({ mode });
    await AsyncStorage.setItem(MODE_KEY, mode);
  },

  loadMode: async () => {
    const stored = await AsyncStorage.getItem(MODE_KEY);
    if (stored === 'spontaneous' || stored === 'meal_prep') {
      set({ mode: stored });
    }
  },
}));
