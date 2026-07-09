/**
 * Tests for /api/cron/sunday-drop — the Mori+ weekly auto-plan cron (money/trust surface).
 *
 * Strategy (per the test-plan audit): mock the data layer (_sundayDropData) + the optimizer
 * (weekPlanCore.planWeekFromInputs) + push/auth/supabase, so this exercises the HANDLER's
 * orchestration — premium gate, opt-in, push-token, local-time window, atomic idempotency claim,
 * MIN_FILL skip, persistence, push-success gating, dead-token cleanup. The pure scorer/optimizer
 * and the timezone/eligibility helpers are unit-tested separately (weekPlanCore/sundayDrop/timezone).
 */

const mockVerifyCronAuth = jest.fn();
const mockSendExpoPush = jest.fn();
const mockFetchCatalogRows = jest.fn();
const mockBuildCatalog = jest.fn();
const mockFetchUserSignals = jest.fn();
const mockFetchRecentPlanHistory = jest.fn();
const mockPlanWeekFromInputs = jest.fn();

jest.mock('@/api/cron/_auth', () => ({ verifyCronAuth: (...a: any[]) => mockVerifyCronAuth(...a) }));
jest.mock('@/api/_pushUtils', () => ({ sendExpoPush: (...a: any[]) => mockSendExpoPush(...a) }));
jest.mock('@/api/cron/_sundayDropData', () => ({
  fetchCatalogRows: (...a: any[]) => mockFetchCatalogRows(...a),
  buildCatalog: (...a: any[]) => mockBuildCatalog(...a),
  fetchUserSignals: (...a: any[]) => mockFetchUserSignals(...a),
  fetchRecentPlanHistory: (...a: any[]) => mockFetchRecentPlanHistory(...a),
}));
jest.mock('@/lib/weekPlanCore', () => ({ planWeekFromInputs: (...a: any[]) => mockPlanWeekFromInputs(...a) }));

let mockUsers: { data: any[] | null; error: any };
let mockClaim: { data: any[] | null; error: any };
let mockExistingPlan: { data: any | null };
const mealPlanUpserts: any[] = [];
const sundayDropUpdates: any[] = [];
const profileUpdates: Array<{ patch: any; id: string }> = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              not: () => {
                const p: any = Promise.resolve(mockUsers); // `await q`
                p.eq = () => Promise.resolve(mockUsers);     // optional `.eq('id', onlyUserId)`
                return p;
              },
            }),
          }),
          update: (patch: any) => ({
            eq: async (_c: string, id: string) => { profileUpdates.push({ patch, id }); return { error: null }; },
          }),
        };
      }
      if (table === 'sunday_drops') {
        return {
          upsert: () => ({ select: () => Promise.resolve(mockClaim) }), // atomic claim
          update: (patch: any) => ({ eq: () => ({ eq: async () => { sundayDropUpdates.push(patch); return { error: null }; } }) }),
        };
      }
      if (table === 'meal_plans') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => mockExistingPlan }) }) }),
          upsert: async (row: any) => { mealPlanUpserts.push(row); return { error: null }; },
        };
      }
      return {};
    }),
  })),
}));

import handler from '@/api/cron/sunday-drop';

const makeReq = (query: Record<string, any> = {}) => ({ method: 'GET', headers: { authorization: 'Bearer x' }, query });
const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const end = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json, end });
  return { status, json, end };
};

const premiumUser = (over: Record<string, any> = {}) => ({
  id: 'u1',
  timezone: 'UTC',
  push_token: 'ExponentPushToken[TEST]',
  is_premium: true,
  premium_in_grace_period: false,
  premium_expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  notify_sunday_drop: true,
  dietary_goals: [],
  ingredient_dislikes: [],
  skill_level: 'confident_chef',
  cooking_frequency: 'most_days',
  eating_style: 'variety',
  cuisine_preferences: [],
  taste_profile: null,
  weekly_budget: null,
  ...over,
});

