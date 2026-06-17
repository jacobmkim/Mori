/**
 * Dev-only RevenueCat debug screen (reached from ProfileSheet's dev section).
 * The first real RC test surface: fetch the `default` offering and confirm the
 * monthly/annual packages + prices come back from Apple↔RC↔app — no purchase
 * needed. Also buttons to present the paywall / Customer Center / restore.
 *
 * Hard-gated to __DEV__ (renders nothing in production builds).
 */
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/userStore';
import { flags } from '@/lib/featureFlags';
import { getOfferings } from '@/lib/revenueCat';
import {
  presentMoriPlusPaywall, presentManageSubscription, formatOfferingForDebug,
  type DebugPackageRow,
} from '@/lib/paywall';
import { restorePurchases } from '@/lib/revenueCat';

export default function RcDebugScreen() {
  const colors = useTheme();
  const isPremium = useUserStore((s) => s.isPremium);
  const [rows, setRows] = useState<DebugPackageRow[] | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchOfferings = useCallback(async () => {
    setLoading(true);
    setStatus('Fetching offerings…');
    try {
      const offering = await getOfferings();
      const parsed = formatOfferingForDebug(offering);
      setRows(parsed);
      setStatus(
        offering == null
          ? 'getOfferings() returned null — RC not initialized, kill switch off, or no native module (Expo Go).'
          : parsed.length === 0
            ? 'Offering found but 0 packages — check the default offering in the RC dashboard / ASC propagation.'
            : `OK — ${parsed.length} package(s) from offering "${(offering as any).identifier}".`,
      );
    } catch (err: any) {
      setStatus(`Error: ${err?.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!__DEV__) return null;

  const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 10 }}
    >
      <Text style={{ color: 'white', fontWeight: '600', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: 'RC Debug' }} />

      <Text style={{ color: colors.text, fontSize: 13, marginBottom: 4 }}>
        moriPlusEnabled: <Text style={{ fontWeight: '700' }}>{String(flags.moriPlusEnabled)}</Text>
      </Text>
      <Text style={{ color: colors.text, fontSize: 13, marginBottom: 16 }}>
        isPremium: <Text style={{ fontWeight: '700' }}>{String(isPremium)}</Text>
      </Text>

      <Btn label={loading ? 'Fetching…' : 'Fetch offerings (RC test)'} onPress={fetchOfferings} />
      <Btn label="Present paywall" onPress={() => presentMoriPlusPaywall().then((o) => setStatus(`Paywall: ${o}`))} />
      <Btn label="Manage subscription (Customer Center)" onPress={() => presentManageSubscription()} />
      <Btn label="Restore purchases" onPress={() => restorePurchases().then((p) => setStatus(`Restore → premium: ${p}`))} />

      {loading && <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />}

      {status ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12, marginBottom: 12 }}>{status}</Text>
      ) : null}

      {rows?.map((r) => (
        <View key={r.packageId} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{r.title} — {r.priceString}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>package: {r.packageId}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>product: {r.productId}</Text>
        </View>
      ))}
      </ScrollView>
    </SafeAreaView>
  );
}
