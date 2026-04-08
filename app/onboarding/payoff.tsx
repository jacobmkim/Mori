import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import { addPantryItems, patchProfile, computeCohortKey, upsertUserCohort } from '@/lib/api';

const GOAL_LABELS: Record<string, string> = {
  balanced: 'Balanced', high_protein: 'High Protein', low_carb: 'Low Carb',
  vegetarian: 'Vegetarian', vegan: 'Vegan', gluten_free: 'Gluten Free',
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
  const colors = useTheme();
  const { onboarding, profile } = useUserStore();
  const [isSaving, setIsSaving] = useState(false);

  async function handleStart() {
    setIsSaving(true);
    try {
      if (profile?.id) {
        const cohortKey = computeCohortKey(onboarding);
        // Run in parallel — neither blocks navigation if it fails
        await Promise.allSettled([
          // Save pantry staples from the dedicated pantry onboarding screen
          onboarding.pantry_staples.length > 0
            ? addPantryItems(profile.id, onboarding.pantry_staples, 'onboarding')
            : Promise.resolve(),
          // Mark onboarding complete so the app knows not to re-run the flow
          patchProfile(profile.id, { onboarding_complete: true }),
          // Map user to cohort — Phase 2 recommendation engine uses this to
          // serve a personalised first stack before any swipe history exists
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 220 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          You're all set! 🎉
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          Here's your personalised Mori profile.
        </Text>

        {/* Preference summary pills */}
        {onboarding.dietary_goals.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Dietary Goals
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {onboarding.dietary_goals.map((g) => (
                <View key={g} style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>{GOAL_LABELS[g] ?? g}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {onboarding.cuisine_preferences.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Favourite Cuisines
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {onboarding.cuisine_preferences.map((c) => (
                <View key={c} style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>{CUISINE_LABELS[c] ?? c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: 10, marginBottom: 32 }}>
          {onboarding.eating_style && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Eating Style</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{EATING_STYLE_LABELS[onboarding.eating_style]}</Text>
            </View>
          )}
          {onboarding.cooking_frequency && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Cooking Frequency</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{FREQ_LABELS[onboarding.cooking_frequency]}</Text>
            </View>
          )}
          {onboarding.skill_level && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Skill Level</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{SKILL_LABELS[onboarding.skill_level]}</Text>
            </View>
          )}
          {onboarding.weekly_budget && (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Budget</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{BUDGET_LABELS[onboarding.weekly_budget]}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 40, backgroundColor: colors.background }}>
        <View style={{ backgroundColor: colors.infoBg, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: colors.info, lineHeight: 16 }}>
            Mori uses AI to personalize your recipe recommendations, analyze nutritional information, and provide recipe suggestions. Read our {' '}
            <Text style={{ fontWeight: '600' }}>privacy policy</Text> for more details.
          </Text>
        </View>
        <Pressable
          onPress={handleStart}
          disabled={isSaving}
          style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center', opacity: isSaving ? 0.7 : 1 }}
        >
          <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
            {isSaving ? 'Saving...' : 'Start Swiping'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
