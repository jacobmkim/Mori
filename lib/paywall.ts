// RevenueCat Paywalls v2 + Customer Center presentation. Pairs with
// lib/revenueCat.ts (the SDK wrapper). The paywall UI itself is configured
// REMOTELY in the RC dashboard (no hand-coded paywall — banned toggle paywalls
// can't happen this way); this module only presents it and normalizes the
// result. After a purchase/restore the CustomerInfo listener in revenueCat.ts
// flips userStore.isPremium — we never set premium here.
//
// Everything no-ops safely when the kill switch is off OR the native UI module
// is unavailable (Expo Go), so these are safe to wire before launch.

import { flags } from './featureFlags';
import { refreshCustomerInfo } from './revenueCat';

// Mirror revenueCat.ts: require() Sentry so jest mocks survive the CJS transform.
function reportError(err: unknown, area: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native');
    const fn = Sentry?.captureException ?? Sentry?.default?.captureException;
    if (typeof fn === 'function') fn(err, { tags: { area } });
  } catch {
    /* Sentry must never crash the host path. */
  }
}

// Lazy-require the native UI module (same rationale as getPurchases()).
function getPaywallUI(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases-ui');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

const ENTITLEMENT_ID = 'mori_plus';

export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'not_presented' | 'error';

/**
 * Map RevenueCat's PAYWALL_RESULT (PURCHASED/RESTORED/CANCELLED/NOT_PRESENTED/
 * ERROR) to a normalized outcome. Pure + exported for tests. Tolerates the
 * US/UK 'CANCELLED'/'CANCELED' spelling and unknown values (→ 'error').
 */
export function mapPaywallResult(raw: unknown): PaywallOutcome {
  switch (String(raw).toUpperCase()) {
    case 'PURCHASED': return 'purchased';
    case 'RESTORED': return 'restored';
    case 'CANCELLED':
    case 'CANCELED': return 'cancelled';
    case 'NOT_PRESENTED': return 'not_presented';
    default: return 'error';
  }
}

/** True when the outcome means the user now has (or already had) access. */
export function grantsAccess(outcome: PaywallOutcome): boolean {
  return outcome === 'purchased' || outcome === 'restored' || outcome === 'not_presented';
}

/** Present the Mori+ paywall unconditionally (the "Upgrade" entry point). */
export async function presentMoriPlusPaywall(): Promise<PaywallOutcome> {
  if (!flags.moriPlusEnabled) return 'not_presented';
  const ui = getPaywallUI();
  if (!ui?.presentPaywall) return 'not_presented'; // Expo Go / native module absent
  try {
    return mapPaywallResult(await ui.presentPaywall());
  } catch (err) {
    reportError(err, 'paywall-present');
    return 'error';
  }
}

/**
 * Gate a premium feature: present the paywall ONLY if the user lacks mori_plus,
 * then return whether they now have access. Use at contextual triggers
 * ("Build my week", "save this deck"). NOT_PRESENTED here means already premium.
 */
export async function gateMoriPlus(): Promise<boolean> {
  if (!flags.moriPlusEnabled) return false;
  const ui = getPaywallUI();
  if (!ui?.presentPaywallIfNeeded) return false;
  try {
    const outcome = mapPaywallResult(
      await ui.presentPaywallIfNeeded({ requiredEntitlementIdentifier: ENTITLEMENT_ID }),
    );
    // NOT_PRESENTED is RC saying "no paywall shown" — usually "already entitled", but it also
    // covers an unfetchable/unpublished offering. Auto Plan runs entirely client-side, so this
    // boolean is the ONLY gate on the flagship; confirm against the entitlement itself rather
    // than inferring access from RC declining to present.
    if (outcome === 'not_presented') return await verifyEntitlement();
    return grantsAccess(outcome);
  } catch (err) {
    reportError(err, 'paywall-gate');
    return false;
  }
}

/** Read the live entitlement. Fails closed — a lookup error must not grant access. */
async function verifyEntitlement(): Promise<boolean> {
  try {
    // refreshCustomerInfo() pulls fresh CustomerInfo from RC and pushes the entitlement
    // through the same listener that owns isPremium; read that rather than a second source.
    await refreshCustomerInfo();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useUserStore } = require('../stores/userStore');
    return !!useUserStore.getState().isPremium;
  } catch (err) {
    reportError(err, 'paywall-verify');
    return false;
  }
}

/**
 * RevenueCat Customer Center — manage subscription, cancel (with survey),
 * restore, and win-back/promotional offers, all configured in the RC dashboard.
 * Satisfies Apple's "manage" + a second "Restore" location, and doubles as the
 * churn kit (A5). Returns nothing — the listener reconciles entitlement state.
 */
export async function presentManageSubscription(): Promise<void> {
  if (!flags.moriPlusEnabled) return;
  const ui = getPaywallUI();
  if (!ui?.presentCustomerCenter) {
    // Never a dead tap: the native UI module being absent is invisible state the
    // user can't diagnose — fall back to Apple's own subscription management.
    openSubscriptionSettingsFallback();
    return;
  }
  try {
    await ui.presentCustomerCenter();
    // Reconcile after dismiss — a synchronous cancel/refund inside the Customer
    // Center changes entitlement now, not at next foreground.
    await refreshCustomerInfo();
  } catch (err) {
    reportError(err, 'customer-center');
    openSubscriptionSettingsFallback();
  }
}

/**
 * Last-resort manage path: deep-link to iOS's subscription settings. Used when
 * the Customer Center can't present (module absent / native refusal) so the
 * "manage subscription" row is never a silent no-op (Apple checks this flow).
 */
function openSubscriptionSettingsFallback(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Linking } = require('react-native');
    Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {});
  } catch {
    /* never crash the host path */
  }
}

// ─── Dev RC-Debug readout ────────────────────────────────────────────────────
export type DebugPackageRow = { packageId: string; productId: string; priceString: string; title: string };

/** Flatten an Offering to printable rows for the dev RC-Debug screen. Pure. */
export function formatOfferingForDebug(offering: any | null): DebugPackageRow[] {
  const pkgs = offering?.availablePackages;
  if (!Array.isArray(pkgs)) return [];
  return pkgs.map((p: any) => ({
    packageId: typeof p?.identifier === 'string' ? p.identifier : '?',
    productId: typeof p?.product?.identifier === 'string' ? p.product.identifier : '?',
    priceString: typeof p?.product?.priceString === 'string' ? p.product.priceString : '?',
    title: typeof p?.product?.title === 'string' ? p.product.title : '?',
  }));
}
