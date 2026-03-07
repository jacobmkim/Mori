import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';

export default function Welcome() {
  return (
    <View style={{ flex: 1, backgroundColor: '#111' }}>
      {/* Hero image */}
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900' }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        transition={400}
      />

      {/* Dark gradient — heavier at bottom */}
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Text block — vertically centred */}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={{
            color: colors.primary, fontSize: 13, fontWeight: '700',
            letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 16,
          }}>
            PrepSwipe
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 38, fontWeight: '800', lineHeight: 46, marginBottom: 16 }}>
            Cook smarter.{'\n'}Waste less.{'\n'}Eat better.
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 16, lineHeight: 25, maxWidth: 300 }}>
            Swipe recipes you love. Get ingredients delivered in one tap.
          </Text>
        </View>

        {/* Button block — sits in lower portion, above the very bottom */}
        <View style={{ paddingHorizontal: 28, paddingBottom: 56 }}>
          <Pressable
            onPress={() => router.push('/onboarding/dietary-goals')}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 20,
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.3)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
              elevation: 10,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 }}>
              Get Started
            </Text>
          </Pressable>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginTop: 14 }}>
            Free to use · No credit card required
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
