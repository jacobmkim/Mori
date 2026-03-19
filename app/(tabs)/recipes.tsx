import {
  View, Text, FlatList, Pressable, TextInput,
  ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@/constants/theme';
import { formatTime } from '@/lib/utils';
import { fetchMealDBRecipesByCategory, fetchMealDetail, MEAL_CATEGORIES, MAIN_CUISINES } from '@/lib/mealdb';
import { setRecipeLiked, updateRecipeDetail, upsertRecipeByExternalId, logInteraction, getMealPlanForWeek, saveMealPlan, getRecipesBySupabaseIds } from '@/lib/api';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useCollectionsStore, FAVORITES_ID } from '@/stores/collectionsStore';
import { useUserStore } from '@/stores/userStore';
import type { Recipe, MealType, MealSlot } from '@/types';
import type { RecipeCollection } from '@/stores/collectionsStore';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import type { MealDetail } from '@/lib/mealdb';

// ── inferCategory ──────────────────────────────────────────────────────────────
// Fallback for saved recipes from Discover (area-based fetch, dietary_tags: [])
function inferCategory(title: string): string | null {
  const t = title.toLowerCase();
  if (/chicken|poultry/.test(t)) return 'Chicken';
  if (/beef|steak|burger|mince/.test(t)) return 'Beef';
  if (/pork|bacon|ham/.test(t)) return 'Pork';
  if (/lamb/.test(t)) return 'Lamb';
  if (/salmon|tuna|shrimp|prawn|fish|cod|crab|lobster|mussel|seafood/.test(t)) return 'Seafood';
  if (/pasta|spaghetti|penne|rigatoni|lasagna|fettuccine|noodle/.test(t)) return 'Pasta';
  if (/vegan/.test(t)) return 'Vegan';
  if (/vegetarian|veggie/.test(t)) return 'Vegetarian';
  return null;
}

// ── RecipeGridCard ─────────────────────────────────────────────────────────────

