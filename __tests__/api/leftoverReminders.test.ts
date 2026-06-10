/**
 * Tests for /api/cron/leftover-reminders — daily bundled push when a user
 * has ingredients expiring within 48h.
 *
 * Key invariants:
 *  - Auth gate (CRON_SECRET).
 *  - Empty leftovers → no push, 0 counts.
 *  - Multi-item bundling: one push per user even with N expiring ingredients.
 *  - Cooldown via `last_leftover_reminder_at` prevents same-day re-fire.
 *  - Opt-out (`notify_leftovers=false`) skips the user.
 *  - Missing push_token skips.
 */

const mockVerifyCronAuth = jest.fn();
const mockSendExpoPush = jest.fn();

jest.mock('@/api/cron/_auth', () => ({
  verifyCronAuth: (...args: any[]) => mockVerifyCronAuth(...args),
}));

jest.mock('@/api/_pushUtils', () => ({
  sendExpoPush: (...args: any[]) => mockSendExpoPush(...args),
}));

let mockLeftoversResult: { data: any[] | null; error: any } = { data: [], error: null };
let mockProfilesResult: { data: any[] | null; error: any } = { data: [], error: null };
const mockProfileUpdates: Array<{ patch: any; id: string }> = [];
// Whether the race-safe conditional claim (update…or…select) matches a row.
// false simulates a concurrent run having already claimed the cooldown slot.
let mockClaimWins = true;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'user_leftovers') {
        return {
          select: jest.fn(() => ({
            is: jest.fn(() => ({
              gt: jest.fn(() => ({
                lt: jest.fn().mockImplementation(() => Promise.resolve(mockLeftoversResult)),
              })),
            })),
          })),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            in: jest.fn(() => ({
              eq: jest.fn(() => ({
                not: jest.fn().mockImplementation(() => Promise.resolve(mockProfilesResult)),
              })),
            })),
          })),
          // Race-safe claim: update().eq().or().select() returns the claimed row.
          update: jest.fn((patch: any) => ({
            eq: jest.fn((_col: string, id: string) => ({
              or: jest.fn(() => ({
                select: jest.fn(async () => {
                  if (!mockClaimWins) return { data: [], error: null };
                  mockProfileUpdates.push({ patch, id });
                  return { data: [{ id }], error: null };
                }),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  })),
}));

import handler, { joinIngredients } from '@/api/cron/leftover-reminders';

const makeReq = (overrides: Record<string, any> = {}) => ({ method: 'GET', headers: {}, ...overrides });

const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const end = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json, end });
  return { status, json, end };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLeftoversResult = { data: [], error: null };
  mockProfilesResult = { data: [], error: null };
  mockProfileUpdates.length = 0;
  mockClaimWins = true;
  mockVerifyCronAuth.mockReturnValue(true);
  mockSendExpoPush.mockResolvedValue(undefined);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ─── joinIngredients pure logic ───────────────────────────────────────────────

describe('joinIngredients — bundling helper', () => {
  it('handles 1 item', () => expect(joinIngredients(['chicken'])).toBe('Chicken'));
  it('handles 2 items with "and"', () => expect(joinIngredients(['chicken', 'spinach'])).toBe('Chicken and spinach'));
  it('handles 3 items with oxford comma', () =>
    expect(joinIngredients(['chicken', 'spinach', 'yogurt'])).toBe('Chicken, spinach, and yogurt'));
  it('overflows 4+ items into "+N more"', () =>
    expect(joinIngredients(['a', 'b', 'c', 'd'])).toBe('A, b, and 2 more'));
  it('handles empty', () => expect(joinIngredients([])).toBe(''));
});

// ─── Auth + empty paths ───────────────────────────────────────────────────────

describe('leftover-reminders — gate + no-op', () => {
  it('rejects without CRON_SECRET', async () => {
    mockVerifyCronAuth.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects non-GET/POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 0/0 when no leftovers are expiring', async () => {
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 0 });
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('500s on a leftovers fetch error', async () => {
    mockLeftoversResult = { data: null, error: { message: 'boom' } };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Bundling + push behaviour ────────────────────────────────────────────────

describe('leftover-reminders — bundles + pushes', () => {
  const soon = new Date(Date.now() + 24 * 3600_000).toISOString();
  const sooner = new Date(Date.now() + 6 * 3600_000).toISOString();

  it('fires one bundled push for a user with 3 expiring items', async () => {
    mockLeftoversResult = {
      data: [
        { user_id: 'u1', ingredient_name: 'chicken', spoils_at: sooner },
        { user_id: 'u1', ingredient_name: 'spinach', spoils_at: soon },
        { user_id: 'u1', ingredient_name: 'yogurt',  spoils_at: soon },
      ],
      error: null,
    };
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_leftovers: true, last_leftover_reminder_at: null }],
      error: null,
    };

    const res = makeRes();
    await handler(makeReq() as any, res as any);

    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.to).toBe('tok');
    expect(call.title).toMatch(/Expiring/);
    expect(call.body.toLowerCase()).toContain('chicken');
    expect(call.body.toLowerCase()).toContain('spinach');
    expect(call.body.toLowerCase()).toContain('yogurt');
    expect(res.json).toHaveBeenCalledWith({ sent: 1, checked: 1 });
    expect(mockProfileUpdates).toHaveLength(1);
    expect(mockProfileUpdates[0].id).toBe('u1');
  });

  it('skips users whose last_leftover_reminder_at is inside the cooldown', async () => {
    mockLeftoversResult = {
      data: [{ user_id: 'u1', ingredient_name: 'chicken', spoils_at: soon }],
      error: null,
    };
    const recent = new Date(Date.now() - 60_000).toISOString();
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_leftovers: true, last_leftover_reminder_at: recent }],
      error: null,
    };

    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 1 });
  });

  it('fires one push per user when multiple users have expiring items', async () => {
    mockLeftoversResult = {
      data: [
        { user_id: 'u1', ingredient_name: 'chicken', spoils_at: soon },
        { user_id: 'u2', ingredient_name: 'fish',    spoils_at: soon },
      ],
      error: null,
    };
    mockProfilesResult = {
      data: [
        { id: 'u1', push_token: 'tok1', notify_leftovers: true, last_leftover_reminder_at: null },
        { id: 'u2', push_token: 'tok2', notify_leftovers: true, last_leftover_reminder_at: null },
      ],
      error: null,
    };

    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ sent: 2, checked: 2 });
  });

  it('does NOT push when the conditional claim loses the race (no double-send)', async () => {
    mockClaimWins = false; // a concurrent run already bumped the cooldown column
    mockLeftoversResult = {
      data: [{ user_id: 'u1', ingredient_name: 'chicken', spoils_at: soon }],
      error: null,
    };
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_leftovers: true, last_leftover_reminder_at: null }],
      error: null,
    };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 1 });
  });

  it('uses a singular title when only one item is expiring', async () => {
    mockLeftoversResult = {
      data: [{ user_id: 'u1', ingredient_name: 'chicken', spoils_at: soon }],
      error: null,
    };
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_leftovers: true, last_leftover_reminder_at: null }],
      error: null,
    };
    await handler(makeReq() as any, makeRes() as any);
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.title).toBe('🥬 Expiring tomorrow');
    expect(call.body).toContain('Chicken');
  });
});
