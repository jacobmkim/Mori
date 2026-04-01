import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import ProgressBar from '@/components/onboarding/ProgressBar';

// Common dislikes pre-populated as quick-tap chips
const COMMON_DISLIKES = [
  'Cilantro', 'Mushrooms', 'Olives', 'Blue Cheese', 'Anchovies',
  'Lamb', 'Tofu', 'Beetroot', 'Shellfish', 'Liver', 'Fennel', 'Offal',
];

export default function IngredientDislikes() {
  const colors = useTheme();
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');

  function toggle(item: string) {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }

  function addCustom() {
    const trimmed = inputText.trim();
    if (!trimmed || selected.includes(trimmed)) {
      setInputText('');
      return;
    }
    setSelected((prev) => [...prev, trimmed]);
    setInputText('');
  }

  function handleNext() {
    // Hard filter — stored verbatim, enforced at the data layer on every recipe fetch
    setOnboardingField('ingredient_dislikes', selected);
    router.push('/onboarding/cuisine-prefs');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={2} total={8} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
          What's off the table?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 24, lineHeight: 22 }}>
          Life's too short to eat things you hate. We'll never show you these.
        </Text>

        {/* Selected items — shown at top so user can see and remove what they've picked */}
        {selected.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Off the table ({selected.length})
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {selected.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => toggle(item)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: colors.error + '18',
                    borderWidth: 1.5, borderColor: colors.error,
                    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: colors.error, fontSize: 14, fontWeight: '600' }}>{item}</Text>
                  <Ionicons name="close-circle" size={15} color={colors.error} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Search / add custom ingredient */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20,
          backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5,
          borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 2,
        }}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={addCustom}
            placeholder="Add anything else..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12 }}
          />
          {inputText.trim().length > 0 && (
            <Pressable
              onPress={addCustom}
              style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 13 }}>Add</Text>
            </Pressable>
          )}
        </View>

        {/* Common dislikes — tap to toggle */}
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
          Common
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COMMON_DISLIKES.map((item) => {
            const isSelected = selected.includes(item);
            return (
              <Pressable
                key={item}
                onPress={() => toggle(item)}
                style={{
                  backgroundColor: isSelected ? colors.error + '18' : colors.card,
                  borderWidth: 1.5,
                  borderColor: isSelected ? colors.error : colors.border,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                }}
              >
                <Text style={{
                  color: isSelected ? colors.error : colors.text,
                  fontSize: 14,
                  fontWeight: isSelected ? '600' : '400',
                }}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, backgroundColor: colors.background }}>
        <Pressable
          onPress={handleNext}
          style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
            {selected.length === 0 ? 'I eat everything — skip' : `Got it — ${selected.length} off the list`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
