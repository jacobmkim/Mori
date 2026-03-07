import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';

interface ProgressBarProps {
  current: number; // 1-based
  total: number;
}

export default function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingVertical: 12 }}>
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
    </SafeAreaView>
  );
}
