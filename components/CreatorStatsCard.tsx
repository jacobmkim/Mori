import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import type { CreatorStats } from '@/types';

interface Props {
  stats: CreatorStats | null;
  loading: boolean;
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  const colors = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

export function CreatorStatsCard({ stats, loading }: Props) {
  const colors = useTheme();

  const likeRatio =
    stats && stats.right_swipes + stats.left_swipes > 0
      ? Math.round((stats.right_swipes / (stats.right_swipes + stats.left_swipes)) * 100)
      : null;

  return (
    <View style={{
      backgroundColor: colors.primaryLight,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary + '40',
      padding: 16,
      marginBottom: 16,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <Ionicons name="bar-chart-outline" size={15} color={colors.primary} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>Your recipe stats</Text>
      </View>

      {loading || !stats ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <StatCell
              label={`swipes · ${likeRatio ?? 0}% liked`}
              value={stats.right_swipes + stats.left_swipes}
            />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <StatCell label="saved" value={stats.saves} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <StatCell label="cooked" value={stats.cooks} />
          </View>

          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />

          <View style={{ flexDirection: 'row' }}>
            <StatCell label="views" value={stats.views} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <StatCell
              label="avg rating"
              value={stats.rating_count > 0 ? `★ ${stats.avg_rating.toFixed(1)}` : '—'}
            />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <StatCell label="reviews" value={stats.rating_count} />
          </View>
        </>
      )}
    </View>
  );
}
