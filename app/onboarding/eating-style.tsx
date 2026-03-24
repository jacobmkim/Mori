import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import ProgressBar from '@/components/onboarding/ProgressBar';

const STYLES = [
  {
    id: 'quick_simple' as const,
    icon: '⚡',
    title: 'Quick and simple most nights',
    description: 'Meals on the table in under 30 mins. One bigger recipe on weekends.',
  },
  {
    id: 'variety' as const,
    icon: '🌍',
    title: 'Variety is everything',
    description: 'Different cuisines and ingredients every week. Keep it interesting.',
  },
  {
    id: 'favourites_rotation' as const,
    icon: '🔄',
    title: 'I find favourites and rotate them',
    description: 'Reliable go-tos with the occasional new discovery mixed in.',
  },
];

type EatingStyleId = typeof STYLES[number]['id'];

export default function EatingStyle() {
  const colors = useTheme();
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<EatingStyleId | null>(null);

  function handleNext() {
    if (!selected) return;
    // Saved as eating_style — AI uses this to shape the weekly recipe stack weighting
    setOnboardingField('eating_style', selected);
    router.push('/onboarding/cook-frequency');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={4} total={8} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
          What does a good week of eating look like?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 28, lineHeight: 22 }}>
          We'll shape your recipe stack around your style.
        </Text>

        {/* Three large single-select cards */}
        <View style={{ gap: 14 }}>
          {STYLES.map((style) => {
            const isSelected = selected === style.id;
            return (
              <Pressable
                key={style.id}
                onPress={() => setSelected(style.id)}
                style={{
                  backgroundColor: isSelected ? colors.primaryLight : colors.white,
                  borderWidth: 2,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderRadius: 16,
                  padding: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Text style={{ fontSize: 38 }}>{style.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16, fontWeight: '700', lineHeight: 22, marginBottom: 5,
                    color: isSelected ? colors.primary : colors.text,
                  }}>
                    {style.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 19 }}>
                    {style.description}
                  </Text>
                </View>
                {/* Selection indicator */}
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: isSelected ? colors.primary : 'transparent',
                  borderWidth: 2, borderColor: isSelected ? colors.primary : colors.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && (
                    <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>✓</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, backgroundColor: colors.background }}>
        <Pressable
          onPress={handleNext}
          disabled={!selected}
          style={{
            backgroundColor: selected ? colors.primary : colors.border,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: selected ? '#fff' : colors.textMuted, fontSize: 17, fontWeight: '700' }}>
            Continue
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
