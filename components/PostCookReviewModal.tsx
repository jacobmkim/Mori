import { useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { ReviewComposer } from '@/components/ReviewComposer';
import { submitReview, updateReview } from '@/lib/api';
import { getRecipeImageUrl } from '@/lib/recipeImage';
import { maybePromptForAppReview } from '@/lib/appReviewPrompt';
import { useUserStore } from '@/stores/userStore';
import type { Recipe, Review } from '@/types';

// Post-cook review prompt — shown right after the leftovers modal closes so we
// capture the freshest impression. Two phases:
//   1. Quick-tap star row (no commit yet) — friction-free entry point.
//   2. As soon as the user taps a star, we expand into the full ReviewComposer
//      pre-filled with that rating so they can add text and submit.
// If the user dismisses without picking a star, no review is recorded.

interface PostCookReviewModalProps {
  visible: boolean;
  recipe: Recipe | null;
  existing: Review | null;
  onClose: () => void;
  onSubmitted: (review: Review) => void;
}

export function PostCookReviewModal({ visible, recipe, existing, onClose, onSubmitted }: PostCookReviewModalProps) {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const [stagedRating, setStagedRating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dismiss() {
    setStagedRating(null);
    setError(null);
    onClose();
  }

  async function handleSubmit(rating: number, text: string) {
    if (!recipe || !userId) return;
    setError(null);
    const supabaseId = recipe.supabase_id ?? recipe.id;
    try {
      const review = existing
        ? await updateReview(existing.id, rating, text || null)
        : await submitReview(userId, supabaseId, rating, text || null);
      onSubmitted(review);
      dismiss();

      // Positive-moment App Store prompt — only on first-time submission (not
      // edits) and only on a 4-or-5. Fire-and-forget; eligibility + cooldown
      // live inside maybePromptForAppReview.
      if (!existing) {
        const profile = useUserStore.getState().profile;
        maybePromptForAppReview({
          rating,
          mealsCookedCount: profile?.meals_cooked_count ?? 0,
          accountCreatedAt: profile?.created_at ?? null,
        }).catch(() => {});
      }
    } catch {
      setError('Could not save review. Please try again.');
    }
  }

  if (!recipe) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={dismiss} />
        <View style={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingBottom: 36, maxHeight: '80%',
        }}>
          <View style={{
            width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
            alignSelf: 'center', marginTop: 12, marginBottom: 18,
          }} />

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingHorizontal: 24, marginBottom: 18 }}>
              {recipe.image_url && (
                <Image
                  source={{ uri: getRecipeImageUrl(recipe.image_url, 'thumb') }}
                  style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.border }}
                  contentFit="cover"
                  transition={150}
                  recyclingKey={recipe.id}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: 'Georgia',
                  fontStyle: 'italic',
                  fontWeight: '700',
                  fontSize: 20,
                  color: colors.text,
                  marginBottom: 2,
                }} numberOfLines={2}>
                  How was it?
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
                  {recipe.title}
                </Text>
              </View>
            </View>

            {stagedRating === null ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 18 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Pressable
                      key={star}
                      onPress={() => setStagedRating(star)}
                      hitSlop={6}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="star-outline" size={42} color="#FFC107" />
                    </Pressable>
                  ))}
                </View>
                <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 18 }}>
                  Tap to rate · tap dimissed area to skip
                </Text>
              </>
            ) : (
              <View style={{ paddingHorizontal: 16 }}>
                <ReviewComposer
                  existing={existing ? { ...existing, rating: stagedRating } : null}
                  onSubmit={handleSubmit}
                  onCancel={() => setStagedRating(null)}
                />
                {error && (
                  <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center', marginTop: 8 }}>{error}</Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
