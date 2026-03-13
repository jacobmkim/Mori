import { View, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors } from '@/constants/theme';

interface ProgressBarProps {
  current: number; // 1-based
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}
        >
          <Text style={{ fontSize: 20, color: colors.text }}>‹</Text>
          <Text style={{ fontSize: 15, color: colors.text, fontWeight: '500' }}>Back</Text>
        </Pressable>

        {/* Progress segments */}
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i < current ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
