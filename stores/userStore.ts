import { create } from 'zustand';
import type { Profile, OnboardingState, EatingStyle, SkillLevel, CookingFrequency } from '@/types';

interface UserStore {
  profile: Profile | null;
  sessionNumber: number;   // incremented each app open, used for swipe event logging
  // True once the initial getSession() restore has finished (with or without a
  // logged-in user). Cold-start deep links that depend on the session (recipe
  // modal Save/Review/Cart) wait for this before routing.
  authResolved: boolean;
  onboarding: OnboardingState;
  isLoading: boolean;
  error: string | null;
  profileSheetOpen: boolean;

  setProfile: (profile: Profile | null) => void;
  setSessionNumber: (n: number) => void;
  setAuthResolved: (resolved: boolean) => void;
  setOnboardingField: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
  resetOnboarding: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProfileSheetOpen: (open: boolean) => void;
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
  pantry_staples: [],
};

export const useUserStore = create<UserStore>((set) => ({
  profile: null,
  sessionNumber: 0,
  authResolved: false,
  onboarding: defaultOnboarding,
  isLoading: false,
  error: null,
  profileSheetOpen: false,

  setProfile: (profile) => set({ profile }),
  setSessionNumber: (sessionNumber) => set({ sessionNumber }),
  setAuthResolved: (authResolved) => set({ authResolved }),

  setOnboardingField: (key, value) =>
    set((state) => ({
      onboarding: { ...state.onboarding, [key]: value },
    })),

  resetOnboarding: () => set({ onboarding: defaultOnboarding }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setProfileSheetOpen: (profileSheetOpen) => set({ profileSheetOpen }),
}));
