/**
 * recipes.tsx — My Recipes (personal library)
 * 3 sub-tabs: Saved | Cooked | Mine
 * Section 18.3 spec
 */
import {
  View, Text, FlatList, Pressable, TextInput, ActivityIndicator, ScrollView, Modal, Alert,
  Animated,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime } from '@/lib/utils';
import { logInteraction, setRecipeLiked, resolveSupabaseId, updateStreakAndCount } from '@/lib/api';
import { getNewlyEarned, type Badge, type BadgeStats } from '@/lib/badges';
import { BadgeAchievementModal } from '@/components/badges/BadgeAchievementModal';

// ── Filter constants ───────────────────────────────────────────────────────────
const CUISINE_OPTIONS = [
  'Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian',
  'American', 'Mediterranean', 'Thai', 'French', 'Greek', 'Korean', 'Middle Eastern',
];
const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten Free', 'Dairy Free', 'Keto', 'Paleo'];
const PROTEIN_OPTIONS = ['Chicken', 'Beef', 'Pork', 'Seafood', 'Lamb', 'Plant-Based'];
const TIME_OPTIONS = ['Quick (≤30 min)', 'Meal Prep Friendly', 'High Protein', 'Low Carb'];
const FILTER_SECTIONS = [
  { title: 'Cuisine',      options: CUISINE_OPTIONS  },
  { title: 'Dietary',      options: DIETARY_OPTIONS  },
  { title: 'Protein Type', options: PROTEIN_OPTIONS  },
  { title: 'Time & Prep',  options: TIME_OPTIONS     },
];
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useUserStore } from '@/stores/userStore';

import { supabase } from '@/lib/supabase';
import { AvatarButton } from '@/components/AvatarButton';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import { AddRecipeWizard } from '@/components/AddRecipeWizard';
import type { Recipe } from '@/types';

type SubTab = 'Saved' | 'Cooked' | 'Mine';
const SUB_TABS: SubTab[] = ['Saved', 'Cooked', 'Mine'];

