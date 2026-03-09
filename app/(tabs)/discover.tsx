import {
  View,
  Text,
  Pressable,
  Dimensions,
  Animated,
  PanResponder,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRef, useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { formatTime, formatCost } from '@/lib/utils';
import { fetchMealDBRecipes, fetchMealDetail, type MealDetail } from '@/lib/mealdb';
import { useSavedStore } from '@/stores/savedStore';
import { useUserStore } from '@/stores/userStore';
import type { Recipe, AppMode } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

function RecipeSwipeCard({
  recipe,
  onSwipe,
  isTop,
  detail,
  topDragX,
  entryX,
}: {
  recipe: Recipe;
  // onSwipe fires immediately at threshold — parent receives position to own the fly-off spring
  onSwipe: (direction: 'left' | 'right', cardPosition: Animated.ValueXY) => void;
  isTop: boolean;
  detail?: MealDetail;
  topDragX?: Animated.Value;
  entryX?: number; // if set, card springs in from this x offset on mount (undo animation)
}) {
  const position = useRef(new Animated.ValueXY()).current;

  // Undo entry animation — runs once on mount if entryX is provided.
  // Capture entryX in a ref so the effect closure is stable.
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
          // Snap background to full-swipe position so the next card is at
          // scale=1.0 the instant the index changes — no pop on transition.
          topDragXRef.current?.setValue(dir === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
          // Fire immediately — parent gets position and starts the fly-off spring.
          // The new top card becomes swipeable right now, no animation delay.
          onSwipeRef.current(dir, position);
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
          {recipe.badge !== 'none' && (
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, marginTop: 2 }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                {recipe.badge === 'staff_pick' ? 'Staff Pick' : 'Fan Fave'}
              </Text>
            </View>
          )}
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
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>{ing}</Text>
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

export default function Discover() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<AppMode>('spontaneous');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [topDetail, setTopDetail] = useState<MealDetail | null>(null);
  const [exitCard, setExitCard] = useState<ExitCard | null>(null);
  const [lastSwipe, setLastSwipe] = useState<{ recipe: Recipe; direction: 'left' | 'right' } | null>(null);
  const detailCache = useRef<Map<string, MealDetail>>(new Map());
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  // Set before decrementing currentIndex so the new top card picks it up on mount
  const undoEntryXRef = useRef<number | null>(null);
  const { addRecipe, removeRecipe } = useSavedStore();
  const userId = useUserStore((s) => s.profile?.id);

  // Single Animated.Value tracking the top card's drag X.
  // Background cards interpolate from this — fully decoupled from the top
  // card's own visual position so resetting it never causes a flash.
  const topDragX = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    fetchMealDBRecipes()
      .then(setRecipes)
      .finally(() => setIsLoading(false));
  }, []);

  // When top card changes, serve from cache immediately — no API call needed
  useEffect(() => {
    const top = recipes[currentIndex];
    if (!top) return;
    setTopDetail(detailCache.current.get(top.id) ?? null);
  }, [currentIndex, recipes]);

  // Fire ALL detail requests in parallel the moment the deck loads.
  // All ~20 cards will be cached within one round-trip (~400ms) instead of
  // N * 400ms sequentially. TheMealDB handles concurrent requests fine.
  useEffect(() => {
    if (recipes.length === 0) return;
    let cancelled = false;

    recipes.forEach(async (recipe) => {
      if (cancelled || detailCache.current.has(recipe.id)) return;
      const detail = await fetchMealDetail(recipe.id);
      if (cancelled || !detail) return;
      detailCache.current.set(recipe.id, detail);
      // Hydrate UI if this is still the top card
      if (recipe.id === recipes[currentIndexRef.current]?.id) {
        setTopDetail(detail);
      }
    });

    return () => { cancelled = true; };
  }, [recipes]);

  function handleSwipe(direction: 'left' | 'right', cardPosition: Animated.ValueXY) {
    const recipe = recipes[currentIndexRef.current];
    if (direction === 'right' && recipe) addRecipe(recipe, userId);
    if (recipe) setLastSwipe({ recipe, direction });

    // Keep the exiting card rendered as an overlay so its fly-off animation
    // plays while the new top card is already fully interactive.
    setExitCard({ recipe: recipe!, detail: detailCache.current.get(recipe!.id), position: cardPosition });

    // Increment immediately — new top card's PanResponder is active right now.
    setCurrentIndex((prev) => prev + 1);

    // Spring topDragX back so the new background card settles into resting position.
    Animated.spring(topDragX, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }).start();

    // Fly the exiting card off screen, then clear it.
    Animated.spring(cardPosition, {
      toValue: { x: direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 },
      useNativeDriver: true,
      speed: 20,
    }).start(() => setExitCard(null));
  }

  function handleUndo() {
    if (!lastSwipe || currentIndexRef.current === 0) return;
    if (lastSwipe.direction === 'right') removeRecipe(lastSwipe.recipe.id, userId);
    // Card springs in from the direction it was swiped out
    undoEntryXRef.current = lastSwipe.direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    setCurrentIndex((prev) => prev - 1);
    setLastSwipe(null);
  }

  // Button-tap swipe: synthesise a position and do the same fly-off.
  function handleButtonSwipe(direction: 'left' | 'right') {
    const recipe = recipes[currentIndexRef.current];
    if (!recipe) return;
    const syntheticPos = new Animated.ValueXY({ x: 0, y: 0 });
    handleSwipe(direction, syntheticPos);
  }

  const visibleCards = recipes.slice(currentIndex, currentIndex + 3);
  const isEmpty = !isLoading && currentIndex >= recipes.length;
  // Consume the undo entry offset exactly once — the top card reads it on mount
  const pendingEntryX = undoEntryXRef.current;
  undoEntryXRef.current = null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>Mise</Text>
        <View style={{ flexDirection: 'row', backgroundColor: colors.border, borderRadius: 20, padding: 3 }}>
          {(['spontaneous', 'meal_prep'] as AppMode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
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
                // Animated.View (not plain View) so React reconciles by key+type
                // when this card transitions from stackIndex=1 → 0, avoiding a
                // remount that would cause a flash. No transforms needed here —
                // the card handles its own position internally.
                return (
                  <Animated.View key={recipe.id} style={baseStyle}>
                    <RecipeSwipeCard
                      recipe={recipe}
                      onSwipe={(dir, pos) => handleSwipe(dir, pos)}
                      isTop
                      detail={cardDetail}
                      topDragX={topDragX}
                      entryX={pendingEntryX ?? undefined}
                    />
                  </Animated.View>
                );
              }

              if (stackIndex === 1) {
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

      {/* Action Buttons */}
      {!isLoading && !isEmpty && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingBottom: 16 }}>
          <Pressable
            onPress={() => handleButtonSwipe('left')}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.error,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
            }}
          >
            <Ionicons name="close" size={28} color={colors.error} />
          </Pressable>
          <Pressable
            onPress={handleUndo}
            disabled={!lastSwipe}
            style={{
              width: 46, height: 46, borderRadius: 23,
              backgroundColor: colors.white, borderWidth: 1.5,
              borderColor: lastSwipe ? colors.textMuted : colors.border,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
              opacity: lastSwipe ? 1 : 0.4,
            }}
          >
            <Ionicons name="arrow-undo" size={20} color={lastSwipe ? colors.textMuted : colors.border} />
          </Pressable>
          <Pressable
            onPress={() => handleButtonSwipe('right')}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
            }}
          >
            <Ionicons name="heart" size={26} color={colors.primary} />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
