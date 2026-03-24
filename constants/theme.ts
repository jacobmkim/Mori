// Spontaneous Light — default, fresh exploratory energy
export const lightTheme = {
  primary:      '#2E7D32',
  primaryLight: '#E8F5E9',
  primaryDark:  '#1B5E20',
  background:   '#F9F9F9',
  card:         '#FFFFFF',
  text:         '#1A1A1A',
  textMuted:    '#666666',
  border:       '#E0E0E0',
  tabBar:       '#FFFFFF',
  tabBorder:    '#E0E0E0',
  error:        '#D32F2F',
  swipeRight:   '#2E7D32',
  swipeLeft:    '#D32F2F',
  white:        '#FFFFFF',
  toggleBg:     '#F0F0F0',
  weekBarBg:    '#E8F5E9',
  dayFilled:    '#2E7D32',
  dayEmpty:     '#C8E6C9',
} as const;

// Spontaneous Dark
export const darkTheme = {
  primary:      '#4CAF50',
  primaryLight: '#1B2E1C',
  primaryDark:  '#2E7D32',
  background:   '#0D0D0D',
  card:         '#1A1A1A',
  text:         '#F0EDE6',
  textMuted:    '#9E9E9E',
  border:       '#2C2C2C',
  tabBar:       '#111111',
  tabBorder:    '#2C2C2C',
  error:        '#EF5350',
  swipeRight:   '#4CAF50',
  swipeLeft:    '#EF5350',
  white:        '#FFFFFF',
  toggleBg:     '#2C2C2C',
  weekBarBg:    '#1B2E1C',
  dayFilled:    '#4CAF50',
  dayEmpty:     '#2A4030',
} as const;

// Meal Prep Light — Linen & Moss, Sunday prep energy
export const mealPrepLightTheme = {
  primary:      '#2E5438',
  primaryLight: '#E0EDD8',
  primaryDark:  '#1A3820',
  background:   '#F8F3EC',
  card:         '#FFFFFF',
  text:         '#1A1408',
  textMuted:    '#5A5040',
  border:       '#D8CCBC',
  tabBar:       '#F0E8DC',
  tabBorder:    '#D8CCBC',
  error:        '#D32F2F',
  swipeRight:   '#2E5438',
  swipeLeft:    '#D32F2F',
  white:        '#FFFFFF',
  toggleBg:     '#EDE5D8',
  weekBarBg:    '#E0EDD8',
  dayFilled:    '#2E5438',
  dayEmpty:     '#B8D0B0',
} as const;

// Meal Prep Dark — Deep forest, rich and focused
export const mealPrepDarkTheme = {
  primary:      '#4CAF50',
  primaryLight: '#1A3028',
  primaryDark:  '#2E7D32',
  background:   '#0F1F1A',
  card:         '#1E2E28',
  text:         '#F0EDE6',
  textMuted:    '#8AAB9E',
  border:       '#2A3D35',
  tabBar:       '#0A1610',
  tabBorder:    '#2A3D35',
  error:        '#EF5350',
  swipeRight:   '#4CAF50',
  swipeLeft:    '#EF5350',
  white:        '#FFFFFF',
  toggleBg:     '#1A3028',
  weekBarBg:    '#1A3028',
  dayFilled:    '#4CAF50',
  dayEmpty:     '#2A4038',
} as const;

export type Theme = typeof lightTheme;

// Legacy — kept for one-off non-component uses (scripts, utils).
// Components must use useTheme() hook instead.
export const colors = lightTheme;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  tile: 12,
  card: 16,
  button: 12,
  pill: 999,
} as const;

export const fontSize = {
  caption: 13,
  body: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
} as const;
