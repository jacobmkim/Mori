/**
 * ProfileSheet.tsx
 * Bottom sheet that replaces the Profile tab.
 * Opened by tapping the AvatarButton on any screen.
 */
import {
  View, Text, Modal, Pressable, ScrollView, Alert, ActivityIndicator, Switch,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState, useEffect, useRef } from 'react';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { useLeftoversStore } from '@/stores/leftoversStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useDiscoverStore, type AppearanceMode, type UnitSystem } from '@/stores/discoverStore';
import { supabase } from '@/lib/supabase';
import {
  patchProfile, clearDiscoverCache,
  getAdventureCardsEnabled, setAdventureCardsEnabled,
  getProfile, fetchBadgeStats, getEffectiveStreak,
  deleteMyAccount,
} from '@/lib/api';
import { clearRecipeCache } from '@/lib/mealdb';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { computeBadges, getShowcaseBadges } from '@/lib/badges';
import type { Badge, BadgeStats } from '@/lib/badges';
import type { Profile } from '@/types';
import { EditPreferencesModal } from '@/components/EditPreferencesModal';
import { PantryModal } from '@/components/PantryModal';
import { BadgeGrid } from '@/components/badges/BadgeGrid';
import { BadgeItem } from '@/components/badges/BadgeItem';
import { BadgeAchievementModal } from '@/components/badges/BadgeAchievementModal';
import { BADGE_CATEGORY_LABELS } from '@/components/badges/badgeData';

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
  vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian', gluten_free: 'Gluten Free',
  dairy_free: 'Dairy Free', keto: 'Keto', paleo: 'Paleo', nut_free: 'Nut Free',
};

const CUISINE_CHIPS: Record<string, string> = {
  italian: '🍝 Italian', japanese: '🍱 Japanese', mexican: '🌮 Mexican',
  indian: '🍛 Indian', chinese: '🥢 Chinese', korean: '🥩 Korean',
  thai: '🍜 Thai', mediterranean: '🫒 Mediterranean', american: '🍔 American',
  french: '🥐 French', greek: '🫙 Greek', spanish: '🥘 Spanish',
};
const GOAL_CHIPS: Record<string, string> = {
  high_protein: '💪 High Protein', vegetarian: '🌱 Vegetarian', vegan: '🌿 Vegan',
  low_carb: '🔥 Low Carb', keto: '🥑 Keto', gluten_free: '🌾 Gluten Free',
  dairy_free: '🥛 Dairy Free', nut_free: '🥜 Nut Free',
};
const STYLE_CHIPS: Record<string, string> = {
  quick_simple: '⚡ Quick Cook', variety: '🌍 Always Exploring', favourites_rotation: '♻️ Comfort Cook',
};

function getPersonalityChips(profile: Profile): string[] {
  const chips: string[] = [];
  if (profile.eating_style && STYLE_CHIPS[profile.eating_style]) {
    chips.push(STYLE_CHIPS[profile.eating_style]);
  }
  (profile.cuisine_preferences ?? []).slice(0, 2).forEach((c) => {
    if (CUISINE_CHIPS[c]) chips.push(CUISINE_CHIPS[c]);
  });
  (profile.dietary_goals ?? []).slice(0, 2).forEach((g) => {
    if (GOAL_CHIPS[g]) chips.push(GOAL_CHIPS[g]);
  });
  return chips.slice(0, 4);
}

function daysAgoText(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  return `Updated ${days}d ago`;
}

