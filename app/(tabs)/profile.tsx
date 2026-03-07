import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/theme';

const SKILL_LABELS: Record<string, string> = {
  beginner: 'Beginner', home_cook: 'Home Cook', confident_chef: 'Confident Chef',
};

const BUDGET_LABELS: Record<string, string> = {
  budget: 'Budget-friendly', mid: 'Mid-range', premium: 'Premium', no_limit: 'No limit',
};

export default function Profile() {
  const { profile, setProfile } = useUserStore();

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setProfile(null);
          router.replace('/onboarding/welcome');
        },
      },
    ]);
  }

  const stats = [
    { label: 'Meals Cooked', value: profile?.meals_cooked_count ?? 0, icon: 'restaurant' },
    { label: 'Recipes Saved', value: 0, icon: 'heart' },
    { label: 'Submitted', value: profile?.recipes_submitted_count ?? 0, icon: 'create' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Ionicons name="person" size={40} color={colors.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>
            {profile?.name ?? 'PrepSwipe User'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }}>
            {profile ? 'Member since ' + new Date(profile.created_at).getFullYear() : 'Welcome!'}
          </Text>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 24 }}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={{
                flex: 1,
                backgroundColor: colors.white,
                borderRadius: 12,
                padding: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name={stat.icon as any} size={20} color={colors.primary} />
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 6 }}>
                {stat.value}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 }}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Preferences */}
        {profile && (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
              My Preferences
            </Text>
            <View style={{ backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {profile.skill_level && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Skill Level</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>
                    {SKILL_LABELS[profile.skill_level]}
                  </Text>
                </View>
              )}
              {profile.weekly_budget && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Budget</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>
                    {BUDGET_LABELS[profile.weekly_budget]}
                  </Text>
                </View>
              )}
              {profile.dietary_goals.length > 0 && (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 8 }}>Dietary Goals</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {profile.dietary_goals.map((g) => (
                      <View key={g} style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>
                          {g.replace('_', ' ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Sign Out */}
        <View style={{ paddingHorizontal: 16 }}>
          <Pressable
            onPress={handleSignOut}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: colors.white,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 15, fontWeight: '500' }}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