// ── Grid card ─────────────────────────────────────────────────────────────────
function RecipeCard({
  recipe,
  cookedCount,
  currentUserId,
  onPress,
  onLongPress,
  deleteMode,
  selected,
  onToggleSelect,
}: {
  recipe: Recipe;
  cookedCount?: number;
  currentUserId?: string;
  onPress: () => void;
  onLongPress?: () => void;
  deleteMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const colors = useTheme();
  const totalMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);
  const isQuick = totalMins > 0 && totalMins <= 30;
  const isMealPrep = recipe.meal_prep_friendly === true;
  const isHighProtein = !!(recipe.dietary_tags?.includes('high_protein') || (recipe.macros as any)?.protein >= 25);
  const isLowCarb = !!(recipe.dietary_tags?.includes('low_carb') || (recipe.macros as any)?.carbohydrates <= 30);
  return (
    <Pressable
      onPress={deleteMode ? onToggleSelect : onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{
        flex: 1, borderRadius: 14,
        backgroundColor: colors.card,
        borderWidth: selected ? 2 : 0.5,
        borderColor: selected ? colors.primary : colors.border,
        overflow: 'hidden', margin: 4,
        opacity: deleteMode && !selected ? 0.55 : 1,
      }}
    >
      {/* Selection checkmark */}
      {deleteMode && (
        <View style={{
          position: 'absolute', top: 6, right: 6, zIndex: 10,
          shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
        }}>
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={selected ? colors.primary : 'rgba(255,255,255,0.9)'}
          />
        </View>
      )}
      {/* Selected tint overlay */}
      {selected && (
        <View style={{
          position: 'absolute', inset: 0, zIndex: 1,
          backgroundColor: colors.primary + '18',
          borderRadius: 12,
        }} pointerEvents="none" />
      )}
      <Image
        source={{ uri: recipe.image_url || undefined }}
        style={{ width: '100%', height: 100 }}
        contentFit="cover"
      />
      <View style={{ padding: 10 }}>
        {/* Moderation gates were removed 2026-05-11 — only the Private badge
            remains, gated on is_public=false. */}
        {recipe.is_public === false && (
          <View style={{
            alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: 999,
            paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4,
          }}>
            <Text style={{ fontSize: 8, fontWeight: '700', color: colors.primary }}>Private</Text>
          </View>
        )}
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
        {recipe.source_type === 'community' && (recipe.submitter_username || recipe.submitter_name) && (
          <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            By {recipe.submitter_username ? `@${recipe.submitter_username}` : recipe.submitter_name}
          </Text>
        )}
        {recipe.source_type === 'community' && recipe.submitted_by === currentUserId && (
          <Text style={{ fontSize: 9, color: colors.primary, marginTop: 3, fontWeight: '600' }}>
            {recipe.save_count > 0 ? `${recipe.save_count} saves` : ''}
            {recipe.save_count > 0 && (recipe.rating_count ?? 0) > 0 ? ' · ' : ''}
            {(recipe.rating_count ?? 0) > 0 ? `★ ${Number(recipe.avg_rating).toFixed(1)}` : ''}
          </Text>
        )}

        {/* Public rating — shown to all viewers once the recipe has 3+ ratings. */}
        {(recipe.rating_count ?? 0) >= 3 && recipe.submitted_by !== currentUserId && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <Ionicons name="star" size={9} color="#FFC107" />
            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>
              {Number(recipe.avg_rating).toFixed(1)} ({recipe.rating_count})
            </Text>
          </View>
        )}
        {!(recipe.source_type === 'community' && recipe.submitted_by === currentUserId)
          && (recipe.rating_count ?? 0) >= 3 && (
          <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 3, fontWeight: '600' }}>
            ★ {Number(recipe.avg_rating).toFixed(1)} ({recipe.rating_count})
          </Text>
        )}
        <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {[
            recipe.cuisine ? recipe.cuisine.split(',').map(c => c.trim()).join(', ') : null,
            formatTime(recipe.prep_time_mins, recipe.cook_time_mins),
          ].filter(Boolean).join(' · ')}
        </Text>
        {(recipe.source_type === 'community' || isMealPrep || isQuick || isHighProtein || isLowCarb) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 }}>
            {recipe.source_type === 'community' && (
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginBottom: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>Community</Text>
              </View>
            )}
            {isMealPrep && (
              <View style={{ backgroundColor: '#2E5438', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginBottom: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>Meal Prep</Text>
              </View>
            )}
            {isQuick && (
              <View style={{ backgroundColor: '#FFF3E0', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginBottom: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#E65100' }}>Quick</Text>
              </View>
            )}
            {isHighProtein && (
              <View style={{ backgroundColor: '#E3F2FD', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4, marginBottom: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#1565C0' }}>High Protein</Text>
              </View>
            )}
            {isLowCarb && (
              <View style={{ backgroundColor: '#F3E5F5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#6A1B9A' }}>Low Carb</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function Recipes() {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const { savedRecipes, addRecipe, removeRecipe, mealPrepIds } = useSavedStore();
  const { addFromDetail, selectedRecipes, removeRecipeFromList } = useGroceryStore();


  const [activeTab, setActiveTab] = useState<SubTab>('Saved');
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [cookedRecipes, setCookedRecipes] = useState<Recipe[]>([]);
  const [cookedCounts, setCookedCounts] = useState<Map<string, number>>(new Map());
  const [mineRecipes, setMineRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);

  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Exit delete mode when switching tabs
  useEffect(() => { setDeleteMode(false); setSelectedIds(new Set()); }, [activeTab]);

  function exitDeleteMode() { setDeleteMode(false); setSelectedIds(new Set()); }

  function toggleSelect(recipe: Recipe) {
    const key = recipe.supabase_id ?? recipe.id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (activeTab === 'Saved') {
      const toRemove = savedRecipes.filter((r) => selectedIds.has(r.supabase_id ?? r.id));
      for (const r of toRemove) { if (userId) removeRecipe(r, userId); }
      exitDeleteMode();
    } else if (activeTab === 'Mine') {
      Alert.alert(
        `Delete ${selectedIds.size} recipe${selectedIds.size > 1 ? 's' : ''}?`,
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive',
            onPress: async () => {
              const ids = [...selectedIds];
              const { error } = await supabase
                .from('recipes')
                .update({ deleted_at: new Date().toISOString() })
                .in('id', ids)
                .eq('submitted_by', userId ?? '');
              if (error) {
                Alert.alert('Could not delete', error.message);
                return;
              }
              loadMineData();
              exitDeleteMode();
            },
          },
        ]
      );
    }
  }

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [isCooked, setIsCooked] = useState(false);
  const [badgeQueue, setBadgeQueue] = useState<Badge[]>([]);
  const [wizardVisible, setWizardVisible] = useState(false);
  const [savedToastVisible, setSavedToastVisible] = useState(false);
  const savedToastOpacity = useRef(new Animated.Value(0)).current;

  function showSavedToast() {
    setSavedToastVisible(true);
    savedToastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(savedToastOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(savedToastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setSavedToastVisible(false));
  }

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
        .is('deleted_at', null)
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
        is_public: r.is_public ?? true,
        moderation_status: r.moderation_status ?? null,
        submitted_by: r.submitted_by ?? null,
      })));
    } catch {}
  }

  // ── Filter by search + active filters ────────────────────────────────────
  function filtered(recipes: Recipe[]) {
    let list = recipes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || (r.cuisine ?? '').toLowerCase().includes(q));
    }
    if (activeFilters.size === 0) return list;

    // Cuisine (OR within section)
    const cuisineSel = CUISINE_OPTIONS.filter((c) => activeFilters.has(c));
    if (cuisineSel.length > 0)
      list = list.filter((r) => cuisineSel.some((c) => (r.cuisine ?? '').toLowerCase().includes(c.toLowerCase())));

    // Dietary (OR within section)
    const dietarySel = DIETARY_OPTIONS.filter((d) => activeFilters.has(d));
    if (dietarySel.length > 0)
      list = list.filter((r) => dietarySel.some((d) => {
        if (d === 'Vegetarian') return r.dietary_tags?.includes('vegetarian') || r.dietary_tags?.includes('vegan');
        if (d === 'Vegan')      return r.dietary_tags?.includes('vegan');
        if (d === 'Gluten Free')return r.dietary_tags?.includes('gluten_free');
        if (d === 'Dairy Free') return r.dietary_tags?.includes('dairy_free');
        if (d === 'Keto')       return r.dietary_tags?.includes('keto');
        if (d === 'Paleo')      return r.dietary_tags?.includes('paleo');
        return false;
      }));

    // Protein Type (OR within section) — keyword match on title + ingredients
    const proteinSel = PROTEIN_OPTIONS.filter((p) => activeFilters.has(p));
    if (proteinSel.length > 0)
      list = list.filter((r) => {
        const text = [r.title, ...(r.ingredients ?? []).map((i) => i.name ?? '')].join(' ').toLowerCase();
        return proteinSel.some((p) => {
          if (p === 'Chicken')     return text.includes('chicken');
          if (p === 'Beef')        return text.includes('beef') || text.includes('steak');
          if (p === 'Pork')        return text.includes('pork') || text.includes('bacon') || text.includes('ham');
          if (p === 'Seafood')     return text.includes('salmon') || text.includes('shrimp') || text.includes('fish') || text.includes('tuna') || text.includes('cod') || text.includes('seafood');
          if (p === 'Lamb')        return text.includes('lamb');
          if (p === 'Plant-Based') return r.dietary_tags?.includes('vegan') || r.dietary_tags?.includes('vegetarian');
          return false;
        });
      });

    // Time & Prep (AND — every selected filter must match)
    const timeSel = TIME_OPTIONS.filter((t) => activeFilters.has(t));
    if (timeSel.length > 0)
      list = list.filter((r) => timeSel.every((t) => {
        if (t === 'Quick (≤30 min)')    return ((r.prep_time_mins ?? 99) + (r.cook_time_mins ?? 99)) <= 30;
        if (t === 'Meal Prep Friendly') return r.meal_prep_friendly === true;
        if (t === 'High Protein')       return r.dietary_tags?.includes('high_protein') || (r.macros as any)?.protein >= 25;
        if (t === 'Low Carb')           return r.dietary_tags?.includes('low_carb') || (r.macros as any)?.carbohydrates <= 30;
        return false;
      }));

    return list;
  }

  function toggleFilter(key: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const savedList = useMemo(() => filtered(savedRecipes), [savedRecipes, search, activeFilters]);
  const cookedList = useMemo(() => filtered(cookedRecipes), [cookedRecipes, search, activeFilters]);
  const mineList = useMemo(() => filtered(mineRecipes), [mineRecipes, search, activeFilters]);

  function currentList(): Recipe[] {
    if (activeTab === 'Saved') return savedList;
    if (activeTab === 'Cooked') return cookedList;
    return mineList;
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
  const displayList: (Recipe | null)[] = list.length % 2 !== 0 ? [...list, null] : list;

  function renderEmpty() {
    const colors_inner = colors;
    const messages: Record<SubTab, { icon: string; title: string; sub: string }> = {
      Saved: { icon: 'bookmark-outline', title: 'No saved recipes yet', sub: 'Swipe right on recipes in Discover to save them here.' },
      Cooked: { icon: 'restaurant-outline', title: 'Nothing cooked yet', sub: 'Mark a recipe as cooked to see it here.' },
      Mine: { icon: 'create-outline', title: 'No recipes submitted yet', sub: 'Use the + button to add your first recipe.' },
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
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>My Recipes</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {deleteMode ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable
                  onPress={handleDeleteSelected}
                  disabled={selectedIds.size === 0}
                  style={{
                    backgroundColor: selectedIds.size > 0 ? '#FF3B30' : colors.border,
                    borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
                    {selectedIds.size > 0 ? `Delete (${selectedIds.size})` : 'Delete'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={exitDeleteMode}
                  style={{
                    backgroundColor: colors.card, borderRadius: 999,
                    paddingHorizontal: 11, paddingVertical: 5,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setWizardVisible(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: colors.primary, borderRadius: 999,
                  paddingHorizontal: 12, paddingVertical: 7,
                }}
              >
                <Ionicons name="add" size={15} color="white" />
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>My Recipe</Text>
              </Pressable>
            )}
            <AvatarButton />
          </View>
        </View>

        {/* Search bar + filter button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 12, paddingVertical: 10,
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
          <Pressable
            onPress={() => setFilterSheetVisible(true)}
            hitSlop={6}
            style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: activeFilters.size > 0 ? colors.primary : colors.card,
              borderWidth: 1, borderColor: activeFilters.size > 0 ? colors.primary : colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="options-outline" size={20} color={activeFilters.size > 0 ? 'white' : colors.textMuted} />
            {activeFilters.size > 0 && (
              <View style={{
                position: 'absolute', top: -4, right: -4,
                backgroundColor: colors.primary, borderRadius: 999,
                minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: colors.background,
              }}>
                <Text style={{ color: 'white', fontSize: 9, fontWeight: '700' }}>{activeFilters.size}</Text>
              </View>
            )}
          </Pressable>
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

        {/* Quick-filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ height: 36, marginTop: 10, marginHorizontal: -16 }}
          contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}
        >
          {([
            { label: 'Meal Prep', key: 'Meal Prep Friendly' },
            { label: 'Quick ≤30 min', key: 'Quick (≤30 min)' },
            { label: 'High Protein', key: 'High Protein' },
            { label: 'Low Carb', key: 'Low Carb' },
          ] as { label: string; key: string }[]).map(({ label, key }) => {
            const active = activeFilters.has(key);
            return (
              <Pressable
                key={key}
                onPress={() => toggleFilter(key)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 12, paddingVertical: 5,
                  marginRight: 8,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : colors.textMuted }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
          data={displayList}
          keyExtractor={(item) => item ? (item.supabase_id ?? item.id) : '__ghost'}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100 }}
          renderItem={({ item }) =>
            item ? (
              <RecipeCard
                recipe={item}
                cookedCount={cookedCounts.get(item.supabase_id ?? '')}
                currentUserId={userId}
                onPress={() => openRecipe(item)}
                onLongPress={() => {
                  if (activeTab === 'Cooked') return;
                  setDeleteMode(true);
                  setSelectedIds(new Set([item.supabase_id ?? item.id]));
                }}
                deleteMode={deleteMode && activeTab !== 'Cooked'}
                selected={selectedIds.has(item.supabase_id ?? item.id)}
                onToggleSelect={() => toggleSelect(item)}
              />
            ) : (
              <View style={{ flex: 1, margin: 4 }} />
            )
          }
        />
      )}

      {/* Filter sheet */}
      <Modal
        visible={filterSheetVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFilterSheetVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Filter Recipes</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              {activeFilters.size > 0 && (
                <Pressable onPress={() => setActiveFilters(new Set())} hitSlop={8}>
                  <Text style={{ color: colors.textMuted, fontSize: 15 }}>Clear</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setFilterSheetVisible(false)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 }}>
            {FILTER_SECTIONS.map((section) => {
              const sectionActive = section.options.filter((o) => activeFilters.has(o)).length;
              return (
                <View key={section.title} style={{
                  marginTop: 16,
                  borderRadius: 14,
                  backgroundColor: colors.card,
                  borderWidth: 1, borderColor: colors.border,
                  overflow: 'hidden',
                }}>
                  {/* Section header */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 16, paddingVertical: 11,
                    backgroundColor: colors.primaryLight,
                    borderBottomWidth: 1, borderBottomColor: colors.border,
                  }}>
                    <Text style={{
                      fontSize: 12, fontWeight: '700', color: colors.primary,
                      textTransform: 'uppercase', letterSpacing: 0.9,
                    }}>
                      {section.title}
                    </Text>
                    {sectionActive > 0 && (
                      <View style={{
                        backgroundColor: colors.primary, borderRadius: 999,
                        paddingHorizontal: 8, paddingVertical: 2,
                      }}>
                        <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>{sectionActive}</Text>
                      </View>
                    )}
                  </View>
                  {/* Options */}
                  {section.options.map((opt, idx) => {
                    const selected = activeFilters.has(opt);
                    const isLast = idx === section.options.length - 1;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => toggleFilter(opt)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          paddingHorizontal: 16, paddingVertical: 13,
                          backgroundColor: selected ? colors.primaryLight : 'transparent',
                          borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 15, color: selected ? colors.primary : colors.text, fontWeight: selected ? '600' : '400' }}>
                          {opt}
                        </Text>
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={21}
                          color={selected ? colors.primary : colors.border}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Recipe detail */}
      <RecipeDetailModal
        visible={detailVisible}
        recipe={selectedRecipe}
        detail={null}
        isSaved={selectedRecipe ? isSaved(selectedRecipe) : false}
        isInCart={selectedRecipe ? selectedRecipes.some((r) => r.id === selectedRecipe.id) : false}
        isCooked={isCooked}
        onClose={() => setDetailVisible(false)}
        onSaveToggle={() => {
          if (!selectedRecipe || !userId) return;
          if (isSaved(selectedRecipe)) removeRecipe(selectedRecipe, userId);
          else addRecipe(selectedRecipe, userId);
        }}
        onAddToCart={(scaledIngredients) => {
          if (!selectedRecipe) return;
          addFromDetail(selectedRecipe, scaledIngredients);
        }}
        onRemoveFromCart={() => { if (selectedRecipe) removeRecipeFromList(selectedRecipe.id); }}
        onMarkCooked={() => {
          if (!selectedRecipe || !userId) return;
          setIsCooked(true);
          // Cooking it = ingredients are spent; clear from the grocery list
          // (no-op if it wasn't on the list — see groceryStore).
          removeRecipeFromList(selectedRecipe.id);
          const profile = useUserStore.getState().profile;
          const preCooked = profile?.meals_cooked_count ?? 0;
          const preLongest = profile?.longest_streak ?? 0;
          resolveSupabaseId(selectedRecipe)
            .then((supabaseId) => {
              logInteraction(userId, supabaseId, 'cooked').catch(() => {});
              updateStreakAndCount(userId).then((updates) => {
                if (updates && profile) {
                  useUserStore.getState().setProfile({ ...profile, ...updates });
                  const base: Partial<BadgeStats> = { distinctCuisines: 0, cookedMealPrep: false, recipesSubmitted: 0, totalSavesEarned: 0, totalCooksEarned: 0 };
                  const prevStats: BadgeStats = { totalCooked: preCooked, longestStreak: preLongest, ...base } as BadgeStats;
                  const nextStats: BadgeStats = { totalCooked: updates.meals_cooked_count, longestStreak: updates.longest_streak, ...base } as BadgeStats;
                  const newBadges = getNewlyEarned(prevStats, nextStats);
                  if (newBadges.length) setBadgeQueue(newBadges);
                }
              }).catch(() => {});
            })
            .catch(() => {});
        }}
      />

      <BadgeAchievementModal queue={badgeQueue} onQueueChange={setBadgeQueue} />

      {/* Add Recipe Wizard */}
      <AddRecipeWizard
        visible={wizardVisible}
        userId={userId ?? ''}
        onClose={() => setWizardVisible(false)}
        onSuccess={(recipe) => {
          setWizardVisible(false);
          loadMineData();
          showSavedToast();
          setTimeout(() => {
            setSelectedRecipe(recipe);
            setIsCooked(false);
            setDetailVisible(true);
          }, 400);
        }}
      />

      {/* "Recipe saved!" toast */}
      {savedToastVisible && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', bottom: 100, alignSelf: 'center',
            opacity: savedToastOpacity,
            backgroundColor: colors.primary, borderRadius: 999,
            paddingHorizontal: 16, paddingVertical: 8,
            flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 99,
          }}
        >
          <Ionicons name="checkmark-circle" size={16} color="white" />
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Recipe saved!</Text>
        </Animated.View>
      )}

    </SafeAreaView>
  );
}
