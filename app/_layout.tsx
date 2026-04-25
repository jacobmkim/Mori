import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://59eecaa7b60a4f0a210f8c92fa782c67@o4511275352326144.ingest.us.sentry.io/4511275354423296',
  enabled: !__DEV__,
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
});

function RootLayout() {
  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, []);

  function handleDeepLink(event: { url: string }) {
    const url = event.url;

    // Handle password reset deep link: mori://reset-password#access_token=xxx&refresh_token=yyy
    if (url.includes('mori://reset-password')) {
      router.push({
        pathname: '/reset-password',
        params: { token: url },
      });
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
        <Stack.Screen name="privacy-policy" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
