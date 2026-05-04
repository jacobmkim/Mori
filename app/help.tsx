import { View, Text, ScrollView, Pressable, Linking, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import Constants from 'expo-constants';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';

const SUPPORT_EMAIL = 'hello@getmori.app';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How does the swipe deck work?',
    a: 'Discover learns from every swipe. Right = save, left = skip. After about 5 swipes your taste profile starts to form, and the deck reorders itself toward what you actually want to cook.',
  },
  {
    q: 'How do I send my grocery list to Instacart?',
    a: 'Save recipes you want, open Grocery List, then tap "Send to Instacart". Mori filters out staples and anything in your pantry, builds the cart, and opens the link. Mori earns a small affiliate fee — same price for you.',
  },
  {
    q: 'Why does my taste profile say "not enough data"?',
    a: 'You need at least 5 swipes for the AI to build a profile. Swipe through Discover for a few minutes and pull-to-refresh on your profile.',
  },
  {
    q: 'How do I edit my dietary preferences?',
    a: 'Profile → Edit Preferences. Changes apply immediately to the Discover deck and Explore filters.',
  },
  {
    q: 'How do streaks work?',
    a: 'Mark a recipe as cooked from Recipes → Cooked, or finish a recipe in Cooking Mode. One cook per day extends your streak; missing a day resets it.',
  },
  {
    q: 'Where do recipe images come from?',
    a: 'Curated recipes use AI-generated images. Community recipes show the photo the submitter uploaded, or a placeholder if none.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Profile → scroll to the bottom → Delete Account. This removes your account, swipes, saves, plans, pantry, and notes immediately. Recipes you submitted to the community are de-attributed and retired.',
  },
];

const HOW_TO_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Discover',
    body: 'Swipe right to save, left to skip. Tap a card to see ingredients, steps, and macros. Use the mode toggle (Spontaneous / Meal Prep) to bias the deck. Pull down to refresh.',
  },
  {
    title: 'Explore',
    body: 'Browse curated sections by cuisine, dietary tag, or theme. Use chip filters to narrow further.',
  },
  {
    title: 'Recipes',
    body: 'Saved · Cooked · Mine. Long-press to multi-select for delete. Inline filter chips on Saved (Meal Prep, Quick, High Protein, Low Carb).',
  },
  {
    title: 'Plan',
    body: 'Week strip at the top, day detail below. Tap a slot to add a recipe — search Saved or browse all. "Copy last week" / "Clear week" in the header.',
  },
  {
    title: 'Grocery List',
    body: 'Auto-built from saved recipes added to the list. Categories grouped, staples + pantry items filtered when you send to Instacart.',
  },
  {
    title: 'Cooking Mode',
    body: 'Open a recipe → tap Cook. Step-by-step with timers. The last step has a Mark as Cooked button — that\'s what extends your streak.',
  },
];

export default function HelpScreen() {
  const colors = useTheme();
  const { profile } = useUserStore();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function buildContactBody(category: string): string {
    const version = (Constants.expoConfig?.version as string | undefined) ?? 'unknown';
    const platform = `${Platform.OS} ${Platform.Version}`;
    const userId = profile?.id ?? 'unknown';
    return [
      `(Please describe your ${category.toLowerCase()} below this line.)`,
      '',
      '',
      '',
      '— — — — — — — — — — — — — — — — — — — —',
      `App version: ${version}`,
      `Platform: ${platform}`,
      `User ID: ${userId}`,
    ].join('\n');
  }

  async function openMailto(subject: string, body: string) {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (!can) {
      Alert.alert(
        'No mail app found',
        `Email us directly at ${SUPPORT_EMAIL}.`,
      );
      return;
    }
    await Linking.openURL(url).catch(() => {
      Alert.alert('Could not open mail app', `Email us directly at ${SUPPORT_EMAIL}.`);
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>Help</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Contact actions — top of screen so users in trouble find them fast */}
        <Text style={{
          fontSize: 11, fontWeight: '700', color: colors.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
        }}>
          Contact us
        </Text>
        <View style={{
          backgroundColor: colors.card, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
          marginBottom: 24,
        }}>
          <ContactRow
            icon="bug-outline"
            label="Report a bug"
            onPress={() => openMailto('Mori — Bug report', buildContactBody('bug'))}
          />
          <ContactRow
            icon="bulb-outline"
            label="Suggest a feature"
            onPress={() => openMailto('Mori — Feature request', buildContactBody('feature request'))}
          />
          <ContactRow
            icon="help-circle-outline"
            label="Ask a question"
            onPress={() => openMailto('Mori — Help', buildContactBody('question'))}
            last
          />
        </View>

        {/* FAQ — collapsible */}
        <Text style={{
          fontSize: 11, fontWeight: '700', color: colors.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
        }}>
          FAQ
        </Text>
        <View style={{
          backgroundColor: colors.card, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
          marginBottom: 24,
        }}>
          {FAQ.map((item, idx) => {
            const isOpen = openFaq === idx;
            const isLast = idx === FAQ.length - 1;
            return (
              <View key={idx} style={{
                borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border,
              }}>
                <Pressable
                  onPress={() => setOpenFaq(isOpen ? null : idx)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 14,
                  }}
                >
                  <Text style={{
                    flex: 1, fontSize: 14, color: colors.text, fontWeight: '500',
                  }}>
                    {item.q}
                  </Text>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.textMuted}
                  />
                </Pressable>
                {isOpen && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 20 }}>
                      {item.a}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* How to use */}
        <Text style={{
          fontSize: 11, fontWeight: '700', color: colors.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
        }}>
          How to use Mori
        </Text>
        <View style={{
          backgroundColor: colors.card, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border, padding: 16,
          marginBottom: 24, gap: 14,
        }}>
          {HOW_TO_SECTIONS.map((section, idx) => (
            <View key={idx}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                {section.title}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 19 }}>
                {section.body}
              </Text>
            </View>
          ))}
        </View>

        {/* Legal */}
        <Text style={{
          fontSize: 11, fontWeight: '700', color: colors.textMuted,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
        }}>
          Legal
        </Text>
        <View style={{
          backgroundColor: colors.card, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
        }}>
          <ContactRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => router.push('/privacy-policy')}
            last
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ContactRow({
  icon, label, onPress, last = false,
}: {
  icon: string; label: string; onPress: () => void; last?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border,
        minHeight: 52,
      }}
    >
      <Ionicons name={icon as any} size={20} color={colors.primary} />
      <Text style={{
        flex: 1, marginLeft: 12, fontSize: 15, color: colors.text, fontWeight: '500',
      }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}
