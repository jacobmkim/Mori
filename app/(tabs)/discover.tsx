import {
  View,
  Text,
  Pressable,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { formatTime, formatCost } from '@/lib/utils';
import type { Recipe, AppMode } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

const SEED_RECIPES: Recipe[] = [
  {
    id: '1', title: 'Spaghetti Carbonara', description: 'Classic Roman pasta dish',
    cuisine: 'Italian', source_type: 'curated',
    ingredients: [
      { name: 'Spaghetti', quantity: '400', unit: 'g' },
      { name: 'Pancetta', quantity: '150', unit: 'g' },
      { name: 'Eggs', quantity: '4', unit: '' },
      { name: 'Parmesan', quantity: '100', unit: 'g' },
      { name: 'Black Pepper', quantity: '2', unit: 'tsp' },
    ],
    steps: [{ order: 1, instruction: 'Cook pasta. Mix eggs and cheese. Fry pancetta. Combine off heat.' }],
    prep_time_mins: 10, cook_time_mins: 20, servings: 4, cost_per_serving: 4.50,
    dietary_tags: [], badge: 'staff_pick', submitted_by: null,
    avg_rating: 4.8, rating_count: 234, save_count: 1200,
    image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=800',
    created_at: '',
  },
  {
    id: '2', title: 'Chicken Tikka Masala', description: 'Creamy spiced chicken curry',
    cuisine: 'Indian', source_type: 'curated',
    ingredients: [
      { name: 'Chicken Breast', quantity: '600', unit: 'g' },
      { name: 'Tomato Sauce', quantity: '400', unit: 'ml' },
      { name: 'Heavy Cream', quantity: '200', unit: 'ml' },
      { name: 'Garam Masala', quantity: '2', unit: 'tbsp' },
      { name: 'Garlic', quantity: '4', unit: 'cloves' },
      { name: 'Ginger', quantity: '1', unit: 'inch' },
    ],
    steps: [{ order: 1, instruction: 'Marinate chicken. Cook in sauce with spices and cream.' }],
    prep_time_mins: 20, cook_time_mins: 30, servings: 4, cost_per_serving: 6.00,
    dietary_tags: ['gluten_free'], badge: 'community_favorite', submitted_by: null,
    avg_rating: 4.7, rating_count: 189, save_count: 980,
    image_url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800',
    created_at: '',
  },
  {
    id: '3', title: 'Avocado Toast', description: 'Quick healthy breakfast',
    cuisine: 'American', source_type: 'curated',
    ingredients: [
      { name: 'Sourdough Bread', quantity: '2', unit: 'slices' },
      { name: 'Avocado', quantity: '1', unit: '' },
      { name: 'Lemon Juice', quantity: '1', unit: 'tbsp' },
      { name: 'Chili Flakes', quantity: '1', unit: 'tsp' },
      { name: 'Salt', quantity: '1', unit: 'pinch' },
    ],
    steps: [{ order: 1, instruction: 'Toast bread. Mash avocado with lemon. Season and serve.' }],
    prep_time_mins: 5, cook_time_mins: 5, servings: 1, cost_per_serving: 3.50,
    dietary_tags: ['vegan', 'dairy_free'], badge: 'none', submitted_by: null,
    avg_rating: 4.2, rating_count: 56, save_count: 320,
    image_url: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c820?w=800',
    created_at: '',
  },
  {
    id: '4', title: 'Beef Tacos', description: 'Street-style tacos with fresh salsa',
    cuisine: 'Mexican', source_type: 'curated',
    ingredients: [
      { name: 'Ground Beef', quantity: '500', unit: 'g' },
      { name: 'Corn Tortillas', quantity: '8', unit: '' },
      { name: 'Salsa', quantity: '1', unit: 'cup' },
      { name: 'Cheddar Cheese', quantity: '100', unit: 'g' },
      { name: 'Sour Cream', quantity: '4', unit: 'tbsp' },
      { name: 'Cumin', quantity: '1', unit: 'tbsp' },
    ],
    steps: [{ order: 1, instruction: 'Brown beef with spices. Assemble tacos with toppings.' }],
    prep_time_mins: 10, cook_time_mins: 15, servings: 4, cost_per_serving: 5.50,
    dietary_tags: [], badge: 'none', submitted_by: null,
    avg_rating: 4.5, rating_count: 102, save_count: 560,
    image_url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800',
    created_at: '',
  },
  {
    id: '5', title: 'Greek Salad', description: 'Fresh Mediterranean summer salad',
    cuisine: 'Mediterranean', source_type: 'curated',
    ingredients: [
      { name: 'Cucumber', quantity: '1', unit: '' },
      { name: 'Tomatoes', quantity: '3', unit: '' },
      { name: 'Red Onion', quantity: '0.5', unit: '' },
      { name: 'Feta Cheese', quantity: '150', unit: 'g' },
      { name: 'Kalamata Olives', quantity: '100', unit: 'g' },
      { name: 'Olive Oil', quantity: '3', unit: 'tbsp' },
    ],
    steps: [{ order: 1, instruction: 'Chop vegetables. Combine with olives and feta. Dress with olive oil.' }],
    prep_time_mins: 10, cook_time_mins: 0, servings: 2, cost_per_serving: 4.00,
    dietary_tags: ['vegetarian', 'gluten_free'], badge: 'staff_pick', submitted_by: null,
    avg_rating: 4.4, rating_count: 78, save_count: 410,
    image_url: 'https://images.unsplash.com/photo-1551248429-40975aa4de74?w=800',
    created_at: '',
  },
];

function RecipeSwipeCard({
  recipe,
  onSwipe,
  isTop,
}: {
  recipe: Recipe;
  onSwipe: (direction: 'left' | 'right') => void;
  isTop: boolean;
}) {
  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy * 0.15 });
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
          const dir = gesture.dx > 0 ? 'right' : 'left';
          Animated.spring(position, {
            toValue: { x: dir === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5, y: 0 },
            useNativeDriver: true,
            speed: 20,
          }).start(() => onSwipe(dir));
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            useNativeDriver: true,
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
        style={{ width: '100%', height: '65%' }}
        contentFit="cover"
      />

      {/* SAVE overlay — centred over image */}
      <Animated.View style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '65%',
        alignItems: 'center', justifyContent: 'center', opacity: likeOpacity,
      }}>
        <View style={{ backgroundColor: colors.swipeRight, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>SAVE</Text>
        </View>
      </Animated.View>

      {/* PASS overlay — centred over image */}
      <Animated.View style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '65%',
        alignItems: 'center', justifyContent: 'center', opacity: nopeOpacity,
      }}>
        <View style={{ backgroundColor: colors.swipeLeft, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: 'white', fontWeight: '800', fontSize: 22, letterSpacing: 1 }}>PASS</Text>
        </View>
      </Animated.View>

      {/* Info */}
      <View style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>
            {recipe.title}
          </Text>
          {recipe.badge !== 'none' && (
            <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                {recipe.badge === 'staff_pick' ? 'Staff Pick' : recipe.badge === 'community_favorite' ? 'Fan Fave' : 'Verified'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{recipe.cuisine}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>·</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>·</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{formatCost(recipe.cost_per_serving)}</Text>
        </View>

        {recipe.dietary_tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {recipe.dietary_tags.slice(0, 3).map((tag) => (
              <View key={tag} style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>
                  {tag.replace('_', ' ')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export default function Discover() {
  const [recipes] = useState<Recipe[]>(SEED_RECIPES);
  const [mode, setMode] = useState<AppMode>('spontaneous');
  const [currentIndex, setCurrentIndex] = useState(0);

  function handleSwipe(_direction: 'left' | 'right') {
    setCurrentIndex((prev) => prev + 1);
  }

  const visibleCards = recipes.slice(currentIndex, currentIndex + 3);
  const isEmpty = currentIndex >= recipes.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>PrepSwipe</Text>
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
        {isEmpty ? (
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
            {[...visibleCards].reverse().map((recipe, i) => {
              const stackIndex = visibleCards.length - 1 - i;
              return (
                <View
                  key={recipe.id}
                  style={{
                    position: 'absolute',
                    top: stackIndex * 8,
                    width: CARD_WIDTH - stackIndex * 8,
                    height: '88%',
                  }}
                >
                  <RecipeSwipeCard
                    recipe={recipe}
                    onSwipe={handleSwipe}
                    isTop={stackIndex === 0}
                  />
                </View>
              );
            })}
          </>
        )}
      </View>

      {/* Action Buttons */}
      {!isEmpty && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, paddingBottom: 16 }}>
          <Pressable
            onPress={() => handleSwipe('left')}
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
            onPress={() => handleSwipe('right')}
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
