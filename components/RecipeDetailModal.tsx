/**
 * RecipeDetailModal.tsx
 * Full-screen recipe detail — Section 18.4 spec.
 * Tabs: Ingredients | Steps | My Notes
 * Sticky footer: Add to grocery + Save
 * Steps as self-contained cards with title + detail + timer pill
 * My Notes tab with rating, tags, substitutions, make-again
 */
import {
  View, Text, Modal, Pressable, ScrollView, Dimensions,
  ActivityIndicator, Alert, TextInput, Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { formatTime, formatCost } from '@/lib/utils';
import { fetchMacros, flagRecipe, getRecipeNote, saveRecipeNote, fetchRecipeReviews, getUserReviewForRecipe, hasUserCookedRecipe, submitReview, updateReview, deleteReview, fetchCreatorStats, rateRecipe } from '@/lib/api';
import { ReviewItem } from '@/components/ReviewItem';
import { ReviewComposer } from '@/components/ReviewComposer';
import { CreatorStatsCard } from '@/components/CreatorStatsCard';
import { PostCookLeftoversModal } from '@/components/PostCookLeftoversModal';
import { useDiscoverStore } from '@/stores/discoverStore';
import { getStaticSubs, getCachedSubs, fetchAndCacheSubs, type Swap } from '@/lib/substitutions';
import { supabase } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { MacroRow } from '@/components/ui/MacroRow';
import { scaleMacros } from '@/lib/macroUtils';
import { CookingMode } from '@/components/CookingMode';
import { timerDoneHaptic } from '@/lib/haptics';
import { playTimerChime } from '@/lib/sound';
import { useUserStore } from '@/stores/userStore';
import type { Recipe, Macros, RecipeStep, Review, CreatorStats } from '@/types';
import type { MealDetail } from '@/lib/mealdb';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Serving size helpers ───────────────────────────────────────────────────────
const UNICODE_FRACS: [string, number][] = [
  ['⅛', 1 / 8], ['¼', 1 / 4], ['⅓', 1 / 3],
  ['½', 1 / 2], ['⅔', 2 / 3], ['¾', 3 / 4],
];

function parseLeadingNumber(str: string): { value: number; rest: string } | null {
  // ASCII fraction: "1/2", "3/4"
  const frac = str.match(/^(\d+)\/(\d+)(.*)/);
  if (frac) return { value: parseInt(frac[1]) / parseInt(frac[2]), rest: frac[3] };
  // Integer + unicode fraction: "1½", "2¼"
  const intMatch = str.match(/^(\d+)/);
  if (intMatch) {
    const intVal = parseInt(intMatch[1]);
    const after = str.slice(intMatch[1].length);
    for (const [sym, val] of UNICODE_FRACS) {
      if (after.startsWith(sym)) return { value: intVal + val, rest: after.slice(sym.length) };
    }
  }
  // Standalone unicode fraction: "½", "¼"
  for (const [sym, val] of UNICODE_FRACS) {
    if (str.startsWith(sym)) return { value: val, rest: str.slice(sym.length) };
  }
  // Decimal or integer
  const dec = str.match(/^(\d+\.?\d*)(.*)/);
  if (dec) return { value: parseFloat(dec[1]), rest: dec[2] };
  return null;
}

function formatNumber(n: number): string {
  const fractions: [number, string][] = [
    [0.25, '¼'], [0.33, '⅓'], [0.5, '½'], [0.67, '⅔'], [0.75, '¾'],
  ];
  const whole = Math.floor(n);
  const remainder = n - whole;
  for (const [val, sym] of fractions) {
    if (Math.abs(remainder - val) < 0.05) return whole > 0 ? `${whole}${sym}` : sym;
  }
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1);
}

function scaleMeasure(measure: string, ratio: number): string {
  if (!measure || ratio === 1) return measure;
  const parsed = parseLeadingNumber(measure.trim());
  if (!parsed) return measure;
  return `${formatNumber(parsed.value * ratio)}${parsed.rest}`;
}

