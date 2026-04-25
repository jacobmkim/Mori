import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import { useSavedStore } from '@/stores/savedStore';
import { useUserStore } from '@/stores/userStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TasteProfileUpdateModal } from '@/components/TasteProfileUpdateModal';

const TASTE_SEEN_KEY = '@mori_taste_profile_seen_at';

export default function TabLayout() {
  const colors = useTheme();
  const loadSavedRecipes = useSavedStore((s) => s.loadSavedRecipes);
  const profile = useUserStore((s) => s.profile);
  const setProfileSheetOpen = useUserStore((s) => s.setProfileSheetOpen);
  const [tasteUpdateVisible, setTasteUpdateVisible] = useState(false);
  const [tasteUpdateText, setTasteUpdateText] = useState('');
  const [tasteUpdateDna, setTasteUpdateDna] = useState<Record<string, { score: number; note: string }> | null>(null);
  const [tasteIsFirstTime, setTasteIsFirstTime] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.id) {
        loadSavedRecipes(data.session.user.id);
      }
    });
  }, []);

  // Show in-app popup when taste profile has been updated since last seen
  useEffect(() => {
    if (!profile?.taste_profile) return;
    const tp = profile.taste_profile as any;
    if (!tp?.text || !tp?.generated_at) return;

    AsyncStorage.getItem(TASTE_SEEN_KEY).then((seenAt) => {
      const generatedAt = new Date(tp.generated_at).getTime();
      const lastSeen = seenAt ? new Date(seenAt).getTime() : 0;
      if (generatedAt > lastSeen) {
        setTasteUpdateText(tp.text);
        setTasteUpdateDna(tp.flavourDna ?? null);
        setTasteIsFirstTime(!seenAt);
        setTasteUpdateVisible(true);
      }
    });
  }, [profile?.taste_profile]);

  function dismissTasteUpdate() {
    setTasteUpdateVisible(false);
    AsyncStorage.setItem(TASTE_SEEN_KEY, new Date().toISOString());
  }

  function viewProfile() {
    dismissTasteUpdate();
    setProfileSheetOpen(true);
  }

  return (
    <>
    <TasteProfileUpdateModal
      visible={tasteUpdateVisible}
      profileText={tasteUpdateText}
      flavourDna={tasteUpdateDna}
      isFirstTime={tasteIsFirstTime}
      onViewProfile={viewProfile}
      onDismiss={dismissTasteUpdate}
    />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBorder,
          borderTopWidth: 1,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="grocery-list"
        options={{
          title: 'Grocery',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // hidden from tab bar — profile is now accessed via AvatarButton
        }}
      />
    </Tabs>
    </>
  );
}
