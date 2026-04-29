import {
  View, Text, FlatList, Pressable, TextInput,
  ActivityIndicator, Alert, Modal, ScrollView, SectionList,
} from 'react-native';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime } from '@/lib/utils';
import { getRecipesBySupabaseIds, fetchDiscoverRecipes, getMealPlanForWeek } from '@/lib/api';
import { useMealPlanStore } from '@/stores/mealPlanStore';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useUserStore } from '@/stores/userStore';
import { AvatarButton } from '@/components/AvatarButton';
import { MacroRow } from '@/components/ui/MacroRow';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import { aggregateWeeklyMacros } from '@/lib/macroUtils';
import { filterPickerRecipes, type PickerChip, type PickerFilterOpts } from '@/lib/pickerFilters';
import { CUISINES } from '@/constants/cuisines';
import type { Recipe, MealType, MealSlot, SkillLevel } from '@/types';

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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY_ABBREVS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function dateForDayIndex(monday: Date, dayIndex: number): Date {
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayIndex);
  return d;
}

// Mon=0 ... Sun=6 — current day-of-week, mapped to our DAY_NAMES order.
function todayDayIndex(): number {
  const day = new Date().getDay(); // 0=Sun ... 6=Sat
  return day === 0 ? 6 : day - 1;
}

