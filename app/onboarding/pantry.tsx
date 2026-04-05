import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import ProgressBar from '@/components/onboarding/ProgressBar';

const PANTRY_STAPLES = [
  'Olive oil', 'Garlic', 'Pasta', 'Rice', 'Canned tomatoes',
  'Eggs', 'Onions', 'Butter', 'Soy sauce', 'Flour',
  'Chicken stock', 'Lemon', 'Cumin', 'Paprika', 'Salt',
  'Pepper', 'Balsamic vinegar', 'Parmesan', 'Chilli flakes', 'Honey',
  'Mustard', 'Tinned chickpeas', 'Coconut milk', 'Bread', 'Potatoes',
];

export default function Pantry() {
  const colors = useTheme();
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(item: string) {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }

  function handleNext() {
    setOnboardingField('pantry_staples', selected);
    router.push('/onboarding/payoff');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={9} total={9} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
          What's always in your kitchen?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 24, lineHeight: 22 }}>
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
                  backgroundColor: isSelected ? colors.primaryLight : colors.card,
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
            {selected.length === 0 ? 'Skip for now' : `${selected.length} item${selected.length !== 1 ? 's' : ''} in my pantry`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
