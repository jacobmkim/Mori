import {
  View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useLeftoversStore } from '@/stores/leftoversStore';
import {
  getPantryItems, fetchDiscoverRecipes, scoreRecipe,
  logInteraction, updateStreakAndCount, resolveSupabaseId,
  generateFromPantry, insertCommunityRecipe,
} from '@/lib/api';
import { sessionLeftSwipes } from '@/lib/weekPlanCore';
import { flags } from '@/lib/featureFlags';
import { gateMoriPlus } from '@/lib/paywall';
import { rankByPantryCoverage, type PantryMatch } from '@/lib/pantryMatch';
import { getRecipeImageUrl } from '@/lib/recipeImage';
import { formatTime } from '@/lib/utils';
import { getNewlyEarned, type Badge, type BadgeStats } from '@/lib/badges';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import { PantryModal } from '@/components/PantryModal';
import { BadgeAchievementModal } from '@/components/badges/BadgeAchievementModal';
import type { Recipe } from '@/types';

// "Cook with what I have" (M8 stage 2 — FREE tier). Pantry + leftovers, pre-checked,
// ranked against the audited catalog by lib/pantryMatch (zero AI cost). Two honest
// sections: full matches ("make tonight") and near-misses with a one-tap
// add-the-gap-to-grocery handoff. The premium constrained-generation CTA is stage 3.
//
// MOUNT CONTRACT: the parent renders this only while open ({visible && <Sheet/>}).
// Mount-per-open keeps every session state (extras, deselections, "Added ✓") scoped
// to one open, and guarantees zero background work while the sheet is closed.

const EMPTY_SWIPES = new Map<string, { direction: 'left' | 'right'; swiped_at: string }>();
const EMPTY_AFFINITY = new Map<string, number>();
const EMPTY_INTERACTIONS = new Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>();

interface OnHandItem {
  key: string;
  name: string;
  kind: 'pantry' | 'leftover' | 'extra';
  spoilsAt?: string | null;
  urgent?: boolean;
}

