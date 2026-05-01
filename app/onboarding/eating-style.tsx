import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
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
  const { setOnboardingField } = useUserStore();
  const [selected, setSelected] = useState<EatingStyleId | null>(null);
  const navigatedRef = useRef(false);

  function handleNext() {
    if (!selected || navigatedRef.current) return;
    navigatedRef.current = true;
    setOnboardingField('eating_style', selected);
    router.push('/onboarding/cook-frequency');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={4} total={8} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          Step 04 · Style
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          What does a good week of eating look like?
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
          We'll shape your recipe stack around your style.
        </Text>

        <View style={{ gap: 14 }}>
          {STYLES.map((style) => {
            const isSelected = selected === style.id;
            return (
              <Pressable
                key={style.id}
                onPress={() => setSelected(style.id)}
                style={{
                  backgroundColor: isSelected ? colors.cardSelected : colors.card,
                  borderWidth: 1.5,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderRadius: 16,
                  padding: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Text style={{ fontSize: 36 }}>{style.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontFamily: 'System',
                    fontSize: 16, fontWeight: '600', lineHeight: 22, marginBottom: 4,
                    color: isSelected ? colors.primary : colors.text,
                  }}>
                    {style.title}
                  </Text>
                  <Text style={{
                    fontFamily: 'System',
                    fontSize: 13, color: colors.textMuted, lineHeight: 19,
                  }}>
                    {style.description}
                  </Text>
                </View>
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: isSelected ? colors.primary : 'transparent',
                  borderWidth: 1.5, borderColor: isSelected ? colors.primary : colors.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && (
                    <Text style={{ color: colors.inverse, fontSize: 12, fontWeight: '700' }}>✓</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, backgroundColor: colors.background }}>
        <Pressable
          onPress={handleNext}
          disabled={!selected}
          style={({ pressed }) => ({
            backgroundColor: pressed && selected ? colors.primaryDeep : colors.primary,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
            opacity: selected ? 1 : 0.4,
          })}
        >
          <Text style={{ ...TYPE.cta, color: colors.inverse }}>
            Continue
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
