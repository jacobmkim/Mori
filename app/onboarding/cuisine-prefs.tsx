import { View, Text, Pressable, Dimensions, Animated, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState, useEffect } from 'react';
import { Image } from 'expo-image';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';
import ProgressBar from '@/components/onboarding/ProgressBar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

const CUISINES = [
  { id: 'italian',       label: 'Italian',       image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600' },
  { id: 'mexican',       label: 'Mexican',       image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600' },
  { id: 'mediterranean', label: 'Mediterranean', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600' },
  { id: 'american',      label: 'American',      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600' },
  { id: 'indian',        label: 'Indian',        image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600' },
  { id: 'japanese',      label: 'Japanese',      image: 'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600' },
  { id: 'thai',          label: 'Thai',          image: 'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=600' },
  { id: 'korean',        label: 'Korean',        image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600' },
];

function CuisineCard({
  cuisine,
  onSwipe,
  swipeX,
}: {
  cuisine: typeof CUISINES[0];
  onSwipe: (direction: 'like' | 'pass') => void;
  swipeX: Animated.Value;
}) {
  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy * 0.1 });
        swipeX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
          const dir = gesture.dx > 0 ? 'like' : 'pass';
          Animated.spring(position, {
            toValue: { x: dir === 'like' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 },
            useNativeDriver: true,
            speed: 20,
          }).start(() => {
            swipeX.setValue(0);
            onSwipe(dir);
          });
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            useNativeDriver: true,
          }).start();
          Animated.spring(swipeX, {
            toValue: 0,
            friction: 5,
            useNativeDriver: false,
          }).start();
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

  const cardWidth = SCREEN_WIDTH - 48;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        width: cardWidth,
        height: 420,
        borderRadius: 20,
        overflow: 'hidden',
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

      {/* Like overlay — centred */}
      <Animated.View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center', opacity: likeOpacity,
      }}>
        <View style={{ backgroundColor: colors.swipeRight, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>LOVE IT</Text>
        </View>
      </Animated.View>

      {/* Pass overlay — centred */}
      <Animated.View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center', opacity: passOpacity,
      }}>
        <View style={{ backgroundColor: colors.swipeLeft, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>PASS</Text>
        </View>
      </Animated.View>

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

export default function CuisinePrefs() {
  const { setOnboardingField } = useUserStore();
  const [index, setIndex] = useState(0);
  const liked = useRef<string[]>([]);
  const swipeX = useRef(new Animated.Value(0)).current;

  // Prefetch the next image so it's ready before the swipe
  useEffect(() => {
    const next = CUISINES[index + 1];
    if (next) {
      Image.prefetch(next.image);
    }
  }, [index]);

  const greenOpacity = swipeX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 0.2],
    extrapolate: 'clamp',
  });

  const redOpacity = swipeX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [0.2, 0],
    extrapolate: 'clamp',
  });

  function advance(direction: 'like' | 'pass') {
    if (direction === 'like') {
      liked.current = [...liked.current, CUISINES[index].id];
    }
    const next = index + 1;
    if (next >= CUISINES.length) {
      setOnboardingField('cuisine_preferences', liked.current);
      router.push('/onboarding/cook-frequency');
    } else {
      setIndex(next);
    }
  }

  const current = CUISINES[index];
  if (!current) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={2} total={6} />

      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 }}>
          Which cuisines do you love?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted }}>
          Swipe right to like, left to pass.
        </Text>
      </View>

      {/* Card area with animated background flash */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Green flash */}
        <Animated.View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: colors.swipeRight, opacity: greenOpacity,
        }} />
        {/* Red flash */}
        <Animated.View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: colors.swipeLeft, opacity: redOpacity,
        }} />

        <CuisineCard key={current.id} cuisine={current} onSwipe={advance} swipeX={swipeX} />
      </View>

      {/* Buttons + progress */}
      <View style={{ alignItems: 'center', paddingBottom: 36, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 24 }}>
          <Pressable
            onPress={() => advance('pass')}
            style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.error,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
            }}
          >
            <Text style={{ fontSize: 26 }}>✕</Text>
          </Pressable>
          <Pressable
            onPress={() => advance('like')}
            style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
            }}
          >
            <Text style={{ fontSize: 26 }}>♥</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {index + 1} of {CUISINES.length}
        </Text>
      </View>
    </View>
  );
}
