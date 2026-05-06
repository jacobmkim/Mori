/**
 * RevenueCat SDK wrapper — client-side gating contract.
 *
 * lib/revenueCat.ts is the single source of truth for client-side `mori_plus`
 * entitlement state. It must:
 *
 *   1. Stay completely silent when the kill switch (flags.moriPlusEnabled) is
 *      OFF — no SDK init, no API key check, no Sentry noise. This is what lets
 *      v1.1 ship dark and flip on via OTA on launch day.
 *   2. Stay silent when EXPO_PUBLIC_REVENUECAT_IOS_KEY is missing — no crash,
 *      because Expo Go and unit tests never have a real key.
 *   3. Be idempotent on init() — multiple calls during React effect cycles
 *      must not configure the SDK twice.
 *   4. Never throw out of init/login/logout/restore — RC failures must never
 *      block app boot or user actions. All errors funnel to Sentry.
 *   5. Mirror entitlement state into useUserStore.setPremium() whenever
 *      customer info updates, so the rest of the app reads from the store
 *      and never round-trips to the SDK.
 *   6. Treat the kill switch as authoritative in isPremium() — even with an
 *      active entitlement, isPremium MUST return false when the flag is off,
 *      so a leaked sandbox key can't accidentally unlock features pre-launch.
 *
 * The wrapper lazy-imports `react-native-purchases` so this test (and Jest in
 * general) doesn't need the native module installed.
 */

// ─── Mocks (must be declared before importing the module under test) ──────────

const mockSetLogLevel = jest.fn();
const mockConfigure = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockLogIn = jest.fn();
const mockLogOut = jest.fn();
const mockAddListener = jest.fn();

// `react-native-purchases` is virtual-mocked: the package is installed at M0
// dependency setup and may not be present when running tests. The wrapper
// lazy-imports the module via `await import(...)` so production also handles
// the missing-module case gracefully (Expo Go, hot-reload glitches, etc.).
jest.mock(
  'react-native-purchases',
  () => ({
    __esModule: true,
    default: {
      setLogLevel: mockSetLogLevel,
      configure: mockConfigure,
      getCustomerInfo: mockGetCustomerInfo,
      getOfferings: mockGetOfferings,
      purchasePackage: mockPurchasePackage,
      restorePurchases: mockRestorePurchases,
      logIn: mockLogIn,
      logOut: mockLogOut,
      addCustomerInfoUpdateListener: mockAddListener,
    },
    LOG_LEVEL: { DEBUG: 'DEBUG', WARN: 'WARN' },
  }),
  { virtual: true },
);

const mockSentryCapture = jest.fn();
jest.mock('@sentry/react-native', () => ({
  __esModule: true,
  captureException: mockSentryCapture,
}));

