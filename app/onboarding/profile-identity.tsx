import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import { useUserStore } from '@/stores/userStore';
import { patchProfile } from '@/lib/api';
import ProgressBar from '@/components/onboarding/ProgressBar';

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
const LOCK_DAYS = 30;

export default function ProfileIdentity() {
  const { profile, setProfile } = useUserStore();
  const [nameInput, setNameInput] = useState(profile?.name ?? '');
  const [usernameInput, setUsernameInput] = useState(profile?.username ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmedName = nameInput.trim();
  const trimmedUsername = usernameInput.trim().toLowerCase();
  const usernameFormatValid = USERNAME_REGEX.test(trimmedUsername);
  const showFormatHint = trimmedUsername !== '' && !usernameFormatValid;
  const canSubmit = useMemo(
    () => trimmedName.length > 0 && usernameFormatValid && !saving,
    [trimmedName, usernameFormatValid, saving],
  );

  async function handleContinue() {
    if (!profile?.id || !canSubmit) return;
    setSaving(true);
    setUsernameError(null);
    try {
      const updated = await patchProfile(profile.id, {
        name: trimmedName,
        username: trimmedUsername,
      });
      setProfile(updated);
      router.push('/onboarding/pantry');
    } catch (err: any) {
      const code = err?.code ?? '';
      const msg = String(err?.message ?? '');
      if (code === '23505' || msg.includes('profiles_username_unique')) {
        setUsernameError(`@${trimmedUsername} is already taken.`);
      } else if (msg.includes('profiles_username_format')) {
        setUsernameError('3–30 chars, lowercase letters, numbers, and underscores only.');
      } else {
        setUsernameError('Could not save. Try again in a moment.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <ProgressBar current={9} total={10} />

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
              Step 09 · Identity
            </Text>
            <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
              What should we call you?
            </Text>
            <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
              Pick a display name and a handle. Both show up on recipes you share.
            </Text>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 8 }}>
                Display Name
              </Text>
              <View style={{
                backgroundColor: colors.card, borderRadius: 12,
                borderWidth: 1.5, borderColor: colors.border,
                paddingHorizontal: 14, paddingVertical: 12,
              }}>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Your name"
                  placeholderTextColor={colors.textSubtle}
                  maxLength={40}
                  autoCapitalize="words"
                  style={{ fontSize: 16, color: colors.text, padding: 0, fontFamily: 'System' }}
                />
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 8 }}>
                Username
              </Text>
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
                    setUsernameInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                    setUsernameError(null);
                  }}
                  placeholder="your_handle"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  style={{ flex: 1, fontSize: 16, color: colors.text, padding: 0, fontFamily: 'System' }}
                />
                <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'System' }}>
                  {trimmedUsername.length}/30
                </Text>
              </View>

              {usernameError ? (
                <Text style={{ fontSize: 12, color: colors.error, marginTop: 6, marginLeft: 4, fontFamily: 'System' }}>
                  {usernameError}
                </Text>
              ) : showFormatHint ? (
                <Text style={{ fontSize: 12, color: colors.error, marginTop: 6, marginLeft: 4, fontFamily: 'System' }}>
                  3–30 chars, lowercase letters, numbers, and underscores only.
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 6, marginLeft: 4, fontFamily: 'System' }}>
                  3–30 characters · lowercase letters, numbers, underscores.
                </Text>
              )}
            </View>

            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 8,
              backgroundColor: colors.infoBg, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 10,
            }}>
              <Ionicons name="information-circle-outline" size={16} color={colors.info} style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 12, color: colors.info, flex: 1, lineHeight: 17, fontFamily: 'System' }}>
                Choose carefully — usernames can only be changed once every {LOCK_DAYS} days.
              </Text>
            </View>
          </ScrollView>

          <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, backgroundColor: colors.background }}>
            <Pressable
              onPress={handleContinue}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                backgroundColor: pressed && canSubmit ? colors.primaryDeep : colors.primary,
                borderRadius: 14,
                paddingVertical: 18,
                alignItems: 'center',
                opacity: canSubmit ? 1 : 0.5,
              })}
            >
              {saving ? (
                <ActivityIndicator color={colors.inverse} />
              ) : (
                <Text style={{ ...TYPE.cta, color: colors.inverse }}>Continue</Text>
              )}
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
