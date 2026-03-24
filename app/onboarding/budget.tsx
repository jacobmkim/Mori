import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import ProgressBar from '@/components/onboarding/ProgressBar';

const OPTIONS = [
  { id: 'budget', label: 'Budget-friendly', subtitle: 'Under $5 per serving', icon: '💰' },
  { id: 'mid', label: 'Mid-range', subtitle: '$5–$10 per serving', icon: '💳' },
  { id: 'premium', label: 'Premium', subtitle: '$10–$20 per serving', icon: '✨' },
  { id: 'no_limit', label: 'No limit', subtitle: "Money is no object", icon: '🌟' },
];

export default function Budget() {
  const colors = useTheme();
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string | null>(null);

  function handleNext() {
    if (!selected) return;
    setOnboardingField('weekly_budget', selected);
    router.push('/onboarding/account');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={5} total={6} />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          What's your weekly grocery budget?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          We'll prioritise recipes that fit your wallet.
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
