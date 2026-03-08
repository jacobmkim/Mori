import { View, Text, FlatList, Pressable, TextInput } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { formatTime } from '@/lib/utils';
import { useSavedStore } from '@/stores/savedStore';
import type { Recipe } from '@/types';

const SEED_RECIPES: Recipe[] = [
  {
    id: '1', title: 'Spaghetti Carbonara', description: 'Classic Roman pasta dish',
    cuisine: 'Italian', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 10, cook_time_mins: 20, servings: 4, cost_per_serving: 4.50,
    dietary_tags: [], badge: 'staff_pick', submitted_by: null,
    avg_rating: 4.8, rating_count: 234, save_count: 1200,
    image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400',
    created_at: '',
  },
  {
    id: '2', title: 'Chicken Tikka Masala', description: 'Creamy spiced chicken curry',
    cuisine: 'Indian', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 20, cook_time_mins: 30, servings: 4, cost_per_serving: 6.00,
    dietary_tags: ['gluten_free'], badge: 'community_favorite', submitted_by: null,
    avg_rating: 4.7, rating_count: 189, save_count: 980,
    image_url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400',
    created_at: '',
  },
  {
    id: '3', title: 'Avocado Toast', description: 'Quick healthy breakfast',
    cuisine: 'American', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 5, cook_time_mins: 5, servings: 1, cost_per_serving: 3.50,
    dietary_tags: ['vegan', 'dairy_free'], badge: 'none', submitted_by: null,
    avg_rating: 4.2, rating_count: 56, save_count: 320,
    image_url: 'https://images.unsplash.com/photo-1541519227354-08fa5d50c820?w=400',
    created_at: '',
  },
  {
    id: '4', title: 'Beef Tacos', description: 'Street-style tacos with fresh salsa',
    cuisine: 'Mexican', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 10, cook_time_mins: 15, servings: 4, cost_per_serving: 5.50,
    dietary_tags: [], badge: 'none', submitted_by: null,
    avg_rating: 4.5, rating_count: 102, save_count: 560,
    image_url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400',
    created_at: '',
  },
  {
    id: '5', title: 'Greek Salad', description: 'Fresh Mediterranean summer salad',
    cuisine: 'Mediterranean', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 10, cook_time_mins: 0, servings: 2, cost_per_serving: 4.00,
    dietary_tags: ['vegetarian', 'gluten_free'], badge: 'staff_pick', submitted_by: null,
    avg_rating: 4.4, rating_count: 78, save_count: 410,
    image_url: 'https://images.unsplash.com/photo-1551248429-40975aa4de74?w=400',
    created_at: '',
  },
  {
    id: '6', title: 'Butter Chicken', description: 'Rich and creamy tomato-based curry',
    cuisine: 'Indian', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 15, cook_time_mins: 35, servings: 4, cost_per_serving: 5.80,
    dietary_tags: ['gluten_free'], badge: 'community_favorite', submitted_by: null,
    avg_rating: 4.9, rating_count: 312, save_count: 1540,
    image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400',
    created_at: '',
  },
  {
    id: '7', title: 'Caesar Salad', description: 'Classic salad with homemade dressing',
    cuisine: 'American', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 15, cook_time_mins: 0, servings: 2, cost_per_serving: 3.20,
    dietary_tags: ['vegetarian'], badge: 'none', submitted_by: null,
    avg_rating: 4.3, rating_count: 67, save_count: 290,
    image_url: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400',
    created_at: '',
  },
  {
    id: '8', title: 'Pad Thai', description: 'Stir-fried rice noodles with tamarind',
    cuisine: 'Thai', source_type: 'curated',
    ingredients: [], steps: [],
    prep_time_mins: 15, cook_time_mins: 15, servings: 2, cost_per_serving: 5.00,
    dietary_tags: [], badge: 'staff_pick', submitted_by: null,
    avg_rating: 4.6, rating_count: 145, save_count: 720,
    image_url: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400',
    created_at: '',
  },
];

const CUISINE_FILTERS = ['All', 'Italian', 'Indian', 'Mexican', 'Mediterranean', 'American', 'Thai'];

function RecipeGridCard({ recipe, onUnsave }: { recipe: Recipe; onUnsave?: () => void }) {
  return (
    <Pressable
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
      }}
    >
      <View style={{ position: 'relative' }}>
        <Image
          source={{ uri: recipe.image_url ?? '' }}
          style={{ width: '100%', height: 130 }}
          contentFit="cover"
        />
        {onUnsave && (
          <Pressable
            onPress={onUnsave}
            style={{
              position: 'absolute', top: 6, right: 6,
              backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999,
              width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="heart" size={15} color="white" />
          </Pressable>
        )}
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 }} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="star" size={12} color="#FFB300" />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            {recipe.avg_rating.toFixed(1)}
          </Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginLeft: 4 }}>
            {formatTime(recipe.prep_time_mins, recipe.cook_time_mins)}
          </Text>
        </View>
        {recipe.badge !== 'none' && (
          <View style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '600' }}>
              {recipe.badge === 'staff_pick' ? 'Staff Pick' : 'Fan Fave'}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function Recipes() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showSaved, setShowSaved] = useState(false);
  const { savedRecipes, removeRecipe } = useSavedStore();

  const displayData = showSaved ? savedRecipes : SEED_RECIPES;

  const filtered = displayData.filter((r) => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = showSaved || activeFilter === 'All' || r.cuisine === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        {/* Header with toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Recipes</Text>
          <View style={{ flexDirection: 'row', backgroundColor: colors.border, borderRadius: 20, padding: 3 }}>
            <Pressable
              onPress={() => setShowSaved(false)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 17,
                backgroundColor: !showSaved ? colors.primary : 'transparent',
              }}
            >
              <Text style={{ color: !showSaved ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>All</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowSaved(true)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 17,
                backgroundColor: showSaved ? colors.primary : 'transparent',
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}
            >
              <Ionicons name="heart" size={12} color={showSaved ? 'white' : colors.textMuted} />
              <Text style={{ color: showSaved ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                Saved {savedRecipes.length > 0 ? `(${savedRecipes.length})` : ''}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
          borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 12,
        }}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={showSaved ? 'Search saved recipes...' : 'Search recipes...'}
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: colors.text }}
          />
        </View>

        {/* Cuisine filter bar — only shown in All view */}
        {!showSaved && (
          <FlatList
            data={CUISINE_FILTERS}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setActiveFilter(item)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: activeFilter === item ? colors.primary : colors.white,
                  borderWidth: 1,
                  borderColor: activeFilter === item ? colors.primary : colors.border,
                  marginRight: 8,
                }}
              >
                <Text style={{ color: activeFilter === item ? 'white' : colors.textMuted, fontSize: 13, fontWeight: '500' }}>
                  {item}
                </Text>
              </Pressable>
            )}
            style={{ marginBottom: 4 }}
          />
        )}
      </View>

      {/* Grid */}
      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <RecipeGridCard
            recipe={item}
            onUnsave={showSaved ? () => removeRecipe(item.id) : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 8 }}>
            {showSaved ? (
              <>
                <Ionicons name="heart-outline" size={48} color={colors.border} />
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
    </SafeAreaView>
  );
}