// Mutable kill-switch handle — flipped per test by mutating the underlying var.
// jest.mock factory uses a getter so every read sees the current value.
let mockKillSwitchOn = true;
jest.mock('@/lib/featureFlags', () => ({
  get flags() {
    return { moriPlusEnabled: mockKillSwitchOn };
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  initRevenueCat,
  loginRevenueCat,
  logoutRevenueCat,
  isPremium,
  getOfferings,
  purchasePackage,
  restorePurchases,
  __resetRevenueCatForTest,
} from '@/lib/revenueCat';
import { useUserStore } from '@/stores/userStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_ENTITLEMENT_INFO = {
  entitlements: { active: { mori_plus: { identifier: 'mori_plus' } } },
} as any;

const NO_ENTITLEMENT_INFO = {
  entitlements: { active: {} },
} as any;

const ENV_KEY = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';

beforeEach(() => {
  __resetRevenueCatForTest();
  mockSetLogLevel.mockReset();
  mockConfigure.mockReset();
  mockGetCustomerInfo.mockReset();
  mockGetOfferings.mockReset();
  mockPurchasePackage.mockReset();
  mockRestorePurchases.mockReset();
  mockLogIn.mockReset();
  mockLogOut.mockReset();
  mockAddListener.mockReset();
  mockSentryCapture.mockReset();
  mockKillSwitchOn = true;
  process.env[ENV_KEY] = 'appl_test_key';
  useUserStore.setState({ isPremium: false } as any);
});

afterEach(() => {
  delete process.env[ENV_KEY];
});

// ─── initRevenueCat ───────────────────────────────────────────────────────────

describe('initRevenueCat — kill switch off', () => {
  it('does not call Purchases.configure when flag is off', async () => {
    mockKillSwitchOn = false;
    await initRevenueCat('user-1');
    expect(mockConfigure).not.toHaveBeenCalled();
    expect(mockGetCustomerInfo).not.toHaveBeenCalled();
  });

  it('does not capture an error to Sentry when flag is off', async () => {
    mockKillSwitchOn = false;
    await initRevenueCat(null);
    expect(mockSentryCapture).not.toHaveBeenCalled();
  });
});

describe('initRevenueCat — missing API key', () => {
  it('does not call Purchases.configure when key is undefined', async () => {
    delete process.env[ENV_KEY];
    await initRevenueCat('user-1');
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it('does not capture an error to Sentry when key is undefined', async () => {
    delete process.env[ENV_KEY];
    await initRevenueCat('user-1');
    expect(mockSentryCapture).not.toHaveBeenCalled();
  });
});

describe('initRevenueCat — happy path', () => {
  it('configures Purchases with the API key and Supabase user ID', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    process.env[ENV_KEY] = 'appl_prod_key';
    await initRevenueCat('user-abc');
    expect(mockConfigure).toHaveBeenCalledWith({
      apiKey: 'appl_prod_key',
      appUserID: 'user-abc',
    });
  });

  it('passes appUserID=undefined when no userId is provided', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat(null);
    expect(mockConfigure).toHaveBeenCalledWith({
      apiKey: 'appl_test_key',
      appUserID: undefined,
    });
  });

  it('registers a customer info update listener exactly once', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    expect(mockAddListener).toHaveBeenCalledTimes(1);
  });

  it('flips userStore.isPremium to true when initial entitlement is active', async () => {
    mockGetCustomerInfo.mockResolvedValue(ACTIVE_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('keeps userStore.isPremium false when no entitlement is active', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    expect(useUserStore.getState().isPremium).toBe(false);
  });
});

describe('initRevenueCat — idempotency', () => {
  it('configures Purchases only once when init is called twice in the same boot', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    await initRevenueCat('user-1');
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it('does not re-register the customer info listener on second init', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    await initRevenueCat('user-1');
    expect(mockAddListener).toHaveBeenCalledTimes(1);
  });
});

describe('initRevenueCat — error swallowing', () => {
  it('does not throw when configure() throws; routes to Sentry instead', async () => {
    mockConfigure.mockImplementation(() => { throw new Error('RC down'); });
    await expect(initRevenueCat('user-1')).resolves.toBeUndefined();
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { area: 'revenuecat-init' } }),
    );
  });

  it('does not throw when getCustomerInfo() rejects', async () => {
    mockGetCustomerInfo.mockRejectedValue(new Error('network'));
    await expect(initRevenueCat('user-1')).resolves.toBeUndefined();
    expect(mockSentryCapture).toHaveBeenCalled();
  });
});

// ─── isPremium ────────────────────────────────────────────────────────────────

describe('isPremium — entitlement gating', () => {
  it('returns true when the mori_plus entitlement is active', () => {
    expect(isPremium(ACTIVE_ENTITLEMENT_INFO)).toBe(true);
  });

  it('returns false when no entitlement is active', () => {
    expect(isPremium(NO_ENTITLEMENT_INFO)).toBe(false);
  });

  it('returns false for null customer info', () => {
    expect(isPremium(null)).toBe(false);
  });

  it('returns false for undefined customer info', () => {
    expect(isPremium(undefined)).toBe(false);
  });

  it('returns false for a different active entitlement', () => {
    const otherEnt = {
      entitlements: { active: { something_else: { identifier: 'something_else' } } },
    } as any;
    expect(isPremium(otherEnt)).toBe(false);
  });
});

describe('isPremium — kill switch supersedes entitlement', () => {
  it('returns false even with an active entitlement when the kill switch is off', () => {
    mockKillSwitchOn = false;
    expect(isPremium(ACTIVE_ENTITLEMENT_INFO)).toBe(false);
  });
});

// ─── loginRevenueCat / logoutRevenueCat ───────────────────────────────────────

describe('loginRevenueCat — pre-init guard', () => {
  it('does not call Purchases.logIn before initRevenueCat has run', async () => {
    await loginRevenueCat('user-2');
    expect(mockLogIn).not.toHaveBeenCalled();
  });
});

describe('loginRevenueCat — post-init', () => {
  it('calls Purchases.logIn with the new user ID and updates premium state', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockLogIn.mockResolvedValue({ customerInfo: ACTIVE_ENTITLEMENT_INFO });
    await initRevenueCat('user-1');
    await loginRevenueCat('user-2');
    expect(mockLogIn).toHaveBeenCalledWith('user-2');
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('swallows login errors into Sentry, does not throw', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockLogIn.mockRejectedValue(new Error('login failed'));
    await initRevenueCat('user-1');
    await expect(loginRevenueCat('user-2')).resolves.toBeUndefined();
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { area: 'revenuecat-login' } }),
    );
  });
});