export default function Plan() {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const dietaryGoals = useUserStore((s) => s.profile?.dietary_goals) ?? [];
  const [weekOffset, setWeekOffset] = useState(0);
  const [slotRecipes, setSlotRecipes] = useState<Record<string, Recipe>>({});
  const [pickerOpen, setPickerOpen] = useState<{ day: number; mealType: MealType } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerChips, setPickerChips] = useState<Set<PickerChip>>(new Set(['meal_prep']));
  const [pickerCuisines, setPickerCuisines] = useState<string[]>([]);
  const [pickerTimeBucket, setPickerTimeBucket] = useState<number | null>(null);
  const [pickerSkill, setPickerSkill] = useState<SkillLevel | null>(null);
  const [catalogRecipes, setCatalogRecipes] = useState<Recipe[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [previewRecipe, setPreviewRecipe] = useState<Recipe | null>(null);
  const [lastWeekSlots, setLastWeekSlots] = useState<MealSlot[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(() => todayDayIndex());

  // Count of "non-default" filters for the Filter button badge.
  // Default state is `{meal_prep}` only — that doesn't earn a badge.
  const activeFilterCount = (() => {
    let n = 0;
    pickerChips.forEach((c) => { if (c !== 'meal_prep') n++; });
    if (!pickerChips.has('meal_prep')) n++; // user removed the default
    n += pickerCuisines.length;
    if (pickerTimeBucket != null) n++;
    if (pickerSkill != null) n++;
    return n;
  })();

  function resetPickerFilters() {
    setPickerSearch('');
    setPickerChips(new Set(['meal_prep']));
    setPickerCuisines([]);
    setPickerTimeBucket(null);
    setPickerSkill(null);
  }

  function togglePickerChip(chip: PickerChip) {
    setPickerChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  }

  function togglePickerCuisine(name: string) {
    setPickerCuisines((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  const plan = useMealPlanStore((s) => s.plan);
  const isLoading = useMealPlanStore((s) => s.isLoading);
  const loadPlan = useMealPlanStore((s) => s.loadPlan);
  const addSlot = useMealPlanStore((s) => s.addSlot);
  const removeSlot = useMealPlanStore((s) => s.removeSlot);
  const clearSlots = useMealPlanStore((s) => s.clearSlots);
  const savePlan = useMealPlanStore((s) => s.savePlan);

  const savedRecipes = useSavedStore((s) => s.savedRecipes);
  const isSaved = useSavedStore((s) => s.isSaved);
  const addSavedRecipe = useSavedStore((s) => s.addRecipe);
  const removeSavedRecipe = useSavedStore((s) => s.removeRecipe);
  const { addFromDetail, removeRecipeFromList, selectedRecipes } = useGroceryStore();

  const slots = plan?.slots ?? [];
  const monday = getMonday(weekOffset);
  const weekStart = toDateStr(monday);

  const macroSummary = useMemo(
    () => aggregateWeeklyMacros(slots, slotRecipes),
    [slots, slotRecipes]
  );
  const showSummary = macroSummary.slotsWithMacros > 0;

  // Hot-meal suggestions for the selected day — meal-prep-friendly, top-rated,
  // dedupes anything already planned on this day. Hidden when the day is full.
  const filledSlotCountForSelectedDay = MEAL_TYPES.reduce(
    (n, mt) => n + (slots.some((s) => s.day === selectedDay && s.meal_type === mt) ? 1 : 0),
    0
  );
  const suggestions = useMemo(() => {
    if (!catalogRecipes) return [];
    const usedIds = new Set(
      slots
        .filter((s) => s.day === selectedDay)
        .map((s) => s.recipe_id)
    );
    return catalogRecipes
      .filter((r) => r.meal_prep_friendly === true)
      .filter((r) => !usedIds.has(r.supabase_id ?? r.id))
      .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
      .slice(0, 8);
  }, [catalogRecipes, slots, selectedDay]);

  useEffect(() => {
    if (!userId) return;
    loadPlan(userId, weekStart);
  }, [userId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the user navigates between weeks, snap the selected day:
  // - Current week → today
  // - Other weeks → Monday
  useEffect(() => {
    setSelectedDay(weekOffset === 0 ? todayDayIndex() : 0);
  }, [weekOffset]);

  // Fetch previous week's slots so we know whether to show "Copy last week".
  useEffect(() => {
    if (!userId) { setLastWeekSlots([]); return; }
    const prevMonday = new Date(monday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevWeekStart = toDateStr(prevMonday);
    getMealPlanForWeek(userId, prevWeekStart)
      .then((p) => setLastWeekSlots(p?.slots ?? []))
      .catch(() => setLastWeekSlots([]));
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

  // Load the full catalogue once per session — drives both the picker's
  // "Browse all" section AND the daily suggestions row. fetchDiscoverRecipes
  // is shared with Discover and caches for 5 minutes, so this is usually free.
  useEffect(() => {
    if (!userId) return;
    if (catalogRecipes !== null) return;
    setCatalogLoading(true);
    fetchDiscoverRecipes(dietaryGoals)
      .then((rs) => setCatalogRecipes(rs))
      .catch(() => setCatalogRecipes([]))
      .finally(() => setCatalogLoading(false));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getSlot(day: number, mealType: MealType): MealSlot | undefined {
    return slots.find((s) => s.day === day && s.meal_type === mealType);
  }

  function addRecipeToSlot(recipe: Recipe, day: number, mealType: MealType) {
    if (!userId) return;
    const recipeId = recipe.supabase_id ?? recipe.id;
    addSlot({ day, meal_type: mealType, recipe_id: recipeId, servings_multiplier: 1 });
    setSlotRecipes((prev) => ({ ...prev, [recipeId]: recipe }));
    savePlan(userId, weekStart);
  }

  function handleAssign(recipe: Recipe) {
    if (!pickerOpen) return;
    addRecipeToSlot(recipe, pickerOpen.day, pickerOpen.mealType);
    setPickerOpen(null);
    resetPickerFilters();
  }

  // Suggestion card "+" tap — pick which empty meal slot to drop the recipe into.
  function handleSuggestionAdd(recipe: Recipe) {
    const emptySlots = MEAL_TYPES.filter((mt) => !getSlot(selectedDay, mt));
    if (emptySlots.length === 0) {
      Alert.alert('Day is full', 'All meals are already planned for this day.');
      return;
    }
    if (emptySlots.length === 1) {
      addRecipeToSlot(recipe, selectedDay, emptySlots[0]);
      return;
    }
    Alert.alert(
      recipe.title,
      'Add to which meal?',
      [
        { text: 'Cancel', style: 'cancel' },
        ...emptySlots.map((mt) => ({
          text: MEAL_LABELS[mt],
          onPress: () => addRecipeToSlot(recipe, selectedDay, mt),
        })),
      ]
    );
  }

  function handleRemove(day: number, mealType: MealType) {
    if (!userId) return;
    removeSlot(day, mealType);
    savePlan(userId, weekStart);
  }

  function handleCopyLastWeek() {
    if (!userId || lastWeekSlots.length === 0) return;
    const apply = () => {
      // Replace this week's slots with last week's. addSlot() upserts per (day, mealType).
      clearSlots();
      lastWeekSlots.forEach((s) => addSlot({ ...s }));
      savePlan(userId, weekStart);
    };
    if (slots.length === 0) {
      apply();
      return;
    }
    Alert.alert(
      'Copy last week?',
      `This will replace your current ${slots.length} planned meal${slots.length !== 1 ? 's' : ''} with last week's ${lastWeekSlots.length}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Copy', style: 'default', onPress: apply },
      ]
    );
  }

  function handleClearWeek() {
    if (!userId || slots.length === 0) return;
    Alert.alert(
      'Clear this week?',
      `Remove all ${slots.length} planned meal${slots.length !== 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearSlots();
            savePlan(userId, weekStart);
          },
        },
      ]
    );
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

  // Build sectioned recipe picker data — applies all filters across saved
  // recipes and (lazily-fetched) full catalogue, then dedupes catalog against saved.
  const pickerSections = useMemo(() => {
    const opts: PickerFilterOpts = {
      search: pickerSearch,
      chips: pickerChips,
      cuisines: pickerCuisines,
      timeBucket: pickerTimeBucket,
      skill: pickerSkill,
    };
    const saved = filterPickerRecipes(savedRecipes, opts);
    const savedIds = new Set(saved.map((r) => r.id));
    const catalog = filterPickerRecipes(catalogRecipes ?? [], opts).filter(
      (r) => !savedIds.has(r.id)
    );
    const sections: { title: string; data: Recipe[] }[] = [];
    if (saved.length > 0) sections.push({ title: 'Saved', data: saved });
    if (catalog.length > 0) sections.push({ title: 'Browse all', data: catalog });
    return sections;
  }, [savedRecipes, catalogRecipes, pickerSearch, pickerChips, pickerCuisines, pickerTimeBucket, pickerSkill]);

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
        {/* Week actions — Copy from last week / Clear week, contextual */}
        {(lastWeekSlots.length > 0 || slots.length > 0) && (
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4, marginBottom: 12 }}>
            {lastWeekSlots.length > 0 && (
              <Pressable onPress={handleCopyLastWeek} hitSlop={6}>
                <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '500' }}>
                  ↺ Copy last week
                </Text>
              </Pressable>
            )}
            {slots.length > 0 && (
              <Pressable onPress={handleClearWeek} hitSlop={6}>
                <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '500' }}>
                  Clear week
                </Text>
              </Pressable>
            )}
          </View>
        )}

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

        {/* Weekly macro totals */}
        {showSummary && (
          <View style={{
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border,
            padding: 14, marginBottom: 16,
          }}>
            <Text style={{
              fontSize: 12, fontWeight: '700', color: colors.textMuted,
              letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
            }}>
              This week's totals
            </Text>
            <MacroRow macros={macroSummary.weekly} />
            {macroSummary.slotsWithMacros < macroSummary.slotsTotal && (
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 6, textAlign: 'center' }}>
                {macroSummary.slotsTotal - macroSummary.slotsWithMacros} meal{macroSummary.slotsTotal - macroSummary.slotsWithMacros !== 1 ? 's' : ''} without macro data
              </Text>
            )}
          </View>
        )}

        {/* Week strip — 7 day chips, tap to focus */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
          {DAY_NAMES.map((dayName, dayIndex) => {
            const date = dateForDayIndex(monday, dayIndex);
            const filledCount = MEAL_TYPES.reduce(
              (n, mt) => n + (getSlot(dayIndex, mt) ? 1 : 0),
              0
            );
            const isSelected = selectedDay === dayIndex;
            const isToday = weekOffset === 0 && dayIndex === todayDayIndex();
            return (
              <Pressable
                key={dayIndex}
                onPress={() => setSelectedDay(dayIndex)}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: isSelected ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: isSelected
                    ? colors.primary
                    : isToday ? colors.primary : colors.border,
                }}
              >
                <Text style={{
                  fontSize: 11, fontWeight: '600',
                  color: isSelected ? 'white' : colors.textMuted,
                  letterSpacing: 0.4,
                }}>
                  {DAY_ABBREVS[dayIndex]}
                </Text>
                <Text style={{
                  fontSize: 16, fontWeight: '700',
                  color: isSelected ? 'white' : colors.text, marginTop: 2,
                }}>
                  {date.getDate()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 4, height: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <View
                      key={i}
                      style={{
                        width: 4, height: 4, borderRadius: 2,
                        backgroundColor: i < filledCount
                          ? (isSelected ? 'white' : colors.primary)
                          : (isSelected ? 'rgba(255,255,255,0.35)' : colors.border),
                      }}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Selected day detail */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8, gap: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {DAY_NAMES[selectedDay]}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>
              {dateForDayIndex(monday, selectedDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
          {macroSummary.perDay[selectedDay] && (
            <View style={{ marginBottom: 10, marginLeft: 2 }}>
              <MacroRow macros={macroSummary.perDay[selectedDay]} compact />
            </View>
          )}
          {MEAL_TYPES.map((mealType) => {
            const slot = getSlot(selectedDay, mealType);
            const recipe = slot ? slotRecipes[slot.recipe_id] : null;
            const isDeleted = slot && !recipe;
            return (
              <Pressable
                key={mealType}
                onPress={() => {
                  if (recipe) return;
                  if (isDeleted) { handleRemove(selectedDay, mealType); return; }
                  setPickerOpen({ day: selectedDay, mealType });
                }}
                onLongPress={() => { if (slot) handleRemove(selectedDay, mealType); }}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: colors.card, borderRadius: 10,
                  borderWidth: 1, borderColor: colors.border,
                  padding: 12, marginBottom: 8, minHeight: 64,
                }}
              >
                <Text style={{ width: 86, fontSize: 12, color: colors.textMuted, fontWeight: '500' }}>
                  {MEAL_LABELS[mealType]}
                </Text>
                {isDeleted ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="alert-circle-outline" size={18} color={colors.textMuted} />
                    <Text style={{ flex: 1, fontSize: 13, color: colors.textMuted, fontStyle: 'italic' }}>Recipe removed</Text>
                    <Pressable onPress={() => handleRemove(selectedDay, mealType)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ) : recipe ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {recipe.image_url && (
                      <Image
                        source={{ uri: recipe.image_url }}
                        style={{ width: 44, height: 44, borderRadius: 6 }}
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
                    <Pressable onPress={() => handleRemove(selectedDay, mealType)} hitSlop={8}>
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

        {/* Hot meals — hidden when the day is fully planned */}
        {filledSlotCountForSelectedDay < 3 && suggestions.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                Hot meals
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                Tap to preview, + to add
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
              {suggestions.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => setPreviewRecipe(r)}
                  style={{
                    width: 156,
                    backgroundColor: colors.card, borderRadius: 12,
                    borderWidth: 1, borderColor: colors.border,
                    overflow: 'hidden',
                  }}
                >
                  {r.image_url && (
                    <Image
                      source={{ uri: r.image_url }}
                      style={{ width: '100%', height: 96 }}
                      contentFit="cover"
                    />
                  )}
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={2}>
                      {r.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }} numberOfLines={1}>
                      {[
                        r.cuisine,
                        (r.prep_time_mins || r.cook_time_mins) ? formatTime(r.prep_time_mins, r.cook_time_mins) : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleSuggestionAdd(r)}
                    hitSlop={8}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999,
                      width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="add" size={20} color="white" />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Recipe picker modal — sectioned with search */}
      <Modal
        visible={!!pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setPickerOpen(null); resetPickerFilters(); }}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Modal header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            backgroundColor: colors.card,
          }}>
            <Pressable onPress={() => { setPickerOpen(null); resetPickerFilters(); }} hitSlop={8}>
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
          {/* Search row + Filter button */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            marginHorizontal: 16, marginTop: 12, marginBottom: 8,
          }}>
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'center',
              backgroundColor: colors.card, borderRadius: 12,
              borderWidth: 1, borderColor: colors.border,
              paddingHorizontal: 12,
            }}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="Search recipes..."
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
            <Pressable
              onPress={() => setFilterSheetOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 44, paddingHorizontal: 14, borderRadius: 12,
                backgroundColor: activeFilterCount > 0 ? colors.primary : colors.card,
                borderWidth: 1, borderColor: activeFilterCount > 0 ? colors.primary : colors.border,
              }}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={activeFilterCount > 0 ? 'white' : colors.text}
              />
              <Text style={{
                fontSize: 14, fontWeight: '600',
                color: activeFilterCount > 0 ? 'white' : colors.text,
              }}>
                Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
              </Text>
            </Pressable>
          </View>

          {catalogLoading && (catalogRecipes ?? []).length === 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 }}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Loading more recipes…</Text>
            </View>
          )}

          {savedRecipes.length === 0 && (catalogRecipes?.length ?? 0) === 0 && !catalogLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
              <Ionicons name="bookmark-outline" size={48} color={colors.border} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>No recipes yet</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
                Swipe right on recipes in Discover to save them, then come back here to plan your week.
              </Text>
            </View>
          ) : pickerSections.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 }}>
              <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
                {pickerSearch ? `No recipes match "${pickerSearch}"` : 'No recipes match these filters'}
              </Text>
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
                  marginBottom: 8, marginTop: section.title === 'Browse all' ? 16 : 0,
                }}>
                  <Ionicons
                    name={section.title === 'Saved' ? 'bookmark' : 'compass-outline'}
                    size={14}
                    color={section.title === 'Saved' ? colors.primary : colors.textMuted}
                  />
                  <Text style={{
                    fontSize: 12, fontWeight: '700',
                    color: section.title === 'Saved' ? colors.primary : colors.textMuted,
                    letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>
                    {section.title}
                  </Text>
                </View>
              )}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setPreviewRecipe(item)}
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
                      style={{ width: 64, height: 64, borderRadius: 8 }}
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
                  {/* Quick-add — direct to slot, skipping the preview. Nested
                      Pressable's onPress fires WITHOUT bubbling to the row Pressable. */}
                  <Pressable onPress={() => handleAssign(item)} hitSlop={8} style={{ padding: 4 }}>
                    <Ionicons name="add-circle" size={28} color={colors.primary} />
                  </Pressable>
                </Pressable>
              )}
            />
          )}

          {/* Inline filter overlay — siblings of the recipe list, conditionally shown.
              Avoids the iOS nested-Modal bug; same pattern as RecipeDetailModal's ServingsSheet. */}
          {filterSheetOpen && (
            <>
              <Pressable
                onPress={() => setFilterSheetOpen(false)}
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                  backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100,
                }}
              />
              <View
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  backgroundColor: colors.background,
                  borderTopLeftRadius: 20, borderTopRightRadius: 20,
                  paddingBottom: 32, maxHeight: '85%', zIndex: 101,
                }}
              >
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
                  borderBottomWidth: 1, borderBottomColor: colors.border,
                }}>
                  <Pressable onPress={() => resetPickerFilters()} hitSlop={8}>
                    <Text style={{ color: colors.textMuted, fontSize: 15 }}>Clear all</Text>
                  </Pressable>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Filters</Text>
                  <Pressable onPress={() => setFilterSheetOpen(false)} hitSlop={8}>
                    <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Done</Text>
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
                  <FilterSection title="Type">
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {(
                        [
                          { key: 'meal_prep', label: 'Meal Prep' },
                          { key: 'quick', label: 'Quick (≤30 min)' },
                          { key: 'high_protein', label: 'High Protein' },
                          { key: 'vegetarian', label: 'Vegetarian' },
                          { key: 'vegan', label: 'Vegan' },
                        ] as { key: PickerChip; label: string }[]
                      ).map((c) => {
                        const active = pickerChips.has(c.key);
                        return (
                          <Pressable
                            key={c.key}
                            onPress={() => togglePickerChip(c.key)}
                            style={{
                              height: 36, paddingHorizontal: 14, borderRadius: 999,
                              justifyContent: 'center',
                              backgroundColor: active ? colors.primary : colors.border + '55',
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : colors.text }}>
                              {c.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </FilterSection>

                  <FilterSection title="Cuisine">
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {CUISINES.map((c) => {
                        const active = pickerCuisines.includes(c.label);
                        return (
                          <Pressable
                            key={c.label}
                            onPress={() => togglePickerCuisine(c.label)}
                            style={{
                              height: 36, paddingHorizontal: 12, borderRadius: 999,
                              flexDirection: 'row', alignItems: 'center', gap: 6,
                              backgroundColor: active ? colors.primary : colors.border + '55',
                            }}
                          >
                            <Text style={{ fontSize: 14 }}>{c.flag}</Text>
                            <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : colors.text }}>
                              {c.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </FilterSection>

                  <FilterSection title="Total time">
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {([
                        { label: 'Any', value: null },
                        { label: '≤ 15 min', value: 15 },
                        { label: '≤ 30 min', value: 30 },
                        { label: '≤ 45 min', value: 45 },
                      ] as { label: string; value: number | null }[]).map((t) => {
                        const active = pickerTimeBucket === t.value;
                        return (
                          <Pressable
                            key={t.label}
                            onPress={() => setPickerTimeBucket(t.value)}
                            style={{
                              height: 36, paddingHorizontal: 14, borderRadius: 999,
                              justifyContent: 'center',
                              backgroundColor: active ? colors.primary : 'transparent',
                              borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : colors.text }}>
                              {t.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </FilterSection>

                  <FilterSection title="Skill level">
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {([
                        { label: 'Any', value: null },
                        { label: 'Beginner', value: 'beginner' },
                        { label: 'Home cook', value: 'home_cook' },
                        { label: 'Confident chef', value: 'confident_chef' },
                      ] as { label: string; value: SkillLevel | null }[]).map((s) => {
                        const active = pickerSkill === s.value;
                        return (
                          <Pressable
                            key={s.label}
                            onPress={() => setPickerSkill(s.value)}
                            style={{
                              height: 36, paddingHorizontal: 14, borderRadius: 999,
                              justifyContent: 'center',
                              backgroundColor: active ? colors.primary : 'transparent',
                              borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? 'white' : colors.text }}>
                              {s.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </FilterSection>
                </ScrollView>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Recipe preview — opened from picker row tap. "Add to {slot}" CTA replaces the default footer. */}
      <RecipeDetailModal
        visible={!!previewRecipe}
        recipe={previewRecipe}
        detail={null}
        isSaved={previewRecipe ? isSaved(previewRecipe.id) : false}
        isInCart={previewRecipe ? selectedRecipes.some((r) => r.id === previewRecipe.id) : false}
        onClose={() => setPreviewRecipe(null)}
        onSaveToggle={() => {
          if (!previewRecipe) return;
          if (isSaved(previewRecipe.id)) removeSavedRecipe(previewRecipe, userId);
          else addSavedRecipe(previewRecipe, userId);
        }}
        onAddToCart={(scaledIngredients) => {
          if (!previewRecipe) return;
          addFromDetail(previewRecipe, scaledIngredients);
        }}
        onRemoveFromCart={() => { if (previewRecipe) removeRecipeFromList(previewRecipe.id); }}
        slotContext={pickerOpen ? `${DAY_NAMES[pickerOpen.day]} · ${MEAL_LABELS[pickerOpen.mealType]}` : undefined}
        onAddToSlot={() => {
          if (!previewRecipe) return;
          handleAssign(previewRecipe);
          setPreviewRecipe(null);
        }}
      />
    </SafeAreaView>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useTheme();
  return (
    <View>
      <Text style={{
        fontSize: 12, fontWeight: '700', color: colors.textMuted,
        letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
      }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
