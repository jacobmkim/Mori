import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getProfile, incrementSessionCount } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { useTheme } from '@/hooks/useTheme';

export default function Index() {
  const colors = useTheme();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const { setProfile, setSessionNumber } = useUserStore();
  const loadSavedRecipes = useSavedStore((s) => s.loadSavedRecipes);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const userId = data.session.user.id;
        try {
          const profile = await getProfile(userId);
          // Profile should always exist (auto-created by auth trigger)
          // but handle gracefully if it doesn't — app works in degraded mode
          if (profile) setProfile(profile);
        } catch {
          // Profile fetch failed — app will work in degraded mode
        }
        // Restore saved recipes from Supabase — awaited so the deck fetch in
        // discover.tsx always has a populated savedExternalIds set and never
        // shows already-saved recipes in the swipe deck on relaunch.
        await loadSavedRecipes(userId);
        // Increment session count — used for swipe event logging (non-blocking)
        incrementSessionCount(userId)
          .then(setSessionNumber)
          .catch(() => {}); // non-critical
        setHasSession(true);
      }
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (hasSession) {
    return <Redirect href="/(tabs)/discover" />;
  }

  return <Redirect href="/onboarding/welcome" />;
}
