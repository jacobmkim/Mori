import { ScrollView, View, Text, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import type { Badge } from '@/lib/badges';

interface Props {
  badges: Badge[];
}

export function BadgeRow({ badges }: Props) {
  const colors = useTheme();

  function onPress(badge: Badge) {
    Alert.alert(badge.name, badge.earned ? badge.description : `🔒 ${badge.description}`);
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
    >
      {badges.map((badge) => (
        <Pressable
          key={badge.id}
          onPress={() => onPress(badge)}
          style={{ alignItems: 'center', width: 72 }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: badge.earned ? colors.primaryLight : colors.card,
              borderWidth: 1,
              borderColor: badge.earned ? colors.primary : colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: badge.earned ? 1 : 0.45,
            }}
          >
            <Ionicons
              name={badge.icon as any}
              size={24}
              color={badge.earned ? colors.primary : colors.textMuted}
            />
            {!badge.earned && (
              <View
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  backgroundColor: colors.border,
                  borderRadius: 8,
                  padding: 2,
                }}
              >
                <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
              </View>
            )}
          </View>
          <Text
            style={{
              marginTop: 6,
              fontSize: 10,
              color: badge.earned ? colors.text : colors.textMuted,
              textAlign: 'center',
              lineHeight: 13,
            }}
            numberOfLines={2}
          >
            {badge.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
