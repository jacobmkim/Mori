// Dev-only premium override — test Mori+ features WITHOUT RevenueCat / a real purchase.
//
// HARD-GUARDED by __DEV__: every function here is a no-op in a production build,
// so there is no code path that can grant premium to a real shipped app, even if
// EXPO_PUBLIC_FORCE_PREMIUM were somehow set in a production EAS env.
//
// Full dev-testing recipe (no RevenueCat setup needed):
//   1. Local .env: EXPO_PUBLIC_MORI_PLUS_ENABLED=true   (surfaces Mori+ at all)
//   2. Local .env: EXPO_PUBLIC_FORCE_PREMIUM=true        (boots as premium)
//      — or call toggleDevPremium() at runtime from a debug control.
//   3. Server-side gating: set profiles.is_premium=true for your account in
//      Supabase Studio (the API endpoints read the DB, not the client flag).
//
// Once RevenueCat is live, use its dashboard "grant entitlement" or an Offer Code
// to comp yourself instead — this dev override is only for pre-RC development.

import { useUserStore } from '@/stores/userStore';

/** True only in a dev build with the force-premium env flag set. Always false in prod. */
export function isDevPremiumForced(): boolean {
  return __DEV__ === true && process.env.EXPO_PUBLIC_FORCE_PREMIUM === 'true';
}

/**
 * Apply the boot-time premium override. Call once after RevenueCat init in
 * app/_layout.tsx. No-op in production and when the env flag isn't set.
 */
export function applyDevPremiumOverride(): void {
  if (__DEV__ !== true) return;
  if (process.env.EXPO_PUBLIC_FORCE_PREMIUM === 'true') {
    useUserStore.getState().setPremium(true);
  }
}

/**
 * Runtime toggle for a debug control — flip premium on/off while testing without
 * a rebuild. Returns the new premium state. No-op (returns false) in production.
 */
export function toggleDevPremium(): boolean {
  if (__DEV__ !== true) return false;
  const next = !useUserStore.getState().isPremium;
  useUserStore.getState().setPremium(next);
  return next;
}
