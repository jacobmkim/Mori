import { View, Text, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import type { Review } from '@/types';

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons
          key={s}
          name={s <= rating ? 'star' : 'star-outline'}
          size={size}
          color={s <= rating ? '#FFC107' : colors.border}
        />
      ))}
    </View>
  );
}

interface ReviewItemProps {
  review: Review;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function ReviewItem({ review, isOwn, onEdit, onDelete }: ReviewItemProps) {
  const colors = useTheme();

  const displayName = review.reviewer_username
    ? `@${review.reviewer_username}`
    : review.reviewer_name ?? 'Mori user';

  const initials = review.reviewer_name
    ? review.reviewer_name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const date = new Date(review.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  function confirmDelete() {
    Alert.alert('Delete review?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  }

  return (
    <View style={{
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {/* Avatar */}
        <View style={{
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {review.reviewer_avatar ? (
            <Image
              source={{ uri: review.reviewer_avatar }}
              style={{ width: 32, height: 32 }}
              contentFit="cover"
            />
          ) : (
            <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>{initials}</Text>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{displayName}</Text>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{date}</Text>
        </View>

        <StarRow rating={review.rating} />

        {isOwn && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onEdit} hitSlop={8}>
              <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={confirmDelete} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        )}
      </View>

      {review.review_text ? (
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
          {review.review_text}
        </Text>
      ) : null}
    </View>
  );
}
