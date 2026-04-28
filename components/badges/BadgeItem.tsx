// badges/BadgeItem.tsx
// Single badge circle — handles earned / locked / legendary states.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useIsDark } from '@/hooks/useTheme';
import { Badge } from './badgeData';
import { getBadgeColors } from './badgeColors';
import { BADGE_ICONS } from './BadgeIcons';

interface BadgeItemProps {
  badge: Badge;
  /** Disk diameter in px. Defaults to 60. Legendary badges auto-size to 68. */
  size?: number;
  showName?: boolean;
  onPress?: () => void;
}

export function BadgeItem({ badge, size, showName = true, onPress }: BadgeItemProps) {
  const isDark = useIsDark();
  const colors = getBadgeColors(badge.category, isDark);
  const isLegendary = badge.legendary ?? false;

  const diskSize = size ?? (isLegendary ? 68 : 60);
  const iconSize = Math.round(diskSize * 0.4);
  const borderWidth = isLegendary ? 2.5 : 2;
  const borderColor = badge.earned
    ? isLegendary ? colors.borderHigh : colors.border
    : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const diskBg = badge.earned
    ? colors.background
    : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const iconColor = badge.earned
    ? colors.icon
    : isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';

  const Icon = BADGE_ICONS[badge.icon];

  const Wrapper: any = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? { onPress, style: ({ pressed }: { pressed: boolean }) => [
        styles.wrapper,
        { width: diskSize + 16, opacity: pressed ? 0.7 : 1 },
      ] }
    : { style: [styles.wrapper, { width: diskSize + 16 }] };

  return (
    <Wrapper {...wrapperProps}>
      {/* Legendary dashed outer ring */}
      {isLegendary && badge.earned && (
        <View
          style={[
            styles.legendRing,
            {
              width: diskSize + 10,
              height: diskSize + 10,
              borderRadius: (diskSize + 10) / 2,
              borderColor: colors.borderHigh,
              marginLeft: -(diskSize + 10) / 2,
            },
          ]}
        />
      )}

      <View
        style={[
          styles.disk,
          {
            width: diskSize,
            height: diskSize,
            borderRadius: diskSize / 2,
            backgroundColor: diskBg,
            borderWidth,
            borderColor,
            opacity: badge.earned ? 1 : 0.42,
          },
        ]}
      >
        {Icon && <Icon size={iconSize} color={iconColor} />}
      </View>

      {showName && (
        <Text
          style={[
            styles.name,
            {
              color: badge.earned
                ? isDark ? '#F0EBE1' : '#181812'
                : isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)',
              fontWeight: badge.earned ? '500' : '400',
            },
          ]}
          numberOfLines={2}
        >
          {badge.name}
        </Text>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 8,
  },
  legendRing: {
    position: 'absolute',
    top: -5,
    left: '50%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  disk: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 10.5,
    textAlign: 'center',
    lineHeight: 14,
    fontFamily: 'System',
  },
});
