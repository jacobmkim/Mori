import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Linking } from 'react-native';
import { router } from 'expo-router';

import * as Sentry from '@sentry/react-native';
import { useUserStore } from '@/stores/userStore';
import { registerForPushNotifications } from '@/lib/notifications';
import { updatePushToken } from '@/lib/api';
import { isResetPasswordUrl } from '@/lib/deepLink';

Sentry.init({
  dsn: 'https://59eecaa7b60a4f0a210f8c92fa782c67@o4511275352326144.ingest.us.sentry.io/4511275354423296',
  enabled: !__DEV__,
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
