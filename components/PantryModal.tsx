/**
 * PantryModal.tsx
 * Extracted from profile.tsx — used by ProfileSheet.
 */
import { View, Text, Modal, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { getPantryItems, addPantryItem, deletePantryItem } from '@/lib/api';
import type { PantryItem } from '@/types';

const PANTRY_STAPLES = [
  'Olive oil', 'Garlic', 'Pasta', 'Rice', 'Canned tomatoes',
  'Eggs', 'Onions', 'Butter', 'Soy sauce', 'Flour',
  'Chicken stock', 'Lemon', 'Cumin', 'Paprika', 'Salt',
  'Pepper', 'Balsamic vinegar', 'Parmesan', 'Chilli flakes', 'Honey',
  'Mustard', 'Tinned chickpeas', 'Coconut milk', 'Bread', 'Potatoes',
];

export function PantryModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    getPantryItems(userId).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [visible, userId]);

  const addedNames = useMemo(
    () => new Set(items.map((i) => i.ingredient_name.toLowerCase())),
    [items]
  );

  const suggestions = useMemo(() => {
    const q = newItem.trim().toLowerCase();
    if (!q) return [];
    return PANTRY_STAPLES.filter((s) => s.toLowerCase().includes(q)).slice(0, 5);
  }, [newItem]);

  async function handleAdd(name?: string) {
    const value = (name ?? newItem).trim();
    if (!value || !userId) return;
    if (addedNames.has(value.toLowerCase())) return;
    setAdding(true);
    try {
      await addPantryItem({ user_id: userId, ingredient_name: value, quantity: null, unit: null, added_via: 'manual' });
      const updated = await getPantryItems(userId);
      setItems(updated);
      setNewItem('');
    } catch {
      Alert.alert('Could not add item', 'Please try again.');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePantryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      Alert.alert('Could not remove item', 'Please try again.');
    }
  }

  function renderHighlighted(text: string, query: string) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <Text style={{ fontSize: 15, color: colors.text }}>{text}</Text>;
    return (
      <Text style={{ fontSize: 15, color: colors.text }}>
        {text.slice(0, idx)}
        <Text style={{ fontWeight: '700' }}>{text.slice(idx, idx + query.length)}</Text>
        {text.slice(idx + query.length)}
      </Text>
    );
  }

  const query = newItem.trim();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
          borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card,
        }}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>Done</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>My Pantry</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {/* Input card */}
          <View style={{
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border, marginBottom: 12,
            overflow: 'hidden',
          }}>
            <View style={{ flexDirection: 'row', gap: 10, padding: 12 }}>
              <TextInput
                value={newItem} onChangeText={setNewItem}
                placeholder="Add an ingredient..."
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, fontSize: 15, color: colors.text }}
                onSubmitEditing={() => handleAdd()}
                returnKeyType="done"
              />
              <Pressable
                onPress={() => handleAdd()}
                style={{
                  backgroundColor: newItem.trim() ? colors.primary : colors.border,
                  borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>
                  {adding ? '...' : 'Add'}
                </Text>
              </Pressable>
            </View>

            {/* Autocomplete suggestions */}
            {suggestions.length > 0 && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                {suggestions.map((s, i) => {
                  const alreadyAdded = addedNames.has(s.toLowerCase());
                  return (
                    <Pressable
                      key={s}
                      onPress={() => !alreadyAdded && handleAdd(s)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingHorizontal: 14, paddingVertical: 11,
                        borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                        backgroundColor: alreadyAdded ? colors.background : colors.card,
                      }}
                    >
                      {renderHighlighted(s, query)}
                      {alreadyAdded && (
                        <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Common staples chip strip (hidden while typing) */}
          {!query && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.08, textTransform: 'uppercase', marginBottom: 10 }}>
                Common Staples
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, flexDirection: 'row' }}>
                {PANTRY_STAPLES.map((staple) => {
                  const has = addedNames.has(staple.toLowerCase());
                  return (
                    <Pressable
                      key={staple}
                      onPress={() => !has && handleAdd(staple)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: has ? colors.primaryLight : colors.card,
                        borderWidth: 1.5,
                        borderColor: has ? colors.primary : colors.border,
                        borderRadius: 999,
                        paddingHorizontal: 14, paddingVertical: 8,
                      }}
                    >
                      {has && <Ionicons name="checkmark" size={13} color={colors.primary} />}
                      <Text style={{
                        color: has ? colors.primary : colors.text,
                        fontSize: 14,
                        fontWeight: has ? '600' : '400',
                      }}>
                        {staple}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Pantry items list */}
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="nutrition-outline" size={36} color={colors.border} />
              <Text style={{ fontSize: 15, color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>
                No pantry items yet.{'\n'}Add staples you keep on hand.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {items.map((item) => (
                <View key={item.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: colors.card, borderRadius: 10,
                  borderWidth: 1, borderColor: colors.border,
                  paddingVertical: 12, paddingHorizontal: 14,
                }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginRight: 12 }} />
                  <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{item.ingredient_name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginRight: 12 }}>
                    {item.added_via === 'onboarding' ? 'Onboarding' : item.added_via === 'manual' ? 'Manual' : 'Grocery'}
                  </Text>
                  <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
