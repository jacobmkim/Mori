import { Pressable, Text, ActivityIndicator } from 'react-native';
import { colors, radius } from '@/constants/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: isPrimary
          ? disabled ? colors.border : pressed ? colors.primaryDark : colors.primary
          : 'transparent',
        borderWidth: isOutline ? 1.5 : 0,
        borderColor: isOutline ? colors.primary : 'transparent',
        borderRadius: radius.button,
        paddingVertical: 16,
        alignItems: 'center',
        opacity: disabled ? 0.6 : 1,
        alignSelf: fullWidth ? 'stretch' : 'auto',
        paddingHorizontal: fullWidth ? 0 : 24,
      })}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : colors.primary} />
      ) : (
        <Text
          style={{
            color: isPrimary ? colors.white : colors.primary,
            fontSize: 16,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
