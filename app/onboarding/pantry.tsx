import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import ProgressBar from '@/components/onboarding/ProgressBar';

const PANTRY_STAPLES = [
  'Olive oil', 'Garlic', 'Pasta', 'Rice', 'Canned tomatoes',
  'Eggs', 'Onions', 'Butter', 'Soy sauce', 'Flour',
  'Chicken stock', 'Lemon', 'Cumin', 'Paprika', 'Salt',
  'Pepper', 'Balsamic vinegar', 'Parmesan', 'Chilli flakes', 'Honey',
  'Mustard', 'Tinned chickpeas', 'Coconut milk', 'Bread', 'Potatoes',
];

export default function Pantry() {
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string[]>([]);
  const navigatedRef = useRef(false);

  function toggle(item: string) {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }

  function handleNext() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    setOnboardingField('pantry_staples', selected);
    router.push('/onboarding/payoff');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={10} total={10} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          Step 10 · Pantry
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          What's always in your kitchen?
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
          Tap what you usually have on hand. We'll find recipes you can make tonight.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PANTRY_STAPLES.map((item) => {
            const isSelected = selected.includes(item);
            return (
              <Pressable
                key={item}
                onPress={() => toggle(item)}
                style={{
                  backgroundColor: isSelected ? colors.cardSelected : colors.card,
                  borderWidth: 1.5,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                }}
              >
                <Text style={{
                  color: isSelected ? colors.primary : colors.text,
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
            {selected.length === 0 ? 'Skip for now' : `${selected.length} item${selected.length !== 1 ? 's' : ''} in my pantry`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
