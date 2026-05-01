import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MoriLogo } from '@/components/ui/MoriLogo';

// Brand-locked palette for the welcome cover.
// design.md: linen + moss soul, Georgia italic for expressive content.
const LINEN = '#F8F3EC';
const MOSS = '#2E5438';
const FOREST = '#1E4D35';
const INK = '#2C2C24';
const MUTED = 'rgba(44,44,36,0.62)';

export default function Welcome() {
  return (
    <View style={{ flex: 1, backgroundColor: LINEN }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Editorial top bar: small logo left, issue meta right */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 24,
          paddingTop: 12,
        }}>
          <View style={{ marginLeft: -16 }}>
            <MoriLogo size="sm" tone="green" />
          </View>
          <Text style={{
            fontSize: 10, color: MUTED,
            letterSpacing: 1.6, textTransform: 'uppercase',
            fontFamily: 'System', fontWeight: '500',
          }}>
            Vol. 01 · 2026
          </Text>
        </View>

        {/* Hairline divider — editorial cue */}
        <View style={{
          height: 1, backgroundColor: 'rgba(44,44,36,0.12)',
          marginHorizontal: 24, marginTop: 14,
        }} />

        {/* Eyebrow label */}
        <View style={{ paddingHorizontal: 28, paddingTop: 22 }}>
          <Text style={{
            fontSize: 11, color: MOSS,
            letterSpacing: 2.4, textTransform: 'uppercase',
            fontFamily: 'System', fontWeight: '600',
          }}>
            Recipe Discovery
          </Text>
        </View>

        {/* Centred content block — hero + cover photo + caption float between eyebrow and CTA */}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          {/* Hero headline — two-line cover layout */}
          <Text style={{
            color: INK, fontSize: 48, lineHeight: 54,
            fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '400',
            letterSpacing: -0.5,
          }}>
            Swipe. Order.
          </Text>
          <Text style={{
            color: INK, fontSize: 48, lineHeight: 54,
            fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '400',
            letterSpacing: -0.5,
          }}>
            Cook.
          </Text>
          <Text style={{
            color: MOSS, fontSize: 16, marginTop: 10,
            fontFamily: 'Georgia', fontStyle: 'italic',
          }}>
            Rooted in your taste.
          </Text>

          {/* Cover photo */}
          <View style={{
            borderRadius: 20,
            overflow: 'hidden',
            backgroundColor: '#E8DDD0',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.12,
            shadowRadius: 18,
            elevation: 6,
            aspectRatio: 16 / 11,
            marginTop: 22,
          }}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&q=80' }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={300}
            />
            {/* Caption strip — editorial photo credit feel */}
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              paddingHorizontal: 16, paddingVertical: 10,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: 'rgba(248,243,236,0.94)',
            }}>
              <Text style={{
                fontSize: 11, color: INK,
                letterSpacing: 1.4, textTransform: 'uppercase',
                fontFamily: 'System', fontWeight: '600',
              }}>
                On the cover
              </Text>
              <Text style={{
                fontSize: 13, color: MOSS,
                fontFamily: 'Georgia', fontStyle: 'italic',
              }}>
                Tonight's possibilities
              </Text>
            </View>
          </View>

          <Text style={{
            color: MUTED, fontSize: 14, lineHeight: 20, marginTop: 14,
            fontFamily: 'System', fontWeight: '400',
          }}>
            A quiet forest of recipes you'll actually want to cook. Swipe what you love — send the list to Instacart.
          </Text>
        </View>

        {/* CTA + sign in */}
        <View style={{ paddingHorizontal: 28, paddingTop: 14, paddingBottom: 24 }}>
          <Pressable
            onPress={() => router.push('/onboarding/dietary-goals')}
            style={({ pressed }) => ({
              backgroundColor: pressed ? FOREST : MOSS,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
            })}
          >
            <Text style={{
              color: LINEN, fontSize: 16, fontWeight: '600',
              fontFamily: 'System', letterSpacing: 0.4,
            }}>
              Begin
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/onboarding/account?signin=1')}
            style={{ alignItems: 'center', paddingVertical: 14 }}
          >
            <Text style={{
              color: MUTED, fontSize: 14,
              fontFamily: 'System', fontWeight: '400',
            }}>
              Already have an account?{' '}
              <Text style={{ color: MOSS, fontWeight: '600' }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
