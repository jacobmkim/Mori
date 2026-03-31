/**
 * PantryModal.tsx
 * Extracted from profile.tsx — used by ProfileSheet.
 */
import { View, Text, Modal, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { getPantryItems, addPantryItem, deletePantryItem } from '@/lib/api';
import type { PantryItem } from '@/types';

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

  async function handleAdd() {
    const name = newItem.trim();
    if (!name || !userId) return;
    setAdding(true);
    try {
      await addPantryItem({ user_id: userId, ingredient_name: name, quantity: null, unit: null, added_via: 'manual' });
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

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
          <View style={{
            flexDirection: 'row', gap: 10, marginBottom: 20,
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border, padding: 12,
          }}>
            <TextInput
              value={newItem} onChangeText={setNewItem}
              placeholder="Add an ingredient..."
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, fontSize: 15, color: colors.text }}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            <Pressable
              onPress={handleAdd}
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
