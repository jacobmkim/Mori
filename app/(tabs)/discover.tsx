import {
  View,
  Text,
  Pressable,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime, formatCost, getTimeOfDay, getWeekStart } from '@/lib/utils';
import { fetchMealDetail, type MealDetail } from '@/lib/mealdb';
import { logSwipe, setRecipeLiked, fetchMacros, estimateMacrosLocally, fetchScoredDeck, updateRecipeDetail, updateRecipeMacros, logInteraction, updateStreakAndCount, recordSessionSwipe, cancelLeftSwipe, recordAdventureCardLeftSwipe, clearSessionState, getCookedRecipeIds, flagRecipe, resolveSupabaseId } from '@/lib/api';
import { computeBadges, getNewlyEarned } from '@/lib/badges';
import type { Badge, BadgeStats } from '@/lib/badges';
import { BadgeAchievementModal } from '@/components/badges/BadgeAchievementModal';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import { LeftoversReminderModal } from '@/components/LeftoversReminderCard';
import { HeadlineMacroPill, MacroRow } from '@/components/ui/MacroRow';
import { scaleMacros } from '@/lib/macroUtils';
import { MoriLogo } from '@/components/ui/MoriLogo';
import { AvatarButton } from '@/components/AvatarButton';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useUserStore } from '@/stores/userStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { useMealPlanStore } from '@/stores/mealPlanStore';
import { TutorialOverlay, shouldShowTutorial } from '@/components/TutorialOverlay';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe, AppMode, Macros, MealType } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

