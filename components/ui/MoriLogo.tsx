import { View, Text } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Reusable Mori logo — italic serif wordmark with green dot accent.
 * `size` is the font size; dot and tagline scale proportionally.
 */
export function MoriLogo({
  size = 76,
  textColor = '#FFFFFF',
  showTagline = false,
}: {
  size?: number;
  textColor?: string;
  showTagline?: boolean;
}) {
  const colors = useTheme();
  const s = size / 76;
  const dotSize = Math.max(6, Math.round(10 * s));

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text
          style={{
            color: textColor,
            fontSize: size,
            fontStyle: 'italic',
            fontFamily: 'Georgia',
            fontWeight: '400',
            letterSpacing: -1 * s,
            lineHeight: size * 1.1,
          }}
        >
          Mori
        </Text>
        {/* Green dot accent */}
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: colors.primary,
            marginLeft: Math.round(4 * s),
            marginBottom: Math.round(10 * s),
          }}
        />
      </View>

      {showTagline && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <View style={{ width: Math.round(20 * s), height: 2, backgroundColor: colors.primary, borderRadius: 1 }} />
          <Text
            style={{
              color: colors.primary,
              fontSize: Math.round(12 * s),
              fontWeight: '600',
              letterSpacing: 5,
              textTransform: 'uppercase',
            }}
          >
            gather · cook · discover
          </Text>
        </View>
      )}
    </View>
  );
}
