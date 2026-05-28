import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime } from '@/lib/utils';
import { getRecipeImageUrl } from '@/lib/recipeImage';
import type { Recipe } from '@/types';

// Shared editorial recipe cards. Used by the Explore tab and the Plan-tab
// picker carousels so both stay visually in sync.

// ── Small horizontal recipe card ──────────────────────────────────────────────
export function HorizontalCard({
  recipe, badge, badgeStyle, onPress,
}: {
  recipe: Recipe;
  badge?: string;
  badgeStyle?: { bg: string; text: string };
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 140, borderRadius: 14, backgroundColor: colors.card,
        borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden', marginRight: 10,
      }}
    >
      <Image
        source={{ uri: getRecipeImageUrl(recipe.image_url, 'card') }}
        style={{ width: 140, height: 90, backgroundColor: colors.border }}
        contentFit="cover"
        transition={150}
        recyclingKey={recipe.id}
      />
      <View style={{ padding: 10 }}>
        {badge && badgeStyle && (
          <View style={{
            alignSelf: 'flex-start', backgroundColor: badgeStyle.bg,
            borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4,
          }}>
            <Text style={{ fontSize: 7, fontWeight: '700', color: badgeStyle.text }}>{badge}</Text>
          </View>
        )}
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 12, color: colors.text }} numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
          {[recipe.cuisine, formatTime(recipe.prep_time_mins, recipe.cook_time_mins)].filter(Boolean).join(' · ')}
        </Text>
        {(recipe.rating_count ?? 0) >= 3 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <Ionicons name="star" size={9} color="#FFC107" />
            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>
              {Number(recipe.avg_rating).toFixed(1)} ({recipe.rating_count})
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── 2-column grid card ─────────────────────────────────────────────────────────
export function GridCard({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, borderRadius: 14, backgroundColor: colors.card,
        borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
      }}
    >
      <Image
        source={{ uri: getRecipeImageUrl(recipe.image_url, 'card') }}
        style={{ width: '100%', height: 100, backgroundColor: colors.border }}
        contentFit="cover"
        transition={150}
        recyclingKey={recipe.id}
      />
      <View style={{ padding: 10 }}>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 12, color: colors.text }} numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}
        </Text>
        {(recipe.rating_count ?? 0) >= 3 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <Ionicons name="star" size={9} color="#FFC107" />
            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>
              {Number(recipe.avg_rating).toFixed(1)} ({recipe.rating_count})
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
export function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 24 }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '500' }}>See all</Text>
        </Pressable>
      )}
    </View>
  );
}
