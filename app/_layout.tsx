import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, Linking } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { useUserStore } from '@/stores/userStore';
import { registerForPushNotifications } from '@/lib/notifications';
import { updatePushToken, touchLastActive } from '@/lib/api';
import { isResetPasswordUrl, isVerifyEmailUrl, isRecipeUrl, extractRecipeId } from '@/lib/deepLink';
import { initRevenueCat } from '@/lib/revenueCat';
import { ResumeCookHandler } from '@/components/ResumeCookHandler';

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

// Tags every Sentry event with the build identifier and drops a breadcrumb
// on cold start. No standalone issue is created — boot info is only surfaced
// when attached to a real error event.
async function emitBootHeartbeatOnce() {
  try {
    const version = Constants.expoConfig?.version ?? 'unknown';
    const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? '';
    const tag = buildNumber ? `${version}+${buildNumber}` : version;
    Sentry.setTag('boot', tag);
    Sentry.addBreadcrumb({ category: 'boot', message: `boot ${tag}`, level: 'info' });
  } catch {
    // Heartbeat is verification-only — never escalate failures to the user.
  }
}

function RootLayout() {
  const profile = useUserStore((s) => s.profile);
  const registeredFor = useRef<string | null>(null);
  const rcInitedFor = useRef<string | null>(null);
  const lastTouchRef = useRef(0);

  useEffect(() => {
    if (!profile?.id || registeredFor.current === profile.id) return;
    registeredFor.current = profile.id;
    registerForPushNotifications()
      .then((token) => { if (token) updatePushToken(profile.id, token).catch(() => {}); })
      .catch(() => {});
    // Mark active on load + re-arm the win-back ladder. Fire-and-forget.
    touchLastActive(profile.id).catch(() => {});
    lastTouchRef.current = Date.now();
  }, [profile?.id]);

  // Refresh last_active_at on foreground (throttled to ~6h — dormancy only
  // needs day granularity), so the win-back cron can tell who's gone quiet.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const uid = useUserStore.getState().profile?.id;
      if (!uid) return;
      const now = Date.now();
      if (now - lastTouchRef.current < 6 * 3600_000) return;
      lastTouchRef.current = now;
      touchLastActive(uid).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // Route a tapped push notification's `data.url` (a mori:// link) through the
  // same deep-link handler used for Universal Links. Covers warm taps + the
  // cold-start case where the tap launched the app.
  useEffect(() => {
    function route(resp: Notifications.NotificationResponse | null) {
      const url = resp?.notification?.request?.content?.data?.url;
      if (typeof url === 'string' && url) handleDeepLink({ url });
    }
    Notifications.getLastNotificationResponseAsync().then(route).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => sub.remove();
  }, []);

  // Mori+ — configure RevenueCat once we know who the user is. The wrapper is
  // a no-op when the kill switch is off OR the API key is missing, so this is
  // safe to leave wired before launch day.
  useEffect(() => {
    if (rcInitedFor.current === (profile?.id ?? null)) return;
    rcInitedFor.current = profile?.id ?? null;
    initRevenueCat(profile?.id ?? null).catch(() => {});
  }, [profile?.id]);

  useEffect(() => {
    emitBootHeartbeatOnce();
  }, []);

  // Check for OTA updates whenever the app foregrounds. Cold-launch checks
  // happen automatically via app.json `updates.checkAutomatically: ON_LOAD`,
  // so this only covers long-running sessions where a user backgrounds the
  // app for hours and we want to pick up a published JS bundle without
  // forcing a manual restart.
  useEffect(() => {
    if (!Updates.isEnabled) return; // dev / Expo Go: skip silently
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Update fetch failures are non-fatal — user keeps running on the
        // currently embedded bundle. Don't surface to the UI.
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink);
    // Cold-start: if the app was launched FROM a link (vs already running),
    // `addEventListener` doesn't fire — we have to ask iOS for the initial
    // URL ourselves. Without this, tapping a shared recipe link with the app
    // not running would just dump the user on the home screen.
    Linking.getInitialURL()
      .then((url) => { if (url) handleDeepLink({ url }); })
      .catch(() => {});
    return () => subscription.remove();
  }, []);

  function handleDeepLink(event: { url: string }) {
    if (isResetPasswordUrl(event.url)) {
      router.push({
        pathname: '/reset-password',
        params: { token: event.url },
      });
      return;
    }
    if (isVerifyEmailUrl(event.url)) {
      router.push({
        pathname: '/verify-email',
        params: { url: event.url },
      });
      return;
    }
    if (isRecipeUrl(event.url)) {
      const id = extractRecipeId(event.url);
      if (id) router.push(`/recipe/${id}` as any);
      return;
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="privacy-policy" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recipe/[id]" options={{ presentation: 'modal' }} />
      </Stack>
      <ResumeCookHandler />
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
