import { View, Text, Pressable, ScrollView, Alert, Modal, TextInput, ActivityIndicator, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { supabase } from '@/lib/supabase';
import { patchProfile, clearDiscoverCache, getPantryItems, addPantryItem, deletePantryItem, getAdventureCardsEnabled, setAdventureCardsEnabled, getUnitSystem, setUnitSystem, getFlaggedRecipes, clearFlaggedRecipes, type FlaggedRecipe } from '@/lib/api';
import { clearRecipeCache } from '@/lib/mealdb';
import { useTheme } from '@/hooks/useTheme';
import { useDiscoverStore, type AppearanceMode } from '@/stores/discoverStore';
import type { Profile, PantryItem } from '@/types';

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

const FREQUENCY_LABELS: Record<string, string> = {
  just_starting: 'Just starting out', few_times_week: 'A few times a week', most_days: 'Most days',
};

const GOAL_LABELS: Record<string, string> = {
  balanced: 'Balanced', high_protein: 'High Protein', low_carb: 'Low Carb',
  vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian', gluten_free: 'Gluten Free',
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

  // Resync local state from profile whenever the modal opens.
  // React doesn't reinitialize useState when props change, so we do it explicitly.
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

  // Detect incompatible goal combinations to warn the user
  function getGoalConflict(goals: string[]): string | null {
    if (goals.includes('vegan') && goals.includes('paleo')) {
      return 'Vegan and Paleo are incompatible — paleo requires meat and fish.';
    }
    if (goals.includes('vegetarian') && goals.includes('paleo')) {
      return 'Vegetarian and Paleo conflict — paleo is built around animal protein.';
    }
    if (goals.includes('pescatarian') && goals.includes('vegan')) {
      return 'Pescatarian and Vegan conflict — vegans do not eat fish.';
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
        cooking_frequency: (cookingFrequency as Profile['cooking_frequency']) || null,
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

          {/* Dietary Goals */}
          <PrefSection title="Dietary Goals">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(GOAL_LABELS).map(([id, label]) => {
                const on = dietaryGoals.includes(id);
                return (
                  <Pressable key={id} onPress={() => toggleGoal(id)} style={{
                    backgroundColor: on ? colors.primaryLight : colors.card,
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
                marginTop: 10, backgroundColor: colors.warningBg, borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 10,
                borderWidth: 1, borderColor: colors.warning,
                flexDirection: 'row', gap: 8, alignItems: 'flex-start',
              }}>
                <Text style={{ fontSize: 14 }}>⚠️</Text>
                <Text style={{ fontSize: 13, color: colors.text, flex: 1, lineHeight: 18 }}>{goalConflict}</Text>
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
                backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
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
                    backgroundColor: on ? colors.primaryLight : colors.card,
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

          {/* Cooking Frequency */}
          <PrefSection title="Cooking Frequency">
            {Object.entries(FREQUENCY_LABELS).map(([id, label]) => (
              <OptionRow
                key={id}
                label={label}
                selected={cookingFrequency === id}
                onPress={() => setCookingFrequency(cookingFrequency === id ? '' : id)}
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
  const colors = useTheme();
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
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: selected ? colors.primaryLight : colors.card,
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
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

// ── Pantry Modal ──────────────────────────────────────────────────────────────

function PantryModal({
  visible,
  userId,
  onClose,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
}) {
  const colors = useTheme();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getPantryItems(userId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, userId]);

  async function handleAdd() {
    const name = newItem.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addPantryItem({ user_id: userId, ingredient_name: name, quantity: null, unit: null, added_via: 'manual' });
      const updated = await getPantryItems(userId);
      setItems(updated);
      setNewItem('');
    } catch {
      Alert.alert('Could not add item', 'Please try again.');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePantryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      Alert.alert('Could not remove item', 'Please try again.');
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
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>Done</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>My Pantry</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* Add item row */}
          <View style={{
            flexDirection: 'row', gap: 10, marginBottom: 20,
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border, padding: 12,
          }}>
            <TextInput
              value={newItem}
              onChangeText={setNewItem}
              placeholder="Add ingredient..."
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, fontSize: 15, color: colors.text }}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <Pressable
              onPress={handleAdd}
              disabled={adding || !newItem.trim()}
              style={{
                backgroundColor: newItem.trim() ? colors.primary : colors.border,
                borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>
                {adding ? '...' : 'Add'}
              </Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="nutrition-outline" size={36} color={colors.border} />
              <Text style={{ fontSize: 15, color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>
                No pantry items yet.{'\n'}Add staples you keep on hand.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {items.map((item) => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: colors.card, borderRadius: 10,
                    borderWidth: 1, borderColor: colors.border,
                    paddingVertical: 12, paddingHorizontal: 14,
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginRight: 12 }} />
                  <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{item.ingredient_name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginRight: 12 }}>
                    {item.added_via === 'onboarding' ? 'Onboarding' : item.added_via === 'manual' ? 'Manual' : 'Grocery'}
                  </Text>
                  <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Dev Tools (dev builds only) ───────────────────────────────────────────────

function DevToolsSection() {
  const colors = useTheme();
  const [flagged, setFlagged] = useState<FlaggedRecipe[]>([]);

  useEffect(() => {
    getFlaggedRecipes().then(setFlagged).catch(() => {});
  }, []);

  async function handleView() {
    const latest = await getFlaggedRecipes();
    setFlagged(latest);
    if (latest.length === 0) {
      Alert.alert('No flagged recipes', 'Open a recipe detail and tap the red flag button to flag it.');
      return;
    }
    const lines = latest.map((f, i) =>
      `${i + 1}. ${f.title}\n   Reason: ${f.reason}\n   ID: ${f.supabase_id || f.external_id}`
    ).join('\n\n');
    Alert.alert(`Flagged Recipes (${latest.length})`, lines);
  }

  function handleClear() {
    Alert.alert('Clear all flags?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearFlaggedRecipes();
          setFlagged([]);
        },
      },
    ]);
  }

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
      <Text style={{
        fontSize: 13, fontWeight: '700', color: colors.error,
        textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
      }}>
        Dev Tools
      </Text>
      <View style={{
        backgroundColor: colors.card, borderRadius: 12,
        borderWidth: 1, borderColor: colors.errorBg, overflow: 'hidden',
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>
              Flagged recipes
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
              {flagged.length === 0
                ? 'None yet — flag bad recipes from the detail view'
                : `${flagged.length} recipe${flagged.length === 1 ? '' : 's'} flagged for review`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={handleView}
              style={{
                backgroundColor: colors.infoBg, borderRadius: 8,
                paddingHorizontal: 12, paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.info, fontWeight: '600' }}>View</Text>
            </Pressable>
            {flagged.length > 0 && (
              <Pressable
                onPress={handleClear}
                style={{
                  backgroundColor: colors.errorBg, borderRadius: 8,
                  paddingHorizontal: 12, paddingVertical: 6,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.error, fontWeight: '600' }}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 18 }}>
            Open any recipe → tap the red flag icon → choose a reason.{'\n'}
            Share this list with Claude to review and fix bad recipes.
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function Profile() {
  const colors = useTheme();
  const { profile, setProfile } = useUserStore();
  const savedCount = useSavedStore((s) => s.savedRecipes.length);
  const [editVisible, setEditVisible] = useState(false);
  const [pantryVisible, setPantryVisible] = useState(false);
  const [adventureCards, setAdventureCards] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [unitSystem, setUnitSystemState] = useState<'us' | 'metric'>('us');
  const { appearanceMode, setAppearanceMode } = useDiscoverStore();
  const savedTasteProfile = (profile?.taste_profile as any);
  const [tasteProfile, setTasteProfile] = useState<string | null>(savedTasteProfile?.text ?? null);
  const [tasteLoading, setTasteLoading] = useState(false);

  async function runTasteProfileGeneration(userId: string) {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!baseUrl) return;
    setTasteLoading(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
      }
      if (!session?.access_token) return;

      const res = await fetch(`${baseUrl}/api/taste-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (res.ok && json.tasteProfile) {
        setTasteProfile(json.tasteProfile);
        if (profile) {
          setProfile({
            ...profile,
            taste_profile: { text: json.tasteProfile, generated_at: new Date().toISOString() },
          });
        }
      }
    } catch (err) {
      console.log('[taste] ERROR:', err);
    } finally {
      setTasteLoading(false);
    }
  }

  // Auto-generate on load: if no profile yet, or last generated > 14 days ago
  useEffect(() => {
    if (!profile?.id) return;
    const generatedAt = savedTasteProfile?.generated_at ? new Date(savedTasteProfile.generated_at) : null;
    const stale = !generatedAt || generatedAt < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    if (!tasteProfile || stale) {
      runTasteProfileGeneration(profile.id);
    }
    getAdventureCardsEnabled().then(setAdventureCards).catch(() => {});
    getUnitSystem().then(setUnitSystemState).catch(() => {});
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleSaveName() {
    if (!profile) return;
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    try {
      const updated = await patchProfile(profile.id, { name: trimmed });
      setProfile(updated);
    } catch {
      Alert.alert('Could not save name', 'Please try again.');
    } finally {
      setEditingName(false);
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
          {editingName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                autoFocus
                maxLength={40}
                style={{
                  fontSize: 18, fontWeight: '700', color: colors.text,
                  borderBottomWidth: 2, borderBottomColor: colors.primary,
                  paddingVertical: 2, paddingHorizontal: 4, minWidth: 120,
                }}
              />
              <Pressable onPress={handleSaveName} hitSlop={8}>
                <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => setEditingName(false)} hitSlop={8}>
                <Ionicons name="close-circle" size={28} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => { setNameInput(profile?.name ?? ''); setEditingName(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
            >
              <Text style={{ fontSize: 20, fontWeight: '700', color: profile?.name ? colors.text : colors.textMuted, fontStyle: profile?.name ? 'normal' : 'italic' }}>
                {profile?.name ?? 'Set display name'}
              </Text>
              <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
            </Pressable>
          )}
          <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }}>
            {profile ? 'Member since ' + new Date(profile.created_at).getFullYear() : 'Welcome!'}
          </Text>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 24 }}>
          {stats.map((stat) => (
            <View key={stat.label} style={{
              flex: 1, backgroundColor: colors.card, borderRadius: 12,
              padding: 14, alignItems: 'center',
              borderWidth: 1, borderColor: colors.border,
            }}>
              <Ionicons name={stat.icon as any} size={20} color={colors.primary} />
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 6 }}>{stat.value}</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 }}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Taste Profile */}
        {profile && (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Your Taste Profile v2</Text>
              {!tasteLoading && (
                <TouchableOpacity
                  activeOpacity={0.5}
                  onPress={() => {
                    console.log('[taste] BUTTON PRESSED');
                    Alert.alert('Taste', 'Button pressed! id=' + (profile?.id ?? 'NULL'));
                    if (profile?.id) runTasteProfileGeneration(profile.id);
                  }}
                  hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
                  style={{ padding: 8 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>
                    {tasteProfile ? 'Refresh' : 'Generate'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{
              backgroundColor: colors.card, borderRadius: 12,
              borderWidth: 1, borderColor: colors.border,
              padding: 16,
            }}>
              {tasteLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ fontSize: 14, color: colors.textMuted }}>
                    {tasteProfile ? 'Refreshing your taste profile...' : 'Building your taste profile...'}
                  </Text>
                </View>
              ) : tasteProfile ? (
                <Text style={{ fontSize: 14, color: colors.text, lineHeight: 22, fontStyle: 'italic' }}>
                  "{tasteProfile}"
                </Text>
              ) : (
                <Text style={{ fontSize: 14, color: colors.textMuted, lineHeight: 22 }}>
                  Swipe on a few recipes in Discover and we'll learn your taste.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Preferences */}
        {profile && (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>My Preferences</Text>
              <Pressable onPress={() => setEditVisible(true)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>Edit</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {profile.skill_level && (
                <PrefRow label="Skill Level" value={SKILL_LABELS[profile.skill_level]} />
              )}
              {profile.weekly_budget && (
                <PrefRow label="Budget" value={BUDGET_LABELS[profile.weekly_budget]} />
              )}
              {profile.eating_style && (
                <PrefRow label="Eating Style" value={EATING_STYLE_LABELS[profile.eating_style]} />
              )}
              {profile.cooking_frequency && (
                <PrefRow label="Cooking Frequency" value={FREQUENCY_LABELS[profile.cooking_frequency]} />
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

        {/* Pantry */}
        {profile && (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>My Pantry</Text>
              <Pressable onPress={() => setPantryVisible(true)} hitSlop={8}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '500' }}>Manage</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setPantryVisible(true)}
              style={{
                backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1, borderColor: colors.border, padding: 16,
                flexDirection: 'row', alignItems: 'center', gap: 12,
              }}
            >
              <Ionicons name="nutrition-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>Pantry staples</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  Track ingredients you keep on hand
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Discover Settings */}
        <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
          <Text style={{
            fontSize: 13, fontWeight: '700', color: colors.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
          }}>
            Discover Settings
          </Text>
          <View style={{
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
          }}>
            {/* Adventure cards */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
            }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>
                  Adventure cards
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  {adventureCards
                    ? 'Exploring new cuisines based on your taste'
                    : 'Showing familiar cuisines only'}
                </Text>
              </View>
              <Switch
                value={adventureCards}
                onValueChange={(val) => {
                  setAdventureCards(val);
                  setAdventureCardsEnabled(val).catch(() => {});
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="white"
              />
            </View>

            {/* Measurement units */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              padding: 16, borderTopWidth: 1, borderTopColor: colors.border,
            }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>
                  Measurement units
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  {unitSystem === 'us' ? 'cups/tbsp for volume · oz for weight' : 'ml for volume · g for weight'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                {(['us', 'metric'] as const).map((opt) => (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      setUnitSystemState(opt);
                      setUnitSystem(opt).catch(() => {});
                    }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 7,
                      backgroundColor: unitSystem === opt ? colors.primary : colors.background,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: unitSystem === opt ? 'white' : colors.textMuted }}>
                      {opt === 'us' ? 'cups' : 'ml'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

          </View>
        </View>

        {/* Appearance */}
        <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
          <Text style={{
            fontSize: 13, fontWeight: '700', color: colors.textMuted,
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
          }}>
            Appearance
          </Text>
          <View style={{
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border, padding: 16,
          }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['light', 'system', 'dark'] as AppearanceMode[]).map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setAppearanceMode(opt)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: appearanceMode === opt ? colors.primary : colors.background,
                    borderWidth: 1.5,
                    borderColor: appearanceMode === opt ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>
                    {opt === 'light' ? '☀️' : opt === 'dark' ? '🌙' : '⚙️'}
                  </Text>
                  <Text style={{
                    fontSize: 12, fontWeight: '600', textTransform: 'capitalize',
                    color: appearanceMode === opt ? 'white' : colors.textMuted,
                  }}>
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Dev Tools — only visible in dev builds */}
        {__DEV__ && (
          <DevToolsSection />
        )}

        {/* Legal */}
        <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 12,
            borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
          }}>
            <Pressable
              onPress={() => router.push('/privacy-policy')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 16,
              }}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.textMuted} />
              <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Sign Out */}
        <View style={{ paddingHorizontal: 16 }}>
          <Pressable
            onPress={handleSignOut}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: colors.card, borderRadius: 12,
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
      {profile && (
        <PantryModal
          visible={pantryVisible}
          userId={profile.id}
          onClose={() => setPantryVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}
