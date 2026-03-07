import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { upsertProfile } from '@/lib/api';
import { useUserStore } from '@/stores/userStore';
import { colors } from '@/constants/theme';
import ProgressBar from '@/components/onboarding/ProgressBar';

interface FormData {
  email: string;
  password: string;
}

export default function Account() {
  const { onboarding } = useUserStore();
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>();

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });
      if (error) throw error;

      if (authData.user) {
        await upsertProfile({
          id: authData.user.id,
          dietary_goals: onboarding.dietary_goals,
          cuisine_preferences: onboarding.cuisine_preferences,
          cooking_frequency: onboarding.cooking_frequency,
          skill_level: onboarding.skill_level,
          weekly_budget: onboarding.weekly_budget,
          onboarding_complete: false,
        });
      }

      router.push('/onboarding/payoff');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-[#F9F9F9]">
      <ProgressBar current={6} total={6} />
      <View className="flex-1 px-6 pt-6">
        <Text className="text-[28px] font-bold text-[#1A1A1A] mb-2">
          Create your account
        </Text>
        <Text className="text-base text-[#666666] mb-10">
          Your preferences are saved. Let's make it official.
        </Text>

        <View className="gap-4">
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
                    backgroundColor: colors.white,
                    borderColor: errors.email ? colors.error : colors.border,
                    borderWidth: 1.5,
                    borderRadius: 12,
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
                  autoComplete="new-password"
                  style={{
                    backgroundColor: colors.white,
                    borderColor: errors.password ? colors.error : colors.border,
                    borderWidth: 1.5,
                    borderRadius: 12,
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
        </View>
      </View>

      <View className="px-6 pb-10 gap-3">
        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={loading}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text className="text-white text-base font-semibold">Create Account</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
