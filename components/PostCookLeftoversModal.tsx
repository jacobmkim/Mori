import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { useLeftoversStore } from '@/stores/leftoversStore';
import { getIngredientStorageDays } from '@/lib/api';
import { isStaple } from '@/lib/staples';
import type { Recipe } from '@/types';

const DEFAULT_FRIDGE_DAYS = 4;

interface Props {
  visible: boolean;
  recipe: Recipe | null;
  onClose: () => void;
}

export function PostCookLeftoversModal({ visible, recipe, onClose }: Props) {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const { addLeftovers } = useLeftoversStore();

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Non-staple ingredient names from this recipe
  const nonStapleIngredients = (recipe?.ingredients ?? [])
    .map((i) => i.name.trim())
    .filter((n) => n && !isStaple(n));

  // Reset state when modal opens for a new recipe
  useEffect(() => {
    if (visible) setChecked(new Set());
  }, [visible, recipe?.id]);

  function toggle(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function handleSave() {
    if (!userId || checked.size === 0) { onClose(); return; }
    setSaving(true);
    try {
      // Resolve spoil dates from ingredient_storage in parallel; fall back to default
      const selected = [...checked];
      const daysList = await Promise.all(
        selected.map((name) => getIngredientStorageDays(name).catch(() => null))
      );
      const items = selected.map((name, i) => {
        const days = daysList[i] ?? DEFAULT_FRIDGE_DAYS;
        const spoilsAt = new Date(Date.now() + days * 86_400_000).toISOString();
        return { name, spoilsAt, ingredientId: null };
      });
      await addLeftovers(userId, items);
    } finally {
      setSaving(false);
      onClose();
    }
  }

  if (!recipe || nonStapleIngredients.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{ paddingTop: 24, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, color: colors.text, marginBottom: 6 }}>
            Anything left over?
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 18 }}>
            Tap what you have — we'll remind you before it spoils. General guidance only, trust your senses.
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
          {nonStapleIngredients.map((name) => {
            const on = checked.has(name);
            return (
              <Pressable
                key={name}
                onPress={() => toggle(name)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
                }}
              >
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  borderWidth: 2, borderColor: on ? colors.primary : colors.border,
                  backgroundColor: on ? colors.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <Ionicons name="checkmark" size={14} color="white" />}
                </View>
                <Text style={{ fontSize: 16, color: colors.text, flex: 1 }}>{name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Footer */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: checked.size > 0 ? colors.primary : colors.border,
              borderRadius: 14, paddingVertical: 16, alignItems: 'center',
            }}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>
                {checked.size > 0 ? `Save ${checked.size} leftover${checked.size > 1 ? 's' : ''}` : 'Nothing left'}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Not this time</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
