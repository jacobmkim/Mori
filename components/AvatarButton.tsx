/**
 * AvatarButton.tsx
 * Persistent 36pt circular avatar shown top-right on every screen.
 * Tapping opens the ProfileSheet bottom sheet.
 */
import { View, Text, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { ProfileSheet } from '@/components/ProfileSheet';

export function AvatarButton() {
  const colors = useTheme();
  const profile = useUserStore((s) => s.profile);
  const { profileSheetOpen, setProfileSheetOpen } = useUserStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (profileSheetOpen) {
      setOpen(true);
      setProfileSheetOpen(false);
    }
  }, [profileSheetOpen]);

  const initials = profile?.name
    ? profile.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: colors.primary,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {initials ? (
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>{initials}</Text>
        ) : (
          <Ionicons name="person" size={18} color="white" />
        )}
      </Pressable>
      <ProfileSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
