import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import ProgressBar from '@/components/onboarding/ProgressBar';
import type { SkillLevel } from '@/types';

const OPTIONS: { id: SkillLevel; label: string; description: string; icon: string }[] = [
  { id: 'beginner', label: 'Beginner', description: 'I can make toast. Sometimes.', icon: '🍳' },
  { id: 'home_cook', label: 'Home Cook', description: 'I follow recipes and they usually turn out great.', icon: '🥘' },
  { id: 'confident_chef', label: 'Confident Chef', description: 'I improvise and my friends beg for invites.', icon: '👨‍🍳' },
];

export default function SkillLevel() {
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<SkillLevel | null>(null);
  const navigatedRef = useRef(false);

  function handleNext() {
    if (!selected || navigatedRef.current) return;
    navigatedRef.current = true;
    setOnboardingField('skill_level', selected);
    router.push('/onboarding/budget');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={6} total={8} />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          Step 06 · Skill
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          What's your cooking skill level?
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
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
                <Text style={{ fontSize: 32 }}>{opt.icon}</Text>
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
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: 'System' }}>{opt.description}</Text>
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
