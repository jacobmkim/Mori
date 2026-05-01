import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '@/stores/userStore';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// Soft, dismissible nudge shown above the Discover deck for users who
// haven't verified their email yet. Verification is non-blocking — this
// banner is the only surface that mentions it.

export function EmailVerifyBanner() {
  const colors = useTheme();
  const profile = useUserStore((s) => s.profile);
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);

  if (!profile || profile.email_verified_at || dismissed) return null;

  async function resend() {
    setResending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Not signed in', 'Sign in to resend the verification email.');
        return;
      }
      const res = await fetch(`${getApiBaseUrl()}/api/send-welcome-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        Alert.alert('Sent', 'Check your inbox for a new verification link.');
      } else if (res.status === 429) {
        Alert.alert('Too many requests', 'Wait a bit before requesting another link.');
      } else {
        Alert.alert('Error', "Couldn't resend. Try again in a moment.");
      }
    } catch {
      Alert.alert('Error', 'Network error. Try again in a moment.');
    } finally {
      setResending(false);
    }
  }

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 4,
        backgroundColor: colors.card,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Ionicons name="mail-outline" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
          Verify your email
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
          Check the welcome email we sent for the verify link.
        </Text>
      </View>
      <Pressable
        onPress={resend}
        disabled={resending}
        hitSlop={8}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: colors.primary,
          opacity: resending ? 0.6 : 1,
        }}
      >
        {resending ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>
            Resend
          </Text>
        )}
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