describe('logoutRevenueCat', () => {
  it('clears userStore.isPremium even when called before init', async () => {
    useUserStore.setState({ isPremium: true } as any);
    await logoutRevenueCat();
    expect(useUserStore.getState().isPremium).toBe(false);
    expect(mockLogOut).not.toHaveBeenCalled();
  });

  it('calls Purchases.logOut after init', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockLogOut.mockResolvedValue(undefined);
    await initRevenueCat('user-1');
    await logoutRevenueCat();
    expect(mockLogOut).toHaveBeenCalledTimes(1);
  });
});

// ─── purchasePackage / restorePurchases / getOfferings ────────────────────────

describe('purchasePackage — pre-init guard', () => {
  it('throws when called before init', async () => {
    await expect(purchasePackage({} as any)).rejects.toThrow(/not initialized/i);
  });
});

describe('purchasePackage — post-init', () => {
  it('returns true when the purchase activates the entitlement', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockPurchasePackage.mockResolvedValue({ customerInfo: ACTIVE_ENTITLEMENT_INFO });
    await initRevenueCat('user-1');
    const fakePkg = { identifier: 'monthly' } as any;
    await expect(purchasePackage(fakePkg)).resolves.toBe(true);
    expect(mockPurchasePackage).toHaveBeenCalledWith(fakePkg);
  });
});

describe('restorePurchases — graceful when not initialized', () => {
  it('returns false (does not throw) before init', async () => {
    await expect(restorePurchases()).resolves.toBe(false);
    expect(mockRestorePurchases).not.toHaveBeenCalled();
  });
});

describe('restorePurchases — post-init', () => {
  it('returns true when restored purchases include an active entitlement', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockRestorePurchases.mockResolvedValue(ACTIVE_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    await expect(restorePurchases()).resolves.toBe(true);
  });

  it('returns false when restore finds no active entitlement', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockRestorePurchases.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    await expect(restorePurchases()).resolves.toBe(false);
  });

  it('routes restore failures to Sentry and returns false', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockRestorePurchases.mockRejectedValue(new Error('apple down'));
    await initRevenueCat('user-1');
    await expect(restorePurchases()).resolves.toBe(false);
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { area: 'revenuecat-restore' } }),
    );
  });
});

describe('getOfferings', () => {
  it('returns null before init', async () => {
    await expect(getOfferings()).resolves.toBeNull();
  });

  it('returns the current offering after init', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    const offering = { identifier: 'default', availablePackages: [] };
    mockGetOfferings.mockResolvedValue({ current: offering });
    await initRevenueCat('user-1');
    await expect(getOfferings()).resolves.toEqual(offering);
  });

  it('returns null when no current offering exists', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockGetOfferings.mockResolvedValue({ current: null });
    await initRevenueCat('user-1');
    await expect(getOfferings()).resolves.toBeNull();
  });

  it('routes offering fetch failures to Sentry and returns null', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockGetOfferings.mockRejectedValue(new Error('network'));
    await initRevenueCat('user-1');
    await expect(getOfferings()).resolves.toBeNull();
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { area: 'revenuecat-offerings' } }),
    );
  });
});

// ─── Customer info listener wiring ────────────────────────────────────────────

describe('customer info listener — keeps userStore in sync', () => {
  it('flips isPremium to true when the listener fires with an active entitlement', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    expect(useUserStore.getState().isPremium).toBe(false);

    // Grab the listener that was registered and fire it as RC would.
    const listener = mockAddListener.mock.calls[0][0] as (info: any) => void;
    listener(ACTIVE_ENTITLEMENT_INFO);
    expect(useUserStore.getState().isPremium).toBe(true);
  });

  it('flips isPremium back to false when entitlement disappears', async () => {
    mockGetCustomerInfo.mockResolvedValue(ACTIVE_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    expect(useUserStore.getState().isPremium).toBe(true);

    const listener = mockAddListener.mock.calls[0][0] as (info: any) => void;
    listener(NO_ENTITLEMENT_INFO);
    expect(useUserStore.getState().isPremium).toBe(false);
  });

  it('forces isPremium=false when listener fires while kill switch is off', async () => {
    // Real scenario: RC fires the listener after a webhook-driven entitlement
    // change, but the kill switch was just flipped off via OTA. The listener
    // must respect the kill switch so locally-cached entitlements can't unlock
    // the surface against a remote-disabled flag.
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    const listener = mockAddListener.mock.calls[0][0] as (info: any) => void;

    mockKillSwitchOn = false;
    listener(ACTIVE_ENTITLEMENT_INFO);
    expect(useUserStore.getState().isPremium).toBe(false);
  });
});

// ─── Additional edge cases — defensive paths that production code WILL hit ────

