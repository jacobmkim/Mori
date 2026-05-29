/**
 * Dev premium override — testing contract.
 *
 * This helper lets us test Mori+ gated features without RevenueCat. Its ONLY
 * safety guarantee is that it is inert in production: every function must be a
 * no-op when __DEV__ is false, regardless of the EXPO_PUBLIC_FORCE_PREMIUM env.
 * If that guarantee ever breaks, a shipped build could grant itself premium —
 * so these tests assert the production no-op path hardest.
 */

import {
  isDevPremiumForced,
  applyDevPremiumOverride,
  toggleDevPremium,
} from '@/lib/devPremium';
import { useUserStore } from '@/stores/userStore';

const ENV_KEY = 'EXPO_PUBLIC_FORCE_PREMIUM';

// jest-expo sets global __DEV__ = true. We flip it per-test to cover both builds.
const ORIGINAL_DEV = (global as any).__DEV__;

function setDev(v: boolean) {
  (global as any).__DEV__ = v;
}

beforeEach(() => {
  setDev(true);
  delete process.env[ENV_KEY];
  useUserStore.setState({ isPremium: false } as any);
});

afterEach(() => {
  (global as any).__DEV__ = ORIGINAL_DEV;
  delete process.env[ENV_KEY];
});

// ─── isDevPremiumForced ───────────────────────────────────────────────────────

describe('isDevPremiumForced', () => {
  it('is true in dev when the flag is exactly "true"', () => {
    setDev(true);
    process.env[ENV_KEY] = 'true';
    expect(isDevPremiumForced()).toBe(true);
  });

  it('is false in dev when the flag is unset', () => {
    setDev(true);
    expect(isDevPremiumForced()).toBe(false);
  });

  it('is false in dev for any non-"true" value (typo guard)', () => {
    setDev(true);
    for (const v of ['TRUE', '1', 'yes', 'false', '']) {
      process.env[ENV_KEY] = v;
      expect(isDevPremiumForced()).toBe(false);
    }
  });

  it('is false in production even when the flag is "true" (the safety guarantee)', () => {
    setDev(false);
    process.env[ENV_KEY] = 'true';
    expect(isDevPremiumForced()).toBe(false);
  });
});

// ─── applyDevPremiumOverride ──────────────────────────────────────────────────

describe('applyDevPremiumOverride', () => {
  it('sets premium=true in dev when the flag is "true"', () => {
    setDev(true);
    process.env[ENV_KEY] = 'true';
    applyDevPremiumOverride();
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('does nothing in dev when the flag is unset', () => {
    setDev(true);
    applyDevPremiumOverride();
    expect(useUserStore.getState().isPremium).toBe(false);
  });

  it('does NOTHING in production even when the flag is "true" (the safety guarantee)', () => {
    setDev(false);
    process.env[ENV_KEY] = 'true';
    applyDevPremiumOverride();
    expect(useUserStore.getState().isPremium).toBe(false);
  });

  it('never flips premium back to false (boot override is additive)', () => {
    setDev(true);
    useUserStore.setState({ isPremium: true } as any);
    applyDevPremiumOverride(); // flag unset → should leave premium alone
    expect(useUserStore.getState().isPremium).toBe(true);
  });
});

// ─── toggleDevPremium ─────────────────────────────────────────────────────────

describe('toggleDevPremium', () => {
  it('flips false→true in dev and returns the new state', () => {
    setDev(true);
    expect(toggleDevPremium()).toBe(true);
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('flips true→false in dev and returns the new state', () => {
    setDev(true);
    useUserStore.setState({ isPremium: true } as any);
    expect(toggleDevPremium()).toBe(false);
    expect(useUserStore.getState().isPremium).toBe(false);
  });

  it('is a no-op in production and returns false without touching the store', () => {
    setDev(false);
    useUserStore.setState({ isPremium: true } as any);
    expect(toggleDevPremium()).toBe(false);
    // store must be untouched (still true)
    expect(useUserStore.getState().isPremium).toBe(true);
  });
});
