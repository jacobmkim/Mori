import { View, Text, Pressable, ActivityIndicator, Alert, Linking as RNLinking } from 'react-native';
import { router, useGlobalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { extractVerifyToken } from '@/lib/deepLink';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { supabase } from '@/lib/supabase';
import { getProfile } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';

type State = 'loading' | 'success' | 'expired' | 'invalid' | 'error';

export default function VerifyEmail() {
  const colors = useTheme();
  const params = useGlobalSearchParams();
  const setProfile = useUserStore((s) => s.setProfile);
  const profile = useUserStore((s) => s.profile);
  const [state, setState] = useState<State>('loading');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    async function verify() {
      try {
        // Token comes from either the deep-link dispatch (params.url contains
        // the full mori://verify-email?token=… URL) or, on cold start, the
        // initial URL captured by the OS.
        const initialUrl = await RNLinking.getInitialURL();
        const candidate =
          (typeof params.url === 'string' && params.url) ||
          initialUrl ||
          (typeof params.token === 'string' ? params.token : null);

        const token = candidate ? extractVerifyToken(candidate) : null;
        if (!token) {
          setState('invalid');
          return;
        }

        const res = await fetch(
          `${getApiBaseUrl()}/api/send-welcome-email?token=${encodeURIComponent(token)}`,
          { method: 'GET' }
        );

        if (res.ok) {
          setState('success');
          // Refresh local profile so the banner disappears.
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            try {
              const fresh = await getProfile(session.user.id);
              if (fresh) setProfile(fresh);
            } catch {
              // Profile refresh is non-fatal — banner will catch up on next foreground.
            }
          }
          return;
        }
        if (res.status === 410) {
          setState('expired');
          return;
        }
        setState('invalid');
      } catch {
        setState('error');
      }
    }
    verify();
  }, []);

  async function resend() {
    setResending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // User isn't signed in (e.g. tapped link from another device). Punt
        // them to sign-in; once authed they can resend from the banner.
        router.replace('/onboarding/account?signin=1');
        return;
      }
      const res = await fetch(`${getApiBaseUrl()}/api/send-welcome-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        Alert.alert('Sent', 'Check your inbox for a new verification link.');
      } else if (res.status === 429) {
        Alert.alert('Too many requests', 'Wait a bit before requesting another link.');
      } else {
        Alert.alert('Error', "Couldn't resend. Try again in a moment.");
      }
    } catch {
      Alert.alert('Error', 'Network error. Try again in a moment.');
    } finally {
      setResending(false);
    }
  }

  function continueToApp() {
    if (profile?.id) {
      router.replace('/(tabs)/discover');
    } else {
      router.replace('/onboarding/account?signin=1');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 40, height: 40, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
        {state === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 16, color: colors.textMuted, textAlign: 'center' }}>
              Verifying your email…
            </Text>
          </>
        )}

        {state === 'success' && (
          <>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.card,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              Email verified
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              Thanks — your account is all set.
            </Text>
          </>
        )}

        {state === 'expired' && (
          <>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.card,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="time-outline" size={48} color={colors.textMuted} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              Link expired
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              Verification links last 24 hours. Tap below to send a new one.
            </Text>
          </>
        )}

        {(state === 'invalid' || state === 'error') && (
          <>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.card,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="alert-circle" size={48} color={colors.error} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              Couldn't verify
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              This link looks invalid or has already been used.
            </Text>
          </>
        )}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40, gap: 12 }}>
        {state === 'success' && (
          <Pressable
            onPress={continueToApp}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
              Continue
            </Text>
          </Pressable>
        )}

        {(state === 'expired' || state === 'invalid' || state === 'error') && (
          <Pressable
            onPress={resend}
            disabled={resending}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
              opacity: resending ? 0.6 : 1,
            }}
          >
            {resending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
                Send new link
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
