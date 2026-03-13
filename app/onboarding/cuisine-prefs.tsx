import { View, Text, Pressable, Dimensions, Animated, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState, useEffect } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';
import ProgressBar from '@/components/onboarding/ProgressBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

// 12 universal cuisines everyone recognises — no niche sub-types.
// Advanced/rare cuisines (Moroccan, Ethiopian, Peruvian, Szechuan etc.) are NOT
// shown here. Instead, Claude surfaces them as "adventure cards" in the Discover
// feed for users who selected confident_chef or home_cook — a reward, not a form.
// Images verified as loading reliably from Unsplash.
const CUISINES = [
  { id: 'italian',       label: 'Italian',       image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600' },
  { id: 'mexican',       label: 'Mexican',       image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600' },
  { id: 'chinese',       label: 'Chinese',       image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600' },
  { id: 'japanese',      label: 'Japanese',      image: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600' },
  { id: 'indian',        label: 'Indian',        image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600' },
  { id: 'american',      label: 'American',      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600' },
  { id: 'mediterranean', label: 'Mediterranean', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600' },
  { id: 'thai',          label: 'Thai',          image: 'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=600' },
  { id: 'french',        label: 'French',        image: 'https://images.unsplash.com/photo-1608855238293-a8853e7f7c98?w=600' },
  { id: 'greek',         label: 'Greek',         image: 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=600' },
  { id: 'korean',        label: 'Korean',        image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600' },
  { id: 'middle_eastern',label: 'Middle Eastern',image: 'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?w=600' },
];

type Cuisine = typeof CUISINES[0];

function CuisineCard({
  cuisine,
  onSwipe,
  isTop,
  topDragX,
  entryX,
}: {
  cuisine: Cuisine;
  onSwipe: (direction: 'like' | 'pass', position: Animated.ValueXY) => void;
  isTop: boolean;
  topDragX?: Animated.Value;
  entryX?: number;
}) {
  const position = useRef(new Animated.ValueXY()).current;
  const [isUndoEntry, setIsUndoEntry] = useState(entryX != null);

  // Undo entry animation — springs in from the direction the card was swiped out
  const entryXRef = useRef(entryX);
  useEffect(() => {
    if (entryXRef.current == null) return;
    position.setValue({ x: entryXRef.current, y: 0 });
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 6,
      tension: 50,
      useNativeDriver: true,
    }).start(() => setIsUndoEntry(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const topDragXRef = useRef(topDragX);
  topDragXRef.current = topDragX;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTopRef.current,
      onMoveShouldSetPanResponder: () => isTopRef.current,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy * 0.1 });
        topDragXRef.current?.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
          const dir = gesture.dx > 0 ? 'like' : 'pass';
          topDragXRef.current?.setValue(dir === 'like' ? SCREEN_WIDTH : -SCREEN_WIDTH);
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

  const passOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#111',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 8,
        transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }],
      }}
    >
      <Image
        source={{ uri: cuisine.image }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        priority="high"
      />

      {isUndoEntry ? (
        /* Undo entry — show neutral "BACK" badge while card springs in */
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: 'rgba(80,80,80,0.85)', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>BACK</Text>
          </View>
        </View>
      ) : (
        <>
          {/* LOVE IT overlay */}
          <Animated.View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center', opacity: likeOpacity,
          }}>
            <View style={{ backgroundColor: colors.swipeRight, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>LOVE IT</Text>
            </View>
          </Animated.View>

          {/* PASS overlay */}
          <Animated.View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center', opacity: passOpacity,
          }}>
            <View style={{ backgroundColor: colors.swipeLeft, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>PASS</Text>
            </View>
          </Animated.View>
        </>
      )}

      {/* Label */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: 20, backgroundColor: 'rgba(0,0,0,0.5)',
      }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '800' }}>{cuisine.label}</Text>
      </View>
    </Animated.View>
  );
}

interface ExitCard {
  cuisine: Cuisine;
  position: Animated.ValueXY;
}

export default function CuisinePrefs() {
  const { setOnboardingField } = useUserStore();
  const [index, setIndex] = useState(0);
  const [exitCard, setExitCard] = useState<ExitCard | null>(null);
  const [swipeHistory, setSwipeHistory] = useState<{ direction: 'like' | 'pass'; index: number }[]>([]);
  const liked = useRef<string[]>([]);
  const currentIndexRef = useRef(index);
  currentIndexRef.current = index;
  const undoEntryXRef = useRef<number | null>(null);

  const topDragX = useRef(new Animated.Value(0)).current;

  const swipeProgress = useRef(
    topDragX.interpolate({
      inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      outputRange: [1, 0, 1],
      extrapolate: 'clamp',
    })
  ).current;

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

  // Prefetch all images upfront so cards are ready before they scale into view
  useEffect(() => {
    CUISINES.forEach((c) => Image.prefetch(c.image));
  }, []);

  function handleSwipe(direction: 'like' | 'pass', cardPosition: Animated.ValueXY) {
    const cuisine = CUISINES[currentIndexRef.current];
    if (direction === 'like') {
      liked.current = [...liked.current, cuisine.id];
    }

    setSwipeHistory((h) => [...h, { direction, index: currentIndexRef.current }]);
    setExitCard({ cuisine, position: cardPosition });

    const next = currentIndexRef.current + 1;
    const flyTo = { x: direction === 'like' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 };

    if (next >= CUISINES.length) {
      // Last card — navigate after fly-off completes
      Animated.spring(cardPosition, {
        toValue: flyTo,
        useNativeDriver: true,
        speed: 20,
      }).start(() => {
        setExitCard(null);
        setOnboardingField('cuisine_preferences', liked.current);
        router.push('/onboarding/eating-style');
      });
    } else {
      setIndex(next);
      Animated.spring(topDragX, { toValue: 0, friction: 6, tension: 40, useNativeDriver: true }).start();
      Animated.spring(cardPosition, {
        toValue: flyTo,
        useNativeDriver: true,
        speed: 20,
      }).start(() => setExitCard(null));
    }
  }

  function handleUndo() {
    if (swipeHistory.length === 0) return;
    const prev = swipeHistory[swipeHistory.length - 1];
    if (prev.direction === 'like') {
      liked.current = liked.current.filter((id) => id !== CUISINES[prev.index].id);
    }
    undoEntryXRef.current = prev.direction === 'like' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    setIndex(prev.index);
    setSwipeHistory((h) => h.slice(0, -1));
  }

  function handleButtonSwipe(direction: 'like' | 'pass') {
    if (!CUISINES[currentIndexRef.current]) return;
    const syntheticPos = new Animated.ValueXY({ x: 0, y: 0 });
    handleSwipe(direction, syntheticPos);
  }

  const current = CUISINES[index];
  const next = CUISINES[index + 1];
  if (!current) return null;

  // Consume once — the new top card reads it on mount
  const pendingEntryX = undoEntryXRef.current;
  undoEntryXRef.current = null;

  const baseCardStyle = {
    position: 'absolute' as const,
    width: CARD_WIDTH,
    height: '96%' as any,
    top: 0,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={3} total={8} />

      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 }}>
          Which cuisines do you love?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted }}>
          Swipe right to like, left to pass.
        </Text>
      </View>

      {/* Card stack */}
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 24 }}>

        {/* Exit card overlay — plays fly-off while new top card is already interactive */}
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
                ...baseCardStyle,
                zIndex: 99,
                transform: [
                  { translateX: exitCard.position.x },
                  { translateY: exitCard.position.y },
                  { rotate: exitRotate },
                ],
              }}
            >
              <CuisineCard cuisine={exitCard.cuisine} onSwipe={() => {}} isTop={false} />
            </Animated.View>
          );
        })()}

        {/* Render top + next as a keyed map so React reuses the next card's
            component instance (with its already-loaded image) when it becomes
            the top card — eliminating the flash on every transition. */}
        {[current, ...(next ? [next] : [])].reverse().map((cuisine) => {
          const isTopCard = cuisine.id === current.id;
          return isTopCard ? (
            <Animated.View key={cuisine.id} style={baseCardStyle}>
              <CuisineCard
                cuisine={cuisine}
                onSwipe={handleSwipe}
                isTop
                topDragX={topDragX}
                entryX={pendingEntryX ?? undefined}
              />
            </Animated.View>
          ) : (
            <Animated.View
              key={cuisine.id}
              style={[baseCardStyle, {
                transform: [
                  { scaleX: nextCardScale },
                  { scaleY: nextCardScale },
                  { translateY: nextCardTranslateY },
                ],
              }]}
            >
              <CuisineCard cuisine={cuisine} onSwipe={() => {}} isTop={false} />
            </Animated.View>
          );
        })}
      </View>

      {/* Action buttons + counter */}
      <View style={{ alignItems: 'center', paddingBottom: 36, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
          <Pressable
            onPress={() => handleButtonSwipe('pass')}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.error,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
            }}
          >
            <Ionicons name="close" size={28} color={colors.error} />
          </Pressable>
          <Pressable
            onPress={handleUndo}
            disabled={swipeHistory.length === 0}
            style={{
              width: 46, height: 46, borderRadius: 23,
              backgroundColor: colors.white, borderWidth: 1.5,
              borderColor: swipeHistory.length > 0 ? colors.textMuted : colors.border,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
              opacity: swipeHistory.length > 0 ? 1 : 0.4,
            }}
          >
            <Ionicons name="arrow-undo" size={20} color={swipeHistory.length > 0 ? colors.textMuted : colors.border} />
          </Pressable>
          <Pressable
            onPress={() => handleButtonSwipe('like')}
            style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
            }}
          >
            <Ionicons name="heart" size={26} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {index + 1} of {CUISINES.length}
        </Text>
      </View>
    </View>
  );
}
