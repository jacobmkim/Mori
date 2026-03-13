import {
  View, Text, Modal, Pressable, ScrollView, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { colors } from '@/constants/theme';
import { formatTime, formatCost } from '@/lib/utils';
import { fetchMacros } from '@/lib/api';
import { MacroRow } from '@/components/ui/MacroRow';
import type { Recipe, Macros } from '@/types';
import type { MealDetail } from '@/lib/mealdb';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Serving size helpers ───────────────────────────────────────────────────────

// Parse the leading numeric part of a measure string ("200 g" → 200, "1/2 cup" → 0.5)
function parseLeadingNumber(str: string): { value: number; rest: string } | null {
  const frac = str.match(/^(\d+)\/(\d+)(.*)/);
  if (frac) return { value: parseInt(frac[1]) / parseInt(frac[2]), rest: frac[3] };
  const dec = str.match(/^(\d+\.?\d*)(.*)/);
  if (dec) return { value: parseFloat(dec[1]), rest: dec[2] };
  return null;
}

// Format a scaled number cleanly — whole numbers as int, otherwise 1 decimal
function formatNumber(n: number): string {
  // Common fractions
  const fractions: [number, string][] = [
    [0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾'],
  ];
  const whole = Math.floor(n);
  const remainder = n - whole;
  for (const [val, sym] of fractions) {
    if (Math.abs(remainder - val) < 0.05) {
      return whole > 0 ? `${whole}${sym}` : sym;
    }
  }
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1);
}

// Scale a measure string by a ratio ("200 g", 1.5 → "300 g")
function scaleMeasure(measure: string, ratio: number): string {
  if (!measure || ratio === 1) return measure;
  const parsed = parseLeadingNumber(measure.trim());
  if (!parsed) return measure;
  const scaled = parsed.value * ratio;
  return `${formatNumber(scaled)}${parsed.rest}`;
}

// Scale all macros by ratio
function scaleMacros(macros: Macros, ratio: number): Macros {
  return {
    calories: Math.round(macros.calories * ratio),
    protein: Math.round(macros.protein * ratio * 10) / 10,
    carbohydrates: Math.round(macros.carbohydrates * ratio * 10) / 10,
    fat: Math.round(macros.fat * ratio * 10) / 10,
    fibre: Math.round(macros.fibre * ratio * 10) / 10,
    netCarbs: macros.netCarbs != null ? Math.round(macros.netCarbs * ratio * 10) / 10 : undefined,
    isEstimated: macros.isEstimated,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RecipeDetailModalProps {
  visible: boolean;
  recipe: Recipe | null;
  detail: MealDetail | null | undefined;
  isSaved: boolean;
  isInCart: boolean;
  onClose: () => void;
  onSaveToggle: () => void;
  onAddToCart: () => void;
}

export function RecipeDetailModal({
  visible,
  recipe,
  detail,
  isSaved,
  isInCart,
  onClose,
  onSaveToggle,
  onAddToCart,
}: RecipeDetailModalProps) {
  const [baseMacros, setBaseMacros] = useState<Macros | null>(null);
  const [servings, setServings] = useState(1);

  const baseServings = recipe?.servings ?? 4;

  // Reset servings and fetch macros when modal opens / recipe changes
  useEffect(() => {
    if (!visible || !recipe) { setBaseMacros(null); setServings(baseServings); return; }
    setServings(baseServings);
    const ings = recipe.ingredients.length > 0
      ? recipe.ingredients
      : (detail?.ingredients ?? []).map((i) => ({ name: i.name, quantity: i.measure, unit: '' }));
    fetchMacros(recipe.title, ings, {
      spoonacularId: recipe.spoonacular_id ?? undefined,
      externalId: recipe.id,
    })
      .then(setBaseMacros)
      .catch(() => setBaseMacros(null));
  }, [visible, recipe?.id]);

  const adjustServings = useCallback((delta: number) => {
    setServings((prev) => Math.max(1, Math.min(20, prev + delta)));
  }, []);

  if (!recipe) return null;

  const ratio = servings / baseServings;
  const scaledMacros = baseMacros ? scaleMacros(baseMacros, ratio) : null;

  const timeStr = formatTime(recipe.prep_time_mins, recipe.cook_time_mins);
  const costStr = formatCost(recipe.cost_per_serving);
  const scaledCost = recipe.cost_per_serving != null
    ? `$${(recipe.cost_per_serving * servings).toFixed(2)}`
    : null;

  const ingredients = detail?.ingredients && detail.ingredients.length > 0
    ? detail.ingredients
    : recipe.ingredients.map((i) => ({ name: i.name, measure: i.quantity ?? '' }));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header image */}
        <View style={{ position: 'relative' }}>
          <Image
            source={{ uri: recipe.image_url ?? '' }}
            style={{ width: '100%', height: SCREEN_HEIGHT * 0.32 }}
            contentFit="cover"
          />
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={18} color="white" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
            {recipe.title}
          </Text>

          {/* Meta row */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            {recipe.cuisine ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="globe-outline" size={14} color={colors.textMuted} />
                <Text style={{ fontSize: 13, color: colors.textMuted }}>{recipe.cuisine}</Text>
              </View>
            ) : null}
            {timeStr ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={{ fontSize: 13, color: colors.textMuted }}>{timeStr}</Text>
              </View>
            ) : null}
            {recipe.avg_rating > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color="#FFB300" />
                <Text style={{ fontSize: 13, color: colors.textMuted }}>{recipe.avg_rating.toFixed(1)}</Text>
              </View>
            )}
          </View>

          {/* Serving size adjuster */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: colors.white, borderRadius: 12,
            paddingVertical: 12, paddingHorizontal: 16,
            borderWidth: 1, borderColor: colors.border,
            marginBottom: 16,
          }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Servings</Text>
              {scaledCost && (
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  {scaledCost} total · {costStr} each
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Pressable
                onPress={() => adjustServings(-1)}
                hitSlop={8}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: servings <= 1 ? colors.border : colors.primaryLight,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="remove" size={18} color={servings <= 1 ? colors.textMuted : colors.primary} />
              </Pressable>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, minWidth: 28, textAlign: 'center' }}>
                {servings}
              </Text>
              <Pressable
                onPress={() => adjustServings(1)}
                hitSlop={8}
                style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: servings >= 20 ? colors.border : colors.primaryLight,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="add" size={18} color={servings >= 20 ? colors.textMuted : colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Description */}
          {(recipe.description || detail?.blurb) ? (
            <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 20 }}>
              {recipe.description || detail!.blurb}
            </Text>
          ) : null}

          {/* Macros — scaled to selected servings */}
          {scaledMacros && (
            <View style={{ marginBottom: 20 }}>
              <MacroRow macros={scaledMacros} />
              {servings !== baseServings && (
                <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>
                  Scaled for {servings} serving{servings !== 1 ? 's' : ''} (base: {baseServings})
                </Text>
              )}
            </View>
          )}

          {/* Ingredients — quantities scaled */}
          {ingredients.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
                Ingredients
              </Text>
              <View style={{ gap: 8 }}>
                {ingredients.map((ing, i) => {
                  const measure = 'measure' in ing ? ing.measure : (ing as { quantity: string }).quantity;
                  const scaledMeasure = scaleMeasure(measure ?? '', ratio);
                  return (
                    <View
                      key={i}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingVertical: 10, paddingHorizontal: 14,
                        backgroundColor: colors.white, borderRadius: 10,
                        borderWidth: 1, borderColor: colors.border,
                      }}
                    >
                      <View style={{
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: colors.primary, marginRight: 12,
                      }} />
                      <Text style={{ flex: 1, fontSize: 14, color: colors.text, fontWeight: '500' }}>
                        {ing.name}
                      </Text>
                      {scaledMeasure ? (
                        <Text style={{ fontSize: 13, color: ratio !== 1 ? colors.primary : colors.textMuted, fontWeight: ratio !== 1 ? '600' : '400' }}>
                          {scaledMeasure}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Instructions placeholder */}
          <View style={{
            backgroundColor: colors.primaryLight,
            borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: colors.primary + '33',
            marginBottom: 20,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Ionicons name="restaurant-outline" size={16} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Full instructions</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.primary + 'CC' }}>
              Step-by-step cooking instructions are coming in Phase 2.
            </Text>
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={onSaveToggle}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 14, borderRadius: 12,
                backgroundColor: isSaved ? colors.primary : colors.white,
                borderWidth: 1.5, borderColor: isSaved ? colors.primary : colors.border,
              }}
            >
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? 'white' : colors.text} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: isSaved ? 'white' : colors.text }}>
                {isSaved ? 'Saved' : 'Save'}
              </Text>
            </Pressable>

            <Pressable
              onPress={onAddToCart}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                paddingVertical: 14, borderRadius: 12,
                backgroundColor: isInCart ? colors.primary : colors.white,
                borderWidth: 1.5, borderColor: isInCart ? colors.primary : colors.border,
              }}
            >
              <Ionicons name={isInCart ? 'cart' : 'cart-outline'} size={18} color={isInCart ? 'white' : colors.text} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: isInCart ? 'white' : colors.text }}>
                {isInCart ? 'In list' : 'Add to list'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
