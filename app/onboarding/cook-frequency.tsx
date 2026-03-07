import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';
import ProgressBar from '@/components/onboarding/ProgressBar';
import type { CookingFrequency } from '@/types';

const OPTIONS: { id: CookingFrequency; label: string; subtitle: string }[] = [
  { id: 'just_starting', label: "I'm just starting out", subtitle: 'New to cooking at home' },
  { id: 'few_times_week', label: 'A few times a week', subtitle: 'I cook when I have time' },
  { id: 'most_days', label: 'Most days', subtitle: 'Cooking is part of my routine' },
];

export default function CookFrequency() {
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<CookingFrequency | null>(null);

  function handleNext() {
    if (!selected) return;
    setOnboardingField('cooking_frequency', selected);
    router.push('/onboarding/skill-level');
  }

  return (
    <View className="flex-1 bg-[#F9F9F9]">
      <ProgressBar current={3} total={6} />
      <View className="flex-1 px-6 pt-6">
        <Text className="text-[28px] font-bold text-[#1A1A1A] mb-2">
          How often do you cook at home?
        </Text>
        <Text className="text-base text-[#666666] mb-10">
          This helps us suggest the right number of recipes.
        </Text>

        <View className="gap-4">
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={{
                  backgroundColor: isSelected ? colors.primaryLight : colors.white,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: 1.5,
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <Text
                  style={{
                    color: isSelected ? colors.primary : colors.text,
                    fontSize: 17,
                    fontWeight: '600',
                    marginBottom: 4,
                  }}
                >
                  {opt.label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>{opt.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="px-6 pb-10">
        <Pressable
          onPress={handleNext}
          disabled={!selected}
          style={{
            backgroundColor: selected ? colors.primary : colors.border,
            borderRadius: 12,
            paddingVertical: 16,
          }}
          className="items-center"
        >
          <Text className="text-white text-base font-semibold">Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}
