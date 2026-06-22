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
//
// presentationStyle is fullScreen (NOT pageSheet): the Plan tab's recipe picker
// is already a mounted pageSheet Modal, and two mounted pageSheet/formSheet modals
// on one screen is a known iOS bug that freezes touches on the screen behind them.
// fullScreen matches RecipeDetailModal (which coexists fine) and lets a tapped
// recipe open RecipeDetailModal cleanly on top.

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
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.card,
        }}>
          <Pressable onPress={onClose} hitSlop={8} style={{ width: 56 }}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>Close</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Your week, planned</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Mori+ · Auto Plan
            </Text>
          </View>
          <View style={{ width: 56 }} />
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 16, color: colors.text, fontWeight: '600' }}>Building your week…</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 48, lineHeight: 19 }}>
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
                backgroundColor: colors.primaryLight, borderRadius: 14,
                padding: 16, marginBottom: 16,
                flexDirection: 'row', gap: 12, alignItems: 'flex-start',
              }}>
                <Ionicons name="sparkles" size={20} color={colors.primary} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 15, color: colors.primary, lineHeight: 22, fontWeight: '500' }}>
                  {result.explanation}
                </Text>
              </View>

              {/* Over-budget warning */}
              {result.overBudget && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
                }}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.textMuted} />
                  <Text style={{ flex: 1, fontSize: 13, color: colors.textMuted }}>
                    Slightly over your weekly budget.
                  </Text>
                </View>
              )}

              {/* Per-day slot cards */}
              <View style={{ gap: 12 }}>
                {slots.map((slot, i) => {
                  const dayLabel = dayNames[slot.day] ?? `Day ${slot.day + 1}`;
                  const recipe = slot.recipe;
                  const macros = recipe?.macros;
                  return (
                    <View key={`${slot.day}-${slot.mealType}-${i}`}>
                      {/* Day heading */}
                      <Text style={{
                        fontSize: 12, fontWeight: '700', color: colors.textMuted,
                        letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6, marginLeft: 2,
                      }}>
                        {dayLabel} · Dinner
                      </Text>

                      <Pressable
                        disabled={!recipe}
                        onPress={() => { if (recipe && onPreviewRecipe) onPreviewRecipe(recipe); }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 14,
                          backgroundColor: colors.card, borderRadius: 14,
                          borderWidth: 1, borderColor: colors.border,
                          padding: 12, minHeight: 88,
                        }}
                      >
                        {recipe ? (
                          <>
                            <Image
                              source={{ uri: getRecipeImageUrl(recipe.image_url, 'card') }}
                              style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: colors.border }}
                              contentFit="cover"
                              transition={150}
                              recyclingKey={recipe.id}
                            />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 17, color: colors.text, lineHeight: 22 }}
                                numberOfLines={2}
                              >
                                {recipe.title}
                              </Text>
                              {/* meta: cuisine · time */}
                              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }} numberOfLines={1}>
                                {[recipe.cuisine, formatTime(recipe.prep_time_mins, recipe.cook_time_mins)].filter(Boolean).join(' · ')}
                              </Text>
                              {/* why this */}
                              {!!slot.explanation && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                                  <Ionicons name="sparkles-outline" size={12} color={colors.primary} />
                                  <Text style={{ flex: 1, fontSize: 12, color: colors.primary, fontWeight: '500' }} numberOfLines={1}>
                                    {slot.explanation}
                                  </Text>
                                </View>
                              )}
                              {/* macro chips */}
                              {macros && (macros.protein != null || macros.calories != null) && (
                                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                                  {macros.calories != null && (
                                    <MacroChip label={`${Math.round(macros.calories)} cal`} colors={colors} />
                                  )}
                                  {macros.protein != null && (
                                    <MacroChip label={`${Math.round(macros.protein)}g protein`} colors={colors} />
                                  )}
                                </View>
                              )}
                            </View>
                            {onPreviewRecipe && (
                              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                            )}
                          </>
                        ) : (
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{
                              width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
                              borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Ionicons name="add" size={26} color={colors.border} />
                            </View>
                            <Text style={{ flex: 1, fontSize: 14, color: colors.textMuted, fontStyle: 'italic' }}>
                              Needs a fresh recipe — add one yourself after.
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* Footer actions */}
            <View style={{
              flexDirection: 'row', gap: 10,
              paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32,
              borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card,
            }}>
              <Pressable
                onPress={onRegenerate}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  height: 52, paddingHorizontal: 20, borderRadius: 14,
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
                  height: 52, borderRadius: 14,
                  backgroundColor: filledCount === 0 ? colors.border : colors.primary,
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="white" />
                <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>
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

// Small macro pill — theme-driven so it reads in both light and dark mode.
function MacroChip({ label, colors }: { label: string; colors: ReturnType<typeof useTheme> }) {
  return (
    <View style={{
      backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
      borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3,
    }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
