import { View, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ONBOARDING_PALETTE as P } from '@/constants/onboardingPalette';

interface ProgressBarProps {
  current: number; // 1-based
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: P.background }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
        {/* Top row: back + step counter */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 22, color: P.text, lineHeight: 22 }}>‹</Text>
            <Text style={{
              fontSize: 11, color: P.text,
              letterSpacing: 1.6, textTransform: 'uppercase',
              fontFamily: 'System', fontWeight: '600',
            }}>
              Back
            </Text>
          </Pressable>

          <Text style={{
            fontSize: 11, color: P.textMuted,
            letterSpacing: 1.6, textTransform: 'uppercase',
            fontFamily: 'System', fontWeight: '500',
          }}>
            Step {current} of {total}
          </Text>
        </View>

        {/* Hairline divider — editorial cue */}
        <View style={{
          height: 1, backgroundColor: P.divider,
          marginTop: 12,
        }} />

        {/* Progress segments — moss on linen */}
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: i < current ? P.primary : 'rgba(46,84,56,0.14)',
              }}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