const RecipeGridCard = memo(function RecipeGridCard({
  recipe,
  showSaved,
  isSaved,
  isFavorite,
  isInList,
  isEditMode,
  isSelected,
  onSaveToggle,
  onFavoriteToggle,
  onAddToList,
  onThreeDot,
  onSelect,
  onLongPress,
  onViewDetail,
}: {
  recipe: Recipe;
  showSaved: boolean;
  isSaved: boolean;
  isFavorite: boolean;
  isInList: boolean;
  isEditMode: boolean;
  isSelected: boolean;
  onSaveToggle: () => void;
  onFavoriteToggle: () => void;
  onAddToList: () => void;
  onThreeDot: () => void;
  onSelect: () => void;
  onLongPress: () => void;
  onViewDetail: () => void;
}) {
  const heartActive = showSaved ? isFavorite : isSaved;
  const heartIcon = showSaved
    ? (isFavorite ? 'heart' : 'heart-outline')
    : (isSaved ? 'bookmark' : 'bookmark-outline');
  const heartBg = heartActive
    ? (showSaved ? 'rgba(211,47,47,0.85)' : colors.primary)
    : 'rgba(0,0,0,0.45)';

  return (
    <Pressable
      onPress={isEditMode ? onSelect : onViewDetail}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: 12,
        overflow: 'hidden',
        margin: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 6,
        elevation: 3,
        borderWidth: isSelected ? 2 : 0,
        borderColor: isSelected ? colors.primary : 'transparent',
      }}
    >
      <View style={{ position: 'relative' }}>
        <Image source={{ uri: recipe.image_url ?? '' }} style={{ width: '100%', height: 130 }} contentFit="cover" />

        {/* Cart button — top-left */}
        <Pressable
          onPress={isEditMode ? onSelect : onAddToList}
          style={{
            position: 'absolute', top: 6, left: 6,
            backgroundColor: isInList ? colors.primary : 'rgba(0,0,0,0.45)',
            borderRadius: 999, width: 28, height: 28,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name={isInList ? 'cart' : 'cart-outline'} size={15} color="white" />
        </Pressable>

        {/* Heart / bookmark — top-right */}
        <Pressable
          onPress={isEditMode ? onSelect : (showSaved ? onFavoriteToggle : onSaveToggle)}
          style={{
            position: 'absolute', top: 6, right: 6,
            backgroundColor: heartBg,
            borderRadius: 999, width: 28, height: 28,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name={heartIcon as any} size={15} color="white" />
        </Pressable>

        {/* Edit mode checkmark overlay */}
        {isEditMode && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: isSelected ? 'rgba(46,125,50,0.18)' : 'rgba(0,0,0,0.12)',
            alignItems: 'flex-end', justifyContent: 'flex-end',
            padding: 8,
          }}>
            <View style={{
              width: 22, height: 22, borderRadius: 11,
              borderWidth: 2, borderColor: 'white',
              backgroundColor: isSelected ? colors.primary : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {isSelected && <Ionicons name="checkmark" size={13} color="white" />}
            </View>
          </View>
        )}
      </View>

      <View style={{ padding: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 }} numberOfLines={2}>
            {recipe.title}
          </Text>
          {!isEditMode && (
            <Pressable onPress={onThreeDot} hitSlop={8} style={{ marginTop: 1 }}>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="star" size={12} color="#FFB300" />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{recipe.avg_rating.toFixed(1)}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: 4 }}>
            {formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}
          </Text>
        </View>
        {recipe.cuisine ? (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }}>{recipe.cuisine}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

// ── Three-dot action menu ──────────────────────────────────────────────────────

function RecipeActionMenu({
  visible,
  recipe,
  isSaved,
  isFavorite,
  onClose,
  onSaveToggle,
  onFavoriteToggle,
  onAddToList,
  onPickCollection,
}: {
  visible: boolean;
  recipe: Recipe | null;
  isSaved: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onSaveToggle: () => void;
  onFavoriteToggle: () => void;
  onAddToList: () => void;
  onPickCollection: () => void;
}) {
  if (!recipe) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 }}>
              <Image source={{ uri: recipe.image_url ?? '' }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }} numberOfLines={2}>{recipe.title}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 20, marginBottom: 8 }} />
            <MenuItem icon={isFavorite ? 'heart' : 'heart-outline'} iconColor={isFavorite ? colors.error : colors.text}
              label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              onPress={() => { onFavoriteToggle(); onClose(); }} />
            <MenuItem icon="cart-outline" label="Add to Grocery List" onPress={() => { onAddToList(); onClose(); }} />
            <MenuItem icon="albums-outline" label="Add to list..." onPress={() => { onPickCollection(); onClose(); }} />
            <MenuItem icon={isSaved ? 'bookmark' : 'bookmark-outline'} label={isSaved ? 'Remove from Saved' : 'Save recipe'}
              onPress={() => { onSaveToggle(); onClose(); }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({ icon, iconColor, label, onPress }: {
  icon: string; iconColor?: string; label: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}>
      <Ionicons name={icon as any} size={22} color={iconColor ?? colors.text} />
      <Text style={{ fontSize: 16, color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

// ── Collection action menu (long press on collection pill) ─────────────────────

function CollectionActionMenu({
  visible,
  collection,
  onClose,
  onRename,
  onDelete,
}: {
  visible: boolean;
  collection: RecipeCollection | null;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  if (!collection) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />
            <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{collection.name}</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                {collection.recipeIds.length} recipe{collection.recipeIds.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 20, marginBottom: 8 }} />
            <MenuItem icon="pencil-outline" label="Rename list" onPress={() => { onRename(); onClose(); }} />
            {!collection.isSystem && (
              <MenuItem icon="trash-outline" iconColor={colors.error} label="Delete list" onPress={() => { onDelete(); onClose(); }} />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Collection picker modal ────────────────────────────────────────────────────

function CollectionPickerModal({
  visible,
  collections,
  recipeIds,
  onClose,
  onToggleCollection,
  onCreateNew,
}: {
  visible: boolean;
  collections: RecipeCollection[];
  recipeIds: string[];
  onClose: () => void;
  onToggleCollection: (collectionId: string) => void;
  onCreateNew: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Add to list</Text>
              <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
            </View>
            {collections.map((col) => {
              const inList = recipeIds.length === 1
                ? col.recipeIds.includes(recipeIds[0])
                : recipeIds.every((id) => col.recipeIds.includes(id));
              return (
                <Pressable key={col.id} onPress={() => onToggleCollection(col.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}>
                  <Ionicons name={col.id === FAVORITES_ID ? 'heart-outline' : 'albums-outline'} size={22} color={colors.text} />
                  <Text style={{ flex: 1, fontSize: 16, color: colors.text }}>{col.name}</Text>
                  {inList && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
            <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 20, marginVertical: 4 }} />
            <Pressable onPress={() => { onCreateNew(); onClose(); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 }}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={{ fontSize: 16, color: colors.primary, fontWeight: '600' }}>Create new list</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Text input modal (shared for Create + Rename) ─────────────────────────────

function TextInputModal({
  visible,
  title,
  initialValue,
  placeholder,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue ?? '');

  // Sync when the modal opens with a new initialValue
  useEffect(() => { if (visible) setValue(initialValue ?? ''); }, [visible, initialValue]);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.white, borderRadius: 16, padding: 24, width: '100%', gap: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            autoFocus
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text }}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={() => { setValue(''); onClose(); }}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, color: colors.textMuted }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { if (value.trim()) { onConfirm(value.trim()); setValue(''); onClose(); } }}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Meal Plan View ────────────────────────────────────────────────────────────

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

function MealPlanView({ savedRecipes, onAddToGrocery }: {
  savedRecipes: Recipe[];
  onAddToGrocery: (recipes: Recipe[]) => void;
}) {
  const userId = useUserStore((s) => s.profile?.id);
  const [weekOffset, setWeekOffset] = useState(0);
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [planId, setPlanId] = useState<string | undefined>();
  const [slotRecipes, setSlotRecipes] = useState<Record<string, Recipe>>({});
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<{ day: number; mealType: MealType } | null>(null);

  const monday = getMonday(weekOffset);
  const weekStart = toDateStr(monday);

  // Load plan for current week
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getMealPlanForWeek(userId, weekStart)
      .then(async (plan) => {
        const loadedSlots = (plan?.slots ?? []) as MealSlot[];
        setSlots(loadedSlots);
        setPlanId(plan?.id);
        // Hydrate recipe details for display
        const ids = [...new Set(loadedSlots.map((s) => s.recipe_id).filter(Boolean))];
        if (ids.length > 0) {
          const recipes = await getRecipesBySupabaseIds(ids);
          const map: Record<string, Recipe> = {};
          recipes.forEach((r) => { if (r.supabase_id) map[r.supabase_id] = r; });
          setSlotRecipes(map);
        } else {
          setSlotRecipes({});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, weekStart]);

  function getSlot(day: number, mealType: MealType): MealSlot | undefined {
    return slots.find((s) => s.day === day && s.meal_type === mealType);
  }

  async function handleAssign(recipe: Recipe) {
    if (!pickerOpen || !userId) return;
    const recipeId = recipe.supabase_id ?? recipe.id;
    const newSlot: MealSlot = {
      day: pickerOpen.day,
      meal_type: pickerOpen.mealType,
      recipe_id: recipeId,
      servings_multiplier: 1,
    };
    const updated = [...slots.filter((s) => !(s.day === newSlot.day && s.meal_type === newSlot.meal_type)), newSlot];
    setSlots(updated);
    setSlotRecipes((prev) => ({ ...prev, [recipeId]: recipe }));
    setPickerOpen(null);
    // Persist
    const saved = await saveMealPlan(userId, weekStart, updated, planId).catch(() => null);
    if (saved) setPlanId(saved.id);
  }

  async function handleRemove(day: number, mealType: MealType) {
    if (!userId) return;
    const updated = slots.filter((s) => !(s.day === day && s.meal_type === mealType));
    setSlots(updated);
    saveMealPlan(userId, weekStart, updated, planId).catch(() => {});
  }

  function handleAddAllToGrocery() {
    const recipes = slots
      .map((s) => slotRecipes[s.recipe_id])
      .filter(Boolean);
    if (recipes.length === 0) return;
    onAddToGrocery(recipes);
    Alert.alert('Added to grocery list', `${recipes.length} meal${recipes.length !== 1 ? 's' : ''} added.`);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>Loading meal plan...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Week header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
      }}>
        <Pressable onPress={() => setWeekOffset((w) => w - 1)} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
            {formatWeekRange(monday)}
          </Text>
          {weekOffset !== 0 && (
            <Pressable onPress={() => setWeekOffset(0)}>
              <Text style={{ fontSize: 12, color: colors.primary, marginTop: 2 }}>This week</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setWeekOffset((w) => w + 1)} hitSlop={8}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {DAY_NAMES.map((dayName, dayIndex) => (
          <View key={dayIndex} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
              {dayName}
            </Text>
            {MEAL_TYPES.map((mealType) => {
              const slot = getSlot(dayIndex, mealType);
              const recipe = slot ? slotRecipes[slot.recipe_id] : null;
              return (
                <Pressable
                  key={mealType}
                  onPress={() => {
                    if (recipe) return; // tap to view later
                    setPickerOpen({ day: dayIndex, mealType });
                  }}
                  onLongPress={() => { if (slot) handleRemove(dayIndex, mealType); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: colors.white, borderRadius: 10,
                    borderWidth: 1, borderColor: colors.border,
                    padding: 10, marginBottom: 6, minHeight: 52,
                  }}
                >
                  <Text style={{ width: 72, fontSize: 12, color: colors.textMuted, fontWeight: '500' }}>
                    {MEAL_LABELS[mealType]}
                  </Text>
                  {recipe ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {recipe.image_url && (
                        <Image source={{ uri: recipe.image_url }} style={{ width: 36, height: 36, borderRadius: 6 }} contentFit="cover" />
                      )}
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.text }} numberOfLines={1}>
                        {recipe.title}
                      </Text>
                      <Pressable onPress={() => handleRemove(dayIndex, mealType)} hitSlop={8}>
                        <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="add-circle-outline" size={18} color={colors.border} />
                      <Text style={{ fontSize: 13, color: colors.border }}>Add recipe</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Add all to grocery */}
        {slots.length > 0 && (
          <Pressable
            onPress={handleAddAllToGrocery}
            style={{
              backgroundColor: colors.primary, borderRadius: 12,
              paddingVertical: 14, alignItems: 'center', marginTop: 8,
            }}
          >
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>
              Add all {slots.length} meal{slots.length !== 1 ? 's' : ''} to grocery list
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Recipe picker modal */}
      <Modal visible={!!pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(null)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            backgroundColor: colors.white,
          }}>
            <Pressable onPress={() => setPickerOpen(null)} hitSlop={8}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
            </Pressable>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
              Pick a recipe
            </Text>
            <View style={{ width: 50 }} />
          </View>
          {savedRecipes.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <Ionicons name="bookmark-outline" size={40} color={colors.border} />
              <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
                Save some recipes in Discover first.
              </Text>
            </View>
          ) : (
            <FlatList
              data={savedRecipes}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleAssign(item)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    backgroundColor: colors.white, borderRadius: 12,
                    borderWidth: 1, borderColor: colors.border,
                    padding: 12, marginBottom: 8,
                  }}
                >
                  {item.image_url && (
                    <Image source={{ uri: item.image_url }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }} numberOfLines={1}>{item.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                      {item.cuisine}{item.prep_time_mins || item.cook_time_mins ? ` · ${formatTime(item.prep_time_mins, item.cook_time_mins)}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color={colors.primary} />
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function Recipes() {
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'saved' | 'all' | 'plan'>('saved');
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingToList, setAddingToList] = useState<string | null>(null);

  // Three-dot menu
  const [menuRecipe, setMenuRecipe] = useState<Recipe | null>(null);
  // Collection picker (single recipe or batch)
  const [collectionPickerRecipeIds, setCollectionPickerRecipeIds] = useState<string[] | null>(null);
  // Create / rename collection modals
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [renameCollection, setRenameCollection] = useState<RecipeCollection | null>(null);
  // Collection action menu (long press on pill)
  const [collectionMenu, setCollectionMenu] = useState<RecipeCollection | null>(null);
  // All lists modal
  const [showAllCollections, setShowAllCollections] = useState(false);
  // Inline action panel inside All Lists modal (avoids modal-stacking issues)
  const [allListsMenuCol, setAllListsMenuCol] = useState<RecipeCollection | null>(null);
  // Active collection filter
  const [activeCollectionId, setActiveCollectionId] = useState<string>('all');
  // Filter panel (Saved tab — hidden behind filter button)
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  // Recipe detail modal
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [detailData, setDetailData] = useState<MealDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { savedRecipes, addRecipe, removeRecipe, isSaved } = useSavedStore();
  const { addFromDetail, removeRecipeFromList, selectedRecipes } = useGroceryStore();
  const {
    collections, addToCollection, removeFromCollection,
    createCollection, renameCollection: storeRename, deleteCollection, isInCollection,
  } = useCollectionsStore();
  const profile = useUserStore((s) => s.profile);
  const router = useRouter();

  useEffect(() => {
    fetchMealDBRecipesByCategory(8).then(setAllRecipes).finally(() => setIsLoading(false));
  }, []);

  // Reset state when switching tabs
  useEffect(() => {
    setEditMode(false);
    setSelectedIds(new Set());
    setActiveCollectionId('all');
    setActiveFilters(new Set());
  }, [tab]);

  // Open detail modal — serves from Supabase ingredients if already stored,
  // otherwise fetches from TheMealDB and persists for future opens.
  const handleViewDetail = useCallback((recipe: Recipe) => {
    setDetailRecipe(recipe);
    setDetailLoading(true);
    // Log view — repeated views = strong interest signal for Phase 2 recommendations
    if (profile?.id) {
      upsertRecipeByExternalId(recipe)
        .then((supabaseId) => logInteraction(profile.id!, supabaseId, 'view'))
        .catch(() => {});
    }

    if (recipe.ingredients && recipe.ingredients.length > 0) {
      // Already have ingredients from Supabase — no API call needed
      setDetailData({
        blurb: recipe.description ?? '',
        ingredients: recipe.ingredients.map((ing) => ({ name: ing.name, measure: ing.quantity ?? '' })),
      });
      setDetailLoading(false);
      return;
    }

    setDetailData(null);
    fetchMealDetail(recipe.id)
      .then((d) => {
        setDetailData(d);
        if (d) updateRecipeDetail(recipe.id, d.ingredients, d.blurb).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [profile]);

  // Toggle a single filter in/out of the active set
  const toggleFilter = useCallback((f: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }, []);

  const handleAddToList = useCallback(async (recipe: Recipe) => {
    const alreadyInList = selectedRecipes.some((r) => r.id === recipe.id);
    if (alreadyInList) {
      Alert.alert('Remove from list?', `Remove ${recipe.title} from your grocery list?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeRecipeFromList(recipe.id) },
      ]);
      return;
    }
    setAddingToList(recipe.id);
    try {
      let ingredients = recipe.ingredients ?? [];
      if (ingredients.length === 0) {
        const detail = await fetchMealDetail(recipe.id);
        if (detail) {
          ingredients = detail.ingredients.map((i) => ({ name: i.name, quantity: i.measure, unit: '' }));
          updateRecipeDetail(recipe.id, detail.ingredients, detail.blurb).catch(() => {});
        }
      }
      addFromDetail(recipe, ingredients.map((i) => ({ name: i.name, measure: i.quantity ?? '' })));
      // Log grocery_add interaction — frequency of this = "regularly cooks this recipe"
      if (profile?.id) {
        upsertRecipeByExternalId(recipe)
          .then((supabaseId) => logInteraction(profile.id!, supabaseId, 'grocery_add'))
          .catch(() => {});
      }
      Alert.alert('Added to list', `${recipe.title} ingredients added.`, [
        { text: 'View List', onPress: () => router.push('/(tabs)/grocery-list') },
        { text: 'OK' },
      ]);
    } finally {
      setAddingToList(null);
    }
  }, [selectedRecipes, addFromDetail, removeRecipeFromList, router, profile]);

  const handleSaveToggle = useCallback((recipe: Recipe) => {
    if (isSaved(recipe.id)) removeRecipe(recipe, profile?.id);
    else addRecipe(recipe, profile?.id);
  }, [isSaved, removeRecipe, addRecipe, profile]);

  const handleFavoriteToggle = useCallback((recipe: Recipe) => {
    const willLike = !isInCollection(FAVORITES_ID, recipe.id);
    if (willLike) addToCollection(FAVORITES_ID, recipe.id);
    else removeFromCollection(FAVORITES_ID, recipe.id);
    // Fire-and-forget — updates saved_recipes.liked for Claude's recommendation engine
    if (profile?.id) setRecipeLiked(profile.id, recipe.id, willLike).catch(() => {});
  }, [isInCollection, addToCollection, removeFromCollection, profile]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Long press on a recipe card — enter edit mode and select it
  const handleLongPress = useCallback((recipe: Recipe) => {
    if (tab !== 'saved') return; // edit mode only in Saved tab
    setEditMode(true);
    setSelectedIds(new Set([recipe.id]));
  }, [tab]);

  const handleBatchDelete = () => {
    const count = selectedIds.size;
    Alert.alert('Remove recipes?', `Remove ${count} recipe${count !== 1 ? 's' : ''} from Saved?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => {
          selectedIds.forEach((id) => {
            const recipe = savedRecipes.find((r) => r.id === id);
            if (recipe) removeRecipe(recipe, profile?.id);
          });
          setSelectedIds(new Set());
          setEditMode(false);
        },
      },
    ]);
  };

  const handleDeleteCollection = (col: RecipeCollection) => {
    Alert.alert(
      `Delete "${col.name}"?`,
      'The list will be deleted. Recipes in it will stay saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            deleteCollection(col.id);
            if (activeCollectionId === col.id) setActiveCollectionId('all');
          },
        },
      ]
    );
  };

  // Derive display data
  const showSaved = tab === 'saved';
  const baseData = showSaved ? savedRecipes : allRecipes;
  const collectionFiltered = (!showSaved || activeCollectionId === 'all')
    ? baseData
    : baseData.filter((r) => isInCollection(activeCollectionId, r.id));

  const filtered = collectionFiltered.filter((r) => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase());
    if (activeFilters.size === 0) return matchesSearch;
    const typeTag = r.dietary_tags[0] ?? inferCategory(r.title) ?? '';
    const cuisine = r.cuisine ?? '';
    // Split filters by category, then: OR within each category, AND across categories
    const typeFilters = [...activeFilters].filter((f) => (MEAL_CATEGORIES as string[]).includes(f));
    const cuisineFilters = [...activeFilters].filter((f) => (MAIN_CUISINES as string[]).includes(f));
    const matchesType = typeFilters.length === 0 || typeFilters.includes(typeTag);
    const matchesCuisine = cuisineFilters.length === 0 || cuisineFilters.includes(cuisine);
    return matchesSearch && matchesType && matchesCuisine;
  });

  const favoriteIds = collections.find((c) => c.id === FAVORITES_ID)?.recipeIds ?? [];
  const collectionTabs = [
    { id: 'all', name: 'All Saved', recipeIds: [] as string[], isSystem: false as boolean | undefined },
    ...collections,
  ];

  // Grid data — append spacer if odd count so last card stays half-width
  const gridData = filtered.length % 2 !== 0
    ? [...filtered, { id: '__spacer__' } as Recipe]
    : filtered;

  const renderRecipeItem = useCallback(({ item }: { item: Recipe }) => {
    if (item.id === '__spacer__') return <View style={{ flex: 1, margin: 4 }} />;
    return (
      <RecipeGridCard
        recipe={item}
        showSaved={showSaved}
        isSaved={isSaved(item.id)}
        isFavorite={favoriteIds.includes(item.id)}
        isInList={selectedRecipes.some((r) => r.id === item.id)}
        isEditMode={editMode}
        isSelected={selectedIds.has(item.id)}
        onSaveToggle={() => handleSaveToggle(item)}
        onFavoriteToggle={() => handleFavoriteToggle(item)}
        onAddToList={() => handleAddToList(item)}
        onThreeDot={() => setMenuRecipe(item)}
        onSelect={() => toggleSelect(item.id)}
        onLongPress={() => handleLongPress(item)}
        onViewDetail={() => handleViewDetail(item)}
      />
    );
  }, [tab, isSaved, favoriteIds, selectedRecipes, editMode, selectedIds,
      handleSaveToggle, handleFavoriteToggle, handleAddToList, toggleSelect, handleLongPress, handleViewDetail]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Recipes</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {showSaved && (
              <Pressable onPress={() => { setEditMode((e) => !e); setSelectedIds(new Set()); }}>
                <Text style={{ color: editMode ? colors.primary : colors.textMuted, fontSize: 14, fontWeight: '500' }}>
                  {editMode ? 'Done' : 'Edit'}
                </Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', backgroundColor: colors.border, borderRadius: 20, padding: 3 }}>
              <Pressable onPress={() => setTab('all')}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 17, backgroundColor: tab === 'all' ? colors.primary : 'transparent' }}>
                <Text style={{ color: tab === 'all' ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>All</Text>
              </Pressable>
              <Pressable onPress={() => setTab('saved')}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 17, backgroundColor: tab === 'saved' ? colors.primary : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="bookmark" size={12} color={tab === 'saved' ? 'white' : colors.textMuted} />
                <Text style={{ color: tab === 'saved' ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                  Saved {savedRecipes.length > 0 ? `(${savedRecipes.length})` : ''}
                </Text>
              </Pressable>
              <Pressable onPress={() => setTab('plan')}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 17, backgroundColor: tab === 'plan' ? colors.primary : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="calendar-outline" size={12} color={tab === 'plan' ? 'white' : colors.textMuted} />
                <Text style={{ color: tab === 'plan' ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>Plan</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {tab !== 'plan' && <>
        {/* Search + filter button row — filter button opens a dropdown */}
        <View style={{ zIndex: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 }}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={showSaved ? 'Search saved recipes...' : 'Search recipes...'}
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: colors.text }}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            {/* Filter toggle — badge shows active count */}
            <Pressable
              onPress={() => setShowFilterPanel((v) => !v)}
              style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: activeFilters.size > 0 ? colors.primary : colors.white,
                borderWidth: 1, borderColor: activeFilters.size > 0 ? colors.primary : colors.border,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="options-outline" size={20} color={activeFilters.size > 0 ? 'white' : colors.textMuted} />
              {activeFilters.size > 0 && (
                <View style={{
                  position: 'absolute', top: -5, right: -5,
                  width: 16, height: 16, borderRadius: 8,
                  backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: colors.primary }}>{activeFilters.size}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Dropdown — two sections: Type + Cuisine, multi-select */}
          {showFilterPanel && (
            <>
              <Pressable
                onPress={() => setShowFilterPanel(false)}
                style={{ position: 'absolute', top: 52, left: -16, right: -16, height: 2000, zIndex: 19 }}
              />
              <View style={{
                position: 'absolute', top: 52, left: 0, right: 0, zIndex: 20,
                backgroundColor: colors.white, borderRadius: 14,
                borderWidth: 1, borderColor: colors.border, padding: 14,
                shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12, shadowRadius: 14, elevation: 10,
              }}>
                {/* Header row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Filter recipes</Text>
                  {activeFilters.size > 0 && (
                    <Pressable onPress={() => setActiveFilters(new Set())} hitSlop={8}>
                      <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Clear all</Text>
                    </Pressable>
                  )}
                </View>

                {/* Type section */}
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {MEAL_CATEGORIES.map((item) => {
                    const on = activeFilters.has(item);
                    return (
                      <Pressable
                        key={item}
                        onPress={() => toggleFilter(item)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                          backgroundColor: on ? colors.primary : colors.background,
                          borderWidth: 1, borderColor: on ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ color: on ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '500' }}>{item}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Cuisine section */}
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>Cuisine</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {MAIN_CUISINES.map((item) => {
                    const on = activeFilters.has(item);
                    return (
                      <Pressable
                        key={item}
                        onPress={() => toggleFilter(item)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                          backgroundColor: on ? colors.primary : colors.background,
                          borderWidth: 1, borderColor: on ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ color: on ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '500' }}>{item}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </View>

        {/* Collections bar — Saved tab only. "New list" is pinned right, never scrolls away. */}
        {showSaved && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
            <FlatList
              data={collectionTabs}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              renderItem={({ item }) => {
                const isActive = activeCollectionId === item.id;
                const canManage = item.id !== 'all';
                return (
                  <Pressable
                    onPress={() => setActiveCollectionId(item.id)}
                    onLongPress={() => {
                      if (canManage) {
                        const col = collections.find((c) => c.id === item.id);
                        if (col) setCollectionMenu(col);
                      }
                    }}
                    delayLongPress={400}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginRight: 8,
                      backgroundColor: isActive ? colors.primaryLight : 'transparent',
                      borderWidth: 1, borderColor: isActive ? colors.primary : colors.border,
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                    }}
                  >
                    {item.id === FAVORITES_ID && (
                      <Ionicons name="heart" size={12} color={isActive ? colors.primary : colors.textMuted} />
                    )}
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '600' : '400', color: isActive ? colors.primary : colors.textMuted }}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
            {/* Fixed right-side buttons — always visible */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 }}>
              <Pressable
                onPress={() => setShowAllCollections(true)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 999, borderWidth: 1, borderColor: colors.border,
                  backgroundColor: colors.white,
                }}
              >
                <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '500' }}>All lists</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowCreateCollection(true)}
                style={{
                  width: 30, height: 30, borderRadius: 999,
                  borderWidth: 1, borderColor: colors.primary,
                  backgroundColor: colors.primaryLight,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        )}
        </>}
      </View>

      {/* Meal Plan tab */}
      {tab === 'plan' && (
        <MealPlanView
          savedRecipes={savedRecipes}
          onAddToGrocery={(recipes) => {
            for (const recipe of recipes) {
              const ingredients = (recipe.ingredients ?? []).map((i) => ({ name: i.name, measure: i.quantity ?? '' }));
              if (ingredients.length > 0) addFromDetail(recipe, ingredients);
            }
          }}
        />
      )}

      {/* Grid */}
      {tab !== 'plan' && (isLoading && !showSaved ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>Loading recipes...</Text>
        </View>
      ) : (
        <FlatList
          data={gridData}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: editMode && selectedIds.size > 0 ? 120 : 24 }}
          renderItem={renderRecipeItem}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
              {showSaved ? (
                <>
                  <Ionicons name="bookmark-outline" size={48} color={colors.border} />
                  <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>No saved recipes yet</Text>
                  <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 32 }}>
                    Swipe right on recipes in Discover to save them here.
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 16, color: colors.textMuted }}>No recipes found.</Text>
              )}
            </View>
          }
        />
      ))}

      {/* Edit mode batch action bar */}
      {editMode && selectedIds.size > 0 && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
          padding: 16, flexDirection: 'row', gap: 12,
        }}>
          <Pressable onPress={handleBatchDelete}
            style={{ flex: 1, backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: colors.error, fontWeight: '600', fontSize: 15 }}>Remove ({selectedIds.size})</Text>
          </Pressable>
          <Pressable onPress={() => setCollectionPickerRecipeIds([...selectedIds])}
            style={{ flex: 1, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 15 }}>Add to list</Text>
          </Pressable>
        </View>
      )}

      {/* ── Modals ── */}

      <RecipeActionMenu
        visible={!!menuRecipe}
        recipe={menuRecipe}
        isSaved={menuRecipe ? isSaved(menuRecipe.id) : false}
        isFavorite={menuRecipe ? favoriteIds.includes(menuRecipe.id) : false}
        onClose={() => setMenuRecipe(null)}
        onSaveToggle={() => menuRecipe && handleSaveToggle(menuRecipe)}
        onFavoriteToggle={() => menuRecipe && handleFavoriteToggle(menuRecipe)}
        onAddToList={() => menuRecipe && handleAddToList(menuRecipe)}
        onPickCollection={() => menuRecipe && setCollectionPickerRecipeIds([menuRecipe.id])}
      />

      <CollectionPickerModal
        visible={!!collectionPickerRecipeIds}
        collections={collections}
        recipeIds={collectionPickerRecipeIds ?? []}
        onClose={() => setCollectionPickerRecipeIds(null)}
        onToggleCollection={(colId) => {
          const ids = collectionPickerRecipeIds ?? [];
          ids.forEach((id) => {
            if (isInCollection(colId, id)) removeFromCollection(colId, id);
            else addToCollection(colId, id);
          });
        }}
        onCreateNew={() => setShowCreateCollection(true)}
      />

      <CollectionActionMenu
        visible={!!collectionMenu}
        collection={collectionMenu}
        onClose={() => setCollectionMenu(null)}
        onRename={() => setRenameCollection(collectionMenu)}
        onDelete={() => collectionMenu && handleDeleteCollection(collectionMenu)}
      />

      <TextInputModal
        visible={showCreateCollection}
        title="New List"
        placeholder="List name..."
        confirmLabel="Create"
        onClose={() => setShowCreateCollection(false)}
        onConfirm={(name) => createCollection(name)}
      />

      <TextInputModal
        visible={!!renameCollection}
        title="Rename List"
        initialValue={renameCollection?.name}
        placeholder="List name..."
        confirmLabel="Save"
        onClose={() => setRenameCollection(null)}
        onConfirm={(name) => renameCollection && storeRename(renameCollection.id, name)}
      />

      {/* All Lists modal */}
      <Modal visible={showAllCollections} transparent animationType="slide" onRequestClose={() => setShowAllCollections(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setShowAllCollections(false)} />
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingTop: 12, paddingBottom: 40, maxHeight: '75%',
        }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>My Lists</Text>
            <Pressable
              onPress={() => { setShowAllCollections(false); setShowCreateCollection(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>New list</Text>
            </Pressable>
          </View>

          <FlatList
            data={[{ id: 'all', name: 'All Saved', recipeIds: savedRecipes.map(r => r.id), isSystem: true } as RecipeCollection, ...collections]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            renderItem={({ item }) => {
              const count = item.id === 'all' ? savedRecipes.length : item.recipeIds.length;
              const isActive = activeCollectionId === item.id;
              return (
                <Pressable
                  onPress={() => { setActiveCollectionId(item.id); setShowAllCollections(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
                  }}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 10, marginRight: 14,
                    backgroundColor: isActive ? colors.primaryLight : colors.background,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons
                      name={item.id === FAVORITES_ID ? 'heart' : item.id === 'all' ? 'bookmark' : 'folder'}
                      size={20}
                      color={isActive ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: isActive ? '700' : '500', color: isActive ? colors.primary : colors.text }}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 1 }}>
                      {count} {count === 1 ? 'recipe' : 'recipes'}
                    </Text>
                  </View>
                  {!item.isSystem && (
                    <Pressable
                      onPress={() => setAllListsMenuCol(item)}
                      hitSlop={12}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
                    </Pressable>
                  )}
                </Pressable>
              );
            }}
          />

          {/* Inline action panel — shown when three-dot tapped inside this modal */}
          {allListsMenuCol && (
            <>
              {/* Backdrop */}
              <Pressable
                onPress={() => setAllListsMenuCol(null)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
              />
              <View style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                backgroundColor: colors.white,
                borderTopLeftRadius: 16, borderTopRightRadius: 16,
                paddingBottom: 32, paddingTop: 8,
              }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
                <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{allListsMenuCol.name}</Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>
                    {allListsMenuCol.recipeIds.length} {allListsMenuCol.recipeIds.length === 1 ? 'recipe' : 'recipes'}
                  </Text>
                </View>
                <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 20, marginBottom: 4 }} />
                <Pressable
                  onPress={() => {
                    const col = allListsMenuCol;
                    setAllListsMenuCol(null);
                    setShowAllCollections(false);
                    setRenameCollection(col);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 }}
                >
                  <Ionicons name="pencil-outline" size={20} color={colors.text} />
                  <Text style={{ fontSize: 15, color: colors.text }}>Rename list</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const col = allListsMenuCol;
                    setAllListsMenuCol(null);
                    handleDeleteCollection(col);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={{ fontSize: 15, color: colors.error }}>Delete list</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Recipe detail modal */}
      <RecipeDetailModal
        visible={detailRecipe !== null}
        recipe={detailRecipe}
        detail={detailLoading ? null : detailData}
        isSaved={detailRecipe ? isSaved(detailRecipe.id) : false}
        isInCart={detailRecipe ? selectedRecipes.some((r) => r.id === detailRecipe.id) : false}
        onClose={() => setDetailRecipe(null)}
        onSaveToggle={() => {
          if (!detailRecipe) return;
          if (isSaved(detailRecipe.id)) removeRecipe(detailRecipe, profile?.id);
          else addRecipe(detailRecipe, profile?.id);
        }}
        onAddToCart={() => {
          if (!detailRecipe) return;
          handleAddToList(detailRecipe);
          setDetailRecipe(null);
        }}
      />
    </SafeAreaView>
  );
}