describe('initRevenueCat — concurrent calls race condition', () => {
  // Two effect cycles fire in the same tick before the first init resolves.
  // The `initialized = true` flag must guard the entire flow — not just the
  // start — otherwise we double-configure the SDK.
  it('configures Purchases only once even when init is awaited from two callers in parallel', async () => {
    let resolveCustomerInfo: (info: unknown) => void = () => {};
    mockGetCustomerInfo.mockReturnValue(
      new Promise((r) => { resolveCustomerInfo = r; }),
    );

    const a = initRevenueCat('user-1');
    const b = initRevenueCat('user-1');
    resolveCustomerInfo(NO_ENTITLEMENT_INFO);
    await Promise.all([a, b]);

    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockAddListener).toHaveBeenCalledTimes(1);
  });
});

describe('initRevenueCat — re-init with different userId is a no-op', () => {
  // Documenting current behavior: switching users requires explicit
  // logoutRevenueCat() then initRevenueCat() (or loginRevenueCat()). A second
  // init with a different userId silently no-ops — caller should use login.
  it('does NOT reconfigure when init is called again with a different userId', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    await initRevenueCat('user-2');
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith({
      apiKey: 'appl_test_key',
      appUserID: 'user-1',
    });
  });
});

describe('purchasePackage — error propagation', () => {
  it('rethrows when Purchases.purchasePackage rejects (user cancellation surfaces to caller)', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockPurchasePackage.mockRejectedValue(
      Object.assign(new Error('Purchase cancelled'), { userCancelled: true }),
    );
    await initRevenueCat('user-1');
    await expect(purchasePackage({ identifier: 'monthly' } as any))
      .rejects.toThrow(/cancelled/i);
  });

  it('returns false when purchase resolves but entitlement is not active', async () => {
    // Defensive: RC reports a successful purchase but the entitlement hasn't
    // propagated yet (rare, network race). isPremium gates the return value
    // so we don't claim premium status until the entitlement is real.
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockPurchasePackage.mockResolvedValue({ customerInfo: NO_ENTITLEMENT_INFO });
    await initRevenueCat('user-1');
    await expect(purchasePackage({ identifier: 'monthly' } as any))
      .resolves.toBe(false);
  });
});

describe('restorePurchases — kill switch supersedes restore result', () => {
  it('returns false when kill switch flips off mid-session even if entitlement is restored', async () => {
    // Realistic: user subscribed before launch (sandbox), kill switch was off
    // at boot, then flipped on later. Restore returns the entitlement, but
    // isPremium is gated by the flag — Mori+ stays locked.
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockRestorePurchases.mockResolvedValue(ACTIVE_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    mockKillSwitchOn = false;
    await expect(restorePurchases()).resolves.toBe(false);
  });
});

describe('logoutRevenueCat — error swallowing', () => {
  it('clears userStore.isPremium even when Purchases.logOut throws', async () => {
    mockGetCustomerInfo.mockResolvedValue(ACTIVE_ENTITLEMENT_INFO);
    mockLogOut.mockRejectedValue(new Error('logout failed'));
    await initRevenueCat('user-1');
    expect(useUserStore.getState().isPremium).toBe(true);

    // setPremium(false) runs BEFORE the try/catch — that's the contract.
    // Even if RC reports a logout failure, the local flag must reset so the
    // next user on the device starts cold.
    await expect(logoutRevenueCat()).resolves.toBeUndefined();
    expect(useUserStore.getState().isPremium).toBe(false);
    expect(mockSentryCapture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { area: 'revenuecat-logout' } }),
    );
  });

  it('is safe to call twice in a row', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    mockLogOut.mockResolvedValue(undefined);
    await initRevenueCat('user-1');
    await logoutRevenueCat();
    await logoutRevenueCat();
    expect(useUserStore.getState().isPremium).toBe(false);
    expect(mockSentryCapture).not.toHaveBeenCalled();
  });
});

describe('handleCustomerInfoUpdate — defensive null handling', () => {
  it('does not crash when listener fires with null customer info', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    const listener = mockAddListener.mock.calls[0][0] as (info: any) => void;
    expect(() => listener(null)).not.toThrow();
    expect(useUserStore.getState().isPremium).toBe(false);
  });

  it('does not crash when listener fires with malformed entitlement object', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    const listener = mockAddListener.mock.calls[0][0] as (info: any) => void;
    expect(() => listener({ entitlements: null } as any)).not.toThrow();
    expect(() => listener({} as any)).not.toThrow();
    expect(useUserStore.getState().isPremium).toBe(false);
  });
});

describe('__resetRevenueCatForTest — enables reliable test isolation', () => {
  it('flips initialized back so init can run again with a different config', async () => {
    mockGetCustomerInfo.mockResolvedValue(NO_ENTITLEMENT_INFO);
    await initRevenueCat('user-1');
    expect(mockConfigure).toHaveBeenCalledTimes(1);

    __resetRevenueCatForTest();
    await initRevenueCat('user-2');
    expect(mockConfigure).toHaveBeenCalledTimes(2);
    expect(mockConfigure).toHaveBeenLastCalledWith({
      apiKey: 'appl_test_key',
      appUserID: 'user-2',
    });
  });
});
