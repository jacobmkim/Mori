import { View, Text, FlatList, Pressable, TextInput } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { formatTime } from '@/lib/utils';
import type { Recipe } from '@/types';

// Reuse seed data from discover — in Phase 2 this will come from Supabase
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
];

const FILTERS = ['All', 'Italian', 'Indian', 'Mexican', 'Mediterranean', 'American'];

function RecipeGridCard({ recipe }: { recipe: Recipe }) {
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
      <Image
        source={{ uri: recipe.image_url ?? '' }}
        style={{ width: '100%', height: 130 }}
        contentFit="cover"
      />
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

  const filtered = SEED_RECIPES.filter((r) => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeFilter === 'All' || r.cuisine === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
          Recipes
        </Text>

        {/* Search */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
          borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 12,
        }}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: colors.text }}
          />
        </View>

        {/* Filter bar */}
        <FlatList
          data={FILTERS}
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
      </View>

      {/* Grid */}
      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        renderItem={({ item }) => <RecipeGridCard recipe={item} />}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 16, color: colors.textMuted }}>No recipes found.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
