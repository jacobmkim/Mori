/**
 * explore.tsx
 * Editorial browse screen — full recipe catalogue in curated sections.
 * Replaces the old flat "All" recipes grid.
 */
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime } from '@/lib/utils';
import { fetchTrendingRecipeIds, logInteraction, resolveSupabaseId, updateStreakAndCount } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { supabase } from '@/lib/supabase';
import { AvatarButton } from '@/components/AvatarButton';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import { BadgeAchievementModal } from '@/components/badges/BadgeAchievementModal';
import { getNewlyEarned, type Badge, type BadgeStats } from '@/lib/badges';
import type { Recipe } from '@/types';
import { CUISINES } from '@/constants/cuisines';

const FILTER_CHIPS = ['All', 'Quick', 'High Protein', 'Meal Prep', 'Vegetarian', 'Vegan'];

function toRecipe(row: any): Recipe {
  return {
    id: row.external_id ?? row.id,
    supabase_id: row.id,
    title: row.title,
    description: row.description,
    cuisine: row.cuisine,
    source_type: row.source_type ?? 'curated',
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? [],
    prep_time_mins: row.prep_time_mins,
    cook_time_mins: row.cook_time_mins,
    servings: row.servings,
    cost_per_serving: row.cost_per_serving,
    dietary_tags: row.dietary_tags ?? [],
    meal_prep_friendly: row.meal_prep_friendly,
    macros: row.macros,
    badge: row.badge ?? 'none',
    avg_rating: row.avg_rating ?? 0,
    save_count: row.save_count ?? 0,
    image_url: row.image_url,
    external_id: row.external_id,
    created_at: row.created_at,
  };
}

