// badges/BadgeGrid.tsx
// Full badge collection view sorted by category.

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useIsDark } from '@/hooks/useTheme';
import {
  Badge,
  BadgeStats,
  BADGE_CATEGORIES,
  BADGE_CATEGORY_LABELS,
  computeBadges,
} from './badgeData';
import { BadgeItem } from './BadgeItem';

interface BadgeGridProps {
  stats: BadgeStats;
  horizontalPadding?: number;
  /** Set false when already inside a ScrollView (e.g. ProfileSheet). Default true. */
  scrollEnabled?: boolean;
  onBadgePress?: (badge: Badge) => void;
}

export function BadgeGrid({ stats, horizontalPadding = 20, scrollEnabled = true, onBadgePress }: BadgeGridProps) {
  const isDark = useIsDark();
  const badges = useMemo(() => computeBadges(stats), [stats]);

  const earned = badges.filter((b) => b.earned).length;
  const total  = badges.length;

  const textSecondary = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.5)';
  const textPrimary   = isDark ? '#F0EBE1' : '#181812';

  const content = (
    <View style={[styles.container, { paddingHorizontal: horizontalPadding }]}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: textPrimary }]}>Badges</Text>
        <Text style={[styles.counter, { color: textSecondary }]}>
          {earned} of {total} earned
        </Text>
      </View>

      {BADGE_CATEGORIES.map((cat) => {
        const catBadges = badges.filter((b) => b.category === cat);
        return (
          <View key={cat} style={styles.section}>
            <Text style={[styles.catLabel, { color: textSecondary }]}>
              {BADGE_CATEGORY_LABELS[cat]}
            </Text>
            <View style={styles.row}>
              {catBadges.map((badge) => (
                <BadgeItem
                  key={badge.id}
                  badge={badge}
                  onPress={onBadgePress ? () => onBadgePress(badge) : undefined}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );

  if (!scrollEnabled) return content;

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 24,
    paddingBottom: 40,
    gap: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: -8,
  },
  heading: {
    fontSize: 22,
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontWeight: '400',
  },
  counter: {
    fontSize: 13,
    fontFamily: 'System',
  },
  section: {
    gap: 12,
  },
  catLabel: {
    fontSize: 11,
    fontFamily: 'System',
    fontWeight: '500',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
