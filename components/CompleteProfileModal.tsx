import { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { patchProfile } from '@/lib/api';
import type { Profile } from '@/types';

const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
const LOCK_DAYS = 30;

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function CompleteProfileModal({ visible, onDismiss }: Props) {
  const colors = useTheme();
  const { profile, setProfile } = useUserStore();
  const [nameInput, setNameInput] = useState(profile?.name ?? '');
  const [usernameInput, setUsernameInput] = useState(profile?.username ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setNameInput(profile?.name ?? '');
      setUsernameInput(profile?.username ?? '');
      setUsernameError(null);
    }
  }, [visible, profile?.id]);

  const trimmedName = nameInput.trim();
  const trimmedUsername = usernameInput.trim().toLowerCase();
  const usernameFormatValid = USERNAME_REGEX.test(trimmedUsername);
  const showFormatHint = trimmedUsername !== '' && !usernameFormatValid;
  const canSubmit = useMemo(
    () => trimmedName.length > 0 && usernameFormatValid && !saving,
    [trimmedName, usernameFormatValid, saving],
  );

  async function handleSave() {
    if (!profile?.id || !canSubmit) return;
    setSaving(true);
    setUsernameError(null);

    const updates: Partial<Profile> = {};
    if (trimmedName !== (profile.name ?? '')) updates.name = trimmedName;
    if (trimmedUsername !== (profile.username ?? '')) updates.username = trimmedUsername;

    try {
      const updated = await patchProfile(profile.id, updates);
      setProfile(updated);
      onDismiss();
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          paddingHorizontal: 20,
        }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 22,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 }}>
                Finish your profile
              </Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, lineHeight: 20 }}>
                Pick a display name and a handle so other cooks can recognise you.
              </Text>
            </View>
            <Pressable
              onPress={onDismiss}
              hitSlop={16}
              style={({ pressed }) => ({
                width: 32, height: 32, borderRadius: 16,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: pressed ? colors.border : 'transparent',
              })}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Display Name */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
            }}>
              Display Name
            </Text>
            <View style={{
              backgroundColor: colors.background, borderRadius: 12,
              borderWidth: 1.5, borderColor: colors.border,
              paddingHorizontal: 14, paddingVertical: 12,
            }}>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                autoCapitalize="words"
                style={{ fontSize: 16, color: colors.text, padding: 0 }}
              />
            </View>
          </View>

          {/* Username */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{
              fontSize: 11, fontWeight: '700', color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
            }}>
              Username
            </Text>
            <View style={{
              backgroundColor: colors.background, borderRadius: 12,
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
                Locked for {LOCK_DAYS} days after you set it.
              </Text>
            )}
          </View>

          <Pressable
            onPress={handleSave}
            disabled={!canSubmit}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Save</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
