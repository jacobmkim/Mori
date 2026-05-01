import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import { Ionicons } from '@expo/vector-icons';

interface FormData {
  email: string;
}

export default function ForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { control, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    defaultValues: { email: '' },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('/reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, { redirectTo });
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView edges={['top']}>
          <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 22, color: colors.text, lineHeight: 22 }}>‹</Text>
              <Text style={{
                fontSize: 11, color: colors.text,
                letterSpacing: 1.6, textTransform: 'uppercase',
                fontFamily: 'System', fontWeight: '600',
              }}>
                Back
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>

        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colors.cardSelected,
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
          </View>
          <Text style={{ ...TYPE.heading, color: colors.text, textAlign: 'center', fontSize: 26, lineHeight: 32 }}>
            Check your inbox
          </Text>
          <Text style={{ ...TYPE.subhead, color: colors.textMuted, textAlign: 'center' }}>
            We sent a password reset link to {watch('email')}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.primaryDeep : colors.primary,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
            })}
          >
            <Text style={{ ...TYPE.cta, color: colors.inverse }}>
              Back to Sign In
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, alignSelf: 'flex-start' }}
          >
            <Text style={{ fontSize: 22, color: colors.text, lineHeight: 22 }}>‹</Text>
            <Text style={{
              fontSize: 11, color: colors.text,
              letterSpacing: 1.6, textTransform: 'uppercase',
              fontFamily: 'System', fontWeight: '600',
            }}>
              Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 28 }}>
        <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
          Reset
        </Text>
        <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
          Forgot password?
        </Text>
        <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
          We'll send a reset link to your email.
        </Text>

        <View>
          <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 8 }}>
            Email
          </Text>
          <Controller
            control={control}
            name="email"
            rules={{
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
            }}
            render={({ field: { onChange, value } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSubtle}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={{
                  backgroundColor: colors.card,
                  borderColor: errors.email ? colors.error : colors.border,
                  borderWidth: 1.5,
                  borderRadius: 14,
                  padding: 16,
                  fontSize: 16,
                  color: colors.text,
                  fontFamily: 'System',
                }}
              />
            )}
          />
          {errors.email && (
            <Text style={{ color: colors.error, fontSize: 13, marginTop: 4, fontFamily: 'System' }}>
              {errors.email.message}
            </Text>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.primaryDeep : colors.primary,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          })}
        >
          {loading ? (
            <ActivityIndicator color={colors.inverse} />
          ) : (
            <Text style={{ ...TYPE.cta, color: colors.inverse }}>
              Send Reset Link
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
