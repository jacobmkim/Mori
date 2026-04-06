import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MoriLogo } from '@/components/ui/MoriLogo';
import { useTheme } from '@/hooks/useTheme';

export default function Welcome() {
  const colors = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: '#111' }}>
      {/* Hero image */}
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900' }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        transition={400}
      />

      {/* Dark overlay — heavy enough to let text breathe */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <LinearGradient
        colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.97)']}
        locations={[0, 0.45, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Logo */}
        <View style={{ paddingHorizontal: 28, paddingTop: 36 }}>
          <MoriLogo size="lg" showTagline />
          <Text style={{
            color: 'rgba(255,255,255,0.5)', fontSize: 11,
            letterSpacing: 2.5, textTransform: 'uppercase', marginTop: 8,
            fontFamily: 'Georgia', fontStyle: 'italic',
          }}>
            Rooted in your taste
          </Text>
        </View>

        {/* Text block — vertically centred */}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '800', lineHeight: 40, marginBottom: 12 }}>
            Cook smarter.{'\n'}Waste less.{'\n'}Eat better.
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 23, maxWidth: 300 }}>
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

          <Pressable
            onPress={() => router.push('/onboarding/account?signin=1')}
            style={{ alignItems: 'center', paddingVertical: 16 }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>
              Already have an account?{' '}
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Sign in</Text>
            </Text>
          </Pressable>

          {/* DEV ONLY — skip straight to app */}
          {__DEV__ && (
            <Pressable
              onPress={() => router.replace('/(tabs)/discover')}
              style={{ alignItems: 'center', marginTop: 20, paddingVertical: 8 }}
            >
              <Text style={{ color: 'rgba(255,255,100,0.7)', fontSize: 12, fontWeight: '600' }}>
                ⚡ DEV: Skip to App
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
