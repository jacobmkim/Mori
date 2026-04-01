import {
  View, Text, FlatList, Pressable, TextInput,
  ActivityIndicator, Alert, Modal, ScrollView, SectionList,
} from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime } from '@/lib/utils';
import { getRecipesBySupabaseIds } from '@/lib/api';
import { useMealPlanStore } from '@/stores/mealPlanStore';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useUserStore } from '@/stores/userStore';
import { AvatarButton } from '@/components/AvatarButton';
import type { Recipe, MealType, MealSlot } from '@/types';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function getMonday(offset = 0): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function Plan() {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const [weekOffset, setWeekOffset] = useState(0);
  const [slotRecipes, setSlotRecipes] = useState<Record<string, Recipe>>({});
  const [pickerOpen, setPickerOpen] = useState<{ day: number; mealType: MealType } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<'All' | 'Meal Prep' | 'Quick' | 'Vegetarian'>('All');

  const plan = useMealPlanStore((s) => s.plan);
  const isLoading = useMealPlanStore((s) => s.isLoading);
  const loadPlan = useMealPlanStore((s) => s.loadPlan);
  const addSlot = useMealPlanStore((s) => s.addSlot);
  const removeSlot = useMealPlanStore((s) => s.removeSlot);
  const savePlan = useMealPlanStore((s) => s.savePlan);

  const savedRecipes = useSavedStore((s) => s.savedRecipes);
  const { addFromDetail } = useGroceryStore();

  const slots = plan?.slots ?? [];
  const monday = getMonday(weekOffset);
  const weekStart = toDateStr(monday);

  useEffect(() => {
    if (!userId) return;
    loadPlan(userId, weekStart);
  }, [userId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ids = [...new Set(slots.map((s) => s.recipe_id).filter(Boolean))];
    if (ids.length === 0) { setSlotRecipes({}); return; }
    getRecipesBySupabaseIds(ids).then((recipes) => {
      const map: Record<string, Recipe> = {};
      recipes.forEach((r) => { if (r.supabase_id) map[r.supabase_id] = r; });
      setSlotRecipes(map);
    }).catch(() => {});
  }, [plan?.slots]); // eslint-disable-line react-hooks/exhaustive-deps

  function getSlot(day: number, mealType: MealType): MealSlot | undefined {
    return slots.find((s) => s.day === day && s.meal_type === mealType);
  }

  function handleAssign(recipe: Recipe) {
    if (!pickerOpen || !userId) return;
    const recipeId = recipe.supabase_id ?? recipe.id;
    addSlot({ day: pickerOpen.day, meal_type: pickerOpen.mealType, recipe_id: recipeId, servings_multiplier: 1 });
    setSlotRecipes((prev) => ({ ...prev, [recipeId]: recipe }));
    setPickerOpen(null);
    setPickerSearch('');
    setPickerFilter('All');
    savePlan(userId, weekStart);
  }

  function handleRemove(day: number, mealType: MealType) {
    if (!userId) return;
    removeSlot(day, mealType);
    savePlan(userId, weekStart);
  }

  function handleAddAllToGrocery() {
    const seenIds = new Set<string>();
    const recipes = slots
      .map((s) => slotRecipes[s.recipe_id])
      .filter((r): r is Recipe => {
        if (!r) return false;
        const id = r.supabase_id ?? r.id;
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });
    if (recipes.length === 0) return;
    recipes.forEach((r) => {
      const ingredients = (r.ingredients ?? []).map((i) => ({ name: i.name, measure: `${i.quantity ?? ''} ${i.unit ?? ''}`.trim() }));
      addFromDetail(r, ingredients);
    });
    Alert.alert('Added to grocery list', `${recipes.length} meal${recipes.length !== 1 ? 's' : ''} added.`);
  }

  // Build sectioned recipe picker data: filter + search, Meal Prep first
  const pickerSections = (() => {
    const q = pickerSearch.toLowerCase();
    let all = savedRecipes.filter((r) =>
      !q || r.title.toLowerCase().includes(q) || (r.cuisine ?? '').toLowerCase().includes(q)
    );
    if (pickerFilter === 'Meal Prep') all = all.filter((r) => r.meal_prep_friendly === true);
    else if (pickerFilter === 'Quick') all = all.filter((r) => ((r.prep_time_mins ?? 99) + (r.cook_time_mins ?? 99)) <= 30);
    else if (pickerFilter === 'Vegetarian') all = all.filter((r) => r.dietary_tags?.includes('vegetarian') || r.dietary_tags?.includes('vegan'));
    if (pickerFilter !== 'All') return [{ title: pickerFilter, data: all }];
    const mealPrep = all.filter((r) => r.meal_prep_friendly === true);
    const rest = all.filter((r) => r.meal_prep_friendly !== true);
    const sections = [];
    if (mealPrep.length > 0) sections.push({ title: 'Meal Prep Friendly', data: mealPrep });
    if (rest.length > 0) sections.push({ title: 'All Saved', data: rest });
    return sections;
  })();

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>Loading meal plan...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Meal Plan</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {slots.length > 0 && (
            <Pressable
              onPress={handleAddAllToGrocery}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: colors.primary, borderRadius: 20,
                paddingHorizontal: 14, paddingVertical: 7,
              }}
            >
              <Ionicons name="cart-outline" size={16} color="white" />
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>Add all to list</Text>
            </Pressable>
          )}
          <AvatarButton />
          </View>
        </View>

        {/* Week navigation */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.card, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border,
          paddingHorizontal: 16, paddingVertical: 10,
        }}>
          <Pressable onPress={() => setWeekOffset((w) => w - 1)} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
              {formatWeekRange(monday)}
            </Text>
            {weekOffset !== 0 && (
              <Pressable onPress={() => setWeekOffset(0)} hitSlop={8}>
                <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2 }}>Back to this week</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => setWeekOffset((w) => w + 1)} hitSlop={12}>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {/* Week summary pill */}
        {slots.length > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: colors.primaryLight, borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16,
          }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '500' }}>
              {slots.length} of {DAY_NAMES.length * MEAL_TYPES.length} meals planned
            </Text>
          </View>
        )}

        {DAY_NAMES.map((dayName, dayIndex) => (
          <View key={dayIndex} style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 8, letterSpacing: 0.3 }}>
              {dayName}
            </Text>
            {MEAL_TYPES.map((mealType) => {
              const slot = getSlot(dayIndex, mealType);
              const recipe = slot ? slotRecipes[slot.recipe_id] : null;
              return (
                <Pressable
                  key={mealType}
                  onPress={() => {
                    if (recipe) return;
                    setPickerOpen({ day: dayIndex, mealType });
                  }}
                  onLongPress={() => { if (slot) handleRemove(dayIndex, mealType); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: colors.card, borderRadius: 10,
                    borderWidth: 1, borderColor: recipe ? colors.border : colors.border,
                    padding: 10, marginBottom: 6, minHeight: 52,
                  }}
                >
                  <Text style={{ width: 78, fontSize: 12, color: colors.textMuted, fontWeight: '500' }}>
                    {MEAL_LABELS[mealType]}
                  </Text>
                  {recipe ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {recipe.image_url && (
                        <Image
                          source={{ uri: recipe.image_url }}
                          style={{ width: 36, height: 36, borderRadius: 6 }}
                          contentFit="cover"
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }} numberOfLines={1}>
                          {recipe.title}
                        </Text>
                        {recipe.meal_prep_friendly && (
                          <Text style={{ fontSize: 11, color: colors.primary, marginTop: 1 }}>Meal prep ✓</Text>
                        )}
                      </View>
                      <Pressable onPress={() => handleRemove(dayIndex, mealType)} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="add-circle-outline" size={18} color={colors.border} />
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>Add recipe</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Recipe picker modal — sectioned with search */}
      <Modal
        visible={!!pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setPickerOpen(null); setPickerSearch(''); setPickerFilter('All'); }}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            backgroundColor: colors.card,
          }}>
            <Pressable onPress={() => { setPickerOpen(null); setPickerSearch(''); setPickerFilter('All'); }} hitSlop={8}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Choose a recipe</Text>
              {pickerOpen && (
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  {DAY_NAMES[pickerOpen.day]} · {MEAL_LABELS[pickerOpen.mealType]}
                </Text>
              )}
            </View>
            <View style={{ width: 56 }} />
          </View>

          {/* Search bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
          }}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search saved recipes..."
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8, fontSize: 15, color: colors.text }}
              autoCorrect={false}
            />
            {pickerSearch.length > 0 && (
              <Pressable onPress={() => setPickerSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' }}>
            {(['All', 'Meal Prep', 'Quick', 'Vegetarian'] as const).map((f) => {
              const active = pickerFilter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setPickerFilter(f)}
                  style={{
                    height: 30, paddingHorizontal: 12, borderRadius: 999,
                    justifyContent: 'center',
                    backgroundColor: active ? colors.primary : colors.border + '55',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: active ? '600' : '400', color: active ? 'white' : colors.textMuted }}>
                    {f}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {savedRecipes.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
              <Ionicons name="bookmark-outline" size={48} color={colors.border} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>No saved recipes yet</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
                Swipe right on recipes in Discover to save them, then come back here to plan your week.
              </Text>
            </View>
          ) : pickerSections.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 15, color: colors.textMuted }}>No recipes match "{pickerSearch}"</Text>
            </View>
          ) : (
            <SectionList
              sections={pickerSections}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  marginBottom: 8, marginTop: section.title === 'All Saved' ? 16 : 0,
                }}>
                  {section.title === 'Meal Prep Friendly' && (
                    <Ionicons name="flash" size={14} color={colors.primary} />
                  )}
                  {section.title === 'All Saved' && (
                    <Ionicons name="bookmark" size={14} color={colors.textMuted} />
                  )}
                  <Text style={{
                    fontSize: 12, fontWeight: '700',
                    color: section.title === 'Meal Prep Friendly' ? colors.primary : colors.textMuted,
                    letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>
                    {section.title}
                  </Text>
                </View>
              )}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleAssign(item)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: colors.card, borderRadius: 12,
                    borderWidth: 1, borderColor: colors.border,
                    padding: 12, marginBottom: 8,
                  }}
                >
                  {item.image_url && (
                    <Image
                      source={{ uri: item.image_url }}
                      style={{ width: 52, height: 52, borderRadius: 8 }}
                      contentFit="cover"
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                      {[
                        item.cuisine,
                        (item.prep_time_mins || item.cook_time_mins) ? formatTime(item.prep_time_mins, item.cook_time_mins) : null,
                        item.meal_prep_friendly ? 'Meal prep ✓' : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={26} color={colors.primary} />
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
