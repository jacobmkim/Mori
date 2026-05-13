/**
 * Tests for /api/cron/community-enrichment — the safety-net cron that
 * backfills macros on community recipes that landed with `macros: null`.
 *
 * Key invariants:
 *  - Rejects requests without CRON_SECRET auth (no admin → public DoS vector).
 *  - Limits per-run to 50 recipes (function budget guard).
 *  - Skips recipes whose ingredients are too sparse for honest macros — no
 *    point burning Claude tokens on submissions /api/macros already rejected.
 *  - Returns { checked, enriched, failed } summary so we can see the cron is
 *    doing real work (or quietly failing) without scraping logs.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockVerifyCronAuth = jest.fn();
const mockEstimateWithClaude = jest.fn();
const mockIsTooSparseForMacros = jest.fn();

jest.mock('@/api/cron/_auth', () => ({
  verifyCronAuth: (...args: any[]) => mockVerifyCronAuth(...args),
}));

jest.mock('@/api/macros', () => ({
  estimateWithClaude: (...args: any[]) => mockEstimateWithClaude(...args),
  isTooSparseForMacros: (...args: any[]) => mockIsTooSparseForMacros(...args),
}));

// Supabase client mock — chainable enough to satisfy the cron's SELECT + UPDATE
// usage. Each test rebuilds the fluent chain via setupSupabase() below.
let mockSelectResult: { data: any[] | null; error: any } = { data: [], error: null };
let mockUpdateResult: { error: any } = { error: null };
const updateCalls: Array<{ patch: any; id: string }> = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          is: jest.fn(() => ({
            not: jest.fn(() => ({
              gte: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue(mockSelectResult),
              })),
            })),
          })),
        })),
      })),
      update: jest.fn((patch: any) => ({
        eq: jest.fn((_col: string, id: string) => ({
          is: jest.fn().mockImplementation(async () => {
            updateCalls.push({ patch, id });
            return mockUpdateResult;
          }),
        })),
      })),
    })),
  })),
}));

import handler from '@/api/cron/community-enrichment';

const makeReq = (overrides: Record<string, any> = {}) => ({
  method: 'GET',
  headers: {},
  ...overrides,
});

const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const end = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json, end });
  return { status, json, end };
};

beforeEach(() => {
  jest.clearAllMocks();
  updateCalls.length = 0;
  mockSelectResult = { data: [], error: null };
  mockUpdateResult = { error: null };
  mockVerifyCronAuth.mockReturnValue(true);
  mockIsTooSparseForMacros.mockReturnValue(false);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ─── Auth gate ────────────────────────────────────────────────────────────────

describe('community-enrichment — auth gate', () => {
  it('rejects requests without CRON_SECRET', async () => {
    mockVerifyCronAuth.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects non-GET/POST methods', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ─── Behaviour ────────────────────────────────────────────────────────────────

describe('community-enrichment — enrichment loop', () => {
  it('returns zero counts when no community recipes are missing macros', async () => {
    mockSelectResult = { data: [], error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ checked: 0, enriched: 0, failed: 0 });
  });

  it('skips recipes that fail the sparse-ingredient gate', async () => {
    mockSelectResult = {
      data: [{ id: 'r1', title: 'Mystery Dish', ingredients: [{ name: 'flour', quantity: '' }], servings: 1 }],
      error: null,
    };
    mockIsTooSparseForMacros.mockReturnValue(true);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockEstimateWithClaude).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ checked: 1, enriched: 0, failed: 1 });
  });

  it('writes computed macros back to the recipe row when Claude succeeds', async () => {
    mockSelectResult = {
      data: [{
        id: 'r1',
        title: 'Pasta',
        ingredients: [
          { name: 'pasta', quantity: '200', unit: 'g' },
          { name: 'tomato', quantity: '3', unit: 'whole' },
          { name: 'olive oil', quantity: '2', unit: 'tbsp' },
        ],
        servings: 2,
      }],
      error: null,
    };
    const fakeMacros = { calories: 380, protein: 12, carbohydrates: 60, fat: 10, fibre: 6, isEstimated: true };
    mockEstimateWithClaude.mockResolvedValue(fakeMacros);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockEstimateWithClaude).toHaveBeenCalledTimes(1);
    expect(updateCalls).toEqual([{ patch: { macros: fakeMacros }, id: 'r1' }]);
    expect(res.json).toHaveBeenCalledWith({ checked: 1, enriched: 1, failed: 0 });
  });

  it('counts failures when Claude returns null (implausible / no key)', async () => {
    mockSelectResult = {
      data: [{ id: 'r1', title: 'X', ingredients: [{}, {}, {}], servings: 2 }],
      error: null,
    };
    mockEstimateWithClaude.mockResolvedValue(null);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(updateCalls).toEqual([]);
    expect(res.json).toHaveBeenCalledWith({ checked: 1, enriched: 0, failed: 1 });
  });

  it('passes servings=4 to Claude when the recipe row has missing/zero servings', async () => {
    mockSelectResult = {
      data: [{ id: 'r1', title: 'X', ingredients: [{}, {}, {}], servings: null }],
      error: null,
    };
    mockEstimateWithClaude.mockResolvedValue(null);
    await handler(makeReq() as any, makeRes() as any);
    expect(mockEstimateWithClaude).toHaveBeenCalledWith('X', expect.any(Array), 4);
  });
});
