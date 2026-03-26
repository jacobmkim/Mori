import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DiscoverMode = 'spontaneous' | 'meal_prep';
export type AppearanceMode = 'light' | 'dark' | 'system';

const MODE_KEY       = 'mise_discover_mode_v1';
const APPEARANCE_KEY = 'mise_appearance_mode_v1';

interface DiscoverStore {
  mode: DiscoverMode;
  appearanceMode: AppearanceMode;
  setMode: (mode: DiscoverMode) => Promise<void>;
  setAppearanceMode: (mode: AppearanceMode) => Promise<void>;
  loadMode: () => Promise<void>;
}

export const useDiscoverStore = create<DiscoverStore>((set) => ({
  mode: 'spontaneous',
  appearanceMode: 'system',

  setMode: async (mode) => {
    set({ mode });
    await AsyncStorage.setItem(MODE_KEY, mode);
  },

  setAppearanceMode: async (appearanceMode) => {
    set({ appearanceMode });
    await AsyncStorage.setItem(APPEARANCE_KEY, appearanceMode);
  },

  loadMode: async () => {
    const [storedMode, storedAppearance] = await Promise.all([
      AsyncStorage.getItem(MODE_KEY),
      AsyncStorage.getItem(APPEARANCE_KEY),
    ]);
    if (storedMode === 'spontaneous' || storedMode === 'meal_prep') {
      set({ mode: storedMode });
    }
    if (storedAppearance === 'light' || storedAppearance === 'dark' || storedAppearance === 'system') {
      set({ appearanceMode: storedAppearance });
    }
  },
}));
