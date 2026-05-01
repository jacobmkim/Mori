import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from '@/stores/userStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import { addPantryItems, patchProfile, computeCohortKey, upsertUserCohort } from '@/lib/api';
import { MoriLogo } from '@/components/ui/MoriLogo';

const GOAL_LABELS: Record<string, string> = {
  balanced: 'Balanced', high_protein: 'High Protein', low_carb: 'Low Carb',
  vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian', gluten_free: 'Gluten Free',
  dairy_free: 'Dairy Free', keto: 'Keto', paleo: 'Paleo', nut_free: 'Nut Free',
};

const CUISINE_LABELS: Record<string, string> = {
  italian: 'Italian', mexican: 'Mexican', chinese: 'Chinese', japanese: 'Japanese',
  indian: 'Indian', american: 'American', mediterranean: 'Mediterranean', thai: 'Thai',
  french: 'French', greek: 'Greek', korean: 'Korean', middle_eastern: 'Middle Eastern',
};

const EATING_STYLE_LABELS: Record<string, string> = {
  quick_simple: 'Quick & simple most nights',
  variety: 'Variety is everything',
  favourites_rotation: 'Favourites rotation',
};

const BUDGET_LABELS: Record<string, string> = {
  budget: 'Budget-friendly', mid: 'Mid-range', premium: 'Premium', no_limit: 'No limit',
};

const SKILL_LABELS: Record<string, string> = {
  beginner: 'Beginner', home_cook: 'Home Cook', confident_chef: 'Confident Chef',
};

const FREQ_LABELS: Record<string, string> = {
  just_starting: 'Just starting out', few_times_week: 'A few times a week', most_days: 'Most days',
};

export default function Payoff() {
  const { onboarding, profile } = useUserStore();
  const [isSaving, setIsSaving] = useState(false);

  async function handleStart() {
    setIsSaving(true);
    try {
      if (profile?.id) {
        const cohortKey = computeCohortKey(onboarding);
        await Promise.allSettled([
          onboarding.pantry_staples.length > 0
            ? addPantryItems(profile.id, onboarding.pantry_staples, 'onboarding')
            : Promise.resolve(),
          patchProfile(profile.id, { onboarding_complete: true }),
          upsertUserCohort(profile.id, cohortKey),
        ]);
      }
    } finally {
      setIsSaving(false);
      router.replace('/(tabs)/discover');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        {/* Editorial top bar */}
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
            fontSize: 10, color: colors.textMuted,
            letterSpacing: 1.6, textTransform: 'uppercase',
            fontFamily: 'System', fontWeight: '500',
          }}>
            Your taste profile
          </Text>
        </View>
        <View style={{ height: 1, backgroundColor: colors.divider, marginHorizontal: 24, marginTop: 14 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 220 }}>
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          You're all set
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          Welcome to the forest.
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 32 }}>
          Here's the taste profile we'll start cooking from.
        </Text>

        {onboarding.dietary_goals.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 10 }}>
              Dietary Goals
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {onboarding.dietary_goals.map((g) => (
                <View key={g} style={{ backgroundColor: colors.cardSelected, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600', fontFamily: 'System' }}>{GOAL_LABELS[g] ?? g}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {onboarding.cuisine_preferences.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 10 }}>
              Favourite Cuisines
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {onboarding.cuisine_preferences.map((c) => (
                <View key={c} style={{ backgroundColor: colors.cardSelected, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600', fontFamily: 'System' }}>{CUISINE_LABELS[c] ?? c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: 10, marginBottom: 32 }}>
          {onboarding.eating_style && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 4 }}>Eating Style</Text>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: 'System' }}>{EATING_STYLE_LABELS[onboarding.eating_style]}</Text>
            </View>
          )}
          {onboarding.cooking_frequency && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 4 }}>Cooking Frequency</Text>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: 'System' }}>{FREQ_LABELS[onboarding.cooking_frequency]}</Text>
            </View>
          )}
          {onboarding.skill_level && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 4 }}>Skill Level</Text>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: 'System' }}>{SKILL_LABELS[onboarding.skill_level]}</Text>
            </View>
          )}
          {onboarding.weekly_budget && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 4 }}>Budget</Text>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: 'System' }}>{BUDGET_LABELS[onboarding.weekly_budget]}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 36, backgroundColor: colors.background }}>
        <View style={{ backgroundColor: colors.infoBg, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: colors.info, lineHeight: 17, fontFamily: 'System' }}>
            Mori uses AI to personalise recommendations, analyse nutrition, and suggest recipes. Read our{' '}
            <Text style={{ fontWeight: '700' }}>privacy policy</Text> for more details.
          </Text>
        </View>
        <Pressable
          onPress={handleStart}
          disabled={isSaving}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.primaryDeep : colors.primary,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
            opacity: isSaving ? 0.7 : 1,
          })}
        >
          <Text style={{ ...TYPE.cta, color: colors.inverse }}>
            {isSaving ? 'Saving…' : 'Start Swiping'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
