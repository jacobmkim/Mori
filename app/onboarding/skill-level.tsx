import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';
import ProgressBar from '@/components/onboarding/ProgressBar';
import type { SkillLevel } from '@/types';

const OPTIONS: { id: SkillLevel; label: string; description: string; icon: string }[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: "I can make toast. Sometimes.",
    icon: '🍳',
  },
  {
    id: 'home_cook',
    label: 'Home Cook',
    description: 'I follow recipes and they usually turn out great.',
    icon: '🥘',
  },
  {
    id: 'confident_chef',
    label: 'Confident Chef',
    description: "I improvise and my friends beg for invites.",
    icon: '👨‍🍳',
  },
];

export default function SkillLevel() {
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<SkillLevel | null>(null);

  function handleNext() {
    if (!selected) return;
    setOnboardingField('skill_level', selected);
    router.push('/onboarding/budget');
  }

  return (
    <View className="flex-1 bg-[#F9F9F9]">
      <ProgressBar current={4} total={6} />
      <View className="flex-1 px-6 pt-6">
        <Text className="text-[28px] font-bold text-[#1A1A1A] mb-2">
          What's your cooking skill level?
        </Text>
        <Text className="text-base text-[#666666] mb-10">
          Honest answers get better recipe matches.
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
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Text style={{ fontSize: 36 }}>{opt.icon}</Text>
                <View style={{ flex: 1 }}>
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
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>{opt.description}</Text>
                </View>
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
