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

export default function Payoff() {
  const { onboarding } = useUserStore();

  async function handleStart() {
    router.replace('/(tabs)/discover');
  }

  return (
    <View className="flex-1 bg-[#F9F9F9]">
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
        <Text className="text-[28px] font-bold text-[#1A1A1A] mb-2">
          You're all set! 🎉
        </Text>
        <Text className="text-base text-[#666666] mb-8">
          Here's your personalised PrepSwipe profile.
        </Text>

        {onboarding.dietary_goals.length > 0 && (
          <View className="mb-6">
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Dietary Goals
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {onboarding.dietary_goals.map((g) => (
                <View
                  key={g}
                  style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}
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
          <View className="mb-6">
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Favourite Cuisines
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {onboarding.cuisine_preferences.map((c) => (
                <View
                  key={c}
                  style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>
                    {CUISINE_LABELS[c] ?? c}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="mb-6 gap-3">
          {onboarding.skill_level && (
            <View style={{ backgroundColor: colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Skill Level</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 }}>
                {SKILL_LABELS[onboarding.skill_level]}
              </Text>
            </View>
          )}
          {onboarding.weekly_budget && (
            <View style={{ backgroundColor: colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Budget</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 }}>
                {BUDGET_LABELS[onboarding.weekly_budget]}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View className="px-6 pb-10">
        <Pressable
          onPress={handleStart}
          style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16 }}
          className="items-center"
        >
          <Text className="text-white text-base font-semibold">Start Swiping</Text>
        </Pressable>
      </View>
    </View>
  );
}
