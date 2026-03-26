import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import { addPantryItems, upsertProfile, computeCohortKey, upsertUserCohort } from '@/lib/api';

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

// Common pantry staples — user taps a handful in seconds on the payoff screen
const PANTRY_STAPLES = [
  'Olive oil', 'Garlic', 'Pasta', 'Rice', 'Canned tomatoes',
  'Eggs', 'Onions', 'Butter', 'Soy sauce', 'Flour',
  'Chicken stock', 'Lemon', 'Cumin', 'Paprika', 'Salt',
  'Pepper', 'Balsamic vinegar', 'Parmesan', 'Chilli flakes', 'Honey',
  'Mustard', 'Tinned chickpeas', 'Coconut milk', 'Bread', 'Potatoes',
];

export default function Payoff() {
  const colors = useTheme();
  const { onboarding, profile } = useUserStore();
  const [selectedPantry, setSelectedPantry] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  function togglePantry(item: string) {
    setSelectedPantry((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }

  async function handleStart() {
    setIsSaving(true);
    try {
      if (profile?.id) {
        const cohortKey = computeCohortKey(onboarding);
        // Run in parallel — neither blocks navigation if it fails
        await Promise.allSettled([
          // Save pantry staples — powers "you can make this tonight" on session one
          selectedPantry.length > 0
            ? addPantryItems(profile.id, selectedPantry, 'onboarding')
            : Promise.resolve(),
          // Mark onboarding complete so the app knows not to re-run the flow
          upsertProfile({ id: profile.id, onboarding_complete: true }),
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 140 }}>
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
            <View style={{ backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Eating Style</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{EATING_STYLE_LABELS[onboarding.eating_style]}</Text>
            </View>
          )}
          {onboarding.cooking_frequency && (
            <View style={{ backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Cooking Frequency</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{FREQ_LABELS[onboarding.cooking_frequency]}</Text>
            </View>
          )}
          {onboarding.skill_level && (
            <View style={{ backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Skill Level</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{SKILL_LABELS[onboarding.skill_level]}</Text>
            </View>
          )}
          {onboarding.weekly_budget && (
            <View style={{ backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Budget</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{BUDGET_LABELS[onboarding.weekly_budget]}</Text>
            </View>
          )}
        </View>

        {/* Pantry staple seed — powers the "you can make this tonight" magic moment on session one */}
        <View style={{ backgroundColor: colors.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 }}>
            What's always in your kitchen?
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 16, lineHeight: 20 }}>
            Tap what you usually have. We'll find recipes you can make tonight.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PANTRY_STAPLES.map((item) => {
              const isSelected = selectedPantry.includes(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => togglePantry(item)}
                  style={{
                    backgroundColor: isSelected ? colors.primaryLight : colors.background,
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{
                    fontSize: 13,
                    fontWeight: isSelected ? '600' : '400',
                    color: isSelected ? colors.primary : colors.text,
                  }}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedPantry.length > 0 && (
            <Text style={{ marginTop: 14, fontSize: 13, color: colors.textMuted }}>
              {selectedPantry.length} item{selectedPantry.length !== 1 ? 's' : ''} in your pantry
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 40, backgroundColor: colors.background }}>
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
