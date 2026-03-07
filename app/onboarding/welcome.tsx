import { View, Text, Pressable, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';

const { height } = Dimensions.get('window');

export default function Welcome() {
  return (
    <View style={{ flex: 1, backgroundColor: '#111' }}>
      {/* Hero image — fills screen */}
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900' }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        transition={400}
      />

      {/* Dark gradient from bottom */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.92)']}
        locations={[0.3, 0.6, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Content pinned to bottom with safe area */}
      <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }} edges={['bottom']}>
        <View style={{ paddingHorizontal: 28, paddingBottom: 36 }}>
          {/* Logo / wordmark */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
              PrepSwipe
            </Text>
            <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '800', lineHeight: 44 }}>
              Cook smarter.{'\n'}Waste less.{'\n'}Eat better.
            </Text>
          </View>

          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 16, lineHeight: 24, marginBottom: 32 }}>
            PrepSwipe learns what you love and gets ingredients delivered — one tap at a time.
          </Text>

          <Pressable
            onPress={() => router.push('/onboarding/dietary-goals')}
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.primaryDark : colors.primary,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>Get Started</Text>
          </Pressable>

          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
            Free to use · No credit card required
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