// AutoPlanResult with `n` filled dinner slots (recipe.supabase_id set so autoSlotsToStoreSlots keeps them).
const planResult = (n: number) => ({
  slots: Array.from({ length: 7 }, (_, i) => ({
    day: i,
    mealType: 'dinner',
    recipe: i < n ? { supabase_id: `p${i}`, id: `p${i}`, title: `Dish ${i}` } : null,
    provenance: 'auto_plan',
    explanation: `why ${i}`,
    servingsMultiplier: 1,
  })),
  generateNeeded: 7 - n,
  totalCost: 0,
  overBudget: false,
  explanation: 'A varied week of dinners.',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUsers = { data: [], error: null };
  mockClaim = { data: [{ id: 'drop1' }], error: null }; // claim won by default
  mockExistingPlan = { data: null };
  mealPlanUpserts.length = 0;
  sundayDropUpdates.length = 0;
  profileUpdates.length = 0;
  mockVerifyCronAuth.mockReturnValue(true);
  mockSendExpoPush.mockResolvedValue({ ok: true, deviceNotRegistered: false });
  mockFetchCatalogRows.mockResolvedValue([]);
  mockBuildCatalog.mockReturnValue([
    { id: 'p0', supabase_id: 'p0' }, { id: 'p1', supabase_id: 'p1' }, { id: 'p2', supabase_id: 'p2' },
    { id: 'p3', supabase_id: 'p3' }, { id: 'p4', supabase_id: 'p4' }, { id: 'p5', supabase_id: 'p5' }, { id: 'p6', supabase_id: 'p6' },
  ]);
  mockFetchUserSignals.mockResolvedValue({
    swipeMap: new Map(), affinityMap: new Map(), interactionMap: new Map(),
    pantrySet: new Set(), leftoversSet: new Set(), ratingMap: new Map(), savedAtMap: new Map(), savedRecipeIds: [],
  });
  mockFetchRecentPlanHistory.mockResolvedValue(new Map());
  mockPlanWeekFromInputs.mockReturnValue(planResult(7));
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ─── Auth + method gate ──────────────────────────────────────────────────────
describe('sunday-drop — gate', () => {
  it('401 without cron secret', async () => {
    mockVerifyCronAuth.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('405 for non-GET/POST', async () => {
    const res = makeRes();
    await handler({ method: 'DELETE', headers: {}, query: {} } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns zeros when no premium users', async () => {
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ checked: 0, generated: 0, pushed: 0 });
  });
});

// ─── Eligibility skips (force bypasses ONLY the time gate, not premium/opt-in/token) ──
describe('sunday-drop — eligibility', () => {
  it('skips a lapsed-but-flagged premium user (isPremiumActive re-check)', async () => {
    mockUsers = { data: [premiumUser({ premium_expires_at: new Date(Date.now() - 86_400_000).toISOString() })], error: null };
    const res = makeRes();
    await handler(makeReq({ force: '1' }) as any, res as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ checked: 1, generated: 0, pushed: 0 });
  });

  it('honors a grace-period user even with a past expiry', async () => {
    mockUsers = { data: [premiumUser({ premium_in_grace_period: true, premium_expires_at: new Date(Date.now() - 86_400_000).toISOString() })], error: null };
    await handler(makeReq({ force: '1' }) as any, makeRes() as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
  });

  it('skips an opted-out user (notify_sunday_drop === false)', async () => {
    mockUsers = { data: [premiumUser({ notify_sunday_drop: false })], error: null };
    await handler(makeReq({ force: '1' }) as any, makeRes() as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('skips a user without a push_token', async () => {
    mockUsers = { data: [premiumUser({ push_token: null })], error: null };
    await handler(makeReq({ force: '1' }) as any, makeRes() as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });
});

// ─── Idempotency (only fires on !force, since force bypasses the won-claim check) ──
describe('sunday-drop — idempotency claim', () => {
  it('skips when the claim is lost (already dropped this week)', async () => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask', 'nextTick', 'performance'] });
    jest.setSystemTime(new Date('2026-06-21T09:30:00Z')); // Sunday 09:30 UTC — in window
    mockUsers = { data: [premiumUser()], error: null };
    mockClaim = { data: [], error: null }; // duplicate → won = false
    const res = makeRes();
    await handler(makeReq() as any, res as any); // NO force
    expect(mockSendExpoPush).not.toHaveBeenCalled();
    expect(mealPlanUpserts).toHaveLength(0);
    expect(res.json).toHaveBeenCalledWith({ checked: 1, generated: 0, pushed: 0 });
  });
});

// ─── Local-time window (the gate force deletes — tested here with a frozen clock) ──
describe('sunday-drop — local-time window', () => {
  const inWindow = () => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask', 'nextTick', 'performance'] });
    jest.setSystemTime(new Date('2026-06-21T09:30:00Z')); // Sunday 09:30 UTC
  };
  const outOfWindow = () => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask', 'nextTick', 'performance'] });
    jest.setSystemTime(new Date('2026-06-21T16:00:00Z')); // Sunday 16:00 UTC — past the [9,11) window
  };

  it('processes a UTC user inside the Sunday 9–11 window (no force)', async () => {
    inWindow();
    mockUsers = { data: [premiumUser({ timezone: 'UTC' })], error: null };
    await handler(makeReq() as any, makeRes() as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
  });

  it('skips a UTC user outside the window (no force)', async () => {
    outOfWindow();
    mockUsers = { data: [premiumUser({ timezone: 'UTC' })], error: null };
    await handler(makeReq() as any, makeRes() as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('force=1 is IGNORED when NODE_ENV=production (window still applies)', async () => {
    outOfWindow();
    const prev = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';
    try {
      mockUsers = { data: [premiumUser({ timezone: 'UTC' })], error: null };
      await handler(makeReq({ force: '1', userId: 'u1' }) as any, makeRes() as any);
      expect(mockSendExpoPush).not.toHaveBeenCalled(); // force disabled in prod → out-of-window skip wins
    } finally {
      (process.env as any).NODE_ENV = prev;
    }
  });
});

// ─── Proposal generation + push gating (cron stores a PROPOSAL, never writes meal_plans) ──────
describe('sunday-drop — propose + push', () => {
  const proposedPlanUpdates = () => sundayDropUpdates.filter((u) => 'proposed_plan' in u);

  it('happy path: stores a proposal (NOT meal_plans) + records drop + pushes', async () => {
    mockUsers = { data: [premiumUser()], error: null };
    const res = makeRes();
    await handler(makeReq({ force: '1' }) as any, res as any);

    // Never writes the week — only stores a proposal on sunday_drops.
    expect(mealPlanUpserts).toHaveLength(0);
    const proposalUpdate = proposedPlanUpdates()[0];
    expect(proposalUpdate).toBeTruthy();
    const proposed = proposalUpdate.proposed_plan;
    expect(proposed.slots).toHaveLength(7);
    expect(proposed.slots.every((s: any) => s.provenance === 'sunday_drop')).toBe(true);
    expect(proposed.slots.every((s: any) => typeof s.recipeId === 'string')).toBe(true);
    expect(proposalUpdate.recipe_ids).toHaveLength(7); // the drop's own picks

    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    const push = mockSendExpoPush.mock.calls[0][0];
    expect(push.data.type).toBe('sunday_drop');
    expect(push.data.url).toMatch(/^mori:\/\/plan\?week=\d{4}-\d{2}-\d{2}$/); // carries the dropped week
    expect(push.title).toContain('Your week is ready');
    expect(sundayDropUpdates.some((u) => 'notified_at' in u)).toBe(true); // push ok → notified
    expect(res.json).toHaveBeenCalledWith({ checked: 1, generated: 1, pushed: 1 });
  });

  it('MIN_FILL: stores no proposal + no push when fewer than 4 dinners fill (cold start)', async () => {
    mockUsers = { data: [premiumUser()], error: null };
    mockPlanWeekFromInputs.mockReturnValue(planResult(2)); // only 2 fill
    const res = makeRes();
    await handler(makeReq({ force: '1' }) as any, res as any);
    expect(proposedPlanUpdates()).toHaveLength(0);
    expect(mealPlanUpserts).toHaveLength(0);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ checked: 1, generated: 0, pushed: 0 });
  });

  it('does NOT set notified_at when the push fails (transient) — proposal still stored', async () => {
    mockUsers = { data: [premiumUser()], error: null };
    mockSendExpoPush.mockResolvedValue({ ok: false, deviceNotRegistered: false });
    const res = makeRes();
    await handler(makeReq({ force: '1' }) as any, res as any);
    expect(proposedPlanUpdates()).toHaveLength(1);                            // proposal stored
    expect(sundayDropUpdates.some((u) => 'notified_at' in u)).toBe(false);    // NOT marked notified
    expect(profileUpdates).toHaveLength(0);                                   // token not cleared
    expect(res.json).toHaveBeenCalledWith({ checked: 1, generated: 1, pushed: 0 });
  });

  it('clears a dead push_token on DeviceNotRegistered', async () => {
    mockUsers = { data: [premiumUser()], error: null };
    mockSendExpoPush.mockResolvedValue({ ok: false, deviceNotRegistered: true });
    await handler(makeReq({ force: '1' }) as any, makeRes() as any);
    expect(profileUpdates).toEqual([{ patch: { push_token: null }, id: 'u1' }]);
  });

  it('processes multiple users independently — one proposal each, no meal_plans writes', async () => {
    mockUsers = { data: [premiumUser({ id: 'u1' }), premiumUser({ id: 'u2' })], error: null };
    const res = makeRes();
    await handler(makeReq({ force: '1' }) as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(2);
    expect(proposedPlanUpdates()).toHaveLength(2);
    expect(mealPlanUpserts).toHaveLength(0);
    expect(res.json).toHaveBeenCalledWith({ checked: 2, generated: 2, pushed: 2 });
  });
});

// ─── Cross-week variety wiring (the "same drop every Sunday" fix) ─────────────────
describe('sunday-drop — recent-plan history', () => {
  it('threads fetchRecentPlanHistory into planWeekFromInputs as recentHistory', async () => {
    mockUsers = { data: [premiumUser()], error: null };
    const history = new Map([['p0', { weeksAgo: 1, wasCooked: true, proposedOnly: false }]]);
    mockFetchRecentPlanHistory.mockResolvedValue(history);
    await handler(makeReq({ force: '1' }) as any, makeRes() as any);
    expect(mockFetchRecentPlanHistory).toHaveBeenCalledWith(
      expect.anything(), 'u1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(mockPlanWeekFromInputs).toHaveBeenCalledTimes(1);
    expect(mockPlanWeekFromInputs.mock.calls[0][0].recentHistory).toBe(history);
  });

  it('a history-fetch failure degrades to an empty map — the drop still generates + pushes', async () => {
    mockUsers = { data: [premiumUser()], error: null };
    mockFetchRecentPlanHistory.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await handler(makeReq({ force: '1' }) as any, res as any);
    expect(mockPlanWeekFromInputs).toHaveBeenCalledTimes(1);
    expect(mockPlanWeekFromInputs.mock.calls[0][0].recentHistory).toEqual(new Map());
    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ checked: 1, generated: 1, pushed: 1 });
  });
});
