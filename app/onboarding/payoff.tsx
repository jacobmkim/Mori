import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';

const GOAL_LABELS: Record<string, string> = {
  balanced: 'Balanced', high_protein: 'High Protein', low_carb: 'Low Carb',
  vegetarian: 'Vegetarian', vegan: 'Vegan', gluten_free: 'Gluten Free',
  dairy_free: 'Dairy Free', keto: 'Keto', paleo: 'Paleo', nut_free: 'Nut Free',
};

const CUISINE_LABELS: Record<string, string> = {
  italian: 'Italian', mexican: 'Mexican', asian: 'Asian',
  mediterranean: 'Mediterranean', american: 'American', indian: 'Indian',
  japanese: 'Japanese', thai: 'Thai',
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
  const { onboarding } = useUserStore();

  function handleStart() {
    router.replace('/(tabs)/discover');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 120 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          You're all set! 🎉
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          Here's your personalised Mise profile.
        </Text>

        {onboarding.dietary_goals.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Dietary Goals
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {onboarding.dietary_goals.map((g) => (
                <View
                  key={g}
                  style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>
                    {GOAL_LABELS[g] ?? g}
                  </Text>
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
                <View
                  key={c}
                  style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>
                    {CUISINE_LABELS[c] ?? c}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: 10 }}>
          {onboarding.cooking_frequency && (
            <View style={{ backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                Cooking Frequency
              </Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                {FREQ_LABELS[onboarding.cooking_frequency]}
              </Text>
            </View>
          )}
          {onboarding.skill_level && (
            <View style={{ backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                Skill Level
              </Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                {SKILL_LABELS[onboarding.skill_level]}
              </Text>
            </View>
          )}
          {onboarding.weekly_budget && (
            <View style={{ backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                Budget
              </Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
                {BUDGET_LABELS[onboarding.weekly_budget]}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 40, backgroundColor: colors.background }}>
        <Pressable
          onPress={handleStart}
          style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 18, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>Start Swiping</Text>
        </Pressable>
      </View>
    </View>
  );
}
