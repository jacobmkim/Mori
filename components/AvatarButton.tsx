/**
 * AvatarButton.tsx
 * Persistent 36pt circular avatar shown top-right on every screen.
 * Tapping opens the ProfileSheet bottom sheet.
 */
import { View, Text, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { ProfileSheet } from '@/components/ProfileSheet';
import { flags } from '@/lib/featureFlags';
import { showPremiumRing } from '@/lib/premiumRing';

export function AvatarButton() {
  const colors = useTheme();
  const profile = useUserStore((s) => s.profile);
  const isPremium = useUserStore((s) => s.isPremium);
  const { profileSheetOpen, setProfileSheetOpen } = useUserStore();
  const [open, setOpen] = useState(false);

  const premiumRing = showPremiumRing(flags.moriPlusEnabled, isPremium);

  useEffect(() => {
    if (profileSheetOpen) {
      setOpen(true);
      setProfileSheetOpen(false);
    }
  }, [profileSheetOpen]);

  const initials = profile?.name
    ? profile.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : null;

  const avatarContent = profile?.avatar_url ? (
    <Image
      source={{ uri: profile.avatar_url }}
      style={{ width: 36, height: 36, borderRadius: 18 }}
      contentFit="cover"
    />
  ) : initials ? (
    <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>{initials}</Text>
  ) : (
    <Ionicons name="person" size={18} color="white" />
  );

  return (
    <>
      {premiumRing ? (
        <Pressable onPress={() => setOpen(true)} hitSlop={8} style={{ position: 'relative' }}>
          <View style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: colors.premiumRing,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {avatarContent}
            </View>
          </View>
          <View style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 16, height: 16, borderRadius: 8,
            backgroundColor: colors.premiumRing,
            borderWidth: 1.5, borderColor: colors.card,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="sparkles" size={9} color={colors.card} />
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          hitSlop={8}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: colors.primary,
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {avatarContent}
        </Pressable>
      )}
      <ProfileSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