function RecipeSwipeCard({
  recipe,
  onSwipe,
  onTap,
  isTop,
  detail,
  topDragX,
  entryX,
  dietaryGoals,
  macros,
  isCooked,
  isSaved,
}: {
  recipe: Recipe;
  onSwipe: (direction: 'left' | 'right', releaseX: number, releaseY: number) => void;
  onTap?: () => void;
  isTop: boolean;
  detail?: MealDetail;
  topDragX?: Animated.Value;
  entryX?: number; // if set, card springs in from this x offset on mount (undo animation)
  dietaryGoals?: string[];
  macros?: Macros | null;
  isCooked?: boolean;
  isSaved?: boolean;
}) {
  const colors = useTheme();
  const position = useRef(new Animated.ValueXY()).current;

  // Undo entry animation — runs once on mount if entryX is provided.
  const entryXRef = useRef(entryX);
  useEffect(() => {
    if (entryXRef.current == null) return;
    position.setValue({ x: entryXRef.current, y: 0 });
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const topDragXRef = useRef(topDragX);
  topDragXRef.current = topDragX;

  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;


  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTopRef.current,
      onMoveShouldSetPanResponder: () => isTopRef.current,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy * 0.15 });
        topDragXRef.current?.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
          const dir = gesture.dx > 0 ? 'right' : 'left';
          topDragXRef.current?.setValue(dir === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
          onSwipeRef.current(dir, gesture.dx, gesture.dy * 0.15);
        } else if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            useNativeDriver: true,
          }).start();
          if (topDragXRef.current) {
            Animated.spring(topDragXRef.current, {
              toValue: 0,
              friction: 5,
              useNativeDriver: true,
            }).start();
          }
          onTapRef.current?.();
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            useNativeDriver: true,
          }).start();
          if (topDragXRef.current) {
            Animated.spring(topDragXRef.current, {
              toValue: 0,
              friction: 5,
              useNativeDriver: true,
            }).start();
          }
        }
      },
    })
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        {
          position: 'absolute',
          width: CARD_WIDTH,
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: colors.card,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 6,
        },
        { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
      ]}
    >
      <Image
        source={{ uri: recipe.image_url ?? '' }}
        style={{ width: '100%', height: '62%' }}
        contentFit="cover"
        priority="high"
      />

      {/* Previously cooked indicator — post-cook check-in prompt */}
      {isCooked && (
        <View style={{
          position: 'absolute', top: 12, left: 12,
          backgroundColor: 'rgba(46, 125, 50, 0.9)',
          borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
          flexDirection: 'row', alignItems: 'center', gap: 4,
        }}>
          <Ionicons name="checkmark-circle" size={13} color="white" />
          <Text style={{ color: 'white', fontSize: 11, fontWeight: '600' }}>Made before · Rate it?</Text>
        </View>
      )}

      {/* Already saved indicator — shown when saved recipe appears in deck (fallback case) */}
      {isSaved && !isCooked && (
        <View style={{
          position: 'absolute', top: 12, left: 12,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
          flexDirection: 'row', alignItems: 'center', gap: 4,
        }}>
          <Ionicons name="bookmark" size={12} color="white" />
          <Text style={{ color: 'white', fontSize: 11, fontWeight: '600' }}>Already saved</Text>
        </View>
      )}

      {/* SAVE overlay */}
      <Animated.View style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '62%',
        alignItems: 'center', justifyContent: 'center', opacity: likeOpacity,
      }}>
        <View style={{ backgroundColor: colors.swipeRight, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>SAVE</Text>
        </View>
      </Animated.View>

      {/* PASS overlay */}
      <Animated.View style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '62%',
        alignItems: 'center', justifyContent: 'center', opacity: nopeOpacity,
      }}>
        <View style={{ backgroundColor: colors.swipeLeft, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>PASS</Text>
        </View>
      </Animated.View>

      {/* Info */}
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
        {/* Title + badge */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
          <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text, flex: 1, lineHeight: 24 }} numberOfLines={2}>
            {recipe.title}
          </Text>
          {recipe.isAdventure ? (
            <View style={{ backgroundColor: '#FFF8E1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, marginTop: 2 }}>
              <Text style={{ color: '#F57F17', fontSize: 11, fontWeight: '600' }}>✦ New for you</Text>
            </View>
          ) : recipe.isTrending ? (
            <View style={{ backgroundColor: '#FFF3E0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, marginTop: 2 }}>
              <Text style={{ color: '#E65100', fontSize: 11, fontWeight: '600' }}>🔥 Trending</Text>
            </View>
          ) : recipe.badge !== 'none' ? (
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, marginTop: 2 }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                {recipe.badge === 'staff_pick' ? 'Staff Pick' : 'Fan Fave'}
              </Text>
            </View>
          ) : recipe.source_type === 'community' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, marginTop: 2 }}>
              <Ionicons name="people-outline" size={11} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Community</Text>
            </View>
          ) : null}
        </View>

        {recipe.source_type === 'community' && (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            By {recipe.submitter_username ? `@${recipe.submitter_username}` : recipe.submitter_name ?? 'Mori community'}
          </Text>
        )}

        {/* Blurb */}
        {detail?.blurb ? (
          <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8, fontStyle: 'italic' }} numberOfLines={1}>
            {detail.blurb}
          </Text>
        ) : (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{recipe.cuisine}  ·  {formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}  ·  {formatCost(recipe.cost_per_serving)}</Text>
          </View>
        )}

        {/* Meta row when blurb is shown */}
        {detail?.blurb && (
          <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
            {recipe.cuisine}  ·  {formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}  ·  {formatCost(recipe.cost_per_serving)}
          </Text>
        )}

        {/* Headline macro pill — only shown when macros + matching dietary goal exist */}
        <HeadlineMacroPill macros={macros ?? recipe.macros} dietaryGoals={dietaryGoals ?? []} />

        {/* Ingredient pills */}
        {detail?.ingredients && detail.ingredients.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, overflow: 'hidden', maxHeight: 64 }}>
            {detail.ingredients.slice(0, 5).map((ing, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: colors.primaryLight,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>{ing.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}


interface ExitCard {
  recipe: Recipe;
  detail?: MealDetail;
  position: Animated.ValueXY;
}

// Stable empty array — prevents Zustand infinite re-render when profile is null.
// Never inline `?? []` in a Zustand selector; it creates a new reference each render.
const EMPTY_GOALS: string[] = [];

export default function Discover() {
  const colors = useTheme();
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { mode, setMode, loadMode } = useDiscoverStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [topDetail, setTopDetail] = useState<MealDetail | null>(null);
  // macroCacheVersion increments whenever macroCache is updated — triggers a re-render
  // so the pill updates with accurate data without any state-driven delay.
  const [macroCacheVersion, setMacroCacheVersion] = useState(0);
  const [exitCard, setExitCard] = useState<ExitCard | null>(null);
  const [lastSwipe, setLastSwipe] = useState<{ recipe: Recipe; direction: 'left' | 'right' } | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [cartToast, setCartToast] = useState(false);
  const [deckServingsSheetVisible, setDeckServingsSheetVisible] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showMealPrepTip, setShowMealPrepTip] = useState(false);
  const [deckServings, setDeckServings] = useState(2);
  const [reloadKey, setReloadKey] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const cartToastOpacity = useRef(new Animated.Value(0)).current;
  const detailCache = useRef<Map<string, MealDetail>>(new Map());
  const macroCache = useRef<Map<string, Macros>>(new Map());
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  // Set before decrementing currentIndex so the new top card picks it up on mount
  const undoEntryXRef = useRef<number | null>(null);
  const { addRecipe, removeRecipe, addMealPrepId } = useSavedStore();
  const { addFromDetail, selectedRecipes, removeRecipeFromList } = useGroceryStore();
  const userId = useUserStore((s) => s.profile?.id);
  const sessionNumber = useUserStore((s) => s.sessionNumber);
  const profile = useUserStore((s) => s.profile ?? null);
  const dietaryGoals = useUserStore((s) => s.profile?.dietary_goals ?? EMPTY_GOALS);
  const ingredientDislikes = useUserStore((s) => s.profile?.ingredient_dislikes ?? EMPTY_GOALS);
  const savedRecipes = useSavedStore((s) => s.savedRecipes);

  // Tracks whether a deck is already on screen — used to skip the loading
  // spinner when re-fetching silently (mode switch, prefs change).
  const hasDeckRef = useRef(false);

  // Single Animated.Value tracking the top card's drag X.
  // Background cards interpolate from this — fully decoupled from the top
  // card's own visual position so resetting it never causes a flash.
  const topDragX = useRef(new Animated.Value(0)).current;

  // Tracks exit card identity so rapid swipes don't clobber each other's
  // cleanup callbacks.
  const exitIdRef = useRef(0);

  const swipeProgress = useRef(
    topDragX.interpolate({
      inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      outputRange: [1, 0, 1],
      extrapolate: 'clamp',
    })
  ).current;

  // Button flash opacity overlays driven by topDragX.
  // Using opacity (0→1) over a static colors.card background keeps the
  // button color in sync with the current theme even after mode switches.
  const heartFlashOpacity = useRef(topDragX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD, SCREEN_WIDTH],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  })).current;

  const xFlashOpacity = useRef(topDragX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  })).current;

  // Shadow glow — direction-specific, scales with drag distance
  const heartGlowOpacity = useRef(topDragX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD, SCREEN_WIDTH],
    outputRange: [0, 0.55, 0.55],
    extrapolate: 'clamp',
  })).current;
  const heartGlowRadius = useRef(topDragX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD, SCREEN_WIDTH],
    outputRange: [4, 22, 22],
    extrapolate: 'clamp',
  })).current;
  const xGlowOpacity = useRef(topDragX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0],
    outputRange: [0.55, 0.55, 0],
    extrapolate: 'clamp',
  })).current;
  const xGlowRadius = useRef(topDragX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0],
    outputRange: [22, 22, 4],
    extrapolate: 'clamp',
  })).current;

  // Post-swipe linger: hold then fade after card flies off
  const heartPostGlow = useRef(new Animated.Value(0)).current;
  const xPostGlow = useRef(new Animated.Value(0)).current;

  // Icon white overlay during drag — native-driver safe (pure topDragX interpolation, no mixing)
  const heartDragIconWhite = useRef(topDragX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })).current;
  const xDragIconWhite = useRef(topDragX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })).current;

  // Next card (stackIndex=1) scales up as you drag — sits centered behind the top card
  // so it stays fully hidden at rest (scale alone provides the depth cue).
  const nextCardScale = useRef(
    swipeProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [(CARD_WIDTH - 8) / CARD_WIDTH, 1],
    })
  ).current;


  // Load persisted mode and meal plan on mount
  useEffect(() => {
    loadMode();
    if (userId) {
      const weekStart = getWeekStart(new Date());
      loadMealPlan(userId, weekStart);
    }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offline detection — update banner whenever connectivity changes
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return unsub;
  }, []);

  // Show tutorial on first launch after onboarding — only for new users with no saves
  useEffect(() => {
    if (!userId) return;
    shouldShowTutorial(userId).then((show) => {
      if (show && savedRecipes.length === 0) setShowTutorial(true);
    });
  }, [userId]);

  // Show one-time meal prep tip when user first switches to meal prep mode
  useEffect(() => {
    if (mode !== 'meal_prep' || !userId) return;
    const key = `@mori_mealprep_tip_seen_${userId}`;
    AsyncStorage.getItem(key).then((seen) => {
      if (!seen) setShowMealPrepTip(true);
    });
  }, [mode, userId]);

  // Re-fetch when userId, mode, or dietary goals change.
  // If a deck is already visible (mode switch / prefs change), fetch silently
  // in the background — keep existing cards on screen until new deck is ready.
  useEffect(() => {
    const silent = hasDeckRef.current;

    if (!silent) {
      setIsLoading(true);
      setCurrentIndex(0);
      clearSessionState();
    }

    // Clear caches on every deck reload to prevent unbounded memory growth
    detailCache.current.clear();
    macroCache.current.clear();

    const savedExternalIds = new Set(savedRecipes.map((r) => r.id));
    fetchScoredDeck(userId, dietaryGoals, profile, savedExternalIds, mode)
      .then((loaded) => {
        // Pre-populate macro cache from Supabase data so pills show instantly
        // for recipes that already have macros stored — no API call needed.
        loaded.forEach((r) => {
          if (r.macros && !macroCache.current.has(r.id)) {
            macroCache.current.set(r.id, r.macros);
          }
        });
        setMacroCacheVersion((v) => v + 1);
        // Swap deck — batched with setRecipes so index + recipes update together
        if (silent) {
          clearSessionState();
          setCurrentIndex(0);
        }
        setRecipes(loaded);
        hasDeckRef.current = true;
      })
      .finally(() => { if (!silent) setIsLoading(false); });

    // Load previously-cooked IDs for cross-session "Made before" banner
    if (userId) {
      getCookedRecipeIds(userId).then(setPrevCookedIds).catch(() => {});
    }
  }, [userId, mode, dietaryGoals, ingredientDislikes, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // When top card changes, update detail from cache (detail has no local estimator).
  useEffect(() => {
    const top = recipes[currentIndex];
    if (!top) return;
    setTopDetail(detailCache.current.get(top.id) ?? null);
  }, [currentIndex, recipes]);

  // Prefetch detail for ALL cards in parallel (TheMealDB is free — no quota concern).
  useEffect(() => {
    if (recipes.length === 0) return;
    let cancelled = false;

    recipes.forEach(async (recipe) => {
      if (cancelled || detailCache.current.has(recipe.id)) return;

      // If Supabase already has ingredients, build detail from DB data — no TheMealDB call.
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        const detail: MealDetail = {
          blurb: recipe.description ?? '',
          ingredients: recipe.ingredients.map((ing) => ({ name: ing.name, measure: `${ing.quantity ?? ''} ${ing.unit ?? ''}`.trim() })),
        };
        detailCache.current.set(recipe.id, detail);
        if (recipe.id === recipes[currentIndexRef.current]?.id) setTopDetail(detail);
        return;
      }

      const detail = await fetchMealDetail(recipe.id);
      if (cancelled || !detail) return;
      detailCache.current.set(recipe.id, detail);
      if (recipe.id === recipes[currentIndexRef.current]?.id) setTopDetail(detail);
      // Persist to Supabase so this recipe never needs a TheMealDB call again
      updateRecipeDetail(recipe.id, detail.ingredients, detail.blurb).catch(() => {});
    });

    return () => { cancelled = true; };
  }, [recipes]);

  // Fetch accurate macros for top card + next 2 whenever the top card changes.
  // macroCache stores results; incrementing macroCacheVersion triggers a re-render
  // so the pill silently updates from local estimate → accurate data.
  useEffect(() => {
    if (recipes.length === 0) return;
    let cancelled = false;

    async function fetchNearby() {
      const indices = [currentIndex, currentIndex + 1, currentIndex + 2];
      for (const idx of indices) {
        const recipe = recipes[idx];
        if (!recipe || macroCache.current.has(recipe.id)) continue;
        let detail = detailCache.current.get(recipe.id);
        if (!detail) {
          if (recipe.ingredients && recipe.ingredients.length > 0) {
            detail = {
              blurb: recipe.description ?? '',
              ingredients: recipe.ingredients.map((ing) => ({ name: ing.name, measure: `${ing.quantity ?? ''} ${ing.unit ?? ''}`.trim() })),
            };
          } else {
            const fetched = await fetchMealDetail(recipe.id).catch(() => null);
            if (fetched) {
              detail = fetched;
              updateRecipeDetail(recipe.id, fetched.ingredients, fetched.blurb).catch(() => {});
            }
          }
          if (detail) detailCache.current.set(recipe.id, detail);
        }
        if (cancelled || !detail) continue;
        const ings = detail.ingredients.map((i) => ({ name: i.name, quantity: i.measure, unit: '' }));
        const macros = await fetchMacros(recipe.title, ings, { externalId: recipe.id }).catch(() => null);
        if (cancelled || !macros) continue;
        macroCache.current.set(recipe.id, macros);
        setMacroCacheVersion((v) => v + 1);
        // Persist to Supabase — next user to see this recipe gets macros from DB instantly
        if (!recipe.macros) updateRecipeMacros(recipe.id, macros).catch(() => {});
      }
    }

    fetchNearby();
    return () => { cancelled = true; };
  }, [currentIndex, recipes]);

  // Fire-and-forget: log the swipe to Supabase.
  // Never blocks the animation or the UI — errors are silently swallowed.
  // Requires recipe.supabase_id; recipes RLS blocks client-side INSERTs of new rows
  // (only submitted_by = auth.uid() is allowed), so we can no longer upsert from here.
  // All deck-fetcher paths populate supabase_id; if it's missing the recipe came from
  // a path that bypassed Supabase and we can't log the swipe.
  function logSwipeBackground(recipe: Recipe, direction: 'left' | 'right', currentMode: AppMode) {
    if (!userId) return;
    console.log(`[swipe] ${direction === 'right' ? '✓' : '✗'} "${recipe.title}" (${recipe.cuisine ?? 'unknown'})`);
    // Adventure card left-swipe → pause adventure cards for next 10 swipes
    if (recipe.isAdventure && direction === 'left') recordAdventureCardLeftSwipe();
    const supabaseId = recipe.supabase_id;
    if (!supabaseId) {
      if (__DEV__) console.warn('[swipe] missing supabase_id, skipping DB log', recipe.id, recipe.title);
      return;
    }
    const cuisines = (recipe.cuisine ?? '').split(',').map((c: string) => c.trim()).filter(Boolean);
    recordSessionSwipe(supabaseId, direction, cuisines);
    logSwipe({
      user_id: userId,
      recipe_id: supabaseId,
      direction,
      mode: currentMode,
      time_of_day: getTimeOfDay(),
      day_of_week: new Date().getDay(),
      session_number: sessionNumber,
    }).catch(() => {}); // swipe logging is non-critical
  }

  function handleSwipe(direction: 'left' | 'right', releaseX = 0, releaseY = 0) {
    const recipe = recipes[currentIndexRef.current];
    if (!recipe) return;
    // Ensure topDragX is at the swipe direction value so button flash fires on button-tap swipes too
    topDragX.setValue(direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
    if (direction === 'right') {
      addRecipe(recipe, userId);
      if (mode === 'meal_prep') addMealPrepId(recipe.id);
    }
    setLastSwipe({ recipe, direction });
    logSwipeBackground(recipe, direction, mode as AppMode);

    // Each exit card gets its own ValueXY so rapid swipes don't conflict.
    const exitPos = new Animated.ValueXY({ x: releaseX, y: releaseY });
    const exitId = ++exitIdRef.current;
    setExitCard({ recipe, detail: detailCache.current.get(recipe.id), position: exitPos });

    // Post-swipe button linger: hold color then fade over ~280ms.
    // Native-driven so the JS thread stays free during the exit fly-off.
    if (direction === 'right') {
      heartPostGlow.setValue(1);
      Animated.timing(heartPostGlow, { toValue: 0, duration: 280, delay: 180, useNativeDriver: true }).start();
    } else {
      xPostGlow.setValue(1);
      Animated.timing(xPostGlow, { toValue: 0, duration: 280, delay: 180, useNativeDriver: true }).start();
    }

    // Quick linear reset — fast enough that pill flash is imperceptible,
    // slow enough that the new second card settles without snapping.
    Animated.timing(topDragX, { toValue: 0, duration: 80, useNativeDriver: true }).start();

    // Fly exit overlay off screen — use timing so the card doesn't decelerate/pause near the edge.
    Animated.timing(exitPos, {
      toValue: { x: direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 },
      duration: 200,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      // Only clear if this is still the latest exit card
      if (exitIdRef.current === exitId) setExitCard(null);
    });

    // Defer next-card mount one frame so the exit card's bridge handoff
    // gets a clean commit before the new top card mounts.
    requestAnimationFrame(() => {
      setCurrentIndex((prev) => prev + 1);
    });
  }

  function handleUndo() {
    if (!lastSwipe || currentIndexRef.current === 0) return;
    if (lastSwipe.direction === 'right') removeRecipe(lastSwipe.recipe, userId);
    // Undo a left swipe — remove from suppression so a subsequent right swipe isn't blocked
    if (lastSwipe.direction === 'left' && lastSwipe.recipe.supabase_id) {
      cancelLeftSwipe(lastSwipe.recipe.supabase_id);
    }
    // Card springs in from the direction it was swiped out
    undoEntryXRef.current = lastSwipe.direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    setCurrentIndex((prev) => prev - 1);
    setLastSwipe(null);
  }

  // Button-tap swipe: fly off from center position.
  function handleButtonSwipe(direction: 'left' | 'right') {
    handleSwipe(direction, 0, 0);
  }

  // ── Ingredient scaling helpers (inline — avoids coupling to RecipeDetailModal internals) ──
  function parseLeadingNumber(str: string): { value: number; rest: string } | null {
    const frac = str.match(/^(\d+)\/(\d+)(.*)/);
    if (frac) return { value: parseInt(frac[1]) / parseInt(frac[2]), rest: frac[3] };
    const dec = str.match(/^(\d+\.?\d*)(.*)/);
    if (dec) return { value: parseFloat(dec[1]), rest: dec[2] };
    return null;
  }
  function formatDeckNumber(n: number): string {
    const fractions: [number, string][] = [[0.25,'¼'],[0.33,'⅓'],[0.5,'½'],[0.67,'⅔'],[0.75,'¾']];
    const whole = Math.floor(n);
    const rem = n - whole;
    for (const [val, sym] of fractions) if (Math.abs(rem - val) < 0.05) return whole > 0 ? `${whole}${sym}` : sym;
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
    return n.toFixed(1);
  }
  function scaleDeckMeasure(measure: string, ratio: number): string {
    if (!measure || ratio === 1) return measure;
    const parsed = parseLeadingNumber(measure.trim());
    if (!parsed) return measure;
    return `${formatDeckNumber(parsed.value * ratio)}${parsed.rest}`;
  }

  // Add current top card to grocery list, mark liked for Phase 2 AI signal,
  // flash a green toast, then auto-swipe right so the card flies off naturally.
  function handleAddToCart(servingsOverride?: number) {
    const recipe = recipes[currentIndexRef.current];
    if (!recipe) return;
    const detail = detailCache.current.get(recipe.id);
    const baseServings = recipe.servings ?? 2;
    const ratio = servingsOverride !== undefined ? servingsOverride / baseServings : 1;
    const rawIngs = detail?.ingredients ?? recipe.ingredients.map((i) => ({
      name: i.name,
      measure: `${i.quantity ?? ''} ${i.unit ?? ''}`.trim(),
    }));
    const scaledIngs = rawIngs.map((ing) => ({
      name: ing.name,
      measure: scaleDeckMeasure(ing.measure ?? '', ratio),
    }));
    addFromDetail(recipe, scaledIngs);
    // Mark liked = true + log grocery_add interaction — cart add is the strongest positive signal
    if (userId) {
      resolveSupabaseId(recipe)
        .then((supabaseId) => {
          setRecipeLiked(userId, recipe.id, true).catch(() => {});
          logInteraction(userId, supabaseId, 'grocery_add', sessionNumber).catch(() => {});
        })
        .catch(() => {});
    }
    // Green toast feedback — fades in instantly, holds, then fades out
    setCartToast(true);
    cartToastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(cartToastOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(cartToastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setCartToast(false));
    // Auto-swipe right — handles save + swipe logging + fly-off animation
    handleButtonSwipe('right');
  }

  // Open detail modal for current top card
  function handleViewDetail() {
    const recipe = recipes[currentIndexRef.current];
    if (!recipe) return;
    setShowDetail(true);
    // Log view — repeated views of the same recipe = strong interest signal
    if (userId) {
      resolveSupabaseId(recipe)
        .then((supabaseId) => logInteraction(userId, supabaseId, 'view', sessionNumber))
        .catch(() => {});
    }
  }

  const [cookedRecipeIds, setCookedRecipeIds] = useState<Set<string>>(new Set());
  // Supabase-backed cooked IDs — persists across sessions, enables "Made before" banner
  const [prevCookedIds, setPrevCookedIds] = useState<Set<string>>(new Set());
  const [badgeQueue, setBadgeQueue] = useState<Badge[]>([]);
  // Meal prep slot picker — shown after right swipe in meal_prep mode

  const isSaved = useSavedStore((s) => s.isSaved);
  const mealPlan = useMealPlanStore((s) => s.plan);
  const loadMealPlan = useMealPlanStore((s) => s.loadPlan);
  // Days with at least one slot filled this week
  const daysPlanned = new Set((mealPlan?.slots ?? []).map((s) => s.day)).size;

  const visibleCards = recipes.slice(currentIndex, currentIndex + 3);
  const isEmpty = !isLoading && currentIndex >= recipes.length;
  // Deck was empty on load (nothing matched the filter) vs exhausted by swiping
  const isInitiallyEmpty = !isLoading && recipes.length === 0;

  // Computed inline every render — no state lag. Cache hit = accurate data,
  // cache miss = instant local estimate. macroCacheVersion causes a re-render
  // when accurate data arrives, silently updating the pill.
  const topRecipe = recipes[currentIndex] ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const topMacros = topRecipe
    ? (macroCache.current.get(topRecipe.id) ?? estimateMacrosLocally(topRecipe.title))
    : null;
  // Consume the undo entry offset exactly once — the top card reads it on mount
  const pendingEntryX = undoEntryXRef.current;
  undoEntryXRef.current = null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Offline banner */}
      {isOffline && (
        <View style={{ backgroundColor: '#B45309', paddingVertical: 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="cloud-offline-outline" size={15} color="white" />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>No internet connection</Text>
        </View>
      )}
      <EmailVerifyBanner />
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <MoriLogo size="sm" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.toggleBg, borderRadius: 16, padding: 2 }}>
            {(['spontaneous', 'meal_prep'] as AppMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m as AppMode)}
                style={{
                  paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14,
                  backgroundColor: mode === m ? colors.primary : 'transparent',
                }}
              >
                <Text style={{ color: mode === m ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                  {m === 'spontaneous' ? 'Quick' : 'Meal Prep'}
                </Text>
              </Pressable>
            ))}
          </View>
          <AvatarButton />
        </View>
      </View>

      {/* Card Stack */}
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 16 }}>
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Loading recipes...</Text>
          </View>
        ) : isInitiallyEmpty && mode === 'meal_prep' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 48 }}>🥡</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>No meal prep recipes yet</Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              Nothing matches your preferences in Meal Prep mode right now.{'\n'}Try Spontaneous to discover more.
            </Text>
            <Pressable
              onPress={() => setMode('spontaneous')}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Try Spontaneous mode</Text>
            </Pressable>
          </View>
        ) : isInitiallyEmpty ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 48 }}>🍽️</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>No recipes found</Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              Couldn't load your deck.{'\n'}Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => { hasDeckRef.current = false; setIsLoading(true); setReloadKey((k) => k + 1); }}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Try Again</Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 48 }}>🎉</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>All caught up!</Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              You've seen all available recipes.{'\n'}Check back soon for more.
            </Text>
            <Pressable
              onPress={() => { setCurrentIndex(0); setReloadKey((k) => k + 1); }}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Start Over</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Exiting card overlay — rendered above the stack, fly-off animation plays
                while the new top card is already swipeable underneath */}
            {exitCard && (() => {
              const exitRotate = exitCard.position.x.interpolate({
                inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
                outputRange: ['-8deg', '0deg', '8deg'],
                extrapolate: 'clamp',
              });
              return (
                <Animated.View
                  key="exit-card"
                  style={{
                    position: 'absolute', width: CARD_WIDTH, height: '96%', top: 0, zIndex: 99,
                    transform: [
                      { translateX: exitCard.position.x },
                      { translateY: exitCard.position.y },
                      { rotate: exitRotate },
                    ],
                  }}
                >
                  <RecipeSwipeCard
                    recipe={exitCard.recipe}
                    onSwipe={() => {}}
                    isTop={false}
                    detail={exitCard.detail}
                  />
                </Animated.View>
              );
            })()}

            {[...visibleCards].reverse().map((recipe, i) => {
              const stackIndex = visibleCards.length - 1 - i;
              const cardDetail = detailCache.current.get(recipe.id) ?? undefined;
              const baseStyle = {
                position: 'absolute' as const,
                width: CARD_WIDTH,
                height: '96%' as any,
                top: 0,
              };

              if (stackIndex === 0) {
                return (
                  <Animated.View key={recipe.id} style={baseStyle}>
                    <RecipeSwipeCard
                      recipe={recipe}
                      onSwipe={(dir, rx, ry) => handleSwipe(dir, rx, ry)}
                      onTap={handleViewDetail}
                      isTop
                      detail={cardDetail}
                      topDragX={topDragX}
                      entryX={pendingEntryX ?? undefined}
                      dietaryGoals={dietaryGoals}
                      macros={topMacros}
                      isCooked={recipe.supabase_id ? (prevCookedIds.has(recipe.supabase_id) || cookedRecipeIds.has(recipe.supabase_id)) : false}
                      isSaved={isSaved(recipe.id)}
                    />
                  </Animated.View>
                );
              }

              if (stackIndex === 1) {
                const nextMacros = macroCache.current.get(recipe.id) ?? estimateMacrosLocally(recipe.title);
                return (
                  <Animated.View
                    key={recipe.id}
                    style={[baseStyle, {
                      transform: [
                        { scaleX: nextCardScale },
                        { scaleY: nextCardScale },
                      ],
                    }]}
                  >
                    <RecipeSwipeCard
                      recipe={recipe}
                      onSwipe={() => {}}
                      isTop={false}
                      detail={cardDetail}
                      topDragX={topDragX}
                      dietaryGoals={dietaryGoals}
                      macros={nextMacros}
                    />
                  </Animated.View>
                );
              }

              // stackIndex >= 2: fixed resting position behind the stack
              return (
                <View
                  key={recipe.id}
                  style={[baseStyle, {
                    transform: [
                      { scaleX: (CARD_WIDTH - 8) / CARD_WIDTH },
                      { scaleY: (CARD_WIDTH - 8) / CARD_WIDTH },
                    ],
                  }]}
                >
                  <RecipeSwipeCard
                    recipe={recipe}
                    onSwipe={handleSwipe}
                    isTop={false}
                    detail={cardDetail}
                  />
                </View>
              );
            })}
          </>
        )}
      </View>

      {/* Cart toast — absolutely positioned so it never shifts layout */}
      {cartToast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 100,
            alignSelf: 'center',
            opacity: cartToastOpacity,
            backgroundColor: colors.primary,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            zIndex: 99,
          }}
        >
          <Ionicons name="cart" size={14} color="white" />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>Added to grocery list</Text>
        </Animated.View>
      )}

      {/* Week progress indicator — Meal Prep mode only. Tap → Plan tab */}
      {mode === 'meal_prep' && !isLoading && (
        <Pressable
          onPress={() => router.push('/(tabs)/plan')}
          style={{ alignItems: 'center', paddingBottom: 4, paddingVertical: 10, marginTop: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: i < daysPlanned ? colors.dayFilled : colors.dayEmpty,
                  }}
                />
              ))}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {daysPlanned} of 7 days planned · Plan week →
            </Text>
          </View>
        </Pressable>
      )}

      {/* Action Buttons */}
      {!isLoading && !isEmpty && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingBottom: 16 }}>
          {/* Pass */}
          <Animated.View style={{
            width: 60, height: 60, borderRadius: 30,
            backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.error,
            shadowColor: colors.error, shadowOffset: { width: 0, height: 0 },
            shadowOpacity: xGlowOpacity, shadowRadius: xGlowRadius, elevation: 3,
          }}>
            <Animated.View pointerEvents="none" style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 30, backgroundColor: colors.error, opacity: xFlashOpacity,
            }} />
            <Animated.View pointerEvents="none" style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 30, backgroundColor: colors.error, opacity: xPostGlow,
            }} />
            <Pressable
              onPress={() => handleButtonSwipe('left')}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={28} color={colors.error} />
              <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: xDragIconWhite }}>
                <Ionicons name="close" size={28} color="white" />
              </Animated.View>
              <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: xPostGlow }}>
                <Ionicons name="close" size={28} color="white" />
              </Animated.View>
            </Pressable>
          </Animated.View>

          {/* Undo */}
          <Pressable
            onPress={handleUndo}
            disabled={!lastSwipe}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: colors.card, borderWidth: 1.5,
              borderColor: lastSwipe ? colors.border : colors.border,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
              opacity: lastSwipe ? 1 : 0.35,
            }}
          >
            <Ionicons name="arrow-undo" size={19} color={lastSwipe ? colors.textMuted : colors.border} />
          </Pressable>

          {/* Flag — dev only */}
          {__DEV__ && topRecipe && (
            <Pressable
              onPress={() => {
                const reasons = ['Wrong image', 'Bad recipe / not tasty', 'Wrong ingredients', 'Bad macro data', 'Incorrect cuisine', 'Duplicate recipe', 'Inappropriate content', 'Other'];
                Alert.alert(
                  'Flag Recipe',
                  `"${topRecipe.title}"\n\nWhat's wrong?`,
                  [
                    ...reasons.map((r) => ({
                      text: r,
                      onPress: () => {
                        flagRecipe(topRecipe, r);
                        Alert.alert('Flagged', `"${topRecipe.title}" flagged for review.`);
                      },
                    })),
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
              style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: 'rgba(180,0,0,0.1)', borderWidth: 1.5, borderColor: '#B00020',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="flag-outline" size={19} color="#B00020" />
            </Pressable>
          )}

          {/* Add to Grocery List — filled green to stand out */}
          <Pressable
            onPress={() => {
              if (!topRecipe) return;
              setDeckServings(topRecipe.servings ?? 2);
              setDeckServingsSheetVisible(true);
            }}
            style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
            }}
          >
            <Ionicons name="cart" size={22} color={colors.white} />
          </Pressable>

          {/* Save */}
          <Animated.View style={{
            width: 60, height: 60, borderRadius: 30,
            backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary,
            shadowColor: colors.swipeRight, shadowOffset: { width: 0, height: 0 },
            shadowOpacity: heartGlowOpacity, shadowRadius: heartGlowRadius, elevation: 3,
          }}>
            <Animated.View pointerEvents="none" style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 30, backgroundColor: colors.swipeRight, opacity: heartFlashOpacity,
            }} />
            <Animated.View pointerEvents="none" style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 30, backgroundColor: colors.swipeRight, opacity: heartPostGlow,
            }} />
            <Pressable
              onPress={() => handleButtonSwipe('right')}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="heart" size={26} color={colors.primary} />
              <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: heartDragIconWhite }}>
                <Ionicons name="heart" size={26} color="white" />
              </Animated.View>
              <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: heartPostGlow }}>
                <Ionicons name="heart" size={26} color="white" />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* Recipe detail modal */}
      {(() => {
        const topRecipe = recipes[currentIndex] ?? null;
        const topCachedDetail = topRecipe ? detailCache.current.get(topRecipe.id) : null;
        return (
          <RecipeDetailModal
            visible={showDetail}
            recipe={topRecipe}
            detail={topCachedDetail}
            isSaved={topRecipe ? isSaved(topRecipe.id) : false}
            isInCart={topRecipe ? selectedRecipes.some((r) => r.id === topRecipe.id) : false}
            isCooked={topRecipe?.supabase_id ? (prevCookedIds.has(topRecipe.supabase_id) || cookedRecipeIds.has(topRecipe.supabase_id)) : false}
            onClose={() => setShowDetail(false)}
            onSaveToggle={() => {
              if (!topRecipe) return;
              if (isSaved(topRecipe.id)) removeRecipe(topRecipe, userId);
              else { addRecipe(topRecipe, userId); if (mode === 'meal_prep') addMealPrepId(topRecipe.id); }
            }}
            onAddToCart={(scaledIngredients) => {
              if (!topRecipe) return;
              addFromDetail(topRecipe, scaledIngredients);
              if (userId) {
                resolveSupabaseId(topRecipe)
                  .then((supabaseId) => logInteraction(userId, supabaseId, 'grocery_add', sessionNumber))
                  .catch(() => {});
              }
            }}
            onRemoveFromCart={() => { if (topRecipe) removeRecipeFromList(topRecipe.id); }}
            onMarkCooked={() => {
              if (!topRecipe || !userId) return;
              if (topRecipe.supabase_id) setCookedRecipeIds((prev) => new Set([...prev, topRecipe.supabase_id!]));
              const preCooked = profile?.meals_cooked_count ?? 0;
              const preLongest = profile?.longest_streak ?? 0;
              resolveSupabaseId(topRecipe)
                .then((supabaseId) => {
                  logInteraction(userId, supabaseId, 'cooked', sessionNumber).catch(() => {});
                  updateStreakAndCount(userId).then((updates) => {
                    if (updates && profile) {
                      useUserStore.getState().setProfile({ ...profile, ...updates });
                      const base: Partial<BadgeStats> = { distinctCuisines: 0, cookedMealPrep: false, recipesSubmitted: 0 };
                      const prevStats: BadgeStats = { totalCooked: preCooked, longestStreak: preLongest, ...base } as BadgeStats;
                      const nextStats: BadgeStats = { totalCooked: updates.meals_cooked_count, longestStreak: updates.longest_streak, ...base } as BadgeStats;
                      const newBadges = getNewlyEarned(prevStats, nextStats);
                      if (newBadges.length) setBadgeQueue(newBadges);
                    }
                  }).catch(() => {});
                })
                .catch(() => {});
              // PostCookLeftoversModal is handled inside RecipeDetailModal
            }}
          />
        );
      })()}

      {/* Deck Servings Sheet — quantity prompt for the swipe-deck green cart button */}
      <Modal
        visible={deckServingsSheetVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDeckServingsSheetVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16, gap: 20 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Add to grocery list</Text>
            {topRecipe && (
              <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 16, color: colors.text, lineHeight: 24 }}>
                {topRecipe.title}
              </Text>
            )}

            {/* Servings adjuster */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Servings</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
                <Pressable
                  onPress={() => setDeckServings((s) => Math.max(1, s - 1))} hitSlop={8}
                  style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="remove" size={20} color={deckServings <= 1 ? colors.border : colors.text} />
                </Pressable>
                <Text style={{ fontSize: 36, fontWeight: '700', color: colors.text, minWidth: 40, textAlign: 'center' }}>{deckServings}</Text>
                <Pressable
                  onPress={() => setDeckServings((s) => Math.min(20, s + 1))} hitSlop={8}
                  style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="add" size={20} color={deckServings >= 20 ? colors.border : colors.text} />
                </Pressable>
              </View>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>serving{deckServings !== 1 ? 's' : ''}</Text>
            </View>

            {/* Scaled macros + cost */}
            {topRecipe && (() => {
              const deckBaseServings = topRecipe.servings ?? 2;
              const deckRatio = deckServings / deckBaseServings;
              const scaledMacros = topMacros ? scaleMacros(topMacros, deckRatio) : null;
              const totalCost = topRecipe.cost_per_serving != null
                ? formatCost(topRecipe.cost_per_serving * deckServings)
                : null;
              if (!scaledMacros && !totalCost) return null;
              return (
                <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10 }}>
                  {scaledMacros && <MacroRow macros={scaledMacros} />}
                  {totalCost && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Ionicons name="cart-outline" size={14} color={colors.textMuted} />
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>
                        Est. <Text style={{ fontWeight: '600', color: colors.text }}>{totalCost}</Text> total
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Scaled ingredient list */}
            {topRecipe && (() => {
              const deckBaseServings = topRecipe.servings ?? 2;
              const deckRatio = deckServings / deckBaseServings;
              const detail = detailCache.current.get(topRecipe.id);
              const ings = detail?.ingredients && detail.ingredients.length > 0
                ? detail.ingredients
                : topRecipe.ingredients.map((i) => ({ name: i.name, measure: `${i.quantity ?? ''} ${i.unit ?? ''}`.trim() }));
              if (ings.length === 0) return null;
              return (
                <View style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingVertical: 10 }}>
                    Ingredients
                  </Text>
                  {ings.map((ing, i) => {
                    const scaledMeasure = scaleDeckMeasure(ing.measure ?? '', deckRatio);
                    const isLast = i === ings.length - 1;
                    return (
                      <View key={i} style={{
                        flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                        borderBottomWidth: isLast ? 0 : 0.5, borderBottomColor: colors.border,
                      }}>
                        <Text style={{ flex: 1, fontSize: 13, color: colors.text }}>{ing.name}</Text>
                        {scaledMeasure ? (
                          <Text style={{ fontSize: 13, fontWeight: '600', color: deckRatio !== 1 ? colors.primary : colors.text }}>
                            {scaledMeasure}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}>
            <Pressable
              onPress={() => {
                setDeckServingsSheetVisible(false);
                handleAddToCart(deckServings);
              }}
              style={{ backgroundColor: colors.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>
                Add {deckServings} serving{deckServings !== 1 ? 's' : ''} to grocery list
              </Text>
            </Pressable>
            <Pressable onPress={() => setDeckServingsSheetVisible(false)} style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <TutorialOverlay
        visible={showTutorial}
        onDone={() => setShowTutorial(false)}
        userId={userId ?? ''}
      />

      {/* Meal Prep mode one-time tip */}
      {showMealPrepTip && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 80,
        }}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 16,
            padding: 20, marginHorizontal: 24,
            borderWidth: 1, borderColor: colors.border,
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Ionicons name="flash-outline" size={22} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                Meal Prep mode
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.textMuted, lineHeight: 21, marginBottom: 16 }}>
              You're now in Meal Prep mode — recipes are optimised for batch cooking and weekly planning.
              {'\n\n'}Tap the <Text style={{ fontWeight: '700', color: colors.text }}>Quick / Meal Prep</Text> toggle at the top anytime to switch modes.
            </Text>
            <Pressable
              onPress={() => {
                AsyncStorage.setItem(`@mori_mealprep_tip_seen_${userId}`, 'true').catch(() => {});
                setShowMealPrepTip(false);
              }}
              style={{
                backgroundColor: colors.primary, borderRadius: 10,
                paddingVertical: 10, alignItems: 'center',
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Got it</Text>
            </Pressable>
          </View>
        </View>
      )}

      <LeftoversReminderModal />
      <BadgeAchievementModal queue={badgeQueue} onQueueChange={setBadgeQueue} />
    </SafeAreaView>
  );
}
