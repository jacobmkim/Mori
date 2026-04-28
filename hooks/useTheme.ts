import { useColorScheme } from 'react-native';
import { useDiscoverStore } from '@/stores/discoverStore';
import { lightTheme, darkTheme, mealPrepLightTheme, mealPrepDarkTheme, type Theme } from '@/constants/theme';

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const mode = useDiscoverStore((s) => s.mode);
  const appearanceMode = useDiscoverStore((s) => s.appearanceMode);

  const isDark =
    appearanceMode === 'dark' ? true :
    appearanceMode === 'light' ? false :
    systemScheme === 'dark';

  if (mode === 'meal_prep' && isDark)  return mealPrepDarkTheme;
  if (mode === 'meal_prep' && !isDark) return mealPrepLightTheme;
  if (isDark)                          return darkTheme;
  return lightTheme;
}

export function useIsDark(): boolean {
  const systemScheme = useColorScheme();
  const appearanceMode = useDiscoverStore((s) => s.appearanceMode);
  return appearanceMode === 'dark' ? true : appearanceMode === 'light' ? false : systemScheme === 'dark';
}
