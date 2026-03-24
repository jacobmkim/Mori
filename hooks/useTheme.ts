import { useColorScheme } from 'react-native';
import { useDiscoverStore } from '@/stores/discoverStore';
import { lightTheme, darkTheme, mealPrepLightTheme, mealPrepDarkTheme, type Theme } from '@/constants/theme';

export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  const mode = useDiscoverStore((s) => s.mode);
  const isDark = colorScheme === 'dark';

  if (mode === 'meal_prep' && isDark)  return mealPrepDarkTheme;
  if (mode === 'meal_prep' && !isDark) return mealPrepLightTheme;
  if (isDark)                          return darkTheme;
  return lightTheme;
}
