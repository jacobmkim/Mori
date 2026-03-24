import { View, Text } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { RecipeBadge } from '@/types';

interface BadgeProps {
  badge: RecipeBadge;
}

export default function Badge({ badge }: BadgeProps) {
  const colors = useTheme();

  const BADGE_CONFIG: Record<Exclude<RecipeBadge, 'none'>, { label: string; bg: string; text: string }> = {
    staff_pick: { label: 'Staff Pick', bg: '#FFF8E1', text: '#F57F17' },
    community_verified: { label: 'Verified', bg: colors.primaryLight, text: colors.primary },
    community_favorite: { label: 'Fan Fave', bg: '#FCE4EC', text: '#C62828' },
  };

  if (badge === 'none') return null;
  const config = BADGE_CONFIG[badge];
  return (
    <View
      style={{
        backgroundColor: config.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: config.text, fontSize: 11, fontWeight: '600' }}>
        {config.label}
      </Text>
    </View>
  );
}
