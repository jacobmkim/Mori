import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
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
  const colors = useTheme();
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<SkillLevel | null>(null);

  function handleNext() {
    if (!selected) return;
    setOnboardingField('skill_level', selected);
    router.push('/onboarding/budget');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={4} total={6} />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          What's your cooking skill level?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          Honest answers get better recipe matches.
        </Text>

        <View style={{ gap: 12 }}>
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
                  borderRadius: 14,
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
                {isSelected && (
                  <Text style={{ color: colors.primary, fontSize: 20 }}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Pressable
          onPress={handleNext}
          disabled={!selected}
          style={{
            backgroundColor: colors.primary,
            opacity: selected ? 1 : 0.4,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}
