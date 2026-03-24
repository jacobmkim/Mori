import { View, Text } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Reusable Mise logo — "m[spatula]se" with the spatula replacing the "i".
 * `size` is the font size; all dimensions scale proportionally from the
 * hero version on the welcome screen (base font size 76).
 */
export function MiseLogo({
  size = 76,
  textColor = '#FFFFFF',
  showTagline = false,
}: {
  size?: number;
  textColor?: string;
  showTagline?: boolean;
}) {
  const colors = useTheme();
  const s = size / 76; // scale factor

  const bladeW = Math.round(26 * s);
  const bladeH = Math.round(30 * s);
  const slotW = Math.max(1, Math.round(2 * s));
  const slotH = Math.round(21 * s);
  const neckW = Math.round(11 * s);
  const neckH = Math.max(2, Math.round(5 * s));
  const handleW = Math.max(2, Math.round(5 * s));
  const handleH = Math.round(37 * s);
  const spatulaMarginBottom = Math.round(10 * s);
  const spatulaMarginH = Math.max(1, Math.round(3 * s));

  return (
    <View>
      {/* "m[spatula]se" row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text
          style={{
            color: textColor,
            fontSize: size,
            fontWeight: '900',
            letterSpacing: -2 * s,
            lineHeight: size,
          }}
        >
          m
        </Text>

        {/* Spatula — blade, tapered neck, handle */}
        <View
          style={{
            alignItems: 'center',
            marginBottom: spatulaMarginBottom,
            marginHorizontal: spatulaMarginH,
          }}
        >
          {/* Blade with vertical slots */}
          <View
            style={{
              width: bladeW,
              height: bladeH,
              borderRadius: Math.max(2, Math.round(4 * s)),
              backgroundColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-evenly',
              paddingHorizontal: Math.max(1, Math.round(3 * s)),
            }}
          >
            <View style={{ width: slotW, height: slotH, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
            <View style={{ width: slotW, height: slotH, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
            <View style={{ width: slotW, height: slotH, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          </View>
          {/* Tapered neck */}
          <View
            style={{
              width: neckW,
              height: neckH,
              borderRadius: 1,
              backgroundColor: colors.primary,
            }}
          />
          {/* Handle */}
          <View
            style={{
              width: handleW,
              height: handleH,
              borderRadius: Math.max(2, Math.round(3 * s)),
              backgroundColor: colors.primary,
            }}
          />
        </View>

        <Text
          style={{
            color: textColor,
            fontSize: size,
            fontWeight: '900',
            letterSpacing: -2 * s,
            lineHeight: size,
          }}
        >
          se
        </Text>
      </View>

      {/* Optional "en place" tagline */}
      {showTagline && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <View style={{ width: 20, height: 2, backgroundColor: colors.primary, borderRadius: 1 }} />
          <Text
            style={{
              color: colors.primary,
              fontSize: Math.round(12 * s),
              fontWeight: '700',
              letterSpacing: 5,
              textTransform: 'uppercase',
            }}
          >
            en place
          </Text>
        </View>
      )}
    </View>
  );
}
