import { View, Text, Pressable, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { supabase } from '@/lib/supabase';
import { upsertProfile, patchProfile, clearDiscoverCache } from '@/lib/api';
import { clearRecipeCache } from '@/lib/mealdb';
import { colors } from '@/constants/theme';
import type { Profile } from '@/types';

// ── Label maps ────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<string, string> = {
  beginner: 'Beginner', home_cook: 'Home Cook', confident_chef: 'Confident Chef',
};

const BUDGET_LABELS: Record<string, string> = {
  budget: 'Budget-friendly', mid: 'Mid-range', premium: 'Premium', no_limit: 'No limit',
};

const EATING_STYLE_LABELS: Record<string, string> = {
  quick_simple: 'Quick & simple', variety: 'Variety is everything', favourites_rotation: 'Favourites rotation',
};

const GOAL_LABELS: Record<string, string> = {
  balanced: 'Balanced', high_protein: 'High Protein', low_carb: 'Low Carb',
  vegetarian: 'Vegetarian', vegan: 'Vegan', gluten_free: 'Gluten Free',
  dairy_free: 'Dairy Free', keto: 'Keto', paleo: 'Paleo', nut_free: 'Nut Free',
};

const CUISINE_LIST = [
  'Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian',
  'American', 'Mediterranean', 'Thai', 'French', 'Greek', 'Korean', 'Middle Eastern',
];

// ── Edit Preferences Modal ────────────────────────────────────────────────────