// ── Small horizontal recipe card ──────────────────────────────────────────────
function HorizontalCard({
  recipe, badge, badgeStyle, onPress,
}: {
  recipe: Recipe;
  badge?: string;
  badgeStyle?: { bg: string; text: string };
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 140, borderRadius: 14, backgroundColor: colors.card,
        borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden', marginRight: 10,
      }}
    >
      <Image
        source={{ uri: recipe.image_url ?? '' }}
        style={{ width: 140, height: 90 }}
        contentFit="cover"
      />
      <View style={{ padding: 10 }}>
        {badge && badgeStyle && (
          <View style={{
            alignSelf: 'flex-start', backgroundColor: badgeStyle.bg,
            borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4,
          }}>
            <Text style={{ fontSize: 7, fontWeight: '700', color: badgeStyle.text }}>{badge}</Text>
          </View>
        )}
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 12, color: colors.text }} numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
          {[recipe.cuisine, formatTime(recipe.prep_time_mins, recipe.cook_time_mins)].filter(Boolean).join(' · ')}
        </Text>
        {(recipe.rating_count ?? 0) >= 3 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <Ionicons name="star" size={9} color="#FFC107" />
            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>
              {Number(recipe.avg_rating).toFixed(1)} ({recipe.rating_count})
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── 2-column grid card ─────────────────────────────────────────────────────────
function GridCard({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, borderRadius: 14, backgroundColor: colors.card,
        borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
      }}
    >
      <Image
        source={{ uri: recipe.image_url ?? '' }}
        style={{ width: '100%', height: 100 }}
        contentFit="cover"
      />
      <View style={{ padding: 10 }}>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 12, color: colors.text }} numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}
        </Text>
        {(recipe.rating_count ?? 0) >= 3 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <Ionicons name="star" size={9} color="#FFC107" />
            <Text style={{ fontSize: 9, color: colors.textMuted, fontWeight: '600' }}>
              {Number(recipe.avg_rating).toFixed(1)} ({recipe.rating_count})
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 24 }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '500' }}>See all</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function Explore() {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const dietaryGoals = useUserStore((s) => s.profile?.dietary_goals) ?? [];
  const { savedRecipes, addRecipe, removeRecipe } = useSavedStore();
  const { addFromDetail, selectedRecipes, removeRecipeFromList } = useGroceryStore();

  const [activeFilter, setActiveFilter] = useState('All');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Recipe[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [trendingRecipes, setTrendingRecipes] = useState<Recipe[]>([]);
  const [justAdded, setJustAdded] = useState<Recipe[]>([]);
  const [quickRecipes, setQuickRecipes] = useState<Recipe[]>([]);
  const [highProtein, setHighProtein] = useState<Recipe[]>([]);
  const [cookedAgain, setCookedAgain] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [badgeQueue, setBadgeQueue] = useState<Badge[]>([]);

  const isSaved = useCallback((r: Recipe) =>
    savedRecipes.some((s) => s.supabase_id === r.supabase_id || s.id === r.id),
    [savedRecipes]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const [trendingIds, justAddedRes, quickRes, proteinRes, cookedRes] = await Promise.all([
        fetchTrendingRecipeIds(),
        supabase.from('recipes').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(10),
        supabase.from('recipes').select('*')
          .lte('prep_time_mins', 20)
          .lte('cook_time_mins', 20)
          .is('deleted_at', null)
          .order('save_count', { ascending: false })
          .limit(6),
        dietaryGoals.includes('high_protein')
          ? supabase.from('recipes').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(10)
          : Promise.resolve({ data: [], error: null }),
        userId
          ? supabase.from('recipe_interactions')
            .select('recipe_id, recipes(*)')
            .eq('user_id', userId)
            .eq('interaction_type', 'cooked')
            .order('interacted_at', { ascending: false })
            .limit(20)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Trending — fetch actual recipe rows for trending IDs
      if (trendingIds.size > 0) {
        const ids = [...trendingIds].slice(0, 10);
        const { data: trendRows } = await supabase
          .from('recipes').select('*').in('id', ids).is('deleted_at', null);
        setTrendingRecipes((trendRows ?? []).map(toRecipe));
      }

      setJustAdded((justAddedRes.data ?? []).map(toRecipe));
      setQuickRecipes((quickRes.data ?? []).map(toRecipe));
      setHighProtein((proteinRes.data ?? []).map(toRecipe));

      // Cooked again — deduplicate by recipe_id, count occurrences
      if (cookedRes.data && cookedRes.data.length > 0) {
        const counts = new Map<string, { recipe: any; count: number }>();
        for (const row of cookedRes.data) {
          const recipe = (row as any).recipes;
          if (!recipe) continue;
          const existing = counts.get(recipe.id);
          if (existing) existing.count++;
          else counts.set(recipe.id, { recipe, count: 1 });
        }
        const sorted = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
        setCookedAgain(sorted.map((s) => ({ ...toRecipe(s.recipe), _cookedCount: s.count } as any)));
      }
    } catch (err) {
      console.error('Explore loadData error:', err);
    } finally {
      setLoading(false);
    }
  }

  // ── Filter recipes by active chip ─────────────────────────────────────────
  function applyFilter(recipes: Recipe[]): Recipe[] {
    if (activeFilter === 'All') return recipes;
    if (activeFilter === 'Quick') return recipes.filter((r) => ((r.prep_time_mins ?? 99) + (r.cook_time_mins ?? 99)) <= 30);
    if (activeFilter === 'High Protein') return recipes.filter((r) => r.dietary_tags?.includes('high_protein') || (r.macros as any)?.protein >= 25);
    if (activeFilter === 'Meal Prep') return recipes.filter((r) => r.meal_prep_friendly);
    if (activeFilter === 'Vegetarian') return recipes.filter((r) => r.dietary_tags?.includes('vegetarian'));
    if (activeFilter === 'Vegan') return recipes.filter((r) => r.dietary_tags?.includes('vegan'));
    return recipes;
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await supabase
          .from('recipes')
          .select('*')
          .ilike('title', `%${searchQuery}%`)
          .is('deleted_at', null)
          .limit(40);
        setSearchResults((data ?? []).map(toRecipe));
      } catch { } finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function openRecipe(recipe: Recipe) {
    setSelectedRecipe(recipe);
    setDetailVisible(true);
    if (userId && recipe.supabase_id) {
      logInteraction(userId, recipe.supabase_id, 'view').catch(() => {});
    }
  }

  const totalCount = 1041; // displayed in search placeholder

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>Explore</Text>
          <AvatarButton />
        </View>

        {/* Search bar */}
        <Pressable
          onPress={() => setSearchVisible(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
          }}
        >
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <Text style={{ fontSize: 15, color: colors.textMuted }}>Search {totalCount} recipes...</Text>
        </Pressable>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row' }}>
          {FILTER_CHIPS.map((chip) => {
            const active = activeFilter === chip;
            return (
              <Pressable
                key={chip}
                onPress={() => setActiveFilter(chip)}
                style={{
                  height: 32, paddingHorizontal: 14, borderRadius: 999,
                  justifyContent: 'center', alignItems: 'center',
                  backgroundColor: active ? colors.primary : colors.border + '66',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '400', color: active ? 'white' : colors.textMuted }}>
                  {chip}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Cook Again */}
        {cookedAgain.length > 0 && (
          <View>
            <SectionHeader title="Cook again" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {applyFilter(cookedAgain).map((recipe) => (
                <HorizontalCard
                  key={recipe.supabase_id ?? recipe.id}
                  recipe={recipe}
                  badge={`Cooked ${(recipe as any)._cookedCount}×`}
                  badgeStyle={{ bg: '#E3F2FD', text: '#1565C0' }}
                  onPress={() => openRecipe(recipe)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trending this week */}
        {applyFilter(trendingRecipes).length > 0 && (
          <View>
            <SectionHeader title="Trending this week" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {applyFilter(trendingRecipes).map((recipe) => (
                <HorizontalCard
                  key={recipe.supabase_id ?? recipe.id}
                  recipe={recipe}
                  badge="Hot"
                  badgeStyle={{ bg: '#FFF3E0', text: '#BF360C' }}
                  onPress={() => openRecipe(recipe)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Just added */}
        {applyFilter(justAdded).length > 0 && (
          <View>
            <SectionHeader title="Just added" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {applyFilter(justAdded).map((recipe) => (
                <HorizontalCard
                  key={recipe.supabase_id ?? recipe.id}
                  recipe={recipe}
                  badge="New"
                  badgeStyle={{ bg: '#E8F5E9', text: '#1B5E20' }}
                  onPress={() => openRecipe(recipe)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Browse by cuisine */}
        <View>
          <SectionHeader title="Browse by cuisine" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: 'row' }}>
            {CUISINES.map((c) => (
              <Pressable
                key={c.label}
                onPress={() => { setActiveFilter('All'); setSearchQuery(c.label); setSearchVisible(true); }}
                style={{
                  width: 64, height: 72, borderRadius: 12, backgroundColor: colors.card,
                  borderWidth: 0.5, borderColor: colors.border,
                  alignItems: 'center', justifyContent: 'center', gap: 4, marginRight: 8,
                }}
              >
                <Text style={{ fontSize: 20 }}>{c.flag}</Text>
                <Text style={{ fontSize: 10, fontWeight: '500', color: colors.text, textAlign: 'center' }}>{c.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Under 30 minutes */}
        {applyFilter(quickRecipes).length > 0 && (
          <View>
            <SectionHeader title="Under 30 minutes" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {applyFilter(quickRecipes).map((recipe) => (
                <View key={recipe.supabase_id ?? recipe.id} style={{ width: '48%' }}>
                  <GridCard recipe={recipe} onPress={() => openRecipe(recipe)} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* High Protein (conditional) */}
        {dietaryGoals.includes('high_protein') && applyFilter(highProtein).length > 0 && (
          <View>
            <SectionHeader title="High protein" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {applyFilter(highProtein).map((recipe) => (
                <HorizontalCard
                  key={recipe.supabase_id ?? recipe.id}
                  recipe={recipe}
                  onPress={() => openRecipe(recipe)}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Search modal */}
      <Modal
        visible={searchVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setSearchVisible(false); setSearchQuery(''); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            backgroundColor: colors.card,
          }}>
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
              paddingHorizontal: 12, paddingVertical: 10,
            }}>
              <Ionicons name="search-outline" size={17} color={colors.textMuted} />
              <TextInput
                autoFocus
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={`Search ${totalCount} recipes...`}
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, fontSize: 15, color: colors.text }}
                autoCorrect={false}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Pressable onPress={() => { setSearchVisible(false); setSearchQuery(''); }} hitSlop={8}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
            </Pressable>
          </View>

          {searchLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : searchResults.length === 0 && searchQuery.length > 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Text style={{ fontSize: 15, color: colors.textMuted }}>No results for "{searchQuery}"</Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.supabase_id ?? item.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSearchVisible(false); setSearchQuery(''); openRecipe(item); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: colors.card, borderRadius: 12,
                    borderWidth: 1, borderColor: colors.border, padding: 12,
                  }}
                >
                  <Image
                    source={{ uri: item.image_url ?? '' }}
                    style={{ width: 52, height: 52, borderRadius: 8 }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 14, color: colors.text }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                      {[item.cuisine, formatTime(item.prep_time_mins, item.cook_time_mins)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Recipe detail */}
      <RecipeDetailModal
        visible={detailVisible}
        recipe={selectedRecipe}
        detail={null}
        isSaved={selectedRecipe ? isSaved(selectedRecipe) : false}
        isInCart={selectedRecipe ? selectedRecipes.some((r) => r.id === selectedRecipe.id) : false}
        onClose={() => setDetailVisible(false)}
        onSaveToggle={() => {
          if (!selectedRecipe) return;
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

    </SafeAreaView>
  );
}
