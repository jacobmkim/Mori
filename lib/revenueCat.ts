// RevenueCat SDK wrapper — single source of truth for client-side premium gating.
//
// Conventions:
//   - Init once per cold start in app/_layout.tsx after the Supabase profile loads.
//   - Use Supabase user ID as RevenueCat appUserID so entitlement carries across devices.
//   - The `mori_plus` entitlement is the one boolean that drives all client-side gating.
//   - Server-side gating reads profiles.is_premium (synced via RC webhook); never trust
//     a client-asserted entitlement on the server.
//   - All errors swallow into Sentry — RC failures must never block app boot.
//
// Mori+ kill switch: when flags.moriPlusEnabled is false, init is a no-op and
// isPremium always returns false; lets us ship a binary with RC compiled in
// but the entire surface dark until flip-day.

import type { CustomerInfo, PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import { useUserStore } from '@/stores/userStore';
import { flags } from './featureFlags';

// Sentry is loaded via require() rather than a named import so jest.mock()
// factories survive Babel's CJS interop transform — the named-import path
// compiles to `(0, _reactNative.captureException)(...)` which fails when
// the mock factory's named export is shaped differently.
function reportError(err: unknown, area: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native');
    const fn = Sentry?.captureException ?? Sentry?.default?.captureException;
    if (typeof fn === 'function') fn(err, { tags: { area } });
  } catch {
    // Sentry should never crash the host code path.
  }
}

export const ENTITLEMENT_ID = 'mori_plus';
export const OFFERING_ID = 'default';

let initialized = false;
let purchasesModule: typeof import('react-native-purchases').default | null = null;

/**
 * Test-only: reset the module-level init state. Production code never calls
 * this; jest tests use it to verify idempotency without resetting the entire
 * jest module registry.
 */
export function __resetRevenueCatForTest() {
  initialized = false;
  purchasesModule = null;
}

// Lazy-load the native module via require() rather than `await import()`:
//   - require() is honored by jest's module mocks (including virtual mocks);
//     the dynamic-import path silently bypasses jest's resolver under
//     jest-expo's transform, breaking unit tests.
//   - In production, react-native bundlers resolve require() at bundle time
//     just like static imports, so this is functionally equivalent to a
//     top-level import — but the try/catch keeps Expo Go and dev-time hot
//     reloads from crashing if the native module is briefly unavailable.
function getPurchases(): typeof import('react-native-purchases').default | null {
  if (purchasesModule) return purchasesModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    purchasesModule = mod.default ?? mod;
    return purchasesModule;
  } catch {
    return null;
  }
}

function getLogLevel(): { DEBUG: unknown; WARN: unknown } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    return mod.LOG_LEVEL ?? null;
  } catch {
    return null;
  }
}

/**
 * Configure RevenueCat once per app boot. Idempotent.
 * Call AFTER the user's Supabase session resolves so we have a stable userId.
 */
export async function initRevenueCat(userId: string | null): Promise<void> {
  if (initialized) return;
  if (!flags.moriPlusEnabled) return;

  // Read at call time (not module load) so EAS env updates that arrive via OTA
  // can take effect on the next foreground init without a full rebuild.
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  if (!apiKey) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[revenueCat] EXPO_PUBLIC_REVENUECAT_IOS_KEY missing — running dark');
    }
    return;
  }

  initialized = true;

  try {
    const Purchases = getPurchases();
    if (!Purchases) return;

    const LOG_LEVEL = getLogLevel();
    if (LOG_LEVEL) {
      Purchases.setLogLevel((__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN) as never);
    }
    Purchases.configure({
      apiKey,
      appUserID: userId ?? undefined,
    });

    Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);

    // Initial sync — flips userStore.isPremium if entitlement is already active
    // (e.g. user reinstalled and we restored automatically).
    const info = await Purchases.getCustomerInfo();
    handleCustomerInfoUpdate(info);
  } catch (err) {
    reportError(err, 'revenuecat-init');
  }
}

/**
 * Re-identify the RC user after sign-in. Carries entitlement to the new session.
 * No-op if init hasn't happened.
 */
export async function loginRevenueCat(userId: string): Promise<void> {
  if (!initialized) return;
  try {
    const Purchases = getPurchases();
    if (!Purchases) return;
    const { customerInfo } = await Purchases.logIn(userId);
    handleCustomerInfoUpdate(customerInfo);
  } catch (err) {
    reportError(err, 'revenuecat-login');
  }
}

/**
 * Reset RC identity on sign-out. Always clears local premium flag so the next
 * user (or anonymous session) starts cold.
 */
export async function logoutRevenueCat(): Promise<void> {
  useUserStore.getState().setPremium(false);
  if (!initialized) return;
  try {
    const Purchases = getPurchases();
    if (!Purchases) return;
    await Purchases.logOut();
  } catch (err) {
    reportError(err, 'revenuecat-logout');
  }
}

/**
 * Drive RC identity from the app's auth state — call whenever the signed-in user
 * changes (wired into the session effect in app/_layout.tsx). This is what keeps
 * one user's entitlement from bleeding into the next session on a shared device.
 *
 *   • next set  → initRevenueCat (idempotent) then loginRevenueCat to (re)attach
 *                 the RC appUserID. loginRevenueCat is a no-op before init, so the
 *                 pair is safe on cold boot AND correct on an account switch
 *                 (init alone is a no-op after first run, so it can't re-identify).
 *   • next null → logoutRevenueCat (drops RC identity + clears the premium flag),
 *                 but only when there was a previous user — avoids a spurious
 *                 logout at logged-out boot.
 */
export async function syncRevenueCatIdentity(
  prevUserId: string | null,
  nextUserId: string | null,
): Promise<void> {
  if (nextUserId) {
    await initRevenueCat(nextUserId);
    await loginRevenueCat(nextUserId);
  } else if (prevUserId) {
    await logoutRevenueCat();
  }
}

/**
 * Read the current `mori_plus` entitlement state. Returns false if RC is unavailable
 * or the kill switch is off.
 */
export function isPremium(info: CustomerInfo | null | undefined): boolean {
  if (!flags.moriPlusEnabled) return false;
  return info?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
}

/**
 * Fetch the current Offering (3 packages: monthly, annual, lifetime).
 * Returns null if RC is unavailable.
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!initialized) return null;
  try {
    const Purchases = getPurchases();
    if (!Purchases) return null;
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (err) {
    reportError(err, 'revenuecat-offerings');
    return null;
  }
}

/**
 * Initiate a purchase. Resolves to the new premium state.
 * Throws on user cancellation; caller should catch and toast.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  if (!initialized) throw new Error('RevenueCat not initialized');
  const Purchases = getPurchases();
  if (!Purchases) throw new Error('RevenueCat module unavailable');
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return isPremium(customerInfo);
}

/**
 * Restore prior purchases for the current Apple ID. Required by Apple — surfaced
 * on the paywall footer and in Settings → Subscription.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!initialized) return false;
  try {
    const Purchases = getPurchases();
    if (!Purchases) return false;
    const info = await Purchases.restorePurchases();
    return isPremium(info);
  } catch (err) {
    reportError(err, 'revenuecat-restore');
    return false;
  }
}

/**
 * Customer info listener — RC fires this on cold start, after every purchase,
 * and on background → foreground transitions. Drives userStore.isPremium.
 */
function handleCustomerInfoUpdate(info: CustomerInfo): void {
  const premium = isPremium(info);
  useUserStore.getState().setPremium(premium);
}
