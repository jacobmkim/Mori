import { View, Text } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface PillTagProps {
  label: string;
  variant?: 'green' | 'muted';
}

export default function PillTag({ label, variant = 'green' }: PillTagProps) {
  const colors = useTheme();
  const isGreen = variant === 'green';
  return (
    <View
      style={{
        backgroundColor: isGreen ? colors.primaryLight : colors.border,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          color: isGreen ? colors.primary : colors.textMuted,
          fontSize: 12,
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
