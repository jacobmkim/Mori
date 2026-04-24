import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { initSentry, Sentry } from '../lib/sentry';

initSentry();

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
