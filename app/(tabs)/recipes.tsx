/**
 * recipes.tsx — My Recipes (personal library)
 * 4 sub-tabs: Saved | Cooked | Mine | Meal Prep
 * Section 18.3 spec
 */
import {
  View, Text, FlatList, Pressable, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime } from '@/lib/utils';
import { logInteraction, setRecipeLiked } from '@/lib/api';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { AvatarButton } from '@/components/AvatarButton';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import type { Recipe } from '@/types';

type SubTab = 'Saved' | 'Cooked' | 'Mine' | 'Meal Prep';
const SUB_TABS: SubTab[] = ['Saved', 'Cooked', 'Mine', 'Meal Prep'];

// ── Grid card ─────────────────────────────────────────────────────────────────
function RecipeCard({
  recipe,
  cookedCount,
  onPress,
}: {
  recipe: Recipe;
  cookedCount?: number;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, borderRadius: 14, backgroundColor: colors.card,
        borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
        margin: 4,
      }}
    >
      <Image
        source={{ uri: recipe.image_url ?? '' }}
        style={{ width: '100%', height: 100 }}
        contentFit="cover"
      />
      <View style={{ padding: 10 }}>
        {cookedCount != null && cookedCount > 0 && (
          <View style={{
            alignSelf: 'flex-start', backgroundColor: '#E8F5E9', borderRadius: 999,
            paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4,
          }}>
            <Text style={{ fontSize: 8, fontWeight: '700', color: '#2E7D32' }}>✓ Cooked {cookedCount}×</Text>
          </View>
        )}
        <Text
          style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 12, color: colors.text, lineHeight: 17 }}
          numberOfLines={2}
        >
          {recipe.title}
        </Text>
        <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {recipe.meal_prep_friendly
            ? 'Meal prep ✓'
            : [recipe.cuisine, formatTime(recipe.prep_time_mins, recipe.cook_time_mins)].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

export default function Recipes() {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const savedRecipes = useSavedStore((s) => s.savedRecipes);
  const { addFromDetail } = useGroceryStore();

  const [activeTab, setActiveTab] = useState<SubTab>('Saved');
  const [search, setSearch] = useState('');
  const [cookedRecipes, setCookedRecipes] = useState<Recipe[]>([]);
  const [cookedCounts, setCookedCounts] = useState<Map<string, number>>(new Map());
  const [mineRecipes, setMineRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [isCooked, setIsCooked] = useState(false);

  // ── Load cooked + mine data ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    loadCookedData();
    loadMineData();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCookedData() {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('recipe_interactions')
        .select('recipe_id, recipes(*)')
        .eq('user_id', userId)
        .eq('interaction_type', 'cooked')
        .order('interacted_at', { ascending: false });

      if (!data) return;
      const counts = new Map<string, number>();
      const seen = new Map<string, Recipe>();
      for (const row of data) {
        const r = (row as any).recipes;
        if (!r) continue;
        const recipe: Recipe = {
          id: r.external_id ?? r.id,
          supabase_id: r.id,
          title: r.title,
          description: r.description,
          cuisine: r.cuisine,
          source_type: r.source_type ?? 'curated',
          ingredients: r.ingredients ?? [],
          steps: r.steps ?? [],
          prep_time_mins: r.prep_time_mins,
          cook_time_mins: r.cook_time_mins,
          servings: r.servings,
          cost_per_serving: r.cost_per_serving,
          dietary_tags: r.dietary_tags ?? [],
          meal_prep_friendly: r.meal_prep_friendly,
          macros: r.macros,
          badge: r.badge ?? 'none',
          avg_rating: r.avg_rating ?? 0,
          save_count: r.save_count ?? 0,
          image_url: r.image_url,
          external_id: r.external_id,
        };
        const existing = counts.get(r.id) ?? 0;
        counts.set(r.id, existing + 1);
        if (!seen.has(r.id)) seen.set(r.id, recipe);
      }
      setCookedCounts(counts);
      const sorted = [...seen.values()].sort((a, b) => (counts.get(b.supabase_id ?? '') ?? 0) - (counts.get(a.supabase_id ?? '') ?? 0));
      setCookedRecipes(sorted);
    } catch (err) {
      console.error('loadCookedData error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMineData() {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('recipes')
        .select('*')
        .eq('submitted_by', userId)
        .order('created_at', { ascending: false });
      if (!data) return;
      setMineRecipes(data.map((r) => ({
        id: r.external_id ?? r.id,
        supabase_id: r.id,
        title: r.title,
        description: r.description,
        cuisine: r.cuisine,
        source_type: r.source_type ?? 'community',
        ingredients: r.ingredients ?? [],
        steps: r.steps ?? [],
        prep_time_mins: r.prep_time_mins,
        cook_time_mins: r.cook_time_mins,
        servings: r.servings,
        cost_per_serving: r.cost_per_serving,
        dietary_tags: r.dietary_tags ?? [],
        meal_prep_friendly: r.meal_prep_friendly,
        macros: r.macros,
        badge: r.badge ?? 'none',
        avg_rating: r.avg_rating ?? 0,
        save_count: r.save_count ?? 0,
        image_url: r.image_url,
        external_id: r.external_id,
      })));
    } catch {}
  }

  // ── Filter by search ───────────────────────────────────────────────────────
  function filtered(recipes: Recipe[]) {
    if (!search.trim()) return recipes;
    const q = search.toLowerCase();
    return recipes.filter((r) =>
      r.title.toLowerCase().includes(q) || (r.cuisine ?? '').toLowerCase().includes(q)
    );
  }

  const savedList = useMemo(() => filtered(savedRecipes), [savedRecipes, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const cookedList = useMemo(() => filtered(cookedRecipes), [cookedRecipes, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const mineList = useMemo(() => filtered(mineRecipes), [mineRecipes, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const mealPrepList = useMemo(() => filtered(savedRecipes.filter((r) => r.meal_prep_friendly)), [savedRecipes, search]); // eslint-disable-line react-hooks/exhaustive-deps

  function currentList(): Recipe[] {
    if (activeTab === 'Saved') return savedList;
    if (activeTab === 'Cooked') return cookedList;
    if (activeTab === 'Mine') return mineList;
    return mealPrepList;
  }

  function openRecipe(recipe: Recipe) {
    setSelectedRecipe(recipe);
    const cooked = cookedCounts.has(recipe.supabase_id ?? '') && (cookedCounts.get(recipe.supabase_id ?? '') ?? 0) > 0;
    setIsCooked(cooked);
    setDetailVisible(true);
    if (userId && recipe.supabase_id) {
      logInteraction(userId, recipe.supabase_id, 'view').catch(() => {});
    }
  }

  const isSaved = useCallback((r: Recipe) =>
    savedRecipes.some((s) => s.supabase_id === r.supabase_id || s.id === r.id),
    [savedRecipes]);

  const list = currentList();

  function renderEmpty() {
    const colors_inner = colors;
    const messages: Record<SubTab, { icon: string; title: string; sub: string }> = {
      Saved: { icon: 'bookmark-outline', title: 'No saved recipes yet', sub: 'Swipe right on recipes in Discover to save them here.' },
      Cooked: { icon: 'restaurant-outline', title: 'Nothing cooked yet', sub: 'Mark a recipe as cooked to see it here.' },
      Mine: { icon: 'create-outline', title: 'No recipes submitted yet', sub: 'Use the + button to add your first recipe.' },
      'Meal Prep': { icon: 'flash-outline', title: 'No meal prep recipes saved', sub: 'Save meal-prep-friendly recipes from Discover.' },
    };
    const m = messages[activeTab];
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 }}>
        <Ionicons name={m.icon as any} size={48} color={colors_inner.border} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors_inner.text, textAlign: 'center' }}>{m.title}</Text>
        <Text style={{ fontSize: 14, color: colors_inner.textMuted, textAlign: 'center', lineHeight: 21 }}>{m.sub}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>My Recipes</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AvatarButton />
          </View>
        </View>

        {/* Search bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: colors.card, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border,
          paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
        }}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Search your recipes..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, fontSize: 15, color: colors.text }}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Segmented control */}
        <View style={{
          flexDirection: 'row', backgroundColor: colors.border + '4D',
          borderRadius: 10, padding: 3, height: 36,
        }}>
          {SUB_TABS.map((tab) => {
            const active = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? colors.card : 'transparent',
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: active ? '700' : '400',
                  color: active ? colors.text : colors.textMuted,
                }}>
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Content */}
      {loading && activeTab === 'Cooked' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : list.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.supabase_id ?? item.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item}
              cookedCount={cookedCounts.get(item.supabase_id ?? '')}
              onPress={() => openRecipe(item)}
            />
          )}
        />
      )}

      {/* Recipe detail */}
      <RecipeDetailModal
        visible={detailVisible}
        recipe={selectedRecipe}
        detail={null}
        isSaved={selectedRecipe ? isSaved(selectedRecipe) : false}
        isInCart={false}
        isCooked={isCooked}
        onClose={() => setDetailVisible(false)}
        onSaveToggle={() => {
          if (!selectedRecipe || !userId) return;
          const id = selectedRecipe.supabase_id ?? selectedRecipe.id;
          setRecipeLiked(userId, id, !isSaved(selectedRecipe)).catch(() => {});
        }}
        onAddToCart={() => {
          if (selectedRecipe) {
            const ingredients = (selectedRecipe.ingredients ?? []).map((i) => ({ name: i.name, measure: `${i.quantity ?? ''} ${i.unit ?? ''}`.trim() }));
            addFromDetail(selectedRecipe, ingredients);
          }
        }}
      />
    </SafeAreaView>
  );
}
