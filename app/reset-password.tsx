import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { router, useGlobalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

interface FormData {
  password: string;
  confirmPassword: string;
}

export default function ResetPassword() {
  const colors = useTheme();
  const params = useGlobalSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const [success, setSuccess] = useState(false);

  const { control, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    defaultValues: { password: '', confirmPassword: '' },
  });

  // Extract tokens from the URL or check if session is already set
  useEffect(() => {
    async function initializeSession() {
      try {
        // First check if Supabase already set the session automatically
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Session already exists (Supabase auto-loaded it)
          setLoading(false);
          return;
        }

        // Try to get the initial URL (for cold start)
        const initialUrl = await Linking.getInitialURL();
        const urlToUse = initialUrl || (typeof params.token === 'string' ? params.token : null);

        console.log('Reset password URL:', urlToUse);

        if (!urlToUse) {
          setTokenError(true);
          setLoading(false);
          return;
        }

        // Parse tokens from URL (could be in hash or query params)
        let accessToken: string | null = null;
        let refreshToken: string | null = null;

        // Try fragment/hash first (mori://reset-password#access_token=xxx&refresh_token=yyy)
        const hashIndex = urlToUse.indexOf('#');
        if (hashIndex > -1) {
          const hash = urlToUse.substring(hashIndex + 1);
          const params = new URLSearchParams(hash);
          accessToken = params.get('access_token');
          refreshToken = params.get('refresh_token');
          console.log('Parsed from hash:', { accessToken, refreshToken });
        }

        // Try query params as fallback (mori://reset-password?access_token=xxx&refresh_token=yyy)
        if (!accessToken) {
          const queryIndex = urlToUse.indexOf('?');
          if (queryIndex > -1) {
            const query = urlToUse.substring(queryIndex + 1);
            const params = new URLSearchParams(query);
            accessToken = params.get('access_token');
            refreshToken = params.get('refresh_token');
            console.log('Parsed from query:', { accessToken, refreshToken });
          }
        }

        if (!accessToken || !refreshToken) {
          console.log('No tokens found in URL');
          setTokenError(true);
          setLoading(false);
          return;
        }

        // Set the session with the tokens from the reset email
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error('Failed to set session:', error);
          setTokenError(true);
        }
      } catch (err) {
        console.error('Failed to initialize session:', err);
        setTokenError(true);
      } finally {
        setLoading(false);
      }
    }

    initializeSession();
  }, []);

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Token error state
  if (tokenError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.card,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="alert-circle" size={48} color={colors.error} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              This link has expired
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              Password reset links expire after 1 hour. Please request a new one.
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
          <Pressable
            onPress={() => router.push('/onboarding/account?signin=1')}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
              Request New Link
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Success state
  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.card,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              Password updated!
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              Your password has been reset successfully.
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
          <Pressable
            onPress={() => router.replace('/(tabs)/discover')}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
              Continue to App
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Password form
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          Set new password
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          Enter a strong password to protect your account.
        </Text>

        <View style={{ gap: 16 }}>
          <View>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              New Password
            </Text>
            <Controller
              control={control}
              name="password"
              rules={{
                required: 'Password is required',
                minLength: { value: 8, message: 'Minimum 8 characters' },
              }}
              render={({ field: { onChange, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder="Minimum 8 characters"
                  secureTextEntry
                  autoComplete="new-password"
                  style={{
                    backgroundColor: colors.card,
                    borderColor: errors.password ? colors.error : colors.border,
                    borderWidth: 1.5,
                    borderRadius: 14,
                    padding: 16,
                    fontSize: 16,
                    color: colors.text,
                  }}
                />
              )}
            />
            {errors.password && (
              <Text style={{ color: colors.error, fontSize: 13, marginTop: 4 }}>
                {errors.password.message}
              </Text>
            )}
          </View>

          <View>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              Confirm Password
            </Text>
            <Controller
              control={control}
              name="confirmPassword"
              rules={{
                required: 'Please confirm your password',
                validate: (v) => v === getValues('password') || 'Passwords do not match',
              }}
              render={({ field: { onChange, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  placeholder="Re-enter your password"
                  secureTextEntry
                  autoComplete="new-password"
                  style={{
                    backgroundColor: colors.card,
                    borderColor: errors.confirmPassword ? colors.error : colors.border,
                    borderWidth: 1.5,
                    borderRadius: 14,
                    padding: 16,
                    fontSize: 16,
                    color: colors.text,
                  }}
                />
              )}
            />
            {errors.confirmPassword && (
              <Text style={{ color: colors.error, fontSize: 13, marginTop: 4 }}>
                {errors.confirmPassword.message}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          }}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
              Update Password
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
