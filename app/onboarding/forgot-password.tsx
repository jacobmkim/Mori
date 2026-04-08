import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

interface FormData {
  email: string;
}

export default function ForgotPassword() {
  const colors = useTheme();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { control, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    defaultValues: { email: '' },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: 'mori://reset-password',
      });
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
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              Check your inbox
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center' }}>
              We sent a password reset link to {watch('email')}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 14,
              paddingVertical: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
              Back to Sign In
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          Forgot password?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          We'll send a reset link to your email.
        </Text>

        <View style={{ gap: 16 }}>
          <View>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
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
                  }}
                />
              )}
            />
            {errors.email && (
              <Text style={{ color: colors.error, fontSize: 13, marginTop: 4 }}>
                {errors.email.message}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 14,
            paddingVertical: 18,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
              Send Reset Link
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
