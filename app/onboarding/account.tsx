import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { patchProfile, getProfile } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { ONBOARDING_PALETTE as colors, ONBOARDING_TYPE as TYPE } from '@/constants/onboardingPalette';
import ProgressBar from '@/components/onboarding/ProgressBar';
import { MoriLogo } from '@/components/ui/MoriLogo';

interface FormData {
  email: string;
  password: string;
  confirmPassword?: string;
}

async function sendWelcomeEmail(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  await fetch(`${getApiBaseUrl()}/api/send-welcome-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

export default function Account() {
  const { onboarding, setProfile } = useUserStore();
  const loadSavedRecipes = useSavedStore((s) => s.loadSavedRecipes);
  const { signin } = useLocalSearchParams<{ signin?: string }>();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signup' | 'signin'>(signin === '1' ? 'signin' : 'signup');

  const { control, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data: authData, error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
        });
        if (error) throw error;

        if (authData.user) {
          const profile = await patchProfile(authData.user.id, {
            dietary_goals: onboarding.dietary_goals,
            dietary_extra_preferences: onboarding.dietary_extra_preferences,
            ingredient_dislikes: onboarding.ingredient_dislikes,
            cuisine_preferences: onboarding.cuisine_preferences,
            eating_style: onboarding.eating_style,
            cooking_frequency: onboarding.cooking_frequency,
            skill_level: onboarding.skill_level,
            weekly_budget: onboarding.weekly_budget,
            onboarding_complete: false,
          });
          setProfile(profile);

          // Fire-and-forget — never block signup completion on the welcome email.
          sendWelcomeEmail().catch(() => {});
        }
        router.push('/onboarding/profile-identity');
      } else {
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (error) throw error;

        if (authData.user) {
          try {
            const profile = await getProfile(authData.user.id);
            setProfile(profile);
          } catch {
            // Profile fetch failure is non-fatal — continue to app
          }
          loadSavedRecipes(authData.user.id);
        }
        router.replace('/(tabs)/discover');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    fontFamily: 'System',
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <ProgressBar current={8} total={8} />

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {mode === 'signup' && (
              <View style={{ marginBottom: 28, alignItems: 'center' }}>
                <MoriLogo size="md" tone="green" />
              </View>
            )}

            <Text style={{ ...TYPE.eyebrow, color: colors.primary, marginBottom: 10 }}>
              Step 08 · Account
            </Text>
            <Text style={{ ...TYPE.heading, color: colors.text, marginBottom: 8 }}>
              {mode === 'signup' ? "Let's get cooking" : 'Welcome back, chef'}
            </Text>
            <Text style={{ ...TYPE.subhead, color: colors.textMuted, marginBottom: 28 }}>
              {mode === 'signup' ? 'Secure your account to save your favorites.' : 'Sign in to your recipe collection.'}
            </Text>

            <View style={{ gap: 16, marginBottom: 28 }}>
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
                        ...inputStyle,
                        borderColor: errors.email ? colors.error : colors.border,
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

              <View>
                <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 8 }}>
                  Password
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
                      placeholderTextColor={colors.textSubtle}
                      secureTextEntry
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      style={{
                        ...inputStyle,
                        borderColor: errors.password ? colors.error : colors.border,
                      }}
                    />
                  )}
                />
                {errors.password && (
                  <Text style={{ color: colors.error, fontSize: 13, marginTop: 4, fontFamily: 'System' }}>
                    {errors.password.message}
                  </Text>
                )}
              </View>

              {mode === 'signup' && (
                <View>
                  <Text style={{ ...TYPE.eyebrow, color: colors.textMuted, marginBottom: 8 }}>
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
                        placeholderTextColor={colors.textSubtle}
                        secureTextEntry
                        autoComplete="new-password"
                        style={{
                          ...inputStyle,
                          borderColor: errors.confirmPassword ? colors.error : colors.border,
                        }}
                      />
                    )}
                  />
                  {errors.confirmPassword && (
                    <Text style={{ color: colors.error, fontSize: 13, marginTop: 4, fontFamily: 'System' }}>
                      {errors.confirmPassword.message}
                    </Text>
                  )}
                </View>
              )}
            </View>

            <View style={{ gap: 12 }}>
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
                    {mode === 'signup' ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </Pressable>

              {mode === 'signin' && (
                <Pressable
                  onPress={() => router.push('/onboarding/forgot-password')}
                  style={{ alignItems: 'center', paddingVertical: 8 }}
                >
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600', fontFamily: 'System' }}>
                    Forgot password?
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                style={{ alignItems: 'center', paddingVertical: 8 }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: 'System' }}>
                  {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>
                    {mode === 'signup' ? 'Sign in' : 'Sign up'}
                  </Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
