/**
 * Tests for lib/paywall.ts — RevenueCat Paywalls v2 / Customer Center wrapper.
 * Pure helpers (mapPaywallResult, grantsAccess, formatOfferingForDebug) plus the
 * present* guards (kill-switch off + native-module-absent must no-op safely).
 */

// Default: native UI module ABSENT (Expo Go). Individual tests can re-mock it.
jest.mock('react-native-purchases-ui', () => { throw new Error('native module unavailable'); }, { virtual: true });

import {
  mapPaywallResult, grantsAccess, formatOfferingForDebug,
  presentMoriPlusPaywall, gateMoriPlus, presentManageSubscription,
} from '@/lib/paywall';
import { flags } from '@/lib/featureFlags';

describe('mapPaywallResult', () => {
  it.each([
    ['PURCHASED', 'purchased'],
    ['RESTORED', 'restored'],
    ['CANCELLED', 'cancelled'],
    ['CANCELED', 'cancelled'],
    ['NOT_PRESENTED', 'not_presented'],
    ['ERROR', 'error'],
    ['something-weird', 'error'],
    [undefined, 'error'],
    [null, 'error'],
  ])('%p → %p', (raw, expected) => {
    expect(mapPaywallResult(raw)).toBe(expected);
  });
});

describe('grantsAccess', () => {
  it('purchased / restored / not_presented grant access', () => {
    expect(grantsAccess('purchased')).toBe(true);
    expect(grantsAccess('restored')).toBe(true);
    expect(grantsAccess('not_presented')).toBe(true); // already entitled
  });
  it('cancelled / error do NOT grant access', () => {
    expect(grantsAccess('cancelled')).toBe(false);
    expect(grantsAccess('error')).toBe(false);
  });
});

describe('formatOfferingForDebug', () => {
  it('returns [] for null/empty/malformed offerings', () => {
    expect(formatOfferingForDebug(null)).toEqual([]);
    expect(formatOfferingForDebug({})).toEqual([]);
    expect(formatOfferingForDebug({ availablePackages: 'nope' })).toEqual([]);
  });
  it('flattens packages and fills "?" for missing fields', () => {
    const offering = {
      availablePackages: [
        { identifier: '$rc_monthly', product: { identifier: 'mori_plus_monthly', priceString: '$6.99', title: 'Mori+ Monthly' } },
        { identifier: '$rc_annual', product: {} }, // missing product fields
      ],
    };
    expect(formatOfferingForDebug(offering)).toEqual([
      { packageId: '$rc_monthly', productId: 'mori_plus_monthly', priceString: '$6.99', title: 'Mori+ Monthly' },
      { packageId: '$rc_annual', productId: '?', priceString: '?', title: '?' },
    ]);
  });
});

describe('present* guards — safe no-op when native module is absent (Expo Go)', () => {
  beforeAll(() => { (flags as any).moriPlusEnabled = true; }); // force on; module mock still throws
  it('presentMoriPlusPaywall → not_presented (no crash)', async () => {
    await expect(presentMoriPlusPaywall()).resolves.toBe('not_presented');
  });
  it('gateMoriPlus → false (no access granted)', async () => {
    await expect(gateMoriPlus()).resolves.toBe(false);
  });
  it('presentManageSubscription → resolves without throwing', async () => {
    await expect(presentManageSubscription()).resolves.toBeUndefined();
  });
});
