import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import * as Sentry from '@sentry/react-native';
import { useUserStore } from '@/stores/userStore';
import { registerForPushNotifications } from '@/lib/notifications';
import { updatePushToken } from '@/lib/api';
import { isResetPasswordUrl } from '@/lib/deepLink';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  // PII off by default. With it on, Sentry attaches IP, UA, and request bodies
  // (including bearer tokens, OAuth codes, taste profiles). Re-enable only
  // after a privacy review and adding redaction in beforeSend.
  sendDefaultPii: false,
  enableLogs: false,
  // Session Replay disabled — it records the rendered screen, which can include
  // the bearer token shown in dev panes, recipe titles, names, taste profile
  // contents. Re-enable only with maskAllText + maskAllImages and PII review.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  integrations: [Sentry.feedbackIntegration()],
  beforeSend(event) {
    // Strip Authorization headers from any captured request data.
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, string>;
      for (const key of Object.keys(h)) {
        if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'cookie') {
          h[key] = '[redacted]';
        }
      }
    }
    return event;
  },
});

// Fires Sentry.captureMessage('boot vX.Y.Z') exactly once per app version.
// Confirms client-side wiring is live without flooding Sentry on every cold
// start. AsyncStorage stores a single key per version so reinstalls / cache
// clears will re-emit, which is fine — it's still scoped to one event per
// install per release.
async function emitBootHeartbeatOnce() {
  try {
    const version = Constants.expoConfig?.version ?? 'unknown';
    const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? '';
    const tag = buildNumber ? `${version}+${buildNumber}` : version;
    const key = `sentry_heartbeat_${tag}`;
    const seen = await AsyncStorage.getItem(key);
    if (seen) return;
    await AsyncStorage.setItem(key, '1');
    Sentry.captureMessage(`boot ${tag}`, 'info');
  } catch {
    // Heartbeat is verification-only — never escalate failures to the user.
  }
}

function RootLayout() {
  const profile = useUserStore((s) => s.profile);
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profile?.id || registeredFor.current === profile.id) return;
    registeredFor.current = profile.id;
    registerForPushNotifications()
      .then((token) => { if (token) updatePushToken(profile.id, token).catch(() => {}); })
      .catch(() => {});
  }, [profile?.id]);

  useEffect(() => {
    emitBootHeartbeatOnce();
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  function handleDeepLink(event: { url: string }) {
    if (!isResetPasswordUrl(event.url)) return;
    router.push({
      pathname: '/reset-password',
      params: { token: event.url },
    });
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="privacy-policy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