export function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const { profile, setProfile } = useUserStore();
  const savedCount = useSavedStore((s) => s.savedRecipes.length);
  const { appearanceMode, setAppearanceMode, unitSystem, setUnitSystem } = useDiscoverStore();
  const [editVisible, setEditVisible] = useState(false);
  const [pantryVisible, setPantryVisible] = useState(false);
  const [adventureCards, setAdventureCards] = useState(true);
  const savedTasteProfile = (profile?.taste_profile as any);
  const [tasteProfile, setTasteProfile] = useState<string | null>(savedTasteProfile?.text ?? null);
  const [flavourDna, setFlavourDna] = useState<Record<string, { score: number; note: string }> | null>(savedTasteProfile?.flavourDna ?? null);
  const [tasteLoading, setTasteLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const cardRef = useRef<View>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'badges'>('overview');
  const [badgeStats, setBadgeStats] = useState<BadgeStats>({
    totalCooked: 0, longestStreak: 0, distinctCuisines: 0, cookedMealPrep: false, recipesSubmitted: 0,
  });
  const [previewQueue, setPreviewQueue] = useState<Badge[]>([]);
  const [deleteVisible, setDeleteVisible] = useState(false);

  async function handleShareImage() {
    if (!cardRef.current || !tasteProfile) return;
    setShareLoading(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your taste profile' });
      } else {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert('Saved!', 'Taste profile card saved to your photos.');
        }
      }
    } catch (err) {
      Alert.alert('Could not share', 'Try again in a moment.');
    } finally {
      setShareLoading(false);
    }
  }

  async function runTasteProfileGeneration(userId: string) {
    setTasteLoading(true);

    let session: any = null;
    try {
      const { data: refreshData } = await supabase.auth.refreshSession();
      session = refreshData.session ?? (await supabase.auth.getSession()).data.session;
    } catch (err: any) {
      setTasteProfile(`Auth error — ${err?.message ?? 'could not refresh session'}.`);
      setTasteLoading(false);
      return;
    }

    if (!session?.access_token) {
      setTasteProfile('Could not authenticate — try signing out and back in.');
      setTasteLoading(false);
      return;
    }

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/taste-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });
      const raw = await res.text();
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        setTasteProfile(`API returned non-JSON (${res.status}): ${raw.slice(0, 120)}`);
        return;
      }
      if (res.ok && json.tasteProfile) {
        setTasteProfile(json.tasteProfile);
        if (json.flavourDna) setFlavourDna(json.flavourDna);
        if (profile) {
          const updatedTp = { text: json.tasteProfile, flavourDna: json.flavourDna, generated_at: new Date().toISOString() };
          setProfile({ ...profile, taste_profile: updatedTp });
        }
      } else if (json.reason === 'not_enough_data') {
        setTasteProfile('Swipe on a few more recipes — we need at least 5 swipes to build your profile.');
      } else if (res.status === 429) {
        setTasteProfile('Rate limit reached — try again tomorrow.');
      } else {
        setTasteProfile(`Could not generate profile (${res.status}) — try again later.`);
      }
    } catch (err: any) {
      setTasteProfile(`Fetch error — ${err?.message ?? 'unknown'}.`);
    } finally {
      setTasteLoading(false);
    }
  }

  useEffect(() => {
    if (visible && profile?.id) {
      (async () => {
        // Refresh full profile so streak/count fields are current
        const fresh = await getProfile(profile.id).catch(() => null);
        if (fresh) {
          setProfile(fresh);
        }

        // Always fetch fresh taste_profile from DB — catches clears and cross-device updates
        const { data } = await supabase
          .from('profiles')
          .select('taste_profile')
          .eq('id', profile.id)
          .single();

        const freshTp = data?.taste_profile as any;
        if (!freshTp?.text || !freshTp?.generated_at) {
          runTasteProfileGeneration(profile.id);
        } else {
          if (freshTp.text !== tasteProfile) {
            setTasteProfile(freshTp.text);
            setFlavourDna(freshTp.flavourDna ?? null);
            setProfile({ ...profile, taste_profile: freshTp });
          }
          const stale = new Date(freshTp.generated_at) < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
          const missingDna = !freshTp.flavourDna;
          if (stale || missingDna) runTasteProfileGeneration(profile.id);
        }
      })();
      getAdventureCardsEnabled().then(setAdventureCards).catch(() => {});

      // Badge stats
      setActiveTab('overview');
      const knownStats = {
        longestStreak: profile.longest_streak ?? 0,
        recipesSubmitted: profile.recipes_submitted_count ?? 0,
      };
      const initialStats: BadgeStats = {
        totalCooked: profile.meals_cooked_count ?? 0,
        longestStreak: knownStats.longestStreak,
        distinctCuisines: 0, cookedMealPrep: false,
        recipesSubmitted: knownStats.recipesSubmitted,
      };
      setBadgeStats(initialStats);
      fetchBadgeStats(profile.id, knownStats).then(setBadgeStats).catch(() => {});
    }
  }, [visible, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    onClose();
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setProfile(null);
          useLeftoversStore.getState().reset();
          useGroceryStore.getState().clearAll();
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
                  overflow: 'hidden',
                }}>
                  {profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={{ width: 48, height: 48, borderRadius: 24 }}
                      contentFit="cover"
                    />
                  ) : initials ? (
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>{initials}</Text>
                  ) : (
                    <Ionicons name="person" size={22} color="white" />
                  )}
                </View>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
                    {profile?.name ?? (profile as any)?.email?.split('@')[0] ?? 'Mori User'}
                  </Text>
                  {profile?.username && (
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                      @{profile.username}
                    </Text>
                  )}
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>
                    {savedCount} recipe{savedCount !== 1 ? 's' : ''} saved
                  </Text>
                  {getEffectiveStreak(profile?.current_streak, profile?.last_cooked_date) > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Text style={{ fontSize: 13 }}>🔥</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                        {getEffectiveStreak(profile?.current_streak, profile?.last_cooked_date)}-day streak
                      </Text>
                    </View>
                  )}
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

            {/* Stats */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingTop: 16, marginBottom: 16 }}>
              {(() => {
                const effectiveStreak = getEffectiveStreak(profile?.current_streak, profile?.last_cooked_date);
                const streakBroken = effectiveStreak === 0;
                return [
                  { label: 'Meals', value: profile?.meals_cooked_count ?? 0, icon: 'restaurant', dim: false },
                  { label: 'Saved', value: savedCount, icon: 'heart', dim: false },
                  { label: 'Streak', value: effectiveStreak > 0 ? `${effectiveStreak}d` : '0', icon: streakBroken ? 'flame-outline' : 'flame', dim: streakBroken },
                  { label: 'Best', value: (profile?.longest_streak ?? 0) > 0 ? `${profile!.longest_streak}d` : '—', icon: 'trophy-outline', dim: false },
                ];
              })().map((stat) => (
                <View key={stat.label} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name={stat.icon as any} size={16} color={stat.dim ? colors.textMuted : colors.primary} />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: stat.dim ? colors.textMuted : colors.text, marginTop: 4 }}>{stat.value}</Text>
                  <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {/* Top badge showcase — one per category */}
            {(() => {
              const showcase = getShowcaseBadges(badgeStats);
              return (
                <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, paddingHorizontal: 8 }}>
                    {showcase.map((badge) => (
                      <View key={badge.id} style={{ alignItems: 'center', gap: 6 }}>
                        <BadgeItem
                          badge={badge}
                          size={52}
                          showName={false}
                          onPress={() => setPreviewQueue([badge])}
                        />
                        <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '500', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                          {BADGE_CATEGORY_LABELS[badge.category]}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Tab bar */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 20, gap: 8 }}>
              {(['overview', 'badges'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: activeTab === tab ? colors.primary : colors.card,
                    borderWidth: 1.5,
                    borderColor: activeTab === tab ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: activeTab === tab ? 'white' : colors.textMuted }}>
                    {tab === 'overview' ? 'Overview' : 'Badges'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Badges tab */}
            {activeTab === 'badges' && (
              <BadgeGrid
                stats={badgeStats}
                scrollEnabled={false}
                onBadgePress={(badge) => setPreviewQueue([badge])}
              />
            )}

            {/* Taste Profile */}
            {activeTab === 'overview' && profile && (
              <View style={{ paddingHorizontal: 16, paddingTop: 4, marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Taste Profile</Text>
                </View>

                <View style={{
                  backgroundColor: colors.card, borderRadius: 16,
                  borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
                }}>
                  {tasteLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18 }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ fontSize: 13, color: colors.textMuted }}>Building your taste profile...</Text>
                    </View>
                  ) : tasteProfile ? (
                    <>
                      {/* Flavour DNA bars */}
                      {flavourDna && (
                        <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
                            Flavour DNA
                          </Text>
                          {(['explorer', 'committed', 'speed', 'planner', 'devoted'] as const).map((dim) => {
                            const d = flavourDna[dim];
                            if (!d) return null;
                            const barColor = d.score >= 70 ? '#1E4D35' : d.score >= 40 ? '#52B788' : '#E8854A';
                            return (
                              <View key={dim} style={{ marginBottom: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                  <Text style={{ fontSize: 10, color: colors.text, fontWeight: '600', width: 72, textTransform: 'capitalize' }}>{dim}</Text>
                                  <View style={{ flex: 1, height: 5, backgroundColor: colors.border, borderRadius: 3 }}>
                                    <View style={{ width: `${d.score}%`, height: '100%', backgroundColor: barColor, borderRadius: 3 }} />
                                  </View>
                                  <Text style={{ fontSize: 9, color: colors.textMuted, width: 28, textAlign: 'right' }}>{d.score}%</Text>
                                </View>
                                <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 11, color: colors.textMuted, paddingLeft: 80, lineHeight: 15 }}>
                                  {d.note}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Mori says */}
                      <View style={{
                        borderTopWidth: flavourDna ? 1 : 0, borderTopColor: colors.border,
                        paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14,
                      }}>
                        {flavourDna && (
                          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                            Mori Says
                          </Text>
                        )}
                        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15, color: colors.text, lineHeight: 22 }}>
                          "{tasteProfile}"
                        </Text>
                      </View>

                      {/* Footer: timestamp + refresh + share */}
                      <View style={{
                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        borderTopWidth: 1, borderTopColor: colors.border,
                        paddingHorizontal: 18, paddingVertical: 10,
                      }}>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>
                          {savedTasteProfile?.generated_at ? daysAgoText(savedTasteProfile.generated_at) : ''}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <Pressable
                            onPress={() => profile?.id && runTasteProfileGeneration(profile.id)}
                            disabled={tasteLoading}
                            hitSlop={8}
                          >
                            <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
                          </Pressable>
                          <Pressable
                            onPress={handleShareImage}
                            disabled={shareLoading}
                            hitSlop={8}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          >
                            {shareLoading
                              ? <ActivityIndicator size="small" color={colors.primary} />
                              : <Ionicons name="share-outline" size={14} color={colors.primary} />
                            }
                            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '500' }}>Share</Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  ) : (
                    <View style={{ padding: 18 }}>
                      <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 20 }}>
                        Swipe on a few recipes in Discover and we'll learn your taste.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {activeTab === 'overview' && (<>

            {/* Account */}
            <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', color: colors.textMuted,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
              }}>
                Account
              </Text>
              <View style={{
                backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
              }}>
                <SheetRow
                  icon="person-circle-outline"
                  label="Edit Profile"
                  onPress={() => { onClose(); setTimeout(() => router.push('/edit-profile' as any), 300); }}
                  last
                />
              </View>
            </View>

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
                  icon="help-circle-outline"
                  label="Help & Support"
                  onPress={() => { onClose(); setTimeout(() => router.push('/help' as any), 300); }}
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

            {/* Appearance */}
            <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', color: colors.textMuted,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
              }}>
                Appearance
              </Text>
              <View style={{
                backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1, borderColor: colors.border, padding: 14,
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

            {/* Measurement */}
            <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', color: colors.textMuted,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
              }}>
                Measurement
              </Text>
              <View style={{
                backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1, borderColor: colors.border, padding: 14,
              }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([['us', 'US', 'cups / oz / lb'], ['metric', 'Metric', 'ml / g / kg']] as [UnitSystem, string, string][]).map(([opt, label, sub]) => (
                    <Pressable
                      key={opt}
                      onPress={() => setUnitSystem(opt)}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                        backgroundColor: unitSystem === opt ? colors.primary : colors.background,
                        borderWidth: 1.5,
                        borderColor: unitSystem === opt ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{
                        fontSize: 14, fontWeight: '700',
                        color: unitSystem === opt ? 'white' : colors.text,
                        marginBottom: 2,
                      }}>
                        {label}
                      </Text>
                      <Text style={{
                        fontSize: 11,
                        color: unitSystem === opt ? 'rgba(255,255,255,0.8)' : colors.textMuted,
                      }}>
                        {sub}
                      </Text>
                    </Pressable>
                  ))}
                </View>
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

            {/* Danger zone — Delete Account at the very bottom */}
            <View style={{ paddingHorizontal: 16, marginBottom: 8, marginTop: 8 }}>
              <View style={{
                backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
              }}>
                <SheetRow
                  icon="trash-outline"
                  label="Delete Account"
                  destructive
                  onPress={() => { onClose(); setTimeout(() => setDeleteVisible(true), 300); }}
                  last
                />
              </View>
              <Text style={{
                fontSize: 11, color: colors.textMuted, textAlign: 'center',
                marginTop: 10, paddingHorizontal: 12, lineHeight: 16,
              }}>
                Permanently removes your account and all data. This cannot be undone.
              </Text>
            </View>
            </>)}
          </ScrollView>
        </View>

        {/* Badge preview modal — inside pageSheet so it stacks correctly on iOS */}
        <BadgeAchievementModal
          queue={previewQueue}
          onQueueChange={setPreviewQueue}
          previewMode
        />
      </Modal>

      {/* Hidden card used for image capture — positioned off-screen */}
      <View ref={cardRef} collapsable={false} style={{
        position: 'absolute', left: -9999, top: 0,
        width: 300, height: 533,
        backgroundColor: '#F8F4ED',
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: '#2D6A4F',
        padding: 26,
        justifyContent: 'space-between',
      }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#2D6A4F', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 3 }}>taste profile</Text>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15, color: '#1E4D35', fontWeight: '700' }}>mori</Text>
          </View>
          <View style={{ backgroundColor: '#1E4D35', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#95D5B2', letterSpacing: 1 }}>
              {new Date().toLocaleString('default', { month: 'short' }).toLowerCase()} {new Date().getFullYear()}
            </Text>
          </View>
        </View>

        {/* DNA bars */}
        {flavourDna && (
          <View style={{ borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#2D6A4F', paddingVertical: 14 }}>
            <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#7A7468', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>your flavour dna</Text>
            {(['explorer', 'committed', 'speed', 'planner', 'devoted'] as const).map((dim) => {
              const d = flavourDna[dim];
              if (!d) return null;
              const barColor = d.score >= 70 ? '#1E4D35' : d.score >= 40 ? '#52B788' : '#E8854A';
              return (
                <View key={dim} style={{ marginBottom: 9 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <Text style={{ fontSize: 10, color: '#2C2C24', fontFamily: 'monospace', width: 70 }}>{dim}</Text>
                    <View style={{ flex: 1, height: 5, backgroundColor: '#E8DDD0', borderRadius: 3 }}>
                      <View style={{ width: `${d.score}%`, height: 5, backgroundColor: barColor, borderRadius: 3 }} />
                    </View>
                    <Text style={{ fontSize: 9, color: '#7A7468', fontFamily: 'monospace', width: 30, textAlign: 'right' }}>{d.score}%</Text>
                  </View>
                  <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 9, color: '#7A7468', paddingLeft: 78, lineHeight: 13 }}>{d.note}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Mori says */}
        <View>
          <Text style={{ fontSize: 9, fontFamily: 'monospace', color: '#7A7468', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>mori says</Text>
          <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 12, color: '#1E4D35', lineHeight: 18 }}>
            "{tasteProfile}"
          </Text>
        </View>

        {/* Footer */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 8, fontFamily: 'monospace', color: '#7A7468', letterSpacing: 1 }}>getmori.app</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#1E4D35', opacity: 0.8 }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#52B788', opacity: 0.5 }} />
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8854A', opacity: 0.5 }} />
          </View>
        </View>
      </View>

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
      <DeleteAccountModal
        visible={deleteVisible}
        onClose={() => setDeleteVisible(false)}
        onDeleted={() => {
          setDeleteVisible(false);
          setProfile(null);
          useLeftoversStore.getState().reset();
          useGroceryStore.getState().clearAll();
          onClose();
          router.replace('/onboarding/welcome');
        }}
      />
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

function DeleteAccountModal({
  visible, onClose, onDeleted,
}: { visible: boolean; onClose: () => void; onDeleted: () => void }) {
  const colors = useTheme();
  const [step, setStep] = useState<'warn' | 'confirm'>('warn');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (visible) {
      setStep('warn');
      setPassword('');
      setErr(null);
      setBusy(false);
    }
  }, [visible]);

  async function handleDelete() {
    if (!password) {
      setErr('Enter your password to confirm.');
      return;
    }
    setBusy(true);
    setErr(null);
    const result = await deleteMyAccount(password);
    setBusy(false);
    if (result.ok) {
      onDeleted();
      return;
    }
    if (result.reason === 'wrong_password') setErr('Incorrect password. Try again.');
    else if (result.reason === 'rate_limited') setErr('Too many attempts. Try again later.');
    else if (result.reason === 'unauthenticated') setErr('Session expired. Sign out and back in, then try again.');
    else setErr('Could not delete account. Email hello@getmori.app for help.');
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
        }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>Delete Account</Text>
          <Pressable onPress={onClose} hitSlop={10} disabled={busy}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {step === 'warn' ? (
            <>
              <View style={{
                backgroundColor: colors.errorBg, borderRadius: 12, padding: 16, marginBottom: 20,
                borderWidth: 1, borderColor: colors.error,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.error, marginBottom: 8 }}>
                  This action cannot be undone.
                </Text>
                <Text style={{ fontSize: 13, color: colors.text, lineHeight: 20 }}>
                  Deleting your account will immediately and permanently remove:
                </Text>
              </View>

              <View style={{ marginBottom: 20, gap: 8 }}>
                {[
                  'Your profile, email, and password',
                  'All swipe history and saved recipes',
                  'Your meal plans, pantry, and grocery lists',
                  'Your notes, reviews, and badges',
                  'Recipes you submitted to the community (de-attributed and retired)',
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ color: colors.textMuted }}>•</Text>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 }}>{item}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => setStep('confirm')}
                style={{
                  backgroundColor: colors.error, borderRadius: 12,
                  paddingVertical: 14, alignItems: 'center', marginBottom: 12,
                }}
              >
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
                  Continue
                </Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                style={{
                  backgroundColor: colors.card, borderRadius: 12,
                  borderWidth: 1, borderColor: colors.border,
                  paddingVertical: 14, alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 14, color: colors.text, marginBottom: 8 }}>
                Enter your password to confirm deletion.
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 16, lineHeight: 18 }}>
                We re-verify your password to make sure no one else can delete your account from your unlocked phone.
              </Text>

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                editable={!busy}
                style={{
                  backgroundColor: colors.card, borderRadius: 12,
                  borderWidth: 1, borderColor: colors.border,
                  paddingHorizontal: 14, paddingVertical: 12,
                  fontSize: 15, color: colors.text, marginBottom: 12,
                }}
              />

              {err && (
                <Text style={{ fontSize: 13, color: colors.error, marginBottom: 12 }}>{err}</Text>
              )}

              <Pressable
                onPress={handleDelete}
                disabled={busy}
                style={{
                  backgroundColor: colors.error, borderRadius: 12,
                  paddingVertical: 14, alignItems: 'center', marginBottom: 12,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
                    Delete my account
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={onClose}
                disabled={busy}
                style={{
                  backgroundColor: colors.card, borderRadius: 12,
                  borderWidth: 1, borderColor: colors.border,
                  paddingVertical: 14, alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                  Cancel
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
