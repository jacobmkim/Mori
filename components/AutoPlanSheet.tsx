import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { getRecipeImageUrl } from '@/lib/recipeImage';
import { formatTime } from '@/lib/utils';
import type { AutoPlanResult, Recipe } from '@/types';

// The Mori+ "Build my week" review sheet. PRESENTATION-ONLY: it renders an
// already-computed AutoPlanResult and reports the user's choice up via callbacks.
// The Plan tab owns generation (generateWeekPlan), the paywall gate, and
// persistence (autoSlotsToStoreSlots → savePlan). Keeping all I/O out of here
// makes the component trivially testable and reusable for Sunday Drop (I8).

export function AutoPlanSheet({
  visible,
  loading,
  result,
  dayNames,
  onClose,
  onRegenerate,
  onAccept,
  onPreviewRecipe,
}: {
  visible: boolean;
  loading: boolean;
  result: AutoPlanResult | null;
  dayNames: string[];
  onClose: () => void;
  onRegenerate: () => void;
  onAccept: () => void;
  onPreviewRecipe?: (recipe: Recipe) => void;
}) {
  const colors = useTheme();

  const slots = result?.slots ?? [];
  // Count only slots that will actually persist — autoSlotsToStoreSlots drops any
  // recipe without a supabase_id, so gating Accept on the same predicate keeps the
  // button from ever offering "Use this plan" on a plan that maps to zero slots.
  const filledCount = slots.filter((s) => s.recipe?.supabase_id).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.card,
        }}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>Close</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Your week, planned</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Mori+ · Auto Plan</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 15, color: colors.textMuted }}>Building your week…</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 }}>
              Matching dinners to your taste, leftovers, and variety.
            </Text>
          </View>
        ) : !result ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
            <Ionicons name="sad-outline" size={44} color={colors.border} />
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              We couldn't build a week right now. Please try again.
            </Text>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
              {/* Why-these explanation */}
              <View style={{
                backgroundColor: colors.primaryLight, borderRadius: 12,
                padding: 14, marginBottom: 8,
                flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              }}>
                <Ionicons name="sparkles" size={18} color={colors.primary} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.primary, lineHeight: 20 }}>
                  {result.explanation}
                </Text>
              </View>

              {/* Over-budget warning */}
              {result.overBudget && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
                }}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={{ flex: 1, fontSize: 12, color: colors.textMuted }}>
                    Slightly over your weekly budget.
                  </Text>
                </View>
              )}

              {/* Per-day slot rows */}
              <View style={{ marginTop: 8, gap: 8 }}>
                {slots.map((slot, i) => {
                  const dayLabel = dayNames[slot.day] ?? `Day ${slot.day + 1}`;
                  const recipe = slot.recipe;
                  return (
                    <Pressable
                      key={`${slot.day}-${slot.mealType}-${i}`}
                      disabled={!recipe}
                      onPress={() => { if (recipe && onPreviewRecipe) onPreviewRecipe(recipe); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        backgroundColor: colors.card, borderRadius: 12,
                        borderWidth: 1, borderColor: colors.border,
                        padding: 12, minHeight: 72,
                      }}
                    >
                      <View style={{ width: 64 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                          {dayLabel.slice(0, 3)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Dinner</Text>
                      </View>

                      {recipe ? (
                        <>
                          <Image
                            source={{ uri: getRecipeImageUrl(recipe.image_url, 'thumb') }}
                            style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.border }}
                            contentFit="cover"
                            transition={150}
                            recyclingKey={recipe.id}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }} numberOfLines={1}>
                              {recipe.title}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <Ionicons name="sparkles-outline" size={11} color={colors.primary} />
                              <Text style={{ flex: 1, fontSize: 11, color: colors.textMuted }} numberOfLines={1}>
                                {slot.explanation || formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}
                              </Text>
                            </View>
                          </View>
                          {onPreviewRecipe && (
                            <Ionicons name="chevron-forward" size={18} color={colors.border} />
                          )}
                        </>
                      ) : (
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="add-circle-outline" size={18} color={colors.border} />
                          <Text style={{ flex: 1, fontSize: 13, color: colors.textMuted, fontStyle: 'italic' }}>
                            Needs a fresh recipe — add one yourself
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Footer actions */}
            <View style={{
              flexDirection: 'row', gap: 10,
              paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
              borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card,
            }}>
              <Pressable
                onPress={onRegenerate}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  height: 50, paddingHorizontal: 18, borderRadius: 14,
                  borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
                }}
              >
                <Ionicons name="shuffle" size={18} color={colors.text} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Shuffle</Text>
              </Pressable>
              <Pressable
                onPress={onAccept}
                disabled={filledCount === 0}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  height: 50, borderRadius: 14,
                  backgroundColor: filledCount === 0 ? colors.border : colors.primary,
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="white" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>
                  Use this plan{filledCount > 0 ? ` (${filledCount})` : ''}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
