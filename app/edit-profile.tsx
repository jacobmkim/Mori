import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { supabase } from '@/lib/supabase';
import { patchProfile } from '@/lib/api';
import { validateImageForUpload, ImageValidationError } from '@/lib/imageUpload';
import type { Profile } from '@/types';

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
const LOCK_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getUsernameUnlockDate(p: Profile | null): Date | null {
  if (!p?.username_changed_at) return null;
  const unlocks = new Date(new Date(p.username_changed_at).getTime() + LOCK_DAYS * MS_PER_DAY);
  return unlocks > new Date() ? unlocks : null;
}

function formatUnlockDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function EditProfileScreen() {
  const colors = useTheme();
  const { profile, setProfile } = useUserStore();
  const [nameInput, setNameInput] = useState(profile?.name ?? '');
  const [usernameInput, setUsernameInput] = useState(profile?.username ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const unlockDate = useMemo(() => getUsernameUnlockDate(profile), [profile?.username_changed_at]);
  const isUsernameLocked = unlockDate !== null;

  const initials = profile?.name
    ? profile.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : null;

  const trimmedUsername = usernameInput.trim().toLowerCase();
  const trimmedName = nameInput.trim();
  const usernameDirty = trimmedUsername !== (profile?.username ?? '');
  const nameDirty = trimmedName !== (profile?.name ?? '');
  const isDirty = usernameDirty || nameDirty;

  const usernameFormatValid =
    trimmedUsername === '' || USERNAME_REGEX.test(trimmedUsername);
  const showFormatHint =
    usernameDirty && trimmedUsername !== '' && !usernameFormatValid;

  async function handlePickAvatar() {
    if (!profile?.id || avatarLoading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setLocalAvatarUri(uri); // show immediately before upload
    setAvatarLoading(true);
    try {
      // Avatars are tightly cropped + 1:1 + quality 0.7 → 2 MB cap is plenty.
      const { data, contentType } = await validateImageForUpload(uri, 2 * 1024 * 1024);
      const path = `${profile.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, data, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatar_url = `${urlData.publicUrl}?t=${Date.now()}`;
      const updated = await patchProfile(profile.id, { avatar_url });
      setProfile(updated);
    } catch (err) {
      setLocalAvatarUri(null); // revert preview on failure
      if (err instanceof ImageValidationError) {
        Alert.alert('Image not supported', err.userMessage);
      } else {
        Alert.alert('Upload failed', 'Could not save profile picture. Try again.');
      }
    } finally {
      setAvatarLoading(false);
    }
  }

  async function handleSave() {
    if (!profile || !isDirty || saving) return;

    const updates: Partial<Profile> = {};
    if (nameDirty) updates.name = trimmedName;

    if (usernameDirty) {
      if (trimmedUsername === '') {
        updates.username = null;
      } else if (!USERNAME_REGEX.test(trimmedUsername)) {
        setUsernameError('3–30 chars, lowercase letters, numbers, and underscores only.');
        return;
      } else {
        updates.username = trimmedUsername;
      }
    }

    setSaving(true);
    setUsernameError(null);
    try {
      const updated = await patchProfile(profile.id, updates);
      setProfile(updated);
      router.back();
    } catch (err: any) {
      const code = err?.code ?? '';
      const msg = String(err?.message ?? '');
      if (code === '23505' || msg.includes('profiles_username_unique')) {
        setUsernameError(`@${trimmedUsername} is already taken.`);
      } else if (msg.includes('username_rate_limit')) {
        setUsernameError(`Username locked — you can change it again in ${LOCK_DAYS} days.`);
      } else if (msg.includes('profiles_username_format')) {
        setUsernameError('3–30 chars, lowercase letters, numbers, and underscores only.');
      } else {
        Alert.alert('Could not save', 'Try again in a moment.');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isDirty) {
      Alert.alert('Discard changes?', 'You have unsaved changes.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  }

  const saveDisabled = !isDirty || saving || (usernameDirty && !usernameFormatValid);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.card,
      }}>
        <Pressable onPress={handleCancel} hitSlop={8}>
          <Text style={{ fontSize: 15, color: colors.textMuted }}>Cancel</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>Edit Profile</Text>
        <Pressable onPress={handleSave} hitSlop={8} disabled={saveDisabled}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={{
              fontSize: 15, fontWeight: '600',
              color: saveDisabled ? colors.textMuted : colors.primary,
            }}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar block */}
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Pressable onPress={handlePickAvatar} disabled={avatarLoading}>
              <View style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: colors.primary,
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {(localAvatarUri ?? profile?.avatar_url) ? (
                  <Image
                    source={{ uri: localAvatarUri ?? profile!.avatar_url! }}
                    style={{ width: 96, height: 96, borderRadius: 48 }}
                    contentFit="cover"
                    cachePolicy="none"
                  />
                ) : initials ? (
                  <Text style={{ color: 'white', fontSize: 32, fontWeight: '700' }}>{initials}</Text>
                ) : (
                  <Ionicons name="person" size={44} color="white" />
                )}
              </View>
              {/* Camera badge */}
              <View style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: colors.primary,
                borderWidth: 3, borderColor: colors.background,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {avatarLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="camera" size={16} color="white" />
                )}
              </View>
            </Pressable>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 12 }}>
              Tap to change profile picture
            </Text>
          </View>

          {/* Display Name */}
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
            }}>
              Display Name
            </Text>
            <View style={{
              backgroundColor: colors.card, borderRadius: 12,
              borderWidth: 1, borderColor: colors.border,
              paddingHorizontal: 14, paddingVertical: 12,
            }}>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                style={{ fontSize: 16, color: colors.text, padding: 0 }}
              />
            </View>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 6, marginLeft: 4 }}>
              Shown on your saved recipes and profile.
            </Text>
          </View>

          {/* Username */}
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
            }}>
              Username
            </Text>

            {isUsernameLocked ? (
              <View style={{
                backgroundColor: colors.warningBg, borderRadius: 12,
                borderWidth: 1, borderColor: colors.warning,
                paddingHorizontal: 14, paddingVertical: 14,
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              }}>
                <Ionicons name="lock-closed" size={18} color={colors.text} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 }}>
                    @{profile?.username} (locked)
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 17 }}>
                    Usernames can only be changed once every {LOCK_DAYS} days. You can change yours
                    again on {formatUnlockDate(unlockDate!)}.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={{
                  backgroundColor: colors.card, borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: showFormatHint || usernameError ? colors.error : colors.border,
                  paddingHorizontal: 14, paddingVertical: 12,
                  flexDirection: 'row', alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 16, color: colors.textMuted, marginRight: 2 }}>@</Text>
                  <TextInput
                    value={usernameInput}
                    onChangeText={(t) => {
                      // Force lowercase + strip invalid chars to guide user
                      setUsernameInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                      setUsernameError(null);
                    }}
                    placeholder="your_handle"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    style={{ flex: 1, fontSize: 16, color: colors.text, padding: 0 }}
                  />
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    {trimmedUsername.length}/30
                  </Text>
                </View>

                {/* Helper / error line */}
                {usernameError ? (
                  <Text style={{ fontSize: 12, color: colors.error, marginTop: 6, marginLeft: 4 }}>
                    {usernameError}
                  </Text>
                ) : showFormatHint ? (
                  <Text style={{ fontSize: 12, color: colors.error, marginTop: 6, marginLeft: 4 }}>
                    3–30 chars, lowercase letters, numbers, and underscores only.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 6, marginLeft: 4 }}>
                    3–30 characters · lowercase letters, numbers, underscores. Visible on your
                    public recipes.
                  </Text>
                )}

                {/* Rate-limit warning when first setting */}
                {!profile?.username && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                    marginTop: 10, paddingHorizontal: 4,
                  }}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 11, color: colors.textMuted, flex: 1, lineHeight: 16 }}>
                      Choose carefully — you can only change your username once every {LOCK_DAYS} days.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
