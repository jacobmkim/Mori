import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { useDiscoverStore } from '@/stores/discoverStore';

interface Props {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function InstacartButton({ onPress, loading, disabled }: Props) {
  const systemScheme = useColorScheme();
  const appearanceMode = useDiscoverStore((s) => s.appearanceMode);
  const isDark =
    appearanceMode === 'dark' ? true :
    appearanceMode === 'light' ? false :
    systemScheme === 'dark';

  const bg = isDark ? '#003D29' : '#FAF1E5';
  const textColor = isDark ? '#FAF1E5' : '#003D29';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        backgroundColor: bg,
        borderRadius: 999,
        borderWidth: isDark ? 0 : 0.5,
        borderColor: '#EFE9E1',
        height: 46,
        paddingHorizontal: 18,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        opacity: (disabled || loading) ? 0.6 : 1,
      }}
    >
      {loading
        ? <ActivityIndicator size="small" color={textColor} />
        : (
          <Image
            source={isDark ? require('@/assets/instacart-carrot-white.png') : require('@/assets/instacart-carrot.png')}
            style={{ width: 22, height: 22 }}
            contentFit="contain"
          />
        )
      }
      <Text style={{ color: textColor, fontSize: 15, fontWeight: '600' }}>
        {loading ? 'Creating list...' : 'Shop ingredients'}
      </Text>
    </Pressable>
  );
}
