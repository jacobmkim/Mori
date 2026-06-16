/**
 * Tests for api/_aiUsage.ts — free-tier monthly budget gate.
 * currentMonthKey is pure; checkAiBudget + incrementAiUsage use a mocked client.
 */

const mockMaybeSingle = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn(() => ({
  select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) }),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom, rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

import {
  checkAiBudget, incrementAiUsage, currentMonthKey,
  FREE_AI_LIMITS, DEFAULT_FREE_AI_LIMIT, UNLIMITED,
} from '@/api/_aiUsage';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
});

describe('currentMonthKey — UTC, no off-by-one', () => {
  it.each([
    ['2026-12-31T23:59:59Z', '2026-12'],
    ['2027-01-01T00:00:00Z', '2027-01'],
    ['2026-01-01T00:00:00Z', '2026-01'],
    ['2026-06-15T12:34:56Z', '2026-06'],
  ])('%s → %s', (iso, expected) => {
    expect(currentMonthKey(new Date(iso))).toBe(expected);
  });
});

describe('checkAiBudget — premium is unlimited (JSON-safe sentinel)', () => {
  it('returns allowed + UNLIMITED sentinel without touching the DB', async () => {
    const r = await checkAiBudget('u1', 'generate-recipe', true);
    expect(r).toEqual({ allowed: true, used: 0, remaining: UNLIMITED, limit: UNLIMITED });
    expect(mockFrom).not.toHaveBeenCalled();
  });
  it('UNLIMITED survives JSON round-trip (unlike Infinity → null) (Bug #8 fix)', () => {
    expect(JSON.parse(JSON.stringify({ remaining: UNLIMITED })).remaining).toBe(UNLIMITED);
  });
});

describe('checkAiBudget — free tier thresholds', () => {
  const setUsed = (count: number | null) =>
    mockMaybeSingle.mockResolvedValue({ data: count == null ? null : { count }, error: null });

  it('no row yet → used 0, allowed, remaining = full limit', async () => {
    setUsed(null);
    const r = await checkAiBudget('u1', 'generate-recipe', false);
    expect(r).toEqual({ allowed: true, used: 0, remaining: 3, limit: 3 });
  });
  it('allows at used = limit-1', async () => {
    setUsed(2);
    expect((await checkAiBudget('u1', 'generate-recipe', false)).allowed).toBe(true);
  });
  it('blocks exactly at used === limit', async () => {
    setUsed(3);
    const r = await checkAiBudget('u1', 'generate-recipe', false);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
  it('remaining never goes negative when used > limit (post-race overshoot)', async () => {
    setUsed(5);
    const r = await checkAiBudget('u1', 'generate-recipe', false);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
  it('uses per-endpoint limits', async () => {
    setUsed(0);
    expect((await checkAiBudget('u1', 'generate-from-pantry', false)).limit).toBe(FREE_AI_LIMITS['generate-from-pantry']);
    expect((await checkAiBudget('u1', 'taste-profile', false)).limit).toBe(FREE_AI_LIMITS['taste-profile']);
  });
  it('falls back to DEFAULT_FREE_AI_LIMIT for an unknown endpoint', async () => {
    setUsed(0);
    expect((await checkAiBudget('u1', 'mystery', false)).limit).toBe(DEFAULT_FREE_AI_LIMIT);
  });
  it('throws on a DB read error (caller must catch)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    await expect(checkAiBudget('u1', 'generate-recipe', false)).rejects.toThrow();
  });
});

describe('incrementAiUsage', () => {
  it('calls the service-role RPC with the verified user + endpoint', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await incrementAiUsage('u1', 'generate-recipe');
    expect(mockRpc).toHaveBeenCalledWith('increment_ai_usage', { p_user: 'u1', p_endpoint: 'generate-recipe' });
  });
  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ error: { code: 'XX000' } });
    await expect(incrementAiUsage('u1', 'generate-recipe')).rejects.toThrow();
  });
});
