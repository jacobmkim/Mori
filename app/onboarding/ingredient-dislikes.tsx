import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '@/stores/userStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import ProgressBar from '@/components/onboarding/ProgressBar';

const COMMON_DISLIKES = [
  'Cilantro', 'Mushrooms', 'Olives', 'Blue Cheese', 'Anchovies',
  'Lamb', 'Tofu', 'Beetroot', 'Shellfish', 'Liver', 'Fennel', 'Offal',
];

export default function IngredientDislikes() {
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const navigatedRef = useRef(false);

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
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    setOnboardingField('ingredient_dislikes', selected);
    router.push('/onboarding/cuisine-prefs');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={2} total={8} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          Step 02 · Dislikes
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          What's off the table?
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 24 }}>
          Life's too short to eat things you hate. We'll never show you these.
        </Text>

        {selected.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 10 }}>
              Off the table ({selected.length})
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {selected.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => toggle(item)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: 'rgba(179,58,58,0.10)',
                    borderWidth: 1.5, borderColor: colors.error,
                    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: colors.error, fontSize: 14, fontWeight: '600', fontFamily: 'System' }}>{item}</Text>
                  <Ionicons name="close-circle" size={15} color={colors.error} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24,
          backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5,
          borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 2,
        }}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={addCustom}
            placeholder="Add anything else..."
            placeholderTextColor={colors.textSubtle}
            returnKeyType="done"
            style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12, fontFamily: 'System' }}
          />
          {inputText.trim().length > 0 && (
            <Pressable
              onPress={addCustom}
              style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: colors.inverse, fontWeight: '600', fontSize: 13, fontFamily: 'System' }}>Add</Text>
            </Pressable>
          )}
        </View>

        <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 12 }}>
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
                  backgroundColor: isSelected ? 'rgba(179,58,58,0.10)' : colors.card,
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
                  fontFamily: 'System',
                }}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, backgroundColor: colors.background }}>
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.primaryDeep : colors.primary,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          })}
        >
          <Text style={{ ...TYPE.cta, color: colors.inverse }}>
            {selected.length === 0 ? 'I eat everything · skip' : `Continue · ${selected.length} off the list`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
