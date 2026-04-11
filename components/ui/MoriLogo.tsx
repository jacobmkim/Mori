import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { useDiscoverStore } from '@/stores/discoverStore';

/**
 * MoriLogo — v3.0
 * Brand system locked April 2026.
 *
 * WORDMARK: spatula (left) + italic "mori" (right) — Canva PNG assets
 *   - Light mode           → mori-green.png  (green spatula + green text)
 *   - Dark mode            → mori-dark.png   (green spatula + white text)
 *   - showTagline/overlay  → mori-white.png  (white spatula + white text)
 */

const BANNER_GREEN = require('../../assets/mori-green.png');
const BANNER_DARK  = require('../../assets/mori-dark.png');
const BANNER_WHITE = require('../../assets/mori-white.png');

interface MoriLogoProps {
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function MoriLogo({ showTagline = false, size = 'md' }: MoriLogoProps) {
  const systemScheme = useColorScheme();
  const appearanceMode = useDiscoverStore((s) => s.appearanceMode);
  const colors = useTheme();

  const isDark =
    appearanceMode === 'dark' ? true :
    appearanceMode === 'light' ? false :
    systemScheme === 'dark';

  const widths  = { sm: 148, md: 208, lg: 268 };
  const heights = { sm: 37,  md: 52,  lg: 67  };

  const source = showTagline
    ? BANNER_WHITE
    : isDark
      ? BANNER_DARK
      : BANNER_GREEN;

  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Image
        source={source}
        style={{ width: widths[size], height: heights[size] }}
        contentFit="contain"
      />
      {showTagline && (
        <Text style={[styles.tagline, { color: colors.textMuted }]}>
          SWIPE. COOK. ORDER.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tagline: {
    fontFamily: 'System',
    fontSize: 9,
    letterSpacing: 3.5,
    marginTop: 4,
  },
});
