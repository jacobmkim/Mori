import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { getRecipeById } from '@/lib/api';
import { fetchMealDetail, type MealDetail } from '@/lib/mealdb';
import { useSavedStore } from '@/stores/savedStore';
import { useUserStore } from '@/stores/userStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import { useTheme } from '@/hooks/useTheme';
import type { Recipe } from '@/types';

// Screen behind `mori://r/<uuid>` deep links and the in-app `/recipe/[id]`
// route. Fetches the recipe and opens RecipeDetailModal so the recipient
// can save / view / cook via the existing flows.

export default function RecipeShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const savedRecipes = useSavedStore((s) => s.savedRecipes);
  const { addRecipe, removeRecipe } = useSavedStore();
  const addFromDetail = useGroceryStore((s) => s.addFromDetail);
  const removeRecipeFromList = useGroceryStore((s) => s.removeRecipeFromList);
  const selectedRecipes = useGroceryStore((s) => s.selectedRecipes);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [detail, setDetail] = useState<MealDetail | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      try {
        const row = await getRecipeById(id);
        if (cancelled) return;
        if (!row || row.is_public === false) {
          setNotFound(true);
          return;
        }
        setRecipe({ ...row, supabase_id: row.id });
        // MealDB-style detail enrichment is curated-only; community recipes
        // already carry their ingredients/steps on the row.
        if (row.external_id) {
          const d = await fetchMealDetail(row.external_id).catch(() => null);
          if (!cancelled) setDetail(d);
        } else {
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  function close() {
    router.canGoBack() ? router.back() : router.replace('/(tabs)/discover');
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (notFound || !recipe) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="restaurant-outline" size={56} color={colors.border} />
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 24, color: colors.text, marginTop: 16, textAlign: 'center' }}>
          Recipe not found
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
          This recipe may have been removed or kept private.
        </Text>
        <Pressable
          onPress={close}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 28,
            marginTop: 24,
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Browse recipes</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const saved = savedRecipes.some((s) => s.supabase_id === recipe.supabase_id || s.id === recipe.id);
  const inCart = selectedRecipes.some((r) => r.id === recipe.id);

  return (
    <RecipeDetailModal
      visible
      recipe={recipe}
      detail={detail}
      isSaved={saved}
      isInCart={inCart}
      onClose={close}
      onSaveToggle={() => {
        if (saved) removeRecipe(recipe, userId);
        else addRecipe(recipe, userId);
      }}
      onAddToCart={(scaledIngredients) => addFromDetail(recipe, scaledIngredients)}
      onRemoveFromCart={() => removeRecipeFromList(recipe.id)}
    />
  );
}