function EditPreferencesModal({
  visible,
  profile,
  onClose,
  onSave,
}: {
  visible: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}) {
  const [dietaryGoals, setDietaryGoals] = useState<string[]>(profile.dietary_goals ?? []);
  const [extraPrefs, setExtraPrefs] = useState(profile.dietary_extra_preferences ?? '');
  const [cuisines, setCuisines] = useState<string[]>(
    (profile.cuisine_preferences ?? []).map((c) => c.charAt(0).toUpperCase() + c.slice(1))
  );
  const [eatingStyle, setEatingStyle] = useState(profile.eating_style ?? '');
  const [skillLevel, setSkillLevel] = useState(profile.skill_level ?? '');
  const [budget, setBudget] = useState(profile.weekly_budget ?? '');
  const [saving, setSaving] = useState(false);

  // Resync local state from profile whenever the modal opens.
  // React doesn't reinitialize useState when props change, so we do it explicitly.
  useEffect(() => {
    if (!visible) return;
    setDietaryGoals(profile.dietary_goals ?? []);
    setExtraPrefs(profile.dietary_extra_preferences ?? '');
    setCuisines((profile.cuisine_preferences ?? []).map((c) => c.charAt(0).toUpperCase() + c.slice(1)));
    setEatingStyle(profile.eating_style ?? '');
    setSkillLevel(profile.skill_level ?? '');
    setBudget(profile.weekly_budget ?? '');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect incompatible goal combinations to warn the user
  function getGoalConflict(goals: string[]): string | null {
    if (goals.includes('vegan') && goals.includes('paleo')) {
      return 'Vegan and Paleo are incompatible — paleo requires meat and fish.';
    }
    if (goals.includes('vegetarian') && goals.includes('paleo')) {
      return 'Vegetarian and Paleo conflict — paleo is built around animal protein.';
    }
    if (goals.includes('keto') && goals.includes('low_fat')) {
      return 'Keto (high fat) and Low Fat directly conflict with each other.';
    }
    if (goals.includes('vegan') && goals.includes('high_protein')) {
      return 'High Protein on a vegan diet is hard — consider removing one or adding a note in the text field.';
    }
    return null;
  }

  const goalConflict = getGoalConflict(dietaryGoals);

  function toggleGoal(id: string) {
    setDietaryGoals((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  }

  function toggleCuisine(c: string) {
    setCuisines((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        dietary_goals: dietaryGoals,
        dietary_extra_preferences: extraPrefs.trim() || null,
        cuisine_preferences: cuisines.map((c) => c.toLowerCase()),
        eating_style: (eatingStyle as Profile['eating_style']) || null,
        skill_level: (skillLevel as Profile['skill_level']) || null,
        weekly_budget: budget || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.white,
        }}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Edit Preferences</Text>
          <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
            <Text style={{ color: saving ? colors.textMuted : colors.primary, fontSize: 16, fontWeight: '600' }}>
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

          {/* Dietary Goals */}
          <PrefSection title="Dietary Goals">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(GOAL_LABELS).map(([id, label]) => {
                const on = dietaryGoals.includes(id);
                return (
                  <Pressable key={id} onPress={() => toggleGoal(id)} style={{
                    backgroundColor: on ? colors.primaryLight : colors.white,
                    borderColor: on ? colors.primary : colors.border,
                    borderWidth: 1.5, borderRadius: 999,
                    paddingHorizontal: 14, paddingVertical: 8,
                  }}>
                    <Text style={{ color: on ? colors.primary : colors.text, fontSize: 13, fontWeight: on ? '600' : '400' }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {goalConflict && (
              <View style={{
                marginTop: 10, backgroundColor: '#FFF8E1', borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 10,
                borderWidth: 1, borderColor: '#FFD54F',
                flexDirection: 'row', gap: 8, alignItems: 'flex-start',
              }}>
                <Text style={{ fontSize: 14 }}>⚠️</Text>
                <Text style={{ fontSize: 13, color: '#795548', flex: 1, lineHeight: 18 }}>{goalConflict}</Text>
              </View>
            )}
            <TextInput
              value={extraPrefs}
              onChangeText={setExtraPrefs}
              placeholder="Anything else? (e.g. low sodium, diabetic friendly)"
              placeholderTextColor={colors.textMuted}
              multiline
              style={{
                marginTop: 12,
                backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border,
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                fontSize: 14, color: colors.text, lineHeight: 20, textAlignVertical: 'top',
                minHeight: 64,
              }}
            />
          </PrefSection>

          {/* Cuisine Preferences */}
          <PrefSection title="Favourite Cuisines">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CUISINE_LIST.map((c) => {
                const on = cuisines.includes(c);
                return (
                  <Pressable key={c} onPress={() => toggleCuisine(c)} style={{
                    backgroundColor: on ? colors.primaryLight : colors.white,
                    borderColor: on ? colors.primary : colors.border,
                    borderWidth: 1.5, borderRadius: 999,
                    paddingHorizontal: 14, paddingVertical: 8,
                  }}>
                    <Text style={{ color: on ? colors.primary : colors.text, fontSize: 13, fontWeight: on ? '600' : '400' }}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </PrefSection>

          {/* Eating Style */}
          <PrefSection title="Eating Style">
            {Object.entries(EATING_STYLE_LABELS).map(([id, label]) => (
              <OptionRow
                key={id}
                label={label}
                selected={eatingStyle === id}
                onPress={() => setEatingStyle(eatingStyle === id ? '' : id)}
              />
            ))}
          </PrefSection>

          {/* Skill Level */}
          <PrefSection title="Skill Level">
            {Object.entries(SKILL_LABELS).map(([id, label]) => (
              <OptionRow
                key={id}
                label={label}
                selected={skillLevel === id}
                onPress={() => setSkillLevel(skillLevel === id ? '' : id)}
              />
            ))}
          </PrefSection>

          {/* Budget */}
          <PrefSection title="Weekly Budget">
            {Object.entries(BUDGET_LABELS).map(([id, label]) => (
              <OptionRow
                key={id}
                label={label}
                selected={budget === id}
                onPress={() => setBudget(budget === id ? '' : id)}
              />
            ))}
          </PrefSection>

        </ScrollView>
      </View>
    </Modal>
  );
}

function PrefSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{
        fontSize: 13, fontWeight: '700', color: colors.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
      }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: selected ? colors.primaryLight : colors.white,
      borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border,
      borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
    }}>
      <Text style={{ fontSize: 15, color: selected ? colors.primary : colors.text, fontWeight: selected ? '600' : '400' }}>
        {label}
      </Text>
      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
    </Pressable>
  );
}

function PrefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Profile() {
  const { profile, setProfile } = useUserStore();
  const savedCount = useSavedStore((s) => s.savedRecipes.length);
  const [editVisible, setEditVisible] = useState(false);

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

  async function handleSavePrefs(updates: Partial<Profile>) {
    if (!profile) return;
    try {
      const updated = await patchProfile(profile.id, updates);
      setProfile(updated);
      // Clear cached recipe deck so Discover reloads with the new dietary filters applied
      clearRecipeCache().catch(() => {});
      clearDiscoverCache();
    } catch (err) {
      Alert.alert('Could not save preferences', 'Please check your connection and try again.');
      console.error('patchProfile error:', err);
    }
  }

  const stats = [
    { label: 'Meals Cooked', value: profile?.meals_cooked_count ?? 0, icon: 'restaurant' },
    { label: 'Recipes Saved', value: savedCount, icon: 'heart' },
    { label: 'Submitted', value: profile?.recipes_submitted_count ?? 0, icon: 'create' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colors.primaryLight,
            alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <Ionicons name="person" size={40} color={colors.primary} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>
            {profile?.name ?? 'Mise User'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }}>
            {profile ? 'Member since ' + new Date(profile.created_at).getFullYear() : 'Welcome!'}
          </Text>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 24 }}>
          {stats.map((stat) => (
            <View key={stat.label} style={{
              flex: 1, backgroundColor: colors.white, borderRadius: 12,
              padding: 14, alignItems: 'center',
              borderWidth: 1, borderColor: colors.border,
            }}>
              <Ionicons name={stat.icon as any} size={20} color={colors.primary} />
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 6 }}>{stat.value}</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 }}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Preferences */}
        {profile && (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>My Preferences</Text>
              <Pressable onPress={() => setEditVisible(true)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>Edit</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {profile.skill_level && (
                <PrefRow label="Skill Level" value={SKILL_LABELS[profile.skill_level]} />
              )}
              {profile.weekly_budget && (
                <PrefRow label="Budget" value={BUDGET_LABELS[profile.weekly_budget]} />
              )}
              {profile.eating_style && (
                <PrefRow label="Eating Style" value={EATING_STYLE_LABELS[profile.eating_style]} />
              )}
              {(profile.dietary_goals ?? []).length > 0 && (
                <View style={{ padding: 16, borderBottomWidth: (profile.cuisine_preferences ?? []).length > 0 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Dietary Goals</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(profile.dietary_goals ?? []).map((g) => (
                      <View key={g} style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>
                          {GOAL_LABELS[g] ?? g.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {(profile.cuisine_preferences ?? []).length > 0 && (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Cuisines</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(profile.cuisine_preferences ?? []).map((c) => (
                      <View key={c} style={{ backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>
                          {c.charAt(0).toUpperCase() + c.slice(1)}
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
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.white, borderRadius: 12,
              padding: 16, borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 15, fontWeight: '500' }}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>

      {profile && (
        <EditPreferencesModal
          visible={editVisible}
          profile={profile}
          onClose={() => setEditVisible(false)}
          onSave={handleSavePrefs}
        />
      )}
    </SafeAreaView>
  );
}
