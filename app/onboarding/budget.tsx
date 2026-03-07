import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';
import ProgressBar from '@/components/onboarding/ProgressBar';

const OPTIONS = [
  { id: 'budget', label: 'Budget-friendly', subtitle: 'Under $5 per serving', icon: '💰' },
  { id: 'mid', label: 'Mid-range', subtitle: '$5–$10 per serving', icon: '💳' },
  { id: 'premium', label: 'Premium', subtitle: '$10–$20 per serving', icon: '✨' },
  { id: 'no_limit', label: 'No limit', subtitle: "Money is no object", icon: '🌟' },
];

export default function Budget() {
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<string | null>(null);

  function handleNext() {
    if (!selected) return;
    setOnboardingField('weekly_budget', selected);
    router.push('/onboarding/account');
  }

  return (
    <View className="flex-1 bg-[#F9F9F9]">
      <ProgressBar current={5} total={6} />
      <View className="flex-1 px-6 pt-6">
        <Text className="text-[28px] font-bold text-[#1A1A1A] mb-2">
          What's your weekly grocery budget?
        </Text>
        <Text className="text-base text-[#666666] mb-10">
          We'll prioritise recipes that fit your wallet.
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
                  padding: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <Text style={{ fontSize: 28 }}>{opt.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: isSelected ? colors.primary : colors.text,
                      fontSize: 16,
                      fontWeight: '600',
                    }}
                  >
                    {opt.label}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                    {opt.subtitle}
                  </Text>
                </View>
                {isSelected && (
                  <Text style={{ color: colors.primary, fontSize: 20 }}>✓</Text>
                )}
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
