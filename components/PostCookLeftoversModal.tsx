import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { useLeftoversStore } from '@/stores/leftoversStore';
import { getIngredientStorageDays, getIngredientStorage, type IngredientStorageInfo } from '@/lib/api';
import { isStaple } from '@/lib/staples';
import type { Recipe } from '@/types';

const DEFAULT_FRIDGE_DAYS = 4;

interface Props {
  visible: boolean;
  recipe: Recipe | null;
  onClose: () => void;
}

interface StorageTip {
  name: string;
  info: IngredientStorageInfo | null;
}

function daysLabel(days: number): string {
  if (days >= 30) return `${Math.round(days / 30)} month${Math.round(days / 30) !== 1 ? 's' : ''}`;
  return `${days} day${days !== 1 ? 's' : ''}`;
}

export function PostCookLeftoversModal({ visible, recipe, onClose }: Props) {
  const colors = useTheme();
  const userId = useUserStore((s) => s.profile?.id);
  const { addLeftovers } = useLeftoversStore();

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'select' | 'tips'>('select');
  const [storageTips, setStorageTips] = useState<StorageTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);

  const nonStapleIngredients = (recipe?.ingredients ?? [])
    .map((i) => i.name.trim())
    .filter((n) => n && !isStaple(n));

  useEffect(() => {
    if (visible) {
      setChecked(new Set());
      setStep('select');
      setStorageTips([]);
    }
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
      const selected = [...checked];
      const [daysList, infoList] = await Promise.all([
        Promise.all(selected.map((name) => getIngredientStorageDays(name).catch(() => null))),
        Promise.all(selected.map((name) => getIngredientStorage(name).catch(() => null))),
      ]);
      const items = selected.map((name, i) => {
        const days = daysList[i] ?? DEFAULT_FRIDGE_DAYS;
        const spoilsAt = new Date(Date.now() + days * 86_400_000).toISOString();
        return { name, spoilsAt, ingredientId: null };
      });
      await addLeftovers(userId, items);
      // Build tips for items that have storage data
      const tips: StorageTip[] = selected.map((name, i) => ({ name, info: infoList[i] }));
      setStorageTips(tips);
      setStep('tips');
    } finally {
      setSaving(false);
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
        {step === 'select' ? (
          <>
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
          </>
        ) : (
          <>
            {/* Tips header */}
            <View style={{ paddingTop: 24, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Ionicons name="leaf-outline" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, color: colors.text }}>
                  How to store them
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 18 }}>
                General guidance — always trust your senses.
              </Text>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 16 }}>
              {storageTips.map(({ name, info }) => (
                <View
                  key={name}
                  style={{
                    backgroundColor: colors.card,
                    borderWidth: 1, borderColor: colors.border,
                    borderRadius: 14, padding: 16, gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{name}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {info?.days_fridge != null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="snow-outline" size={13} color={colors.textMuted} />
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>Fridge: {daysLabel(info.days_fridge)}</Text>
                      </View>
                    )}
                    {info?.days_freezer != null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="cube-outline" size={13} color={colors.textMuted} />
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>Freezer: {daysLabel(info.days_freezer)}</Text>
                      </View>
                    )}
                    {info?.days_room_temp != null && info.days_room_temp > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="sunny-outline" size={13} color={colors.textMuted} />
                        <Text style={{ fontSize: 13, color: colors.textMuted }}>Counter: {daysLabel(info.days_room_temp)}</Text>
                      </View>
                    )}
                    {!info && (
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>Fridge: {DEFAULT_FRIDGE_DAYS} days (estimated)</Text>
                    )}
                  </View>
                  {info?.tips_text ? (
                    <Text style={{ fontSize: 13, color: colors.text, lineHeight: 19, marginTop: 2 }}>
                      {info.tips_text}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>

            <View style={{ paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Pressable
                onPress={onClose}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>Done</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
