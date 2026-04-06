import { View, StyleSheet, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Rect, Text as SvgText, G } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';
import { useDiscoverStore } from '@/stores/discoverStore';

/**
 * MoriLogo — v2.0
 * Brand system locked March 2026.
 *
 * WORDMARK: upright spatula (left) + italic Georgia "mori" (right)
 *   - Light mode, no tagline → PNG banner (mori banner white.png)
 *   - Dark mode or showTagline (welcome screen dark overlay) → SVG (theme-adaptive)
 * APP ICON:  linen #F8F3EC bg, italic Georgia "m" in moss #2E5438, spatula top-right
 */

const BANNER = require('../../assets/mori transparent banner.png');

// ─── Spatula ─────────────────────────────────────────────────────────────────
// Natural bounding box ≈ 36w × 100h at scale(1). Use G transform to position.
// Circle knob removed — matches mori.png banner design.

interface SpatulaProps {
  fill: string;
  slotFill: string;
  scale?: number;
  x?: number;
  y?: number;
}

function Spatula({ fill, slotFill, scale = 1, x = 0, y = 0 }: SpatulaProps) {
  return (
    <G transform={`translate(${x},${y}) scale(${scale})`}>
      <Path
        d="M7 4 Q7 0 11 0 L25 0 Q29 0 29 4 L29 28 Q29 33 25 36 L20 39 L16 39 Q12 36 7 33 Z"
        fill={fill}
      />
      <Rect x={12} y={4} width={3} height={24} rx={1.5} fill={slotFill} />
      <Rect x={17.5} y={4} width={3} height={24} rx={1.5} fill={slotFill} />
      <Rect x={23} y={4} width={3} height={24} rx={1.5} fill={slotFill} />
      <Path
        d="M14 39 Q13 52 13.5 65 Q14 75 16 83 Q17 87 18 93 Q19 87 20 83 Q22 75 22.5 65 Q23 52 22 39 Z"
        fill={fill}
      />
    </G>
  );
}

// ─── Wordmark (SVG fallback) ──────────────────────────────────────────────────

interface MoriLogoProps {
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

function MoriLogoSVG({ showTagline = false, size = 'md' }: MoriLogoProps) {
  const colors = useTheme();
  const isMealPrep = useDiscoverStore((s) => s.mode === 'meal_prep');

  const spatulaFill = colors.primary;
  const slotFill = colors.background;
  const textFill = isMealPrep && (colors.background as string) === '#F8F3EC'
    ? '#2E5438'
    : colors.text;
  const taglineFill = colors.textMuted;

  const scales       = { sm: 0.44, md: 0.62, lg: 0.72 };
  const fontSizes    = { sm: 30,   md: 46,   lg: 52   };
  const taglineSizes = { sm: 7.5,  md: 9,    lg: 10   };
  const widths       = { sm: 175,  md: 240,  lg: 275  };
  const heights      = { sm: 54,   md: 78,   lg: 88   };

  const s     = scales[size];
  const fs    = fontSizes[size];
  const ts    = taglineSizes[size];
  const wordX = size === 'sm' ? 30 : 38;
  const wordY = size === 'sm' ? 32 : size === 'md' ? 50 : 54;
  const tagY  = size === 'sm' ? 45 : size === 'md' ? 65 : 72;

  return (
    <Svg width={widths[size]} height={heights[size]}>
      <Spatula fill={spatulaFill} slotFill={slotFill} scale={s} x={1} y={2} />
      <SvgText
        x={wordX}
        y={wordY}
        fontFamily="Georgia, serif"
        fontSize={fs}
        fontStyle="italic"
        fontWeight="400"
        fill={textFill}
        letterSpacing={-1.5}
      >
        mori
      </SvgText>
      {showTagline && (
        <SvgText
          x={wordX + 1}
          y={tagY}
          fontFamily="System"
          fontSize={ts}
          fill={taglineFill}
          letterSpacing={3.5}
        >
          SWIPE. COOK. ORDER.
        </SvgText>
      )}
    </Svg>
  );
}

// ─── Public MoriLogo ─────────────────────────────────────────────────────────
// Light mode + no tagline → PNG banner (crisp, matches physical brand asset)
// Dark mode or showTagline (welcome screen dark overlay) → SVG (theme-adaptive)

export function MoriLogo({ showTagline = false, size = 'md' }: MoriLogoProps) {
  const scheme = useColorScheme();

  if (showTagline || scheme === 'dark') {
    return <MoriLogoSVG showTagline={showTagline} size={size} />;
  }

  const widths  = { sm: 120, md: 160, lg: 185 };
  const heights = { sm: 37,  md: 50,  lg: 57  };

  return (
    <Image
      source={BANNER}
      style={{ width: widths[size], height: heights[size] }}
      contentFit="contain"
    />
  );
}

// ─── App Icon ─────────────────────────────────────────────────────────────────
// Always linen #F8F3EC bg + moss #2E5438 — never changes with theme.

export function MoriAppIcon({ size = 120 }: { size?: number }) {
  const iconBg   = '#F8F3EC';
  const iconFill = '#2E5438';
  const slotFill = '#F8F3EC';
  const borderRadius = Math.round(size * 0.233);

  return (
    <View
      style={[
        styles.iconContainer,
        { width: size, height: size, borderRadius, backgroundColor: iconBg, borderColor: '#E0D4C4' },
      ]}
    >
      <Svg width={size * 0.92} height={size * 0.92} viewBox="0 0 92 92">
        <SvgText
          x={4}
          y={78}
          fontFamily="Georgia, serif"
          fontSize={76}
          fontStyle="italic"
          fontWeight="400"
          fill={iconFill}
          letterSpacing={-2}
        >
          m
        </SvgText>
        <Spatula fill={iconFill} slotFill={slotFill} scale={0.46} x={64} y={1} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
