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

// Meal Prep Light — Linen & Moss, warm and grounded Sunday prep energy
export const mealPrepLightTheme = {
  primary:      '#2E5438',   // Deep moss green
  primaryLight: '#E0EDD8',   // Soft sage tint
  primaryDark:  '#1A3820',   // Pressed state
  background:   '#EDE5D8',   // Warm linen — slightly deeper than pure linen
  card:         '#FFFFFF',   // Pure white cards pop on linen bg
  text:         '#1A1408',   // Warm near-black
  textMuted:    '#5A5040',   // Warm grey-brown
  border:       '#CEC0AC',   // Warm divider
  tabBar:       '#E4D9C8',   // Deeper linen for tab bar
  tabBorder:    '#CEC0AC',
  error:        '#D32F2F',
  swipeRight:   '#2E5438',
  swipeLeft:    '#D32F2F',
  white:        '#FFFFFF',
  toggleBg:     '#D8CCBA',   // Toasted linen for mode toggle
  weekBarBg:    '#E0EDD8',   // Sage fill for week progress bar
  dayFilled:    '#2E5438',   // Moss dot — planned days
  dayEmpty:     '#B8D0B0',   // Pale sage — unplanned days
} as const;

// Meal Prep Dark — Deep forest, rich and focused night prep energy
export const mealPrepDarkTheme = {
  primary:      '#4CAF50',   // Bright green — pops on dark forest bg
  primaryLight: '#1A3028',   // Dark green tint
  primaryDark:  '#2E7D32',   // Deeper green
  background:   '#0F1F1A',   // Deep forest — green-tinted dark
  card:         '#1E2E28',   // Dark green-tinted card surface
  text:         '#F0EDE6',   // Warm off-white
  textMuted:    '#8AAB9E',   // Muted sage
  border:       '#2A3D35',   // Forest border
  tabBar:       '#0A1610',   // Very dark forest tab bar
  tabBorder:    '#2A3D35',
  error:        '#EF5350',
  swipeRight:   '#4CAF50',
  swipeLeft:    '#EF5350',
  white:        '#FFFFFF',
  toggleBg:     '#1A3028',
  weekBarBg:    '#1A3028',
  dayFilled:    '#4CAF50',   // Bright green dot — planned days
  dayEmpty:     '#2A4038',   // Dark sage — unplanned days
} as const;

export type Theme = { [K in keyof typeof lightTheme]: string };

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
