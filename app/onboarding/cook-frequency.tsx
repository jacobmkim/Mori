import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import ProgressBar from '@/components/onboarding/ProgressBar';
import type { CookingFrequency } from '@/types';

const OPTIONS: { id: CookingFrequency; label: string; subtitle: string; icon: string }[] = [
  { id: 'just_starting', label: "I'm just starting out", subtitle: 'New to cooking at home', icon: '🌱' },
  { id: 'few_times_week', label: 'A few times a week', subtitle: 'I cook when I have time', icon: '🍽️' },
  { id: 'most_days', label: 'Most days', subtitle: 'Cooking is part of my routine', icon: '👨‍🍳' },
];

export default function CookFrequency() {
  const colors = useTheme();
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<CookingFrequency | null>(null);

  function handleNext() {
    if (!selected) return;
    setOnboardingField('cooking_frequency', selected);
    router.push('/onboarding/skill-level');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={3} total={6} />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          How often do you cook at home?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          This helps us suggest the right number of recipes.
        </Text>

        <View style={{ gap: 12 }}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                style={{
                  backgroundColor: isSelected ? colors.primaryLight : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: 1.5,
                  borderRadius: 14,
                  padding: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Text style={{ fontSize: 32 }}>{opt.icon}</Text>
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
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>{opt.subtitle}</Text>
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
