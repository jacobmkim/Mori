import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getProfile } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const { setProfile } = useUserStore();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        try {
          const profile = await getProfile(data.session.user.id);
          setProfile(profile);
        } catch {
          // Profile may not exist yet (e.g. mid-onboarding) — that's fine
        }
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
