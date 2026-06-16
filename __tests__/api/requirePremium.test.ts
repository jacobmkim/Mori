/**
 * Tests for api/_requirePremium.ts — the server-side Mori+ gate.
 * isPremiumActive is pure (full edge-case table from the adversarial review);
 * requirePremium is covered with mocked auth + Supabase.
 */

const mockRequireAuth = jest.fn();
const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
}));

jest.mock('@/api/_apiAuth', () => {
  // Keep the REAL AuthError (a plain class); only stub requireAuth. Defining the
  // class inline here would trip jest's mock-hoisting on the TS param property.
  const actual = jest.requireActual('@/api/_apiAuth');
  return { ...actual, requireAuth: (...a: unknown[]) => mockRequireAuth(...a) };
});
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mockFrom }) }));

import { isPremiumActive, requirePremium } from '@/api/_requirePremium';
import { AuthError } from '@/api/_apiAuth';

const NOW = 1_800_000_000_000;
const future = new Date(NOW + 1e9).toISOString();
const past = new Date(NOW - 1e9).toISOString();

describe('isPremiumActive — full edge-case table', () => {
  it.each([
    ['null', null, false],
    ['undefined', undefined, false],
    ['empty object', {}, false],
    ['premium, no expiry', { is_premium: true }, true],
    ['premium, future expiry', { is_premium: true, premium_expires_at: future }, true],
    ['premium, past expiry (defense-in-depth revoke)', { is_premium: true, premium_expires_at: past }, false],
    ['grace true, past expiry (16-day window)', { premium_in_grace_period: true, premium_expires_at: past }, true],
    ['grace true, is_premium false', { premium_in_grace_period: true, is_premium: false }, true],
    ['neither flag', { is_premium: false, premium_in_grace_period: false }, false],
    ['unparseable expiry string → fail closed', { is_premium: true, premium_expires_at: 'not-a-date' }, false],
    ['EMPTY-string expiry → fail closed (Bug #3 fix)', { is_premium: true, premium_expires_at: '' }, false],
    ['non-boolean grace ("true") ignored', { premium_in_grace_period: 'true' as any }, false],
    ['truthy non-bool is_premium (1) ignored', { is_premium: 1 as any }, false],
  ])('%s', (_label, row, expected) => {
    expect(isPremiumActive(row as any, NOW)).toBe(expected);
  });

  it('exact-instant expiry is exclusive (expired AT now)', () => {
    expect(isPremiumActive({ is_premium: true, premium_expires_at: new Date(NOW).toISOString() }, NOW)).toBe(false);
  });
});

describe('requirePremium', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  });
  const req = {} as any;

  it('propagates the 401 from requireAuth before any DB read', async () => {
    mockRequireAuth.mockRejectedValue(new AuthError(401, 'Missing authorization token'));
    await expect(requirePremium(req)).rejects.toMatchObject({ statusCode: 401 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns the userId for an active premium profile', async () => {
    mockRequireAuth.mockResolvedValue('user-1');
    mockMaybeSingle.mockResolvedValue({ data: { is_premium: true, premium_expires_at: future }, error: null });
    await expect(requirePremium(req)).resolves.toBe('user-1');
  });

  it('throws 402 for a free user (row with is_premium=false)', async () => {
    mockRequireAuth.mockResolvedValue('user-1');
    mockMaybeSingle.mockResolvedValue({ data: { is_premium: false }, error: null });
    await expect(requirePremium(req)).rejects.toMatchObject({ statusCode: 402 });
  });

  it('throws 402 when no profile row exists (maybeSingle null)', async () => {
    mockRequireAuth.mockResolvedValue('user-1');
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(requirePremium(req)).rejects.toMatchObject({ statusCode: 402 });
  });

  it('throws 500 and FAILS CLOSED on a DB error', async () => {
    mockRequireAuth.mockResolvedValue('user-1');
    mockMaybeSingle.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    await expect(requirePremium(req)).rejects.toMatchObject({ statusCode: 500 });
  });

  it('honors the grace period (expired but in grace → allowed)', async () => {
    mockRequireAuth.mockResolvedValue('user-1');
    mockMaybeSingle.mockResolvedValue({
      data: { is_premium: false, premium_in_grace_period: true, premium_expires_at: past }, error: null });
    await expect(requirePremium(req)).resolves.toBe('user-1');
  });
});
