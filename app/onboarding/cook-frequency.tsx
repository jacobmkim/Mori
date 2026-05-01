import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import ProgressBar from '@/components/onboarding/ProgressBar';
import type { CookingFrequency } from '@/types';

const OPTIONS: { id: CookingFrequency; label: string; subtitle: string; icon: string }[] = [
  { id: 'just_starting', label: "I'm just starting out", subtitle: 'New to cooking at home', icon: '🌱' },
  { id: 'few_times_week', label: 'A few times a week', subtitle: 'I cook when I have time', icon: '🍽️' },
  { id: 'most_days', label: 'Most days', subtitle: 'Cooking is part of my routine', icon: '👨‍🍳' },
];

export default function CookFrequency() {
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<CookingFrequency | null>(null);
  const navigatedRef = useRef(false);

  function handleNext() {
    if (!selected || navigatedRef.current) return;
    navigatedRef.current = true;
    setOnboardingField('cooking_frequency', selected);
    router.push('/onboarding/skill-level');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={5} total={8} />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          Step 05 · Frequency
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          How often do you cook at home?
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
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
                  backgroundColor: isSelected ? colors.cardSelected : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: 1.5,
                  borderRadius: 14,
                  padding: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Text style={{ fontSize: 30 }}>{opt.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: isSelected ? colors.primary : colors.text,
                      fontFamily: 'System',
                      fontSize: 16,
                      fontWeight: '600',
                      marginBottom: 3,
                    }}
                  >
                    {opt.label}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: 'System' }}>{opt.subtitle}</Text>
                </View>
                {isSelected && (
                  <Text style={{ color: colors.primary, fontSize: 18 }}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Pressable
          onPress={handleNext}
          disabled={!selected}
          style={({ pressed }) => ({
            backgroundColor: pressed && selected ? colors.primaryDeep : colors.primary,
            opacity: selected ? 1 : 0.4,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          })}
        >
          <Text style={{ ...TYPE.cta, color: colors.inverse }}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}
