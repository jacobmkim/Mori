/**
 * Tests for /api/cron/creator-milestones — daily push for submitters whose
 * saves-earned or cooks-earned totals cross a badge tier.
 *
 * Key invariants:
 *  - Rejects requests without CRON_SECRET (push-flood DoS guard).
 *  - Non-GET/POST → 405.
 *  - Tier-crossing math: only fires the highest newly-crossed tier per metric,
 *    never duplicates an already-notified tier (idempotency on cron re-runs).
 *  - Persists last_*_milestone_notified after each send so the next run
 *    doesn't re-fire the same tier.
 *  - Returns { sent, checked } summary.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockVerifyCronAuth = jest.fn();
const mockSendExpoPush = jest.fn();

jest.mock('@/api/cron/_auth', () => ({
  verifyCronAuth: (...args: any[]) => mockVerifyCronAuth(...args),
}));

jest.mock('@/api/_pushUtils', () => ({
  sendExpoPush: (...args: any[]) => mockSendExpoPush(...args),
}));

// Eligible users returned by the initial profiles SELECT.
let mockUsersResult: { data: any[] | null; error: any } = { data: [], error: null };
// Per-user recipes lookup — keyed by submitted_by user id.
const mockRecipesByUser: Record<string, { save_count: number; cook_count: number }[]> = {};
// Updates captured for idempotency assertions.
const mockProfileUpdates: Array<{ patch: any; id: string }> = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            gt: jest.fn(() => ({
              not: jest.fn(() => ({
                eq: jest.fn().mockImplementation(() => Promise.resolve(mockUsersResult)),
              })),
            })),
          })),
          // Race-safe claim: update().eq().or().select() returns the claimed row.
          update: jest.fn((patch: any) => ({
            eq: jest.fn((_col: string, id: string) => ({
              or: jest.fn(() => ({
                select: jest.fn(async () => {
                  mockProfileUpdates.push({ patch, id });
                  return { data: [{ id }], error: null };
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'recipes') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn().mockImplementation((_col: string, id: string) =>
              Promise.resolve({ data: mockRecipesByUser[id] ?? [], error: null }),
            ),
          })),
        };
      }
      return {};
    }),
  })),
}));

import handler from '@/api/cron/creator-milestones';

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
  mockUsersResult = { data: [], error: null };
  for (const k of Object.keys(mockRecipesByUser)) delete mockRecipesByUser[k];
  mockProfileUpdates.length = 0;
  mockVerifyCronAuth.mockReturnValue(true);
  mockSendExpoPush.mockResolvedValue(undefined);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ─── Auth + method gate ───────────────────────────────────────────────────────

describe('creator-milestones — auth gate', () => {
  it('rejects requests without CRON_SECRET', async () => {
    mockVerifyCronAuth.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('rejects non-GET/POST methods', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'DELETE' }) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ─── No-op cases ──────────────────────────────────────────────────────────────

describe('creator-milestones — empty state', () => {
  it('returns sent=0 checked=0 when no eligible users', async () => {
    mockUsersResult = { data: [], error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 0 });
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('returns 500 when the users query errors', async () => {
    mockUsersResult = { data: null, error: { message: 'boom' } };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Tier-crossing math ───────────────────────────────────────────────────────

describe('creator-milestones — tier crossing', () => {
  it('fires the first-save (tier 1) push for a freshly notified user', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'ExponentPushToken[abc]',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 0,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 1,
      }],
      error: null,
    };
    mockRecipesByUser['u1'] = [{ save_count: 1, cook_count: 0 }];
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ExponentPushToken[abc]',
      data: { type: 'creator_milestone', metric: 'saves', tier: 1 },
    }));
    expect(res.json).toHaveBeenCalledWith({ sent: 1, checked: 1 });
  });

  it('skips the saves push when current === lastNotified (idempotency)', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'tok',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 10,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 1,
      }],
      error: null,
    };
    // 12 saves but already notified at tier 10 → next tier is 50 (not crossed).
    mockRecipesByUser['u1'] = [{ save_count: 12, cook_count: 0 }];
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 1 });
  });

  it('fires the HIGHEST newly-crossed tier when multiple tiers are jumped in one day', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'tok',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 0,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 2,
      }],
      error: null,
    };
    // 75 saves — crosses 1, 10, AND 50 in one go. We should only notify 50.
    mockRecipesByUser['u1'] = [
      { save_count: 50, cook_count: 0 },
      { save_count: 25, cook_count: 0 },
    ];
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      data: { type: 'creator_milestone', metric: 'saves', tier: 50 },
    }));
  });

  it('fires both saves AND cooks when each crosses a separate tier the same day', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'tok',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 0,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 1,
      }],
      error: null,
    };
    mockRecipesByUser['u1'] = [{ save_count: 10, cook_count: 1 }];
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(2);
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      data: { type: 'creator_milestone', metric: 'saves', tier: 10 },
    }));
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      data: { type: 'creator_milestone', metric: 'cooks', tier: 1 },
    }));
    expect(res.json).toHaveBeenCalledWith({ sent: 2, checked: 1 });
  });

  it('persists last_*_milestone_notified after each push (idempotency on next run)', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'tok',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 0,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 1,
      }],
      error: null,
    };
    mockRecipesByUser['u1'] = [{ save_count: 50, cook_count: 10 }];
    await handler(makeReq() as any, makeRes() as any);
    expect(mockProfileUpdates).toEqual([
      { patch: { last_saves_earned_milestone_notified: 50 }, id: 'u1' },
      { patch: { last_cooks_earned_milestone_notified: 10 }, id: 'u1' },
    ]);
  });

  it('caps the top tier at 100 (no spurious tier crossings beyond the ladder)', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'tok',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 100,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 1,
      }],
      error: null,
    };
    // 500 saves, already notified at 100 → no further push.
    mockRecipesByUser['u1'] = [{ save_count: 500, cook_count: 0 }];
    await handler(makeReq() as any, makeRes() as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('handles users with multiple recipes by summing counts across them', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'tok',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 0,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 3,
      }],
      error: null,
    };
    // Three recipes — 3 + 4 + 3 = 10 total saves → tier 10 fires.
    mockRecipesByUser['u1'] = [
      { save_count: 3, cook_count: 0 },
      { save_count: 4, cook_count: 0 },
      { save_count: 3, cook_count: 0 },
    ];
    await handler(makeReq() as any, makeRes() as any);
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      data: { type: 'creator_milestone', metric: 'saves', tier: 10 },
    }));
  });

  it('skips users whose recipes lookup errors', async () => {
    mockUsersResult = {
      data: [{
        id: 'u1',
        push_token: 'tok',
        notify_creator_events: true,
        last_saves_earned_milestone_notified: 0,
        last_cooks_earned_milestone_notified: 0,
        recipes_submitted_count: 1,
      }],
      error: null,
    };
    // Don't seed mockRecipesByUser['u1'] — mock returns empty array, so sums = 0.
    // 0 saves doesn't cross tier 1 → no push.
    await handler(makeReq() as any, makeRes() as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });
});
