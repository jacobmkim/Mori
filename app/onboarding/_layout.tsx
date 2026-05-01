import { Stack } from 'expo-router';
import { ONBOARDING_PALETTE as P } from '@/constants/onboardingPalette';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: P.background },
      }}
    />
  );
}
