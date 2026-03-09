import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getProfile } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { colors } from '@/constants/theme';

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const { setProfile } = useUserStore();
  const loadSavedRecipes = useSavedStore((s) => s.loadSavedRecipes);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const userId = data.session.user.id;
        try {
          const profile = await getProfile(userId);
          setProfile(profile);
        } catch {
          // Profile may not exist yet (e.g. mid-onboarding) — that's fine
        }
        // Restore saved recipes from Supabase so they persist across sessions
        loadSavedRecipes(userId);
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
