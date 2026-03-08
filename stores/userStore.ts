import { create } from 'zustand';
import type { Profile, OnboardingState, EatingStyle, SkillLevel, CookingFrequency } from '@/types';

interface UserStore {
  profile: Profile | null;
  onboarding: OnboardingState;
  isLoading: boolean;
  error: string | null;

  setProfile: (profile: Profile | null) => void;
  setOnboardingField: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
  resetOnboarding: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const defaultOnboarding: OnboardingState = {
  dietary_goals: [],
  dietary_extra_preferences: null,
  ingredient_dislikes: [],
  cuisine_preferences: [],
  eating_style: null,
  cooking_frequency: null,
  skill_level: null,
  weekly_budget: null,
};

export const useUserStore = create<UserStore>((set) => ({
  profile: null,
  onboarding: defaultOnboarding,
  isLoading: false,
  error: null,

  setProfile: (profile) => set({ profile }),

  setOnboardingField: (key, value) =>
    set((state) => ({
      onboarding: { ...state.onboarding, [key]: value },
    })),

  resetOnboarding: () => set({ onboarding: defaultOnboarding }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
