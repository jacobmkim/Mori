/**
 * EditPreferencesModal.tsx
 * Extracted from profile.tsx — used by both ProfileSheet and (legacy) profile.tsx
 */
import { View, Text, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import type { Profile } from '@/types';

const GOAL_LABELS: Record<string, string> = {
  balanced: 'Balanced', high_protein: 'High Protein', low_carb: 'Low Carb',
  vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian', gluten_free: 'Gluten Free',
  dairy_free: 'Dairy Free', keto: 'Keto', paleo: 'Paleo', nut_free: 'Nut Free',
};
const SKILL_LABELS: Record<string, string> = {
  beginner: 'Beginner', home_cook: 'Home Cook', confident_chef: 'Confident Chef',
};
const BUDGET_LABELS: Record<string, string> = {
  budget: 'Budget-friendly', mid: 'Mid-range', premium: 'Premium', no_limit: 'No limit',
};
const EATING_STYLE_LABELS: Record<string, string> = {
  quick_simple: 'Quick & simple', variety: 'Variety is everything', favourites_rotation: 'Favourites rotation',
};
const FREQUENCY_LABELS: Record<string, string> = {
  just_starting: 'Just starting out', few_times_week: 'A few times a week', most_days: 'Most days',
};
const CUISINE_LIST = [
  'Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian',
  'American', 'Mediterranean', 'Thai', 'French', 'Greek', 'Korean', 'Middle Eastern',
];

export function EditPreferencesModal({
  visible, profile, onClose, onSave,
}: {
  visible: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (updates: Partial<Profile>) => Promise<void>;
}) {
  const colors = useTheme();
  const [dietaryGoals, setDietaryGoals] = useState<string[]>(profile.dietary_goals ?? []);
  const [extraPrefs, setExtraPrefs] = useState(profile.dietary_extra_preferences ?? '');
  const [cuisines, setCuisines] = useState<string[]>(
    (profile.cuisine_preferences ?? []).map((c) => c.charAt(0).toUpperCase() + c.slice(1))
  );
  const [eatingStyle, setEatingStyle] = useState(profile.eating_style ?? '');
  const [skillLevel, setSkillLevel] = useState(profile.skill_level ?? '');
  const [cookingFrequency, setCookingFrequency] = useState(profile.cooking_frequency ?? '');
  const [budget, setBudget] = useState(profile.weekly_budget ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDietaryGoals(profile.dietary_goals ?? []);
    setExtraPrefs(profile.dietary_extra_preferences ?? '');
    setCuisines((profile.cuisine_preferences ?? []).map((c) => c.charAt(0).toUpperCase() + c.slice(1)));
    setEatingStyle(profile.eating_style ?? '');
    setSkillLevel(profile.skill_level ?? '');
    setCookingFrequency(profile.cooking_frequency ?? '');
    setBudget(profile.weekly_budget ?? '');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function getGoalConflict(goals: string[]): string | null {
    if (goals.includes('vegan') && goals.includes('paleo')) return 'Vegan and Paleo are incompatible — paleo requires meat and fish.';
    if (goals.includes('vegetarian') && goals.includes('paleo')) return 'Vegetarian and Paleo conflict — paleo is built around animal protein.';
    if (goals.includes('pescatarian') && goals.includes('vegan')) return 'Pescatarian and Vegan conflict — vegans do not eat fish.';
    if (goals.includes('keto') && goals.includes('low_fat')) return 'Keto (high fat) and Low Fat directly conflict.';
    if (goals.includes('vegan') && goals.includes('high_protein')) return 'High Protein on a vegan diet is hard — consider removing one or adding a note.';
    return null;
  }

  const goalConflict = getGoalConflict(dietaryGoals);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        dietary_goals: dietaryGoals,
        dietary_extra_preferences: extraPrefs.trim() || null,
        cuisine_preferences: cuisines.map((c) => c.toLowerCase()),
        eating_style: (eatingStyle as Profile['eating_style']) || null,
        skill_level: (skillLevel as Profile['skill_level']) || null,
        cooking_frequency: (cookingFrequency as Profile['cooking_frequency']) || null,
        weekly_budget: budget || null,
      });
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.card,
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
          <PrefSection title="Dietary Goals">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(GOAL_LABELS).map(([id, label]) => {
                const on = dietaryGoals.includes(id);
                return (
                  <Pressable key={id} onPress={() => setDietaryGoals((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id])} style={{
                    backgroundColor: on ? colors.primaryLight : colors.card,
                    borderColor: on ? colors.primary : colors.border,
                    borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
                  }}>
                    <Text style={{ color: on ? colors.primary : colors.text, fontSize: 13, fontWeight: on ? '600' : '400' }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {goalConflict && (
              <View style={{ marginTop: 10, backgroundColor: '#FFF8E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#FFD54F', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 14 }}>⚠️</Text>
                <Text style={{ fontSize: 13, color: '#795548', flex: 1, lineHeight: 18 }}>{goalConflict}</Text>
              </View>
            )}
            <TextInput
              value={extraPrefs} onChangeText={setExtraPrefs}
              placeholder="Anything else? (e.g. low sodium, diabetic friendly)"
              placeholderTextColor={colors.textMuted} multiline
              style={{ marginTop: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text, lineHeight: 20, textAlignVertical: 'top', minHeight: 64 }}
            />
          </PrefSection>

          <PrefSection title="Favourite Cuisines">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CUISINE_LIST.map((c) => {
                const on = cuisines.includes(c);
                return (
                  <Pressable key={c} onPress={() => setCuisines((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])} style={{ backgroundColor: on ? colors.primaryLight : colors.card, borderColor: on ? colors.primary : colors.border, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: on ? colors.primary : colors.text, fontSize: 13, fontWeight: on ? '600' : '400' }}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </PrefSection>

          <PrefSection title="Eating Style">
            {Object.entries(EATING_STYLE_LABELS).map(([id, label]) => (
              <OptionRow key={id} label={label} selected={eatingStyle === id} onPress={() => setEatingStyle(eatingStyle === id ? '' : id)} />
            ))}
          </PrefSection>

          <PrefSection title="Skill Level">
            {Object.entries(SKILL_LABELS).map(([id, label]) => (
              <OptionRow key={id} label={label} selected={skillLevel === id} onPress={() => setSkillLevel(skillLevel === id ? '' : id)} />
            ))}
          </PrefSection>

          <PrefSection title="Cooking Frequency">
            {Object.entries(FREQUENCY_LABELS).map(([id, label]) => (
              <OptionRow key={id} label={label} selected={cookingFrequency === id} onPress={() => setCookingFrequency(cookingFrequency === id ? '' : id)} />
            ))}
          </PrefSection>

          <PrefSection title="Weekly Budget">
            {Object.entries(BUDGET_LABELS).map(([id, label]) => (
              <OptionRow key={id} label={label} selected={budget === id} onPress={() => setBudget(budget === id ? '' : id)} />
            ))}
          </PrefSection>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PrefSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useTheme();
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: selected ? colors.primaryLight : colors.card, borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8 }}>
      <Text style={{ fontSize: 15, color: selected ? colors.primary : colors.text, fontWeight: selected ? '600' : '400' }}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
    </Pressable>
  );
}
