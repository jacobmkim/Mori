/**
 * ProfileSheet.tsx
 * Bottom sheet that replaces the Profile tab.
 * Opened by tapping the AvatarButton on any screen.
 */
import {
  View, Text, Modal, Pressable, ScrollView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { useDiscoverStore } from '@/stores/discoverStore';
import { supabase } from '@/lib/supabase';
import {
  patchProfile, clearDiscoverCache,
  getAdventureCardsEnabled, setAdventureCardsEnabled,
} from '@/lib/api';
import { clearRecipeCache } from '@/lib/mealdb';
import type { Profile } from '@/types';
import { EditPreferencesModal } from '@/components/EditPreferencesModal';
import { PantryModal } from '@/components/PantryModal';

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

export function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const { profile, setProfile } = useUserStore();
  const savedCount = useSavedStore((s) => s.savedRecipes.length);
  const { appearanceMode, setAppearanceMode } = useDiscoverStore();
  const [editVisible, setEditVisible] = useState(false);
  const [pantryVisible, setPantryVisible] = useState(false);
  const [adventureCards, setAdventureCards] = useState(true);
  const [tasteProfile, setTasteProfile] = useState<string | null>(
    (profile?.taste_profile as any)?.text ?? null
  );
  const [tasteLoading, setTasteLoading] = useState(false);

  const generateTasteProfile = useCallback(async () => {
    if (!profile?.id) return;
    const baseUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!baseUrl) return;
    setTasteLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/taste-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id }),
      });
      if (!res.ok) return;
      const { tasteProfile: text } = await res.json();
      if (text) setTasteProfile(text);
    } catch { } finally { setTasteLoading(false); }
  }, [profile?.id]);

  useEffect(() => {
    if (visible) {
      if (!tasteProfile && !tasteLoading) generateTasteProfile();
      getAdventureCardsEnabled().then(setAdventureCards).catch(() => {});
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    onClose();
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
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
      clearRecipeCache().catch(() => {});
      clearDiscoverCache();
    } catch {
      Alert.alert('Could not save preferences', 'Please check your connection and try again.');
    }
  }

  const initials = profile?.name
    ? profile.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Handle + close */}
          <View style={{
            alignItems: 'center', paddingTop: 12, paddingBottom: 4,
            backgroundColor: colors.card,
            borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 }} />
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', paddingHorizontal: 20, paddingBottom: 16,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {initials ? (
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>{initials}</Text>
                  ) : (
                    <Ionicons name="person" size={22} color="white" />
                  )}
                </View>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
                    {profile?.name ?? 'Mori User'}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>
                    {savedCount} recipe{savedCount !== 1 ? 's' : ''} saved
                  </Text>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

            {/* Taste Profile */}
            {profile && (
              <View style={{ paddingHorizontal: 16, paddingTop: 20, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Your Taste Profile</Text>
                  {!tasteLoading && (
                    <Pressable onPress={generateTasteProfile} hitSlop={8}>
                      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '500' }}>
                        {tasteProfile ? 'Refresh' : 'Generate'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <View style={{
                  backgroundColor: colors.card, borderRadius: 12,
                  borderWidth: 1, borderColor: colors.border, padding: 14,
                }}>
                  {tasteLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>Building your taste profile...</Text>
                    </View>
                  ) : tasteProfile ? (
                    <Text style={{ fontSize: 13, color: colors.text, lineHeight: 20, fontStyle: 'italic' }}>
                      "{tasteProfile}"
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 20 }}>
                      Swipe on a few recipes in Discover and we'll learn your taste.
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Quick links */}
            <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
              <View style={{
                backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
              }}>
                <SheetRow
                  icon="options-outline"
                  label="Edit Preferences"
                  onPress={() => { onClose(); setTimeout(() => setEditVisible(true), 300); }}
                />
                <SheetRow
                  icon="nutrition-outline"
                  label="My Pantry"
                  onPress={() => { onClose(); setTimeout(() => setPantryVisible(true), 300); }}
                />
                <SheetRow
                  icon="compass-outline"
                  label="Discover Settings"
                  chevron={false}
                  trailing={
                    <Switch
                      value={adventureCards}
                      onValueChange={async (v) => {
                        setAdventureCards(v);
                        await setAdventureCardsEnabled(v);
                      }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="white"
                    />
                  }
                />
                <SheetRow
                  icon="log-out-outline"
                  label="Sign Out"
                  destructive
                  onPress={handleSignOut}
                  last
                />
              </View>
            </View>

            {/* Preferences summary */}
            {profile && (
              <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
                <Text style={{
                  fontSize: 11, fontWeight: '700', color: colors.textMuted,
                  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
                }}>
                  My Preferences
                </Text>
                <View style={{
                  backgroundColor: colors.card, borderRadius: 12,
                  borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8,
                }}>
                  {profile.skill_level && (
                    <PrefLine label="Skill" value={SKILL_LABELS[profile.skill_level]} />
                  )}
                  {profile.eating_style && (
                    <PrefLine label="Style" value={EATING_STYLE_LABELS[profile.eating_style]} />
                  )}
                  {(profile.dietary_goals ?? []).length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {(profile.dietary_goals ?? []).map((g) => (
                        <View key={g} style={{
                          backgroundColor: colors.primaryLight, borderRadius: 999,
                          paddingHorizontal: 10, paddingVertical: 3,
                        }}>
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                            {GOAL_LABELS[g] ?? g.replace(/_/g, ' ')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Sub-modals rendered outside the sheet so they work after onClose */}
      {profile && (
        <EditPreferencesModal
          visible={editVisible}
          profile={profile}
          onClose={() => setEditVisible(false)}
          onSave={handleSavePrefs}
        />
      )}
      <PantryModal visible={pantryVisible} onClose={() => setPantryVisible(false)} />
    </>
  );
}

function SheetRow({
  icon, label, onPress, destructive = false, chevron = true, trailing, last = false,
}: {
  icon: string; label: string; onPress?: () => void;
  destructive?: boolean; chevron?: boolean; trailing?: React.ReactNode; last?: boolean;
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
      <Ionicons name={icon as any} size={20} color={destructive ? colors.error : colors.primary} />
      <Text style={{
        flex: 1, marginLeft: 12, fontSize: 15,
        color: destructive ? colors.error : colors.text, fontWeight: '500',
      }}>
        {label}
      </Text>
      {trailing ?? (chevron && (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      ))}
    </Pressable>
  );
}

function PrefLine({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ fontSize: 12, color: colors.textMuted, width: 48 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500', flex: 1 }}>{value}</Text>
    </View>
  );
}
