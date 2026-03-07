import { View, Text, FlatList, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useGroceryStore } from '@/stores/groceryStore';
import { colors } from '@/constants/theme';
import type { GroceryItem } from '@/types';

const CATEGORIES = ['Produce', 'Meat & Seafood', 'Dairy', 'Pantry', 'Frozen', 'Other'];

function categorizeName(name: string): string {
  const n = name.toLowerCase();
  if (/avocado|tomato|cucumber|onion|garlic|ginger|lemon|lettuce|spinach|pepper|carrot|herb|basil|parsley/.test(n)) return 'Produce';
  if (/chicken|beef|pork|salmon|tuna|shrimp|bacon|pancetta|lamb|fish/.test(n)) return 'Meat & Seafood';
  if (/milk|cheese|cream|butter|yogurt|feta|parmesan|egg/.test(n)) return 'Dairy';
  if (/pasta|spaghetti|rice|flour|oil|salt|pepper|spice|cumin|masala|sauce|bread|tortilla|olive|soy/.test(n)) return 'Pantry';
  if (/frozen|ice/.test(n)) return 'Frozen';
  return 'Other';
}

export default function GroceryList() {
  const { list, toggleItem, clearChecked } = useGroceryStore();

  const items = list?.items ?? [];

  const grouped = CATEGORIES.reduce<Record<string, GroceryItem[]>>((acc, cat) => {
    const catItems = items.filter((i) => categorizeName(i.ingredient_name) === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});

  const checkedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;

  function handleOrder() {
    Alert.alert('Order Now', 'Delivery integration coming in Phase 3!', [{ text: 'OK' }]);
  }

  if (totalCount === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Grocery List</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 48 }}>🛒</Text>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Your list is empty</Text>
          <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 32 }}>
            Swipe right on recipes in Discover to add their ingredients here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Grocery List</Text>
        {checkedCount > 0 && (
          <Pressable onPress={clearChecked}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>Clear checked</Text>
          </Pressable>
        )}
      </View>

      <Text style={{ paddingHorizontal: 16, color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>
        {checkedCount} of {totalCount} items checked
      </Text>

      <FlatList
        data={Object.entries(grouped)}
        keyExtractor={([cat]) => cat}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        renderItem={({ item: [category, catItems] }) => (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {category}
            </Text>
            {catItems.map((item) => (
              <Pressable
                key={item.ingredient_name}
                onPress={() => toggleItem(item.ingredient_name)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.white,
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: item.checked ? colors.primaryLight : colors.border,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 1.5,
                    borderColor: item.checked ? colors.primary : colors.border,
                    backgroundColor: item.checked ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item.checked && <Ionicons name="checkmark" size={13} color="white" />}
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    color: item.checked ? colors.textMuted : colors.text,
                    textDecorationLine: item.checked ? 'line-through' : 'none',
                  }}
                >
                  {item.ingredient_name}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>
                  {item.quantity} {item.unit}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />

      {/* Order Button */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          onPress={handleOrder}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Ionicons name="cart" size={20} color="white" />
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Order Now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
