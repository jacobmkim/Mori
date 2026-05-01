import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import ProgressBar from '@/components/onboarding/ProgressBar';

const GOALS = [
  { id: 'balanced',     label: 'Balanced',     icon: '⚖️' },
  { id: 'high_protein', label: 'High Protein', icon: '💪' },
  { id: 'low_carb',     label: 'Low Carb',     icon: '🥗' },
  { id: 'vegetarian',   label: 'Vegetarian',   icon: '🥦' },
  { id: 'vegan',        label: 'Vegan',        icon: '🌱' },
  { id: 'pescatarian',  label: 'Pescatarian',  icon: '🐟' },
  { id: 'gluten_free',  label: 'Gluten Free',  icon: '🌾' },
  { id: 'dairy_free',   label: 'Dairy Free',   icon: '🥛' },
  { id: 'keto',         label: 'Keto',         icon: '🥑' },
  { id: 'paleo',        label: 'Paleo',        icon: '🍖' },
  { id: 'nut_free',     label: 'Nut Free',     icon: '🚫' },
];

export default function DietaryGoals() {
  const { onboarding, setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string[]>(onboarding.dietary_goals);
  const [extraText, setExtraText] = useState<string>(onboarding.dietary_extra_preferences ?? '');
  const navigatedRef = useRef(false);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  function handleNext() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    setOnboardingField('dietary_goals', selected);
    setOnboardingField('dietary_extra_preferences', extraText.trim() || null);
    router.push('/onboarding/ingredient-dislikes');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={1} total={8} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          Step 01 · Diet
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          Any dietary goals or allergies?
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
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
                  backgroundColor: isSelected ? colors.cardSelected : colors.card,
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
                    fontFamily: 'System',
                    fontSize: 14,
                    fontWeight: isSelected ? '600' : '500',
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

        {/* Optional free text — niche needs Claude reads at recommendation time */}
        <View style={{ marginTop: 28 }}>
          <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 8 }}>
            Anything else? (optional)
          </Text>
          <TextInput
            value={extraText}
            onChangeText={setExtraText}
            placeholder="e.g. low sodium, diabetic friendly, low FODMAP..."
            placeholderTextColor={colors.textSubtle}
            multiline
            numberOfLines={3}
            style={{
              backgroundColor: colors.card,
              borderWidth: 1.5,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: colors.text,
              lineHeight: 22,
              textAlignVertical: 'top',
              fontFamily: 'System',
            }}
          />
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
            {selected.length === 0 ? 'Skip for now' : `Continue · ${selected.length} selected`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
