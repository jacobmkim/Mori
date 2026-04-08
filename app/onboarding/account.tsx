import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { upsertProfile, getProfile } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';
import { useSavedStore } from '@/stores/savedStore';
import { useTheme } from '@/hooks/useTheme';
import ProgressBar from '@/components/onboarding/ProgressBar';

interface FormData {
  email: string;
  password: string;
  confirmPassword?: string;
}

export default function Account() {
  const colors = useTheme();
  const { onboarding, setProfile } = useUserStore();
  const loadSavedRecipes = useSavedStore((s) => s.loadSavedRecipes);
  const { signin } = useLocalSearchParams<{ signin?: string }>();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signup' | 'signin'>(signin === '1' ? 'signin' : 'signup');

  const { control, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    defaultValues: __DEV__
      ? { email: 'dev@mise.app', password: 'devpassword123', confirmPassword: '' }
      : { email: '', password: '', confirmPassword: '' },
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
          const profile = await upsertProfile({
            id: authData.user.id,
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

          // Send confirmation email (optional — user can ignore)
          supabase.auth.resendConfirmationEmail(data.email).catch((err) => {
            console.error('Failed to send confirmation email:', err);
            // Non-fatal — continue to app even if email fails
          });
        }
        router.push('/onboarding/pantry');
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
          // Restore saved recipes on sign-in
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProgressBar current={8} total={8} />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, marginBottom: 32 }}>
          {mode === 'signup' ? "Your preferences are saved. Let's make it official." : 'Sign in to continue to Mori.'}
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

          <View>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
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
                  secureTextEntry
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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

          {mode === 'signup' && (
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
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40, gap: 12 }}>
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
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
              {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </Text>
          )}
        </Pressable>

        {mode === 'signin' && (
          <Pressable
            onPress={() => router.push('/onboarding/forgot-password')}
            style={{ alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
              Forgot password?
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          style={{ alignItems: 'center', paddingVertical: 8 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
