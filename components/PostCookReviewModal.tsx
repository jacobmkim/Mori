import { useState, useRef } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { ReviewComposer } from '@/components/ReviewComposer';
import { submitReview, updateReview } from '@/lib/api';
import { getRecipeImageUrl } from '@/lib/recipeImage';
import { maybePromptForAppReview } from '@/lib/appReviewPrompt';
import { shareRecipe, canShareRecipe } from '@/lib/shareRecipe';
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
  const [error, setError] = useState<string | null>(null);
  // After a great first-time cook (4-5★), nudge the user to send the recipe to
  // someone before closing.
  const [showShareNudge, setShowShareNudge] = useState(false);
  const [nudgeRating, setNudgeRating] = useState(5);
  // Recipe to share once this prompt has fully closed (see handleShareNudge).
  const shareTargetRef = useRef<Recipe | null>(null);
  // Fallback timer id, so whichever of {onDismiss, timeout} fires first cancels
  // the other — a single guarded path, not two racing ones.
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    setShowShareNudge(false);
    setError(null);
    onClose();
  }

  // Present the share sheet only after this prompt is gone. Presenting an iOS
  // activity sheet from inside this nested, transparent overFullScreen modal
  // fails silently — it must present from the recipe-detail modal underneath.
  // Idempotent: cancels the fallback timer and consumes the target ref, so it
  // runs exactly once no matter how many callers reach it.
  function flushPendingShare() {
    if (shareTimerRef.current) {
      clearTimeout(shareTimerRef.current);
      shareTimerRef.current = null;
    }
    const target = shareTargetRef.current;
    if (!target) return;
    shareTargetRef.current = null;
    shareRecipe(target);
  }

  function handleShareNudge() {
    // Stash the target, close this prompt, then share once it's dismissed —
    // via the Modal's onDismiss, with a timeout fallback in case onDismiss
    // doesn't fire for a transparent modal. flushPendingShare runs once.
    shareTargetRef.current = recipe;
    // They just did the positive action — don't pile on an app-review prompt.
    dismiss();
    shareTimerRef.current = setTimeout(flushPendingShare, 600);
  }

  function skipShareNudge() {
    const profile = useUserStore.getState().profile;
    // App-review prompt only when they decline sharing, so the native review
    // dialog never collides with the system share sheet. Gated internally.
    maybePromptForAppReview({
      rating: nudgeRating,
      mealsCookedCount: profile?.meals_cooked_count ?? 0,
      accountCreatedAt: profile?.created_at ?? null,
    }).catch(() => {});
    dismiss();
  }

  async function handleSubmit(rating: number, text: string, photoUrl: string | null) {
    if (!recipe || !userId) return;
    setError(null);
    const supabaseId = recipe.supabase_id ?? recipe.id;
    try {
      const review = existing
        ? await updateReview(existing.id, rating, text || null, photoUrl)
        : await submitReview(userId, supabaseId, rating, text || null, photoUrl);
      onSubmitted(review);

      // Great first-time cook → nudge them to send the recipe to a friend
      // before closing. The app-review prompt is deferred into skipShareNudge
      // so the two never fire at once.
      if (!existing && rating >= 4 && canShareRecipe(recipe)) {
        setNudgeRating(rating);
        setShowShareNudge(true);
        return;
      }

      dismiss();

      // Positive-moment App Store prompt — first-time only, 4-or-5 only.
      // (Reached for ratings < 4, or recipes that can't be shared.)
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
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={dismiss} onDismiss={flushPendingShare}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                  {showShareNudge ? 'Loved it?' : 'How was it?'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
                  {recipe.title}
                </Text>
              </View>
            </View>

            {showShareNudge ? (
              <View style={{ paddingHorizontal: 24 }}>
                <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 18, lineHeight: 20 }}>
                  Know someone who'd love this? Send it their way.
                </Text>
                <Pressable
                  onPress={handleShareNudge}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 50, borderRadius: 14, backgroundColor: colors.primary, marginBottom: 8,
                  }}
                >
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>Send to a friend</Text>
                </Pressable>
                <Pressable onPress={skipShareNudge} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, color: colors.textMuted }}>No thanks</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16 }}>
                <ReviewComposer
                  existing={existing}
                  hideTitle
                  userId={userId ?? ''}
                  recipeId={recipe.supabase_id ?? recipe.id}
                  onSubmit={handleSubmit}
                  onCancel={dismiss}
                />
                {error && (
                  <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center', marginTop: 8 }}>{error}</Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