// Hoisted row component — defining it inside the sheet would mint a new component
// type per render and remount every row (images included) on each state change.
function MatchRow({
  m, colors, added, onOpen, onAddGap,
}: {
  m: PantryMatch;
  colors: ReturnType<typeof useTheme>;
  added: boolean;
  onOpen: (r: Recipe) => void;
  onAddGap: (m: PantryMatch) => void;
}) {
  return (
    <Pressable
      onPress={() => onOpen(m.recipe)}
      style={{
        flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12,
        backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border, marginBottom: 8,
      }}
    >
      <Image
        source={{ uri: getRecipeImageUrl(m.recipe.image_url, 'thumb') }}
        style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.border }}
        contentFit="cover"
        recyclingKey={m.recipe.id}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 14, color: colors.text }} numberOfLines={1}>
          {m.recipe.title}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
          {[m.recipe.cuisine, formatTime(m.recipe.prep_time_mins, m.recipe.cook_time_mins)].filter(Boolean).join(' · ')}
        </Text>
        {m.urgentLeftovers.length > 0 ? (
          <Text style={{ fontSize: 11, color: colors.primary, marginTop: 3 }} numberOfLines={1}>
            ⏳ Uses your {m.urgentLeftovers.join(', ')} before it spoils
          </Text>
        ) : m.usesLeftovers.length > 0 ? (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }} numberOfLines={1}>
            Uses your leftover {m.usesLeftovers.join(', ')}
          </Text>
        ) : null}
        {m.missing.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 11, color: colors.textMuted, flexShrink: 1 }} numberOfLines={2}>
              Missing: {m.missing.join(', ')}
            </Text>
            {/* Nested Pressable: RN's responder system gives the inner target the touch,
                so this tap does NOT also open the recipe. */}
            <Pressable
              onPress={() => { if (!added) onAddGap(m); }}
              hitSlop={6}
              style={{
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                backgroundColor: added ? colors.toggleBg : colors.primary,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: added ? colors.textMuted : 'white' }}>
                {added ? 'Added ✓' : `+ Add ${m.missing.length} to list`}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function CookWhatIHaveSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id;

  // Narrow zustand selectors — a whole-store subscription would re-render (and
  // re-rank) on every unrelated grocery/save mutation anywhere in the app.
  const savedRecipes = useSavedStore((s) => s.savedRecipes);
  const addRecipe = useSavedStore((s) => s.addRecipe);
  const removeRecipe = useSavedStore((s) => s.removeRecipe);
  const selectedRecipes = useGroceryStore((s) => s.selectedRecipes);
  const addFromDetail = useGroceryStore((s) => s.addFromDetail);
  const removeRecipeFromList = useGroceryStore((s) => s.removeRecipeFromList);
  const addCustomItem = useGroceryStore((s) => s.addCustomItem);
  const leftovers = useLeftoversStore((s) => s.leftovers);

  // Same saved-check as Explore, but guarded for ephemeral generated recipes:
  // undefined === undefined would read as "saved" the moment ANY saved recipe
  // lacks a supabase_id.
  const isSaved = (r: Recipe) =>
    savedRecipes.some((s) => (r.supabase_id != null && s.supabase_id === r.supabase_id) || s.id === r.id);

  // Captured once per open (mount-per-open contract) — a per-render Date.now()
  // would defeat every memo below.
  const [now] = useState(() => Date.now());
  const [pantryNames, setPantryNames] = useState<string[] | null>(null); // null = loading
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [extras, setExtras] = useState<string[]>([]);                    // this-open-only quick-adds
  const [extraInput, setExtraInput] = useState('');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState<Recipe[] | null>(null);
  const [pantryModalVisible, setPantryModalVisible] = useState(false);
  const [addedToList, setAddedToList] = useState<Set<string>>(new Set()); // recipe ids whose gap was added
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [badgeQueue, setBadgeQueue] = useState<Badge[]>([]);
  // Stage 3 — premium constrained generation. Ephemeral until saved.
  const [genRecipes, setGenRecipes] = useState<Recipe[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  // Generated-recipe id → the private supabase row id once "saved to My Recipes".
  const [savedGenIds, setSavedGenIds] = useState<Map<string, string>>(new Map());

  // Initial load (fetchDiscoverRecipes caches, so reopening is usually free).
  // A failure is a FAILURE state — never conflated with an empty pantry, or an
  // offline user with a stocked kitchen gets told to "set up their pantry".
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadFailed(false);
    Promise.all([getPantryItems(userId), fetchDiscoverRecipes(profile?.dietary_goals ?? [])])
      .then(([items, rs]) => {
        if (cancelled) return;
        setPantryNames(items.map((i) => i.ingredient_name));
        setCatalog(rs);
      })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, reloadKey]);

  // Re-fetch the pantry ONLY when the setup modal CLOSES (not when it opens).
  const pantryModalWasOpen = useRef(false);
  useEffect(() => {
    if (pantryModalVisible) { pantryModalWasOpen.current = true; return; }
    if (!pantryModalWasOpen.current || !userId) return;
    pantryModalWasOpen.current = false;
    getPantryItems(userId)
      .then((items) => setPantryNames(items.map((i) => i.ingredient_name)))
      .catch(() => {});
  }, [pantryModalVisible, userId]);

  const onHand: OnHandItem[] = useMemo(() => {
    const urgentCutoff = now + 3 * 24 * 60 * 60 * 1000;
    const byName = new Map<string, OnHandItem>();
    // Pantry first, then leftovers OVERWRITE same-named entries (a leftover carries
    // spoil urgency, and two identical chips would be confusing dead weight).
    for (const name of pantryNames ?? []) {
      byName.set(name.toLowerCase().trim(), { key: `p:${name.toLowerCase()}`, name, kind: 'pantry' });
    }
    for (const l of leftovers) {
      if (l.dismissed_at) continue;
      const t = new Date(l.spoils_at).getTime();
      // Already-spoiled leftovers are NOT offered as on-hand — the leftovers
      // check-in flow (Yes/Used/Tossed) owns those; recommending them is a
      // food-safety problem, not a feature.
      if (!Number.isNaN(t) && t <= now) continue;
      byName.set(l.ingredient_name.toLowerCase().trim(), {
        key: `l:${l.id}`, name: l.ingredient_name, kind: 'leftover',
        spoilsAt: l.spoils_at, urgent: !Number.isNaN(t) && t <= urgentCutoff,
      });
    }
    for (const name of extras) {
      byName.set(name.toLowerCase().trim(), { key: `x:${name.toLowerCase()}`, name, kind: 'extra' });
    }
    return [...byName.values()];
  }, [pantryNames, leftovers, extras, now]);

  const activeItems = useMemo(() => onHand.filter((i) => !deselected.has(i.key)), [onHand, deselected]);

  const matches: PantryMatch[] = useMemo(() => {
    if (!catalog || activeItems.length === 0) return [];
    // Recipes actively left-swiped this session are a "no for tonight" — exclude
    // them up front (the scorer's -999 would otherwise degrade into a mere
    // last-place tie-break here).
    const pool = catalog.filter((r) => !r.supabase_id || !sessionLeftSwipes.has(r.supabase_id));
    const activePantry = activeItems.filter((i) => i.kind !== 'leftover').map((i) => i.name);
    const activeLeftovers = activeItems.filter((i) => i.kind === 'leftover').map((i) => ({ name: i.name, spoilsAt: i.spoilsAt }));
    // Taste tie-break: the shared scorer with the cheap client-side signals (profile
    // prefs, saved set, pantry/leftovers, flavourDna). forPlanning=true so recipes
    // merely SHOWN in the deck aren't excluded; fixed rng for stable ordering.
    const savedIds = new Set(savedRecipes.map((r) => r.id));
    const pantrySet = new Set(activePantry.map((n) => n.toLowerCase().trim()));
    const leftoversSet = new Set(activeLeftovers.map((l) => l.name.toLowerCase().trim()));
    const flavourDna = (profile?.taste_profile as any)?.flavourDna ?? null;
    const scoreFn = (r: Recipe) =>
      scoreRecipe(r, profile, EMPTY_SWIPES, savedIds, EMPTY_AFFINITY, EMPTY_INTERACTIONS, pantrySet, leftoversSet, undefined, undefined, flavourDna, true, () => 0.5);
    return rankByPantryCoverage({
      catalog: pool,
      pantry: activePantry,
      leftovers: activeLeftovers,
      dietaryGoals: profile?.dietary_goals ?? [],
      ingredientDislikes: profile?.ingredient_dislikes ?? [],
      skillLevel: profile?.skill_level ?? null,
      cookingFrequency: profile?.cooking_frequency ?? null,
      scoreFn,
      now,
    });
  }, [catalog, activeItems, savedRecipes, profile, now]);

  const makeTonight = matches.filter((m) => m.missing.length === 0).slice(0, 12);
  const almostThere = matches.filter((m) => m.missing.length > 0).slice(0, 10);
  const loading = !loadFailed && (pantryNames === null || catalog === null);

  function toggleItem(item: OnHandItem) {
    // Quick-adds are this-open-only: tapping one REMOVES it (typo escape hatch);
    // pantry/leftover chips just toggle out of tonight's search.
    if (item.kind === 'extra') {
      setExtras((prev) => prev.filter((e) => e.toLowerCase() !== item.name.toLowerCase()));
      return;
    }
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
  }

  function addExtra() {
    const name = extraInput.trim();
    if (!name) return;
    setExtras((prev) => (prev.some((e) => e.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name]));
    setExtraInput('');
  }

  function addGapToGrocery(m: PantryMatch) {
    m.missing.forEach((name) => addCustomItem(name));
    setAddedToList((prev) => new Set(prev).add(m.recipe.id));
  }

  function openRecipe(recipe: Recipe) {
    setSelectedRecipe(recipe);
    setDetailVisible(true);
    // Rule 12: every recipe view is logged (fire-and-forget, never blocks UI).
    // Ephemeral generated recipes have no supabase row yet — nothing to log against.
    if (userId && recipe.supabase_id) {
      resolveSupabaseId(recipe)
        .then((supabaseId) => logInteraction(userId, supabaseId, 'view'))
        .catch(() => {});
    }
  }

  // ── Stage 3: generate up to 3 recipes constrained to what's on hand ───────────
  // Free tier gets 1 call/month (the server 402s after that — THE paywall moment);
  // premium is unlimited. Never gates up front: the free taste must actually work.
  async function handleGenerate(afterPurchase = false) {
    if (!userId || genLoading) return;
    const names = activeItems.map((i) => i.name);
    if (names.length < 2) {
      Alert.alert('Add a bit more', 'Pick at least two ingredients to generate a recipe from.');
      return;
    }
    setGenLoading(true);
    try {
      const result = await generateFromPantry(names, {
        dietaryGoals: profile?.dietary_goals ?? [],
        avoidIngredients: profile?.ingredient_dislikes ?? [],
      });
      if (result.budgetExhausted) {
        if (afterPurchase) {
          // Purchased but the webhook hasn't flipped the server flag yet — be honest.
          Alert.alert('Almost there', 'Your subscription is activating — try again in a moment.');
          return;
        }
        const granted = await gateMoriPlus();
        if (granted) await handleGenerate(true); // one retry post-purchase
        return;
      }
      if (result.rateLimited) {
        // Honest ceiling copy — never "something went wrong" for a working limit.
        Alert.alert('That’s the limit for today', 'Generation is capped daily to keep Mori sustainable — try again tomorrow.');
        return;
      }
      if (result.failed || result.recipes.length === 0) {
        Alert.alert('Couldn’t generate', 'Something went wrong — try again in a moment.');
        return;
      }
      setGenRecipes(result.recipes);
    } finally {
      setGenLoading(false);
    }
  }

  // Save an ephemeral generated recipe as a PRIVATE row (is_public: false — never
  // into the public catalog), then into the saved library with its real id.
  // Returns the persisted Recipe (or null). In-flight guard: a double-tap (row
  // Save + modal heart) must not insert duplicate private rows.
  const savingGenIds = useRef<Set<string>>(new Set());
  async function saveGeneratedRecipe(recipe: Recipe): Promise<Recipe | null> {
    if (!userId) return null;
    if (savingGenIds.current.has(recipe.id) || savedGenIds.has(recipe.id) || recipe.supabase_id) return recipe.supabase_id ? recipe : null;
    savingGenIds.current.add(recipe.id);
    try {
      const rowId = await insertCommunityRecipe({
        title: recipe.title,
        description: recipe.description ?? null,
        cuisine: recipe.cuisine ?? null,
        ingredients: (recipe.ingredients ?? []) as { name: string; quantity: string; unit: string }[],
        steps: (recipe.steps ?? []) as { order: number; instruction: string; title?: string }[],
        prep_time_mins: recipe.prep_time_mins ?? null,
        cook_time_mins: recipe.cook_time_mins ?? null,
        servings: recipe.servings ?? 2,
        dietary_tags: recipe.dietary_tags ?? [],
        meal_prep_friendly: recipe.meal_prep_friendly ?? false,
        skill_level: 'home_cook',
        macros: recipe.macros ?? null,
        submitted_by: userId,
        image_url: null,
        is_public: false,
      });
      const persisted = { ...recipe, supabase_id: rowId } as Recipe;
      addRecipe(persisted, userId);
      setSavedGenIds((prev) => new Map(prev).set(recipe.id, rowId));
      // Keep the open detail modal (and future taps) pointed at the persisted row.
      setGenRecipes((prev) => prev.map((r) => (r.id === recipe.id ? persisted : r)));
      if (selectedRecipe?.id === recipe.id) setSelectedRecipe(persisted);
      return persisted;
    } catch {
      Alert.alert('Couldn’t save', 'Try again in a moment.');
      return null;
    } finally {
      savingGenIds.current.delete(recipe.id);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '700', fontSize: 20, color: colors.text }}>
            Cook with what I have
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : loadFailed ? (
          // Honest failure state — never "set up your pantry" when the truth is "offline".
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
              Couldn’t load your kitchen — check your connection and try again.
            </Text>
            <Pressable
              onPress={() => { setPantryNames(null); setCatalog(null); setReloadKey((k) => k + 1); }}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, marginTop: 4 }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Retry</Text>
            </Pressable>
          </View>
        ) : onHand.length === 0 ? (
          // Empty pantry + no leftovers — a setup state, never a dead end.
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
            <Ionicons name="basket-outline" size={40} color={colors.textMuted} />
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 17, color: colors.text, textAlign: 'center' }}>
              What’s in your kitchen?
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
              Add your pantry once and Mori will show you what you can cook tonight without a shopping trip.
            </Text>
            <Pressable
              onPress={() => setPantryModalVisible(true)}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, marginTop: 4 }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Set up my pantry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
            {/* On-hand chips — checked by default; tap to leave out tonight (tap removes quick-adds) */}
            <Text style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
              Using ({activeItems.length})
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {onHand.map((item) => {
                const off = deselected.has(item.key);
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => toggleItem(item)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: off ? colors.background : colors.card,
                      borderWidth: 1, borderColor: off ? colors.border : colors.primary,
                      opacity: off ? 0.55 : 1,
                    }}
                  >
                    {item.kind === 'leftover' && (
                      <Ionicons name={item.urgent ? 'time-outline' : 'leaf-outline'} size={11} color={item.urgent ? colors.primary : colors.textMuted} />
                    )}
                    <Text style={{ fontSize: 12, color: off ? colors.textMuted : colors.text, textDecorationLine: off ? 'line-through' : 'none' }}>
                      {item.name}{item.urgent && !off ? ' · use soon' : ''}
                    </Text>
                    {item.kind === 'extra' && (
                      <Ionicons name="close-circle" size={12} color={colors.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Quick add — this-open-only ("also have tonight"); pantry setup is for permanent items */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <TextInput
                value={extraInput}
                onChangeText={setExtraInput}
                onSubmitEditing={addExtra}
                placeholder="Also using tonight… (e.g. mushrooms)"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                style={{
                  flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text, backgroundColor: colors.card,
                }}
              />
              <Pressable onPress={addExtra} hitSlop={8} style={{ padding: 6 }}>
                <Ionicons name="add-circle" size={26} color={colors.primary} />
              </Pressable>
            </View>
            <Pressable onPress={() => setPantryModalVisible(true)} hitSlop={6} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Edit my pantry</Text>
            </Pressable>

            {/* Results */}
            {makeTonight.length > 0 && (
              <>
                <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '700', fontSize: 17, color: colors.text, marginTop: 20, marginBottom: 10 }}>
                  You can make tonight
                </Text>
                {makeTonight.map((m) => (
                  <MatchRow key={m.recipe.id} m={m} colors={colors} added={addedToList.has(m.recipe.id)} onOpen={openRecipe} onAddGap={addGapToGrocery} />
                ))}
              </>
            )}
            {almostThere.length > 0 && (
              <>
                <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '700', fontSize: 17, color: colors.text, marginTop: 20, marginBottom: 2 }}>
                  Almost there
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
                  A couple of ingredients short — add the gap to your list.
                </Text>
                {almostThere.map((m) => (
                  <MatchRow key={m.recipe.id} m={m} colors={colors} added={addedToList.has(m.recipe.id)} onOpen={openRecipe} onAddGap={addGapToGrocery} />
                ))}
              </>
            )}
            {makeTonight.length === 0 && almostThere.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                <Ionicons name="search-outline" size={28} color={colors.textMuted} />
                <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 24 }}>
                  {activeItems.length === 0
                    ? 'Everything’s unchecked — tap items above to include them.'
                    : 'Nothing quite matches yet. Add a few more items above — proteins and vegetables help most. (Basics like salt, oil and rice are already assumed.)'}
                </Text>
              </View>
            )}

            {/* ── Stage 3: premium constrained generation (kill-switched) ─────────── */}
            {flags.moriPlusEnabled && activeItems.length >= 2 && (
              <View style={{ marginTop: 20 }}>
                {genRecipes.length > 0 && (
                  <>
                    <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '700', fontSize: 17, color: colors.text, marginBottom: 2 }}>
                      Made from your kitchen
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
                      Created just now from exactly what you have — save any you want to keep.
                    </Text>
                    {genRecipes.map((r) => {
                      const saved = savedGenIds.has(r.id) || !!r.supabase_id;
                      return (
                        <Pressable
                          key={r.id}
                          onPress={() => openRecipe(r)}
                          style={{
                            flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12, alignItems: 'center',
                            backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.primary, marginBottom: 8,
                          }}
                        >
                          <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: colors.toggleBg, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 14, color: colors.text }} numberOfLines={1}>
                              {r.title}
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
                              {[r.cuisine, formatTime(r.prep_time_mins, r.cook_time_mins)].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => { if (!saved) saveGeneratedRecipe(r); }}
                            hitSlop={6}
                            style={{
                              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                              backgroundColor: saved ? colors.toggleBg : colors.primary,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: saved ? colors.textMuted : 'white' }}>
                              {saved ? 'Saved ✓' : 'Save'}
                            </Text>
                          </Pressable>
                        </Pressable>
                      );
                    })}
                  </>
                )}
                <Pressable
                  onPress={() => handleGenerate()}
                  disabled={genLoading}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13,
                    opacity: genLoading ? 0.7 : 1, marginTop: genRecipes.length > 0 ? 4 : 0,
                  }}
                >
                  {genLoading ? (
                    <>
                      <ActivityIndicator size="small" color="white" />
                      <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Cooking something up…</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={15} color="white" />
                      <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
                        {genRecipes.length > 0 ? 'Generate different ones' : 'Generate a recipe from exactly what you have'}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: 'center', marginTop: 6 }}>
                  Mori+ · free plan includes 1 a month
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        <PantryModal visible={pantryModalVisible} onClose={() => setPantryModalVisible(false)} />

        <RecipeDetailModal
          visible={detailVisible}
          recipe={selectedRecipe}
          detail={null}
          isSaved={selectedRecipe ? isSaved(selectedRecipe) : false}
          isInCart={selectedRecipe ? selectedRecipes.some((r) => r.id === selectedRecipe.id) : false}
          onClose={() => setDetailVisible(false)}
          onSaveToggle={() => {
            if (!selectedRecipe || !userId) return;
            // An ephemeral generated recipe must persist as a private row first —
            // savedStore's DB sync needs a real supabase_id.
            if (!selectedRecipe.supabase_id) { saveGeneratedRecipe(selectedRecipe); return; }
            if (isSaved(selectedRecipe)) removeRecipe(selectedRecipe, userId);
            else addRecipe(selectedRecipe, userId);
          }}
          onAddToCart={(scaledIngredients) => {
            if (!selectedRecipe) return;
            addFromDetail(selectedRecipe, scaledIngredients);
          }}
          onRemoveFromCart={() => { if (selectedRecipe) removeRecipeFromList(selectedRecipe.id); }}
          onMarkCooked={async () => {
            if (!selectedRecipe || !userId) return;
            // Cooking an EPHEMERAL generated recipe silently loses the cook (no row to
            // log against, streak/count untouched) — persist it first: cooking it is
            // the strongest "worth keeping" signal there is.
            let cookedRecipe = selectedRecipe;
            if (!cookedRecipe.supabase_id) {
              const persisted = await saveGeneratedRecipe(cookedRecipe);
              if (!persisted) return; // save failed — alert already shown, don't half-log
              cookedRecipe = persisted;
            }
            // Same flow as Explore: cooked = ingredients spent → off the grocery list,
            // interaction logged, streak/count updated, badge unlocks surfaced.
            removeRecipeFromList(cookedRecipe.id);
            const prof = useUserStore.getState().profile;
            const preCooked = prof?.meals_cooked_count ?? 0;
            const preLongest = prof?.longest_streak ?? 0;
            resolveSupabaseId(cookedRecipe)
              .then((supabaseId) => {
                logInteraction(userId, supabaseId, 'cooked').catch(() => {});
                updateStreakAndCount(userId).then((updates) => {
                  if (updates && prof) {
                    useUserStore.getState().setProfile({ ...prof, ...updates });
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
    </Modal>
  );
}
