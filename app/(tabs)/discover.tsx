import {
  View,
  Text,
  Pressable,
  Dimensions,
  Animated,
  PanResponder,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { formatTime, formatCost, getTimeOfDay, getWeekStart } from '@/lib/utils';
import { fetchMealDetail, type MealDetail } from '@/lib/mealdb';
import { logSwipe, upsertRecipeByExternalId, setRecipeLiked, fetchMacros, estimateMacrosLocally, fetchScoredDeck, updateRecipeDetail, updateRecipeMacros, logInteraction, recordSessionSwipe, cancelLeftSwipe, recordAdventureCardLeftSwipe, clearSessionState, getCookedRecipeIds, rateRecipe, flagRecipe } from '@/lib/api';
import { RecipeDetailModal } from '@/components/RecipeDetailModal';
import { HeadlineMacroPill } from '@/components/ui/MacroRow';
import { MoriLogo } from '@/components/ui/MoriLogo';
import { useSavedStore } from '@/stores/savedStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useUserStore } from '@/stores/userStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { useMealPlanStore } from '@/stores/mealPlanStore';
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
          ) : null}
        </View>

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

        {/* Ingredient pills — wrapped grid */}
        {detail?.ingredients && detail.ingredients.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {detail.ingredients.slice(0, 8).map((ing, i) => (
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
  const cartToastOpacity = useRef(new Animated.Value(0)).current;
  const detailCache = useRef<Map<string, MealDetail>>(new Map());
  const macroCache = useRef<Map<string, Macros>>(new Map());
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  // Set before decrementing currentIndex so the new top card picks it up on mount
  const undoEntryXRef = useRef<number | null>(null);
  const { addRecipe, removeRecipe } = useSavedStore();
  const { addFromDetail, selectedRecipes } = useGroceryStore();
  const userId = useUserStore((s) => s.profile?.id);
  const sessionNumber = useUserStore((s) => s.sessionNumber);
  const profile = useUserStore((s) => s.profile ?? null);
  const dietaryGoals = useUserStore((s) => s.profile?.dietary_goals ?? EMPTY_GOALS);
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

  // Next card (stackIndex=1) scales up and slides up as you drag
  const nextCardScale = useRef(
    swipeProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [(CARD_WIDTH - 8) / CARD_WIDTH, 1],
    })
  ).current;

  const nextCardTranslateY = useRef(
    swipeProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [8, 0],
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
  }, [userId, mode, dietaryGoals]); // eslint-disable-line react-hooks/exhaustive-deps

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
          ingredients: recipe.ingredients.map((ing) => ({ name: ing.name, measure: ing.quantity ?? '' })),
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
              ingredients: recipe.ingredients.map((ing) => ({ name: ing.name, measure: ing.quantity ?? '' })),
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

  // Resolves the Supabase UUID for a recipe — uses supabase_id directly if present
  // (AI-generated and recommended recipes already have it), otherwise upserts via external_id.
  function resolveSupabaseId(recipe: Recipe): Promise<string> {
    if (recipe.supabase_id) return Promise.resolve(recipe.supabase_id);
    return upsertRecipeByExternalId(recipe);
  }

  // Fire-and-forget: resolve Supabase UUID then log the swipe.
  // Never blocks the animation or the UI — errors are silently swallowed.
  function logSwipeBackground(recipe: Recipe, direction: 'left' | 'right', currentMode: AppMode) {
    if (!userId) return;
    console.log(`[swipe] ${direction === 'right' ? '✓' : '✗'} "${recipe.title}" (${recipe.cuisine ?? 'unknown'})`);
    // Adventure card left-swipe → pause adventure cards for next 10 swipes
    if (recipe.isAdventure && direction === 'left') recordAdventureCardLeftSwipe();
    resolveSupabaseId(recipe)
      .then((supabaseId) => {
        recordSessionSwipe(supabaseId, direction);
        return logSwipe({
          user_id: userId,
          recipe_id: supabaseId,
          direction,
          mode: currentMode,
          time_of_day: getTimeOfDay(),
          day_of_week: new Date().getDay(),
          session_number: sessionNumber,
        });
      })
      .catch(() => {}); // swipe logging is non-critical
  }

  function handleSwipe(direction: 'left' | 'right', releaseX = 0, releaseY = 0) {
    const recipe = recipes[currentIndexRef.current];
    if (!recipe) return;
    if (direction === 'right') addRecipe(recipe, userId);
    setLastSwipe({ recipe, direction });
    logSwipeBackground(recipe, direction, mode as AppMode);

    // Each exit card gets its own ValueXY so rapid swipes don't conflict.
    const exitPos = new Animated.ValueXY({ x: releaseX, y: releaseY });
    const exitId = ++exitIdRef.current;
    setExitCard({ recipe, detail: detailCache.current.get(recipe.id), position: exitPos });

    // Increment immediately — the card has no running animation on its own
    // position, so unmounting it won't cause a native-driver flash. The exit
    // overlay (above) handles the visual fly-off on a separate ValueXY.
    setCurrentIndex((prev) => prev + 1);

    // Spring topDragX back so the background card settles smoothly (no pop).
    Animated.spring(topDragX, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }).start();

    // Fly exit overlay off screen.
    Animated.spring(exitPos, {
      toValue: { x: direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 },
      useNativeDriver: true,
      speed: 20,
      bounciness: 0,
    }).start(() => {
      // Only clear if this is still the latest exit card
      if (exitIdRef.current === exitId) setExitCard(null);
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

  // Add current top card to grocery list, mark liked for Phase 2 AI signal,
  // flash a green toast, then auto-swipe right so the card flies off naturally.
  function handleAddToCart() {
    const recipe = recipes[currentIndexRef.current];
    if (!recipe) return;
    const detail = detailCache.current.get(recipe.id);
    addFromDetail(recipe, detail?.ingredients ?? []);
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
  // Meal prep slot picker — shown after right swipe in meal_prep mode

  const isSaved = useSavedStore((s) => s.isSaved);
  const mealPlan = useMealPlanStore((s) => s.plan);
  const loadMealPlan = useMealPlanStore((s) => s.loadPlan);
  // Days with at least one slot filled this week
  const daysPlanned = new Set((mealPlan?.slots ?? []).map((s) => s.day)).size;

  const visibleCards = recipes.slice(currentIndex, currentIndex + 3);
  const isEmpty = !isLoading && currentIndex >= recipes.length;

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
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <MoriLogo size="sm" />
        <View style={{ flexDirection: 'row', backgroundColor: colors.toggleBg, borderRadius: 20, padding: 3 }}>
          {(['spontaneous', 'meal_prep'] as AppMode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m as AppMode)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 17,
                backgroundColor: mode === m ? colors.primary : 'transparent',
              }}
            >
              <Text style={{ color: mode === m ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                {m === 'spontaneous' ? 'Quick' : 'Meal Prep'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Card Stack */}
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 16 }}>
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Loading recipes...</Text>
          </View>
        ) : isEmpty ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 48 }}>🎉</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>All caught up!</Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              You've seen all available recipes.{'\n'}Check back soon for more.
            </Text>
            <Pressable
              onPress={() => setCurrentIndex(0)}
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
                        { translateY: nextCardTranslateY },
                      ],
                    }]}
                  >
                    <RecipeSwipeCard
                      recipe={recipe}
                      onSwipe={() => {}}
                      isTop={false}
                      detail={cardDetail}
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
                      { translateY: 16 },
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
          onPress={() => router.push('/(tabs)/recipes?tab=plan')}
          style={{ alignItems: 'center', paddingBottom: 4, paddingVertical: 6 }}
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
          <Pressable
            onPress={() => handleButtonSwipe('left')}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.error,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
            }}
          >
            <Ionicons name="close" size={28} color={colors.error} />
          </Pressable>

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
            onPress={handleAddToCart}
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
          <Pressable
            onPress={() => handleButtonSwipe('right')}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
            }}
          >
            <Ionicons name="heart" size={26} color={colors.primary} />
          </Pressable>
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
              else addRecipe(topRecipe, userId);
            }}
            onAddToCart={() => {
              if (!topRecipe) return;
              handleAddToCart();
              setShowDetail(false);
            }}
            onMarkCooked={() => {
              if (!topRecipe || !userId) return;
              if (topRecipe.supabase_id) setCookedRecipeIds((prev) => new Set([...prev, topRecipe.supabase_id!]));
              resolveSupabaseId(topRecipe)
                .then((supabaseId) => logInteraction(userId, supabaseId, 'cooked', sessionNumber))
                .catch(() => {});
            }}
            onRateRecipe={(rating) => {
              if (!topRecipe || !userId) return;
              resolveSupabaseId(topRecipe)
                .then((supabaseId) => rateRecipe(userId, supabaseId, rating))
                .catch(() => {});
            }}
          />
        );
      })()}
    </SafeAreaView>
  );
}
