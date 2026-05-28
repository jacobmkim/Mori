import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

// Stepper for choosing a servings count. Extracted from the Discover deck
// servings sheet so the Plan-tab picker can reuse the same control.
export function ServingsAdjuster({
  value,
  onChange,
  min = 1,
  max = 20,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const colors = useTheme();
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const circle = {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1.5,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  } as const;

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Servings</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28 }}>
        <Pressable onPress={dec} hitSlop={8} style={circle}>
          <Ionicons name="remove" size={20} color={value <= min ? colors.border : colors.text} />
        </Pressable>
        <Text style={{ fontSize: 36, fontWeight: '700', color: colors.text, minWidth: 40, textAlign: 'center' }}>{value}</Text>
        <Pressable onPress={inc} hitSlop={8} style={circle}>
          <Ionicons name="add" size={20} color={value >= max ? colors.border : colors.text} />
        </Pressable>
      </View>
      <Text style={{ fontSize: 14, color: colors.textMuted }}>serving{value !== 1 ? 's' : ''}</Text>
    </View>
  );
}
