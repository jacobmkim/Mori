import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';
import ProgressBar from '@/components/onboarding/ProgressBar';

const GOALS = [
  { id: 'balanced',     label: 'Balanced',     icon: '⚖️' },
  { id: 'high_protein', label: 'High Protein', icon: '💪' },
  { id: 'low_carb',     label: 'Low Carb',     icon: '🥗' },
  { id: 'vegetarian',   label: 'Vegetarian',   icon: '🥦' },
  { id: 'vegan',        label: 'Vegan',        icon: '🌱' },
  { id: 'gluten_free',  label: 'Gluten Free',  icon: '🌾' },
  { id: 'dairy_free',   label: 'Dairy Free',   icon: '🥛' },
  { id: 'keto',         label: 'Keto',         icon: '🥑' },
  { id: 'paleo',        label: 'Paleo',        icon: '🍖' },
  { id: 'nut_free',     label: 'Nut Free',     icon: '🚫' },
];

export default function DietaryGoals() {
  const { onboarding, setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string[]>(onboarding.dietary_goals);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  function handleNext() {
    setOnboardingField('dietary_goals', selected);
    router.push('/onboarding/cuisine-prefs');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={1} total={6} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
          Any dietary goals or allergies?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 24, lineHeight: 22 }}>
          Select all that apply. We'll filter recipes to match.
        </Text>

        {/* 2-column grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {GOALS.map((goal) => {
            const isSelected = selected.includes(goal.id);
            return (
              <Pressable
                key={goal.id}
                onPress={() => toggle(goal.id)}
                style={{
                  width: '47%',
                  backgroundColor: isSelected ? colors.primaryLight : colors.white,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: 1.5,
                  borderRadius: 14,
                  paddingVertical: 16,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 24 }}>{goal.icon}</Text>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? colors.primary : colors.text,
                  }}
                >
                  {goal.label}
                </Text>
                {isSelected && (
                  <Text style={{ color: colors.primary, fontSize: 14 }}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 }}>
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.primaryDark : colors.primary,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          })}
        >
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
            {selected.length === 0 ? 'Skip for now' : `Continue (${selected.length} selected)`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
