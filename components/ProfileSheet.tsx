/**
 * ProfileSheet.tsx
 * Bottom sheet that replaces the Profile tab.
 * Opened by tapping the AvatarButton on any screen.
 */
import {
  View, Text, Modal, Pressable, ScrollView, Alert, ActivityIndicator, Switch, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const savedTasteProfile = (profile?.taste_profile as any);
  const [tasteProfile, setTasteProfile] = useState<string | null>(savedTasteProfile?.text ?? null);
  const [tasteLoading, setTasteLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const cardRef = useRef<View>(null);

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
    const baseUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!baseUrl) { console.log('[taste] no baseUrl'); return; }
    setTasteLoading(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
      }
      if (!session?.access_token) {
        console.log('[taste] no auth token');
        return;
      }

      const res = await fetch(`${baseUrl}/api/taste-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      console.log('[taste] response:', res.status);
      if (res.ok && json.tasteProfile) {
        setTasteProfile(json.tasteProfile);
        if (profile) {
          const updatedTp = { text: json.tasteProfile, generated_at: new Date().toISOString() };
          setProfile({ ...profile, taste_profile: updatedTp });
        }
      } else if (json.reason === 'not_enough_data') {
        setTasteProfile('Swipe on a few more recipes — we need at least 5 swipes to build your profile.');
      } else if (res.status === 429) {
        setTasteProfile('Rate limit reached — try again tomorrow.');
      }
    } catch (err) {
      console.log('[taste] error:', err);
    } finally {
      setTasteLoading(false);
    }
  }

  useEffect(() => {
    if (visible && profile?.id) {
      (async () => {
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
            setProfile({ ...profile, taste_profile: freshTp });
          }
          const stale = new Date(freshTp.generated_at) < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
          if (stale) runTasteProfileGeneration(profile.id);
        }
      })();
      getAdventureCardsEnabled().then(setAdventureCards).catch(() => {});
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
                    {profile?.name ?? profile?.email?.split('@')[0] ?? 'Mori User'}
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
                      {/* Quote */}
                      <View style={{ padding: 18, paddingBottom: 14 }}>
                        <Text style={{
                          fontFamily: 'Georgia', fontStyle: 'italic',
                          fontSize: 16, color: colors.text, lineHeight: 24,
                        }}>
                          "{tasteProfile}"
                        </Text>
                      </View>

                      {/* Personality chips */}
                      {getPersonalityChips(profile).length > 0 && (
                        <View style={{
                          flexDirection: 'row', flexWrap: 'wrap', gap: 6,
                          paddingHorizontal: 18, paddingBottom: 14,
                        }}>
                          {getPersonalityChips(profile).map((chip) => (
                            <View key={chip} style={{
                              backgroundColor: colors.primaryLight, borderRadius: 20,
                              paddingHorizontal: 10, paddingVertical: 4,
                            }}>
                              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '500' }}>{chip}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Footer: timestamp + share */}
                      <View style={{
                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        borderTopWidth: 1, borderTopColor: colors.border,
                        paddingHorizontal: 18, paddingVertical: 10,
                      }}>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>
                          {savedTasteProfile?.generated_at ? daysAgoText(savedTasteProfile.generated_at) : ''}
                        </Text>
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
                {editingName ? (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderBottomWidth: 0,
                  }}>
                    <Ionicons name="person-outline" size={20} color={colors.primary} />
                    <TextInput
                      value={nameInput}
                      onChangeText={setNameInput}
                      placeholder="Display name"
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      maxLength={40}
                      style={{
                        flex: 1, marginLeft: 12, fontSize: 15, color: colors.text,
                        borderBottomWidth: 1.5, borderBottomColor: colors.primary,
                        paddingVertical: 2,
                      }}
                    />
                    <Pressable onPress={handleSaveName} hitSlop={8} style={{ marginLeft: 10 }}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => setEditingName(false)} hitSlop={8} style={{ marginLeft: 6 }}>
                      <Ionicons name="close-circle" size={24} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => { setNameInput(profile?.name ?? ''); setEditingName(true); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
                    }}
                  >
                    <Ionicons name="person-outline" size={20} color={colors.primary} />
                    <Text style={{ flex: 1, marginLeft: 12, fontSize: 15, color: colors.text, fontWeight: '500' }}>
                      Display Name
                    </Text>
                    <Text style={{ fontSize: 14, color: profile?.name ? colors.textMuted : colors.primary, fontStyle: profile?.name ? 'normal' : 'italic' }}>
                      {profile?.name ?? 'Set name'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
                  </Pressable>
                )}
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
          </ScrollView>
        </View>
      </Modal>

      {/* Hidden card used for image capture — positioned off-screen */}
      <View ref={cardRef} collapsable={false} style={{
        position: 'absolute', left: -9999, top: 0,
        width: 360, height: 360,
        backgroundColor: '#F8F3EC',
        borderRadius: 24,
        padding: 32,
        justifyContent: 'space-between',
      }}>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, fontWeight: '700', color: '#2E5438' }}>
          mori
        </Text>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 18, color: '#1a1a1a', lineHeight: 28, textAlign: 'center' }}>
          "{tasteProfile}"
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {profile && getPersonalityChips(profile).map((chip) => (
            <View key={chip} style={{ backgroundColor: '#d4e6d8', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: '#2E5438', fontWeight: '500' }}>{chip}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 11, color: '#2E5438', textAlign: 'right', opacity: 0.6 }}>getmori.app</Text>
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
