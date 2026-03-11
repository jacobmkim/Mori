import {
  View, Text, Modal, Pressable, ScrollView, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { colors } from '@/constants/theme';
import { formatTime, formatCost } from '@/lib/utils';
import { fetchMacros } from '@/lib/api';
import { MacroRow } from '@/components/ui/MacroRow';
import type { Recipe, Macros } from '@/types';
import type { MealDetail } from '@/lib/mealdb';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const [macros, setMacros] = useState<Macros | null>(null);

  useEffect(() => {
    if (!visible || !recipe) { setMacros(null); return; }
    // recipe.ingredients is empty for TheMealDB cards — use detail.ingredients if available
    const ings = recipe.ingredients.length > 0
      ? recipe.ingredients
      : (detail?.ingredients ?? []).map((i) => ({ name: i.name, quantity: i.measure, unit: '' }));
    fetchMacros(recipe.title, ings, {
      spoonacularId: recipe.spoonacular_id ?? undefined,
      externalId: recipe.id,
    })
      .then(setMacros)
      .catch(() => setMacros(null));
  }, [visible, recipe?.id]);

  if (!recipe) return null;

  const timeStr = formatTime(recipe.prep_time_mins, recipe.cook_time_mins);
  const costStr = formatCost(recipe.cost_per_serving);

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
          {/* Close button */}
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
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
            {costStr ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
                <Text style={{ fontSize: 13, color: colors.textMuted }}>{costStr} / serving</Text>
              </View>
            ) : null}
            {recipe.avg_rating > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={14} color="#FFB300" />
                <Text style={{ fontSize: 13, color: colors.textMuted }}>{recipe.avg_rating.toFixed(1)}</Text>
              </View>
            )}
          </View>

          {/* Description — prefer recipe.description, fall back to detail blurb */}
          {(recipe.description || detail?.blurb) ? (
            <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 20 }}>
              {recipe.description || detail!.blurb}
            </Text>
          ) : null}

          {macros && (
            <View style={{ marginBottom: 20 }}>
              <MacroRow macros={macros} />
            </View>
          )}

          {/* Ingredients */}
          {detail?.ingredients && detail.ingredients.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
                Ingredients
              </Text>
              <View style={{ gap: 8 }}>
                {detail.ingredients.map((ing, i) => (
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
                    {ing.measure ? (
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>
                        {ing.measure}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Instructions placeholder — Phase 2 */}
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
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={isSaved ? 'white' : colors.text}
              />
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
              <Ionicons
                name={isInCart ? 'cart' : 'cart-outline'}
                size={18}
                color={isInCart ? 'white' : colors.text}
              />
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
