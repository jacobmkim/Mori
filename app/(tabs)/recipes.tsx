import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';
import { formatTime } from '@/lib/utils';
import { fetchMealDBRecipes, MEAL_AREAS } from '@/lib/mealdb';
import { useSavedStore } from '@/stores/savedStore';
import type { Recipe } from '@/types';

// Cuisine filter pills — derived from the shared MEAL_AREAS list
const CUISINE_FILTERS = ['All', ...MEAL_AREAS];

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
        {recipe.cuisine ? (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }}>{recipe.cuisine}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function Recipes() {
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showSaved, setShowSaved] = useState(false);
  const { savedRecipes, removeRecipe } = useSavedStore();

  useEffect(() => {
    // Fetch more recipes per area than Discover (5 vs 3) to give the grid
    // a fuller feel without blowing the TheMealDB rate limit
    fetchMealDBRecipes(5)
      .then(setAllRecipes)
      .finally(() => setIsLoading(false));
  }, []);

  const displayData = showSaved ? savedRecipes : allRecipes;

  const filtered = displayData.filter((r) => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = showSaved || activeFilter === 'All' || r.cuisine === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        {/* Header with All / Saved toggle */}
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
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
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

      {/* Loading state */}
      {isLoading && !showSaved ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>Loading recipes...</Text>
        </View>
      ) : (
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
      )}
    </SafeAreaView>
  );
}