/** Snap a cup value to the nearest cooking-friendly fraction and format with symbols. */
function formatCups(cups: number): string {
  // Only use fractions cooks actually measure: ⅛ ¼ ⅓ ½ ⅔ ¾
  const FRACS: [number, string][] = [
    [0, ''], [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'],
    [0.5, '½'], [0.667, '⅔'], [0.75, '¾'],
  ];
  const whole = Math.floor(cups);
  const rem = cups - whole;
  if (rem > 0.875) return `${whole + 1}`;
  let best: [number, string] = FRACS[0];
  for (const f of FRACS) {
    if (Math.abs(rem - f[0]) < Math.abs(rem - best[0])) best = f;
  }
  const fracStr = best[1];
  if (whole === 0) return fracStr || '⅛';
  return fracStr ? `${whole}${fracStr}` : `${whole}`;
}

/** Convert metric units to US (cups/tbsp/tsp/oz/lbs) or pass through if system is 'metric'. */
function normalizeMeasure(measure: string, system: 'us' | 'metric' = 'us'): string {
  if (!measure || system === 'metric') return measure;
  const parsed = parseLeadingNumber(measure.trim());
  if (!parsed) return measure;
  const v = parsed.value;
  const tokens = parsed.rest.trim().split(/\s+/);
  const unitRaw = (tokens[0] ?? '').replace(/\.$/, '').toLowerCase();
  const trailing = tokens.slice(1).join(' ');

  let converted: string | null = null;
  if (unitRaw === 'ml') {
    if (v >= 60)      converted = `${formatCups(v / 240)} cup`;
    else if (v >= 15) converted = `${formatNumber(v / 15)} tbsp`;
    else if (v >= 5)  converted = `${formatNumber(v / 5)} tsp`;
  } else if (unitRaw === 'l') {
    converted = `${formatCups((v * 1000) / 240)} cup`;
  } else if (unitRaw === 'g' && v >= 14) {
    converted = `${formatNumber(v / 28.35)} oz`;
  } else if (unitRaw === 'kg') {
    converted = `${formatNumber(v * 2.205)} lbs`;
  }

  if (converted === null) return measure;
  return trailing ? `${converted} ${trailing}` : converted;
}

// ── Extract a title from a step ───────────────────────────────────────────────
// Uses AI-generated title if present, falls back to sentence extraction
function extractStepTitle(step: RecipeStep): { title: string; detail: string } {
  // Use AI-generated title if present
  if (step.title) {
    return { title: step.title, detail: step.instruction };
  }

  // Fallback: extract first complete sentence as title
  const instruction = step.instruction;
  const match = instruction.match(/^([^.!?]+[.!?])\s+(.*)/s);
  if (match && match[1].length <= 60) {
    return { title: match[1].replace(/[.!?]$/, '').trim(), detail: match[2].trim() };
  }

  // Final fallback: first 8 words as title
  const words = instruction.split(' ');
  if (words.length > 10) {
    return { title: words.slice(0, 8).join(' '), detail: words.slice(8).join(' ') };
  }

  return { title: instruction, detail: '' };
}

// ── Extract timer duration from instruction text ──────────────────────────────
function extractTimerMinutes(instruction: string): number | null {
  const match = instruction.match(/(\d+)[\s-]*(to[\s-]*\d+\s*)?min(?:ute)?s?/i);
  if (match) return parseInt(match[1]);
  const hrMatch = instruction.match(/(\d+)\s*hour/i);
  if (hrMatch) return parseInt(hrMatch[1]) * 60;
  return null;
}

// ── Note types ────────────────────────────────────────────────────────────────
const QUICK_TAGS = ['Family favourite', 'Make again', 'Too spicy', 'Too salty', 'Weekend only', 'Quick win'];
const MAKE_AGAIN_OPTIONS = [
  { key: 'yes', label: 'Yes, exactly as is', bg: '#E8F5E9', text: '#2E7D32' },
  { key: 'with_changes', label: 'Yes, with some changes', bg: '#FFF8E1', text: '#E65100' },
  { key: 'no', label: 'Probably not', bg: '#FFEBEE', text: '#C62828' },
];

// ── Component ─────────────────────────────────────────────────────────────────
interface RecipeDetailModalProps {
  visible: boolean;
  recipe: Recipe | null;
  detail: MealDetail | null | undefined;
  isSaved: boolean;
  isInCart: boolean;
  isCooked?: boolean;
  onClose: () => void;
  onSaveToggle: () => void;
  onAddToCart: (scaledIngredients: { name: string; measure: string }[]) => void;
  onRemoveFromCart?: () => void;
  onMarkCooked?: () => void;
  // Optional slot-add CTA — when set (e.g. opened from the Plan tab picker),
  // replaces the default save/grocery footer with a single "Add to {slot}" button.
  slotContext?: string;
  onAddToSlot?: () => void;
  // When set, opens directly into CookingMode at the given step. Used by the
  // ResumeCookHandler to drop the user back into a cook session they
  // backgrounded out of.
  autoOpenCookingAtStep?: number;
}

export function RecipeDetailModal({
  visible, recipe, detail, isSaved, isInCart, isCooked = false,
  onClose, onSaveToggle, onAddToCart, onRemoveFromCart, onMarkCooked,
  slotContext, onAddToSlot, autoOpenCookingAtStep,
}: RecipeDetailModalProps) {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const [baseMacros, setBaseMacros] = useState<Macros | null>(null);
  const [servings, setServings] = useState(1);
  const [userRating, setUserRating] = useState(0);
  const [storageTips, setStorageTips] = useState<string | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [showLeftoversModal, setShowLeftoversModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'ingredients' | 'steps' | 'notes' | 'reviews'>('ingredients');

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [hasCooked, setHasCooked] = useState(false);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null);
  const [creatorStatsLoading, setCreatorStatsLoading] = useState(false);
  const [cookingModeVisible, setCookingModeVisible] = useState(false);
  const [showServingsSheet, setShowServingsSheet] = useState(false);
  const [groceryToast, setGroceryToast] = useState(false);
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Active step index for steps tab
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [ingredRefExpanded, setIngredRefExpanded] = useState(false);

  // Per-ingredient swap state
  type SwapState = Swap[] | 'loading' | 'no_subs' | 'unavailable';
  const [swapData, setSwapData] = useState<Record<number, SwapState>>({});
  const [expandedSwapIdx, setExpandedSwapIdx] = useState<number | null>(null);
  // Applied swaps: index → substitute name (session-only override)
  const [appliedSwaps, setAppliedSwaps] = useState<Record<number, string>>({});
  const unitSystem = useDiscoverStore((s) => s.unitSystem);

  // Active timer state
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStepIndex, setTimerStepIndex] = useState<number | null>(null);

  // Notes state
  const [noteText, setNoteText] = useState('');
  const [noteSubs, setNoteSubs] = useState('');
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [noteMakeAgain, setNoteMakeAgain] = useState<string | null>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);

  const baseServings = recipe?.servings ?? 4;

  useEffect(() => {
    if (!visible || !recipe) {
      setBaseMacros(null); setServings(baseServings); setUserRating(0);
      setStorageTips(null); setActiveTab('ingredients'); setActiveStepIndex(0);
      setTimerSeconds(null); setTimerRunning(false); setTimerStepIndex(null);
      setNoteEditing(false); setNoteSaved(false);
      setShowServingsSheet(false); setGroceryToast(false);
      setSwapData({}); setExpandedSwapIdx(null); setAppliedSwaps({});
      setShowLeftoversModal(false);
      setReviews([]); setUserReview(null); setHasCooked(false);
      setEditingReview(false); setReviewDismissed(false); setCreatorStats(null);
      return;
    }
    setServings(baseServings);
    const ings = (recipe.ingredients?.length ?? 0) > 0
      ? recipe.ingredients
      : (detail?.ingredients ?? []).map((i) => ({ name: i.name, quantity: i.measure, unit: '' }));
    fetchMacros(recipe.title, ings, { externalId: recipe.external_id ?? undefined, supabaseId: recipe.supabase_id }).then(setBaseMacros).catch(() => setBaseMacros(null));

    // Load existing note
    if (userId && recipe.supabase_id) {
      setNoteLoading(true);
      getRecipeNote(userId, recipe.supabase_id)
        .then((note) => {
          if (note) {
            setNoteText(note.note_text ?? '');
            setNoteSubs(note.substitutions ?? '');
            setNoteTags(note.tags ?? []);
            setNoteMakeAgain(note.make_again ?? null);
            setNoteSaved(true);
          } else {
            setNoteText(''); setNoteSubs(''); setNoteTags([]); setNoteMakeAgain(null); setNoteSaved(false);
          }
        })
        .catch(() => {})
        .finally(() => setNoteLoading(false));
    }
  }, [visible, recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open CookingMode when ResumeCookHandler restores a session.
  useEffect(() => {
    if (visible && recipe && typeof autoOpenCookingAtStep === 'number') {
      setCookingModeVisible(true);
    }
  }, [visible, recipe?.id, autoOpenCookingAtStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer countdown
  useEffect(() => {
    if (!timerRunning || timerSeconds === null) return;
    if (timerSeconds <= 0) {
      setTimerRunning(false);
      timerDoneHaptic();
      playTimerChime();
      return;
    }
    const t = setTimeout(() => setTimerSeconds((s) => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [timerRunning, timerSeconds]);

  useEffect(() => {
    if (!isCooked || !recipe || storageTips !== null || tipsLoading) return;
    const ingredientNames = ((recipe.ingredients?.length ?? 0) > 0
      ? recipe.ingredients.map((i) => i.name)
      : (detail?.ingredients ?? []).map((i) => i.name)).slice(0, 8);
    if (ingredientNames.length === 0) return;
    setTipsLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch(`${getApiBaseUrl()}/api/storage-tip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ ingredients: ingredientNames }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.tips) setStorageTips(data.tips); })
        .catch(() => {})
        .finally(() => setTipsLoading(false));
    }).catch(() => setTipsLoading(false));
  }, [isCooked, recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load reviews + cook status when reviews tab becomes active
  useEffect(() => {
    if (activeTab !== 'reviews' || !recipe || !userId) return;
    const recipeId = recipe.supabase_id ?? recipe.id;
    setReviewsLoading(true);
    Promise.all([
      fetchRecipeReviews(recipeId),
      getUserReviewForRecipe(userId, recipeId),
      hasUserCookedRecipe(userId, recipeId),
    ]).then(([list, own, cooked]) => {
      setReviews(list);
      setUserReview(own);
      setHasCooked(cooked);
    }).catch(() => {}).finally(() => setReviewsLoading(false));

    if (recipe.submitted_by === userId) {
      setCreatorStatsLoading(true);
      fetchCreatorStats(recipeId)
        .then(setCreatorStats)
        .catch(() => {})
        .finally(() => setCreatorStatsLoading(false));
    }
  }, [activeTab, recipe?.id, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmitReview(rating: number, text: string) {
    if (!userId || !recipe) return;
    const recipeId = recipe.supabase_id ?? recipe.id;
    try {
      if (userReview) {
        const updated = await updateReview(userReview.id, rating, text || null);
        setUserReview(updated);
        setReviews((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      } else {
        const created = await submitReview(userId, recipeId, rating, text || null);
        setUserReview(created);
        setReviews((prev) => [created, ...prev]);
      }
      // Sync private scorer signal alongside the public review
      if (recipe.supabase_id) rateRecipe(userId, recipe.supabase_id, rating).catch(() => {});
      setUserRating(rating);
      setEditingReview(false);
    } catch (err: any) {
      if (err?.message?.includes('review_insert') || err?.code === '42501') {
        Alert.alert('Not available', 'You need to mark this recipe as cooked before reviewing.');
      } else {
        Alert.alert('Error', 'Could not save review. Try again.');
      }
    }
  }

  async function handleDeleteReview() {
    if (!userReview) return;
    try {
      await deleteReview(userReview.id);
      setReviews((prev) => prev.filter((r) => r.id !== userReview.id));
      setUserReview(null);
    } catch {
      Alert.alert('Error', 'Could not delete review. Try again.');
    }
  }

  const adjustServings = useCallback((delta: number) => {
    setServings((prev) => Math.max(1, Math.min(20, prev + delta)));
  }, []);

  async function handleSaveNote() {
    if (!userId || !recipe?.supabase_id) return;
    try {
      await saveRecipeNote(userId, recipe.supabase_id, {
        note_text: noteText.trim() || null,
        substitutions: noteSubs.trim() || null,
        tags: noteTags,
        make_again: noteMakeAgain as any,
      });
      setNoteSaved(true);
      setNoteEditing(false);
    } catch {
      Alert.alert('Could not save note', 'Please try again.');
    }
  }

  async function handleSwapTap(idx: number, ingName: string) {
    // Toggle collapse if already resolved
    const current = swapData[idx];
    if (current !== undefined && current !== 'loading') {
      setExpandedSwapIdx((prev) => (prev === idx ? null : idx));
      return;
    }
    if (current === 'loading') return;

    setExpandedSwapIdx(idx);

    // 1. Static table — instant
    const staticSubs = getStaticSubs(ingName, unitSystem);
    if (staticSubs) {
      setSwapData((prev) => ({ ...prev, [idx]: staticSubs }));
      return;
    }

    // 2. AsyncStorage cache — from a previous API call
    const cached = await getCachedSubs(ingName);
    if (cached) {
      setSwapData((prev) => ({ ...prev, [idx]: cached }));
      return;
    }

    // 3. API fallback — Claude Haiku, rate-limited, result saved to cache
    setSwapData((prev) => ({ ...prev, [idx]: 'loading' }));

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSwapData((prev) => ({ ...prev, [idx]: 'no_subs' })); return; }

    const { swaps, rateLimited } = await fetchAndCacheSubs(ingName, session.access_token, getApiBaseUrl());
    if (rateLimited) {
      setSwapData((prev) => ({ ...prev, [idx]: 'unavailable' }));
    } else {
      setSwapData((prev) => ({ ...prev, [idx]: swaps.length > 0 ? swaps : 'no_subs' }));
    }
  }

  if (!recipe) return null;

  const ratio = servings / baseServings;

  function handleAddToCart() {
    const scaled = ingredients.map((ing) => ({
      name: ing.name,
      measure: scaleMeasure('measure' in ing ? ing.measure : (ing as any).quantity ?? '', ratio),
    }));
    onAddToCart(scaled);
  }

  function openServingsSheet() {
    setShowServingsSheet(true);
    sheetAnim.setValue(SCREEN_HEIGHT);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  }

  function closeServingsSheet() {
    Animated.timing(sheetAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start(() => setShowServingsSheet(false));
  }
  const scaledMacros = baseMacros ? scaleMacros(baseMacros, ratio) : null;
  const timeStr = formatTime(recipe.prep_time_mins, recipe.cook_time_mins);
  const costStr = formatCost(recipe.cost_per_serving);

  const ingredients = detail?.ingredients && detail.ingredients.length > 0
    ? detail.ingredients
    : recipe.ingredients.map((i) => ({ name: i.name, measure: `${i.quantity ?? ''} ${i.unit ?? ''}`.trim() }));

  const steps = (recipe.steps ?? []).slice().sort((a, b) => a.order - b.order);

  const reviewCount = recipe?.rating_count ?? 0;
  const TABS = [
    { key: 'ingredients', label: 'Ingredients' },
    { key: 'steps', label: 'Steps' },
    { key: 'notes', label: 'Notes' },
    { key: 'reviews', label: reviewCount > 0 ? `Reviews (${reviewCount})` : 'Reviews' },
  ] as const;

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>

          {/* Back button — floats above scroll content */}
          <Pressable
            onPress={onClose} hitSlop={8}
            style={{
              position: 'absolute', zIndex: 10, top: 52, left: 16,
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.88)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={20} color="#1A1A1A" />
          </Pressable>
          {/* Dev flag */}
          {__DEV__ && (
            <Pressable
              onPress={() => {
                const reasons = ['Wrong image', 'Bad recipe / not tasty', 'Wrong ingredients', 'Bad macro data', 'Incorrect cuisine', 'Duplicate recipe'];
                Alert.alert('Flag Recipe', `"${recipe.title}"`, [
                  ...reasons.map((r) => ({ text: r, onPress: () => { flagRecipe(recipe, r); Alert.alert('Flagged', `"${recipe.title}" flagged.`); } })),
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              hitSlop={8}
              style={{
                position: 'absolute', zIndex: 10, top: 52, right: 16,
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: 'rgba(180,0,0,0.7)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="flag" size={16} color="white" />
            </Pressable>
          )}

          <ScrollView stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {/* 0: Header — scrolls away */}
          <View>
            <Image
              source={{ uri: recipe.image_url ?? '' }}
              style={{ width: '100%', height: 220 }}
              contentFit="cover"
            />

          {/* Recipe info block */}
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: colors.background }}>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, color: colors.text, marginBottom: recipe.source_type === 'community' ? 4 : 10, lineHeight: 28 }}>
              {recipe.title}
            </Text>

            {recipe.source_type === 'community' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Ionicons name="people-outline" size={12} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  By {recipe.submitter_username ? `@${recipe.submitter_username}` : recipe.submitter_name ?? 'Mori community'}
                </Text>
              </View>
            )}

            {/* Meta pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  ...(recipe.cuisine
                    ? recipe.cuisine.split(',').map(c => c.trim().charAt(0).toUpperCase() + c.trim().slice(1))
                    : []),
                  ...(recipe.cuisine?.includes(',') ? ['Fusion'] : []),
                  timeStr,
                  recipe.servings ? `${servings} serving${servings !== 1 ? 's' : ''}` : null,
                  costStr ? `${costStr}/serving` : null,
                ].filter(Boolean).map((pill) => (
                  <View key={pill} style={{ backgroundColor: colors.border + '66', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>{pill}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Rating summary — tap to jump to Reviews tab */}
            {(recipe.rating_count ?? 0) >= 3 && (
              <Pressable
                onPress={() => setActiveTab('reviews')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}
                hitSlop={6}
              >
                <Ionicons name="star" size={14} color="#FFC107" />
                <Text style={{ fontSize: 13, color: colors.text, fontWeight: '600' }}>
                  {Number(recipe.avg_rating).toFixed(1)}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  · {recipe.rating_count} {recipe.rating_count === 1 ? 'review' : 'reviews'}
                </Text>
              </Pressable>
            )}

            {/* Macros row */}
            {scaledMacros && (
              <View style={{ marginBottom: 6 }}>
                <MacroRow macros={scaledMacros} />
                <Text style={{ fontSize: 9, color: colors.textMuted, textAlign: 'center', marginTop: 4 }}>
                  Estimated values
                </Text>
              </View>
            )}
          </View>

          </View>{/* end scrollable header */}

          {/* 1: Tab bar — sticky */}
          <View style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 10, padding: 3 }}>
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setActiveTab(tab.key as any)}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
                      backgroundColor: active ? colors.primary : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? '#FFFFFF' : colors.textMuted }}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 2: Tab content */}
          <View style={{ padding: 16 }}>

            {/* ── Ingredients tab ───────────────────────────────────────── */}
            {activeTab === 'ingredients' && (
              <>
                {/* Serving size adjuster */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 14,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Servings</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <Pressable onPress={() => adjustServings(-1)} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="remove" size={18} color={servings <= 1 ? colors.border : colors.text} />
                    </Pressable>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, minWidth: 24, textAlign: 'center' }}>{servings}</Text>
                    <Pressable onPress={() => adjustServings(1)} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="add" size={18} color={servings >= 20 ? colors.border : colors.text} />
                    </Pressable>
                  </View>
                </View>

                {ingredients.map((ing, i) => {
                  const measure = normalizeMeasure('measure' in ing ? ing.measure : (ing as any).quantity ?? '', unitSystem);
                  const scaledMeasure = scaleMeasure(measure, ratio);
                  const isLast = i === ingredients.length - 1;
                  const swapState = swapData[i];
                  const isSwapExpanded = expandedSwapIdx === i;
                  const appliedSub = appliedSwaps[i];
                  // Only show swap icon when a static substitution exists for this ingredient
                  const hasSwap = getStaticSubs(ing.name, unitSystem) !== null;
                  return (
                    <View key={i} style={{
                      borderBottomWidth: isLast ? 0 : 0.5, borderBottomColor: colors.border,
                    }}>
                      {/* Ingredient row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, minHeight: 44 }}>
                        {/* Name / applied swap — takes remaining space */}
                        {appliedSub ? (
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{appliedSub}</Text>
                            <Text style={{ fontSize: 11, color: colors.textMuted }}>(was: {ing.name})</Text>
                          </View>
                        ) : (
                          <Text style={{ flex: 1, fontSize: 13, color: colors.text }}>{ing.name}</Text>
                        )}
                        {/* Swap icon — sits between name and measurement */}
                        {!appliedSub && hasSwap && (
                          <Pressable onPress={() => handleSwapTap(i, ing.name)} hitSlop={8} style={{ marginRight: 8 }}>
                            <Ionicons
                              name="swap-horizontal-outline"
                              size={15}
                              color={isSwapExpanded ? colors.primary : colors.border}
                            />
                          </Pressable>
                        )}
                        {/* Measurement — right-aligned */}
                        {scaledMeasure ? (
                          <Text style={{ fontSize: 13, fontWeight: '600', color: ratio !== 1 ? colors.primary : colors.text }}>
                            {scaledMeasure}
                          </Text>
                        ) : null}
                        {/* Undo applied swap */}
                        {appliedSub && (
                          <Pressable onPress={() => setAppliedSwaps((prev) => { const n = { ...prev }; delete n[i]; return n; })} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                          </Pressable>
                        )}
                      </View>
                      {/* Swap panel */}
                      {isSwapExpanded && !appliedSub && (
                        <View style={{
                          marginBottom: 10, marginTop: -4, paddingHorizontal: 10, paddingVertical: 10,
                          backgroundColor: colors.card, borderRadius: 10,
                        }}>
                          {swapState === 'loading' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <ActivityIndicator size="small" color={colors.primary} />
                              <Text style={{ fontSize: 12, color: colors.textMuted }}>Finding substitutions...</Text>
                            </View>
                          )}
                          {swapState === 'unavailable' && (
                            <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>
                              AI substitutions unavailable today — try again tomorrow.
                            </Text>
                          )}
                          {swapState === 'no_subs' && (
                            <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>
                              No common substitutions found.
                            </Text>
                          )}
                          {Array.isArray(swapState) && swapState.map((s, j) => {
                            // Detect compound substitutes: parenthetical prep instructions or multi-ingredient mixes
                            const parenMatch = s.substitute.match(/^(.+?)\s*\(([^)]+)\)$/);
                            const displayName = parenMatch ? parenMatch[1].trim() : s.substitute;
                            const prepNote = parenMatch
                              ? `Combine: ${parenMatch[2]}`
                              : s.substitute.includes(' + ')
                                ? 'Mix ingredients together before adding'
                                : null;
                            return (
                            <View key={j} style={{
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              marginBottom: j < swapState.length - 1 ? 10 : 0,
                            }}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{displayName}</Text>
                                {prepNote && (
                                  <Text style={{ fontSize: 11, color: colors.primary, opacity: 0.7, marginTop: 2 }}>
                                    {prepNote}
                                  </Text>
                                )}
                                <Text style={{ fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: 1 }}>{s.reason}</Text>
                              </View>
                              <Pressable
                                onPress={() => {
                                  setAppliedSwaps((prev) => ({ ...prev, [i]: s.substitute }));
                                  setExpandedSwapIdx(null);
                                }}
                                style={{
                                  marginLeft: 10, paddingHorizontal: 12, paddingVertical: 6,
                                  backgroundColor: colors.primary, borderRadius: 8,
                                }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '600', color: 'white' }}>Use</Text>
                              </Pressable>
                            </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Add all to grocery */}
                <Pressable onPress={() => isInCart ? onRemoveFromCart?.() : openServingsSheet()} style={{ alignItems: 'center', marginTop: 20 }}>
                  <Text style={{ fontSize: 14, color: isInCart ? colors.error : colors.primary, fontWeight: '600' }}>
                    {isInCart ? 'Remove from grocery list' : 'Add all to grocery list'}
                  </Text>
                </Pressable>
              </>
            )}

            {/* ── Steps tab ────────────────────────────────────────────── */}
            {activeTab === 'steps' && (
              <>
                {steps.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Text style={{ fontSize: 14, color: colors.textMuted }}>Instructions not available for this recipe.</Text>
                  </View>
                ) : (
                  <>
                    {/* Start cooking — top of steps */}
                    <Pressable
                      onPress={() => setCookingModeVisible(true)}
                      style={{
                        paddingVertical: 14, borderRadius: 14, alignItems: 'center',
                        backgroundColor: colors.primary, marginBottom: 14,
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Start cooking →</Text>
                    </Pressable>

                    {/* Ingredient quick-reference */}
                    <Pressable
                      onPress={() => setIngredRefExpanded((v) => !v)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingVertical: 12, paddingHorizontal: 14,
                        backgroundColor: colors.card,
                        borderWidth: 1, borderColor: colors.border,
                        borderRadius: ingredRefExpanded ? 0 : 12,
                        borderTopLeftRadius: 12, borderTopRightRadius: 12,
                        marginBottom: ingredRefExpanded ? 0 : 14,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="list-outline" size={15} color={colors.textMuted} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                          Ingredients ({ingredients.length})
                        </Text>
                      </View>
                      <Ionicons name={ingredRefExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} />
                    </Pressable>
                    {ingredRefExpanded && (
                      <View style={{
                        borderWidth: 1, borderTopWidth: 0, borderColor: colors.border,
                        borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
                        backgroundColor: colors.card, marginBottom: 14, overflow: 'hidden',
                      }}>
                        {ingredients.map((ing, i) => {
                          const measure = normalizeMeasure('measure' in ing ? ing.measure : (ing as any).quantity ?? '', unitSystem);
                          const scaledMeasure = scaleMeasure(measure, ratio);
                          const isLast = i === ingredients.length - 1;
                          return (
                            <View key={i} style={{
                              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              paddingVertical: 10, paddingHorizontal: 14,
                              borderBottomWidth: isLast ? 0 : 0.5, borderBottomColor: colors.border,
                            }}>
                              <Text style={{ fontSize: 13, color: colors.text }}>{ing.name}</Text>
                              {scaledMeasure ? (
                                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted }}>{scaledMeasure}</Text>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {steps.map((step, idx) => {
                      const isActive = idx === activeStepIndex;
                      const isCompleted = idx < activeStepIndex;
                      const { title, detail: detailText } = extractStepTitle(step);
                      const timerMins = step.timer_minutes ?? extractTimerMinutes(step.instruction);
                      const isThisTimerActive = timerStepIndex === idx;
                      // Ingredients mentioned in this step
                      const mentionedIngreds = ingredients.filter((ing) => {
                        const firstWord = ing.name.toLowerCase().split(' ')[0];
                        return firstWord.length > 2 && step.instruction.toLowerCase().includes(firstWord);
                      });
                      const timerDisplay = isThisTimerActive && timerSeconds !== null
                        ? `${Math.floor(timerSeconds / 60)}:${String(timerSeconds % 60).padStart(2, '0')}`
                        : timerMins ? `${timerMins}:00` : null;

                      return (
                        <Pressable
                          key={step.order}
                          onPress={() => setActiveStepIndex(idx)}
                          style={{
                            borderRadius: 14, marginBottom: 10, padding: 14,
                            borderWidth: isActive ? 1.5 : 0.5,
                            borderColor: isActive ? colors.primary : colors.border,
                            backgroundColor: isCompleted ? colors.border + '33' : isActive ? colors.card : colors.background,
                          }}
                        >
                          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                            {/* Step circle */}
                            <View style={{
                              width: 24, height: 24, borderRadius: 12, flexShrink: 0, marginTop: 1,
                              backgroundColor: isCompleted ? '#A5D6A7' : isActive ? colors.primary : '#CCCCCC',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isCompleted
                                ? <Ionicons name="checkmark" size={13} color="white" />
                                : <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>{step.order}</Text>
                              }
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: detailText ? 4 : 0 }}>
                                {title}
                              </Text>
                              {detailText ? (
                                <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 20 }}>
                                  {detailText}
                                </Text>
                              ) : null}

                              {/* Timer pill */}
                              {timerMins && (
                                <Pressable
                                  onPress={() => {
                                    if (isThisTimerActive && timerRunning) {
                                      setTimerRunning(false);
                                    } else if (isThisTimerActive && !timerRunning && timerSeconds !== null && timerSeconds > 0) {
                                      setTimerRunning(true);
                                    } else {
                                      setTimerSeconds(timerMins * 60);
                                      setTimerStepIndex(idx);
                                      setTimerRunning(true);
                                    }
                                  }}
                                  style={{
                                    alignSelf: 'flex-start', marginTop: 8,
                                    flexDirection: 'row', alignItems: 'center', gap: 5,
                                    backgroundColor: '#E8F5E9', borderRadius: 999,
                                    paddingVertical: 6, paddingHorizontal: 12,
                                  }}
                                >
                                  <Ionicons name="timer-outline" size={13} color={colors.primary} />
                                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>
                                    {timerDisplay ?? `${timerMins} min`}
                                    {isThisTimerActive ? (timerRunning ? ' — Pause' : timerSeconds === 0 ? ' Done ✓' : ' — Resume') : ''}
                                  </Text>
                                </Pressable>
                              )}

                              {/* Ingredient chips for this step */}
                              {mentionedIngreds.length > 0 && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                                  {mentionedIngreds.map((ing, mi) => {
                                    const m = normalizeMeasure('measure' in ing ? ing.measure : (ing as any).quantity ?? '', unitSystem);
                                    const sm = scaleMeasure(m, ratio);
                                    if (!sm) return null;
                                    const ingIdx = ingredients.indexOf(ing);
                                    const displayName = ingIdx >= 0 && appliedSwaps[ingIdx] ? appliedSwaps[ingIdx] : ing.name;
                                    return (
                                      <View key={mi} style={{
                                        backgroundColor: colors.primaryLight, borderRadius: 6,
                                        paddingHorizontal: 8, paddingVertical: 3,
                                      }}>
                                        <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '500' }}>
                                          {sm} {displayName}
                                        </Text>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}

                    {/* Mark as cooked */}
                    {onMarkCooked && (
                      <View style={{ marginTop: 8 }}>
                        <Pressable
                          onPress={onMarkCooked}
                          style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                            paddingVertical: 14, borderRadius: 12,
                            backgroundColor: isCooked ? colors.primaryLight : colors.card,
                            borderWidth: 1.5, borderColor: isCooked ? colors.primary : colors.border,
                          }}
                        >
                          <Ionicons name={isCooked ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={isCooked ? colors.primary : colors.textMuted} />
                          <Text style={{ fontSize: 15, fontWeight: '600', color: isCooked ? colors.primary : colors.textMuted }}>
                            {isCooked ? 'Cooked this!' : 'Mark as cooked'}
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Storage tips */}
                    {isCooked && (tipsLoading || storageTips) && (
                      <View style={{ marginTop: 16, padding: 16, backgroundColor: colors.primaryLight, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + '40' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: tipsLoading ? 0 : 10 }}>
                          <Ionicons name="bulb-outline" size={16} color={colors.primary} />
                          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Storage tips</Text>
                        </View>
                        {tipsLoading ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                            <ActivityIndicator size="small" color={colors.primary} />
                            <Text style={{ fontSize: 13, color: colors.primary }}>Getting tips...</Text>
                          </View>
                        ) : storageTips ? (
                          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 20 }}>{storageTips}</Text>
                        ) : null}
                      </View>
                    )}

                    {/* Post-cook review prompt */}
                    {isCooked && (
                      userReview ? (
                        <View style={{ marginTop: 12, padding: 14, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Your review</Text>
                            <View style={{ flexDirection: 'row', gap: 2 }}>
                              {[1,2,3,4,5].map((s) => (
                                <Ionicons key={s} name={s <= userReview.rating ? 'star' : 'star-outline'} size={13} color={s <= userReview.rating ? '#FFC107' : colors.border} />
                              ))}
                            </View>
                          </View>
                          {userReview.review_text ? (
                            <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>{userReview.review_text}</Text>
                          ) : null}
                          <Pressable onPress={() => setActiveTab('reviews')} hitSlop={6} style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>Edit in Reviews tab →</Text>
                          </Pressable>
                        </View>
                      ) : !reviewDismissed ? (
                        <View style={{ marginTop: 12 }}>
                          <ReviewComposer
                            onSubmit={handleSubmitReview}
                            onCancel={() => setReviewDismissed(true)}
                          />
                        </View>
                      ) : null
                    )}
                  </>
                )}
              </>
            )}

            {/* ── My Notes tab ─────────────────────────────────────────── */}
            {activeTab === 'notes' && (
              <>
                {noteLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : noteEditing ? (
                  <NotesEditor
                    noteText={noteText} onNoteText={setNoteText}
                    noteSubs={noteSubs} onNoteSubs={setNoteSubs}
                    noteTags={noteTags} onNoteTags={setNoteTags}
                    noteMakeAgain={noteMakeAgain} onNoteMakeAgain={setNoteMakeAgain}
                    onCancel={() => setNoteEditing(false)}
                    onSave={handleSaveNote}
                  />
                ) : noteSaved && (noteText || noteSubs || noteTags.length > 0 || noteMakeAgain) ? (
                  <NotesFilled
                    noteText={noteText} noteSubs={noteSubs}
                    noteTags={noteTags} noteMakeAgain={noteMakeAgain}
                    onEdit={() => setNoteEditing(true)}
                  />
                ) : (
                  <NotesEmpty onAdd={() => setNoteEditing(true)} />
                )}
              </>
            )}
            {/* ── Reviews tab ───────────────────────────────────────────── */}
            {activeTab === 'reviews' && (
              <>
                {/* Creator stats — only visible to the recipe creator */}
                {recipe?.submitted_by === userId && (
                  <CreatorStatsCard stats={creatorStats} loading={creatorStatsLoading} />
                )}

                {/* Rating summary header */}
                {!reviewsLoading && (reviews.length > 0 || recipe?.rating_count) && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 14, marginBottom: 8,
                    borderBottomWidth: 1, borderBottomColor: colors.border,
                  }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 36, fontWeight: '700', color: colors.text, lineHeight: 40 }}>
                        {recipe?.avg_rating ? Number(recipe.avg_rating).toFixed(1) : '—'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
                        {[1,2,3,4,5].map((s) => (
                          <Ionicons key={s} name={s <= Math.round(Number(recipe?.avg_rating ?? 0)) ? 'star' : 'star-outline'} size={12} color={s <= Math.round(Number(recipe?.avg_rating ?? 0)) ? '#FFC107' : colors.border} />
                        ))}
                      </View>
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        {recipe?.rating_count ?? 0} {(recipe?.rating_count ?? 0) === 1 ? 'review' : 'reviews'}
                      </Text>
                    </View>
                    {/* Distribution bars */}
                    {reviews.length > 0 && (
                      <View style={{ flex: 1, gap: 3 }}>
                        {[5,4,3,2,1].map((star) => {
                          const count = reviews.filter((r) => r.rating === star).length;
                          const pct = reviews.length > 0 ? count / reviews.length : 0;
                          return (
                            <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 10, color: colors.textMuted, width: 8 }}>{star}</Text>
                              <View style={{ flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3 }}>
                                <View style={{ width: `${pct * 100}%`, height: 6, backgroundColor: '#FFC107', borderRadius: 3 }} />
                              </View>
                              <Text style={{ fontSize: 10, color: colors.textMuted, width: 16 }}>{count}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {reviewsLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
                ) : (
                  <>
                    {/* Composer or "write" button */}
                    {hasCooked && recipe?.submitted_by !== userId && (
                      editingReview || !userReview ? (
                        <ReviewComposer
                          existing={editingReview ? userReview : null}
                          onSubmit={handleSubmitReview}
                          onCancel={() => setEditingReview(false)}
                        />
                      ) : null
                    )}

                    {/* Write review button if cooked + no review yet + not editing */}
                    {hasCooked && !userReview && !editingReview && recipe?.submitted_by !== userId && (
                      <Pressable
                        onPress={() => setEditingReview(true)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                          paddingVertical: 13, borderRadius: 12,
                          borderWidth: 1.5, borderColor: colors.primary,
                          marginBottom: 16,
                        }}
                      >
                        <Ionicons name="star-outline" size={16} color={colors.primary} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Write a review</Text>
                      </Pressable>
                    )}

                    {/* Cook-gated empty state */}
                    {!hasCooked && recipe?.submitted_by !== userId && (
                      <View style={{
                        paddingVertical: 16, paddingHorizontal: 12, marginBottom: 16,
                        backgroundColor: colors.card, borderRadius: 12,
                        borderWidth: 1, borderColor: colors.border,
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                      }}>
                        <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
                        <Text style={{ fontSize: 13, color: colors.textMuted, flex: 1 }}>
                          Cook this recipe to leave a review
                        </Text>
                      </View>
                    )}

                    {/* Reviews list */}
                    {reviews.length === 0 && !reviewsLoading ? (
                      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8 }}>
                        No reviews yet — be the first!
                      </Text>
                    ) : (
                      reviews.map((review) => (
                        <ReviewItem
                          key={review.id}
                          review={review}
                          isOwn={review.user_id === userId}
                          onEdit={() => setEditingReview(true)}
                          onDelete={handleDeleteReview}
                        />
                      ))
                    )}
                  </>
                )}
              </>
            )}

          </View>{/* end tab content */}
          </ScrollView>{/* end outer sticky ScrollView */}

          {/* Grocery toast — inside modal so visible when modal stays open */}
          {groceryToast && (
            <View style={{
              position: 'absolute', bottom: 100, left: 20, right: 20, zIndex: 200,
              backgroundColor: colors.primary, borderRadius: 12,
              paddingVertical: 14, paddingHorizontal: 20,
              flexDirection: 'row', alignItems: 'center', gap: 10,
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
            }}>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>Added to grocery list</Text>
            </View>
          )}

          {/* Sticky footer */}
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: colors.card, borderTopWidth: 0.5, borderTopColor: colors.border,
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32,
            flexDirection: 'row', gap: 12,
          }}>
            {slotContext && onAddToSlot ? (
              <Pressable
                onPress={onAddToSlot}
                style={{
                  flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.primary,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>
                  Add to {slotContext}
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => isInCart ? onRemoveFromCart?.() : openServingsSheet()}
                  style={{
                    flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: isInCart ? colors.error : colors.primary,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: isInCart ? colors.error : colors.primary }}>
                    {isInCart ? 'Remove from grocery' : 'Add to grocery'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onSaveToggle}
                  style={{
                    flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isSaved ? colors.primaryLight : colors.primary,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: isSaved ? colors.primary : 'white' }}>
                    {isSaved ? 'Saved ✓' : 'Save recipe'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Servings sheet — inline animated overlay (avoids nested Modal iOS bug) */}
          {showServingsSheet && (
            <>
              <Pressable
                onPress={closeServingsSheet}
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100 }}
              />
              <Animated.View style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 101,
                backgroundColor: colors.background,
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                paddingBottom: 32,
                transform: [{ translateY: sheetAnim }],
              }}>
                <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 24 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Add to grocery list</Text>
                  <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 16, color: colors.text, lineHeight: 24 }}>
                    {recipe.title}
                  </Text>

                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Servings</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
                      <Pressable
                        onPress={() => adjustServings(-1)} hitSlop={8}
                        style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="remove" size={20} color={servings <= 1 ? colors.border : colors.text} />
                      </Pressable>
                      <Text style={{ fontSize: 36, fontWeight: '700', color: colors.text, minWidth: 40, textAlign: 'center' }}>{servings}</Text>
                      <Pressable
                        onPress={() => adjustServings(1)} hitSlop={8}
                        style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="add" size={20} color={servings >= 20 ? colors.border : colors.text} />
                      </Pressable>
                    </View>
                    <Text style={{ fontSize: 14, color: colors.textMuted }}>serving{servings !== 1 ? 's' : ''}</Text>
                  </View>
                </View>

                {scaledMacros && (
                  <View style={{ paddingHorizontal: 24, paddingBottom: 16, alignItems: 'center', gap: 4 }}>
                    <MacroRow macros={scaledMacros} compact />
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>Estimated · per serving</Text>
                  </View>
                )}

                <View style={{ paddingHorizontal: 20, gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      handleAddToCart();
                      closeServingsSheet();
                      setGroceryToast(true);
                      setTimeout(() => setGroceryToast(false), 2500);
                    }}
                    style={{ backgroundColor: colors.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>
                      Add {servings} serving{servings !== 1 ? 's' : ''} to grocery list
                    </Text>
                  </Pressable>
                  <Pressable onPress={closeServingsSheet} style={{ alignItems: 'center', paddingVertical: 12 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
                  </Pressable>
                </View>
              </Animated.View>
            </>
          )}
          {/* CookingMode — inside Modal so iOS presents from correct UIViewController */}
          {cookingModeVisible && (
            <CookingMode
              recipe={recipe}
              steps={steps}
              rawIngredients={ingredients.map((ing, i) => ({
                name: appliedSwaps[i] ?? ing.name,
                measure: normalizeMeasure('measure' in ing ? (ing as any).measure : (ing as any).quantity ?? '', unitSystem),
              }))}
              ratio={ratio}
              initialStep={autoOpenCookingAtStep}
              onClose={() => setCookingModeVisible(false)}
              onMarkCooked={() => {
                if (onMarkCooked) onMarkCooked(); // fire parent for interaction logging
                if (recipe) setShowLeftoversModal(true);
              }}
            />
          )}
        </View>

        <PostCookLeftoversModal
          visible={showLeftoversModal}
          recipe={recipe}
          onClose={() => setShowLeftoversModal(false)}
        />
      </Modal>
    </>
  );
}

// ── Notes sub-components ──────────────────────────────────────────────────────
function NotesEmpty({ onAdd }: { onAdd: () => void }) {
  const colors = useTheme();
  return (
    <View style={{ padding: 4, gap: 16 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 24 }}>✏️</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Your personal notes on this recipe</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 19 }}>Tweaks, substitutions, what to do differently next time.</Text>
      </View>
      <Pressable onPress={onAdd} style={{ backgroundColor: colors.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>+ Add a note</Text>
      </Pressable>
    </View>
  );
}

function NotesFilled({ noteText, noteSubs, noteTags, noteMakeAgain, onEdit }: {
  noteText: string; noteSubs: string; noteTags: string[]; noteMakeAgain: string | null;
  onEdit: () => void;
}) {
  const colors = useTheme();
  const makeAgain = MAKE_AGAIN_OPTIONS.find((o) => o.key === noteMakeAgain);
  return (
    <View style={{ gap: 12 }}>
      {/* Tags */}
      {noteTags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {noteTags.map((tag) => (
            <View key={tag} style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
      {/* Note card */}
      {noteText ? (
        <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 0.5, borderColor: colors.border, padding: 14 }}>
          <Text style={{ fontSize: 13, color: colors.text, lineHeight: 21 }}>{noteText}</Text>
        </View>
      ) : null}
      {/* Substitutions */}
      {noteSubs ? (
        <View style={{ backgroundColor: colors.primaryLight, borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>SUBSTITUTIONS</Text>
          <Text style={{ fontSize: 12, color: colors.text }}>{noteSubs}</Text>
        </View>
      ) : null}
      {/* Make again */}
      {makeAgain && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>You said:</Text>
          <View style={{ backgroundColor: makeAgain.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: makeAgain.text }}>{makeAgain.label}</Text>
          </View>
        </View>
      )}
      <Pressable onPress={onEdit} style={{ backgroundColor: colors.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>Edit note</Text>
      </Pressable>
    </View>
  );
}

function NotesEditor({ noteText, onNoteText, noteSubs, onNoteSubs, noteTags, onNoteTags, noteMakeAgain, onNoteMakeAgain, onCancel, onSave }: {
  noteText: string; onNoteText: (v: string) => void;
  noteSubs: string; onNoteSubs: (v: string) => void;
  noteTags: string[]; onNoteTags: (v: string[]) => void;
  noteMakeAgain: string | null; onNoteMakeAgain: (v: string | null) => void;
  onCancel: () => void; onSave: () => void;
}) {
  const colors = useTheme();
  function toggleTag(tag: string) {
    onNoteTags(noteTags.includes(tag) ? noteTags.filter((t) => t !== tag) : [...noteTags, tag]);
  }
  return (
    <View style={{ gap: 20 }}>
      {/* Free text */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>What do you want to remember?</Text>
        <TextInput
          value={noteText} onChangeText={onNoteText} multiline
          placeholder="Tweaks, substitutions, what to do differently next time..."
          placeholderTextColor={colors.textMuted}
          style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 13, color: colors.text, minHeight: 90, textAlignVertical: 'top', lineHeight: 21 }}
        />
      </View>
      {/* Substitutions */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>What did you swap?</Text>
        <TextInput
          value={noteSubs} onChangeText={onNoteSubs} multiline
          placeholder="e.g. chicken thighs instead of breast, oat milk instead of cream"
          placeholderTextColor={colors.textMuted}
          style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 13, color: colors.text, minHeight: 60, textAlignVertical: 'top' }}
        />
      </View>
      {/* Tags */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Tags</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_TAGS.map((tag) => {
            const on = noteTags.includes(tag);
            return (
              <Pressable key={tag} onPress={() => toggleTag(tag)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', backgroundColor: on ? colors.primaryLight : colors.toggleBg, borderWidth: on ? 1 : 0, borderColor: on ? colors.primary : 'transparent' }}>
                <Text style={{ fontSize: 12, color: on ? colors.primary : colors.textMuted, fontWeight: on ? '600' : '400' }}>{on ? `✓ ${tag}` : tag}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {/* Make again */}
      <View>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Would you cook it again?</Text>
        <View style={{ gap: 8 }}>
          {MAKE_AGAIN_OPTIONS.map((opt) => {
            const on = noteMakeAgain === opt.key;
            return (
              <Pressable key={opt.key} onPress={() => onNoteMakeAgain(on ? null : opt.key)} style={{ height: 44, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: on ? opt.bg : colors.toggleBg }}>
                <Text style={{ fontSize: 13, color: on ? opt.text : colors.textMuted, fontWeight: on ? '600' : '400' }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {/* Footer */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable onPress={onCancel} style={{ flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textMuted }}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onSave} style={{ flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>Save note</Text>
        </Pressable>
      </View>
    </View>
  );
}
