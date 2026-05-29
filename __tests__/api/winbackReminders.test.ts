/**
 * Tests for /api/cron/winback-reminders — dormancy re-engagement push.
 * Stage math itself is unit-tested in __tests__/lib/winback.test.ts; here we
 * cover the cron wiring: auth/method gates, eligibility → send, the personalized
 * deep-link payload, and the winback_stage/last_winback_reminder_at update.
 */

const mockVerifyCronAuth = jest.fn();
const mockSendExpoPush = jest.fn();

jest.mock('@/api/cron/_auth', () => ({
  verifyCronAuth: (...args: any[]) => mockVerifyCronAuth(...args),
}));
jest.mock('@/api/_pushUtils', () => ({
  sendExpoPush: (...args: any[]) => mockSendExpoPush(...args),
}));

// `mock`-prefixed so jest's hoisted mock factory may reference them.
let mockProfilesResult: { data: any[] | null; error: any } = { data: [], error: null };
let mockSavedResult: { data: any[]; error: any } = { data: [], error: null };
let mockCookedResult: { data: any[]; error: any } = { data: [], error: null };
let mockTopResult: { data: any[]; error: any } = { data: [], error: null };
const mockProfileUpdates: Array<{ patch: any; id: string }> = [];

const mockMakeChain = (getResult: () => any) => {
  const chain: any = {};
  for (const m of ['select', 'eq', 'not', 'lt', 'gt', 'gte', 'in', 'is', 'order', 'limit']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(getResult()).then(resolve, reject);
  return chain;
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn(() => mockMakeChain(() => mockProfilesResult)),
          update: jest.fn((patch: any) => ({
            eq: jest.fn(async (_c: string, id: string) => { mockProfileUpdates.push({ patch, id }); return { error: null }; }),
          })),
        };
      }
      if (table === 'saved_recipes') return { select: jest.fn(() => mockMakeChain(() => mockSavedResult)) };
      if (table === 'recipe_interactions') return { select: jest.fn(() => mockMakeChain(() => mockCookedResult)) };
      if (table === 'recipes') return { select: jest.fn(() => mockMakeChain(() => mockTopResult)) };
      return {};
    }),
  })),
}));

import handler from '@/api/cron/winback-reminders';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const makeReq = (o: Record<string, any> = {}) => ({ method: 'GET', headers: {}, ...o });
const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const end = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json, end });
  return { status, json, end };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProfilesResult = { data: [], error: null };
  mockSavedResult = { data: [], error: null };
  mockCookedResult = { data: [], error: null };
  mockTopResult = { data: [], error: null };
  mockProfileUpdates.length = 0;
  mockVerifyCronAuth.mockReturnValue(true);
  mockSendExpoPush.mockResolvedValue(undefined);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe('winback-reminders — gates', () => {
  it('401 without CRON_SECRET', async () => {
    mockVerifyCronAuth.mockReturnValue(false);
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('405 on non-GET/POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'PUT' }) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('sent=0 when no eligible profiles', async () => {
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 0 });
  });

  it('500 when profiles query errors', async () => {
    mockProfilesResult = { data: null, error: { message: 'boom' } };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('winback-reminders — send', () => {
  it('sends stage-1 with a deep-link to the saved-uncooked recipe + advances stage', async () => {
    mockProfilesResult = { data: [{
      id: 'u1', push_token: 'ExponentPushToken[x]', last_active_at: daysAgo(8),
      last_winback_reminder_at: null, winback_stage: 0, cuisine_preferences: [],
    }], error: null };
    mockSavedResult = { data: [{ user_id: 'u1', recipe_id: 'r1', saved_at: daysAgo(20), recipes: { id: 'r1', title: 'Lemon Salmon', cuisine: 'seafood' } }], error: null };

    const res = makeRes();
    await handler(makeReq() as any, res as any);

    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ExponentPushToken[x]',
      data: expect.objectContaining({ type: 'winback', stage: 1, url: 'mori://r/r1' }),
    }));
    expect(mockProfileUpdates).toEqual([{ patch: { last_winback_reminder_at: expect.any(String), winback_stage: 1 }, id: 'u1' }]);
    expect(res.json).toHaveBeenCalledWith({ sent: 1, checked: 1 });
  });

  it('does not send when inactivity < 7 days (stage stays 0)', async () => {
    mockProfilesResult = { data: [{
      id: 'u1', push_token: 'tok', last_active_at: daysAgo(3),
      last_winback_reminder_at: null, winback_stage: 0, cuisine_preferences: [],
    }], error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 1 });
  });

  it('sends stage-2 at ≥14 days when stage 1 already sent and spaced', async () => {
    mockProfilesResult = { data: [{
      id: 'u1', push_token: 'tok', last_active_at: daysAgo(15),
      last_winback_reminder_at: daysAgo(7), winback_stage: 1, cuisine_preferences: [],
    }], error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    expect(mockProfileUpdates[0].patch.winback_stage).toBe(2);
  });

  it('falls back to a generic nudge (Discover) when nothing saved', async () => {
    mockProfilesResult = { data: [{
      id: 'u1', push_token: 'tok', last_active_at: daysAgo(8),
      last_winback_reminder_at: null, winback_stage: 0, cuisine_preferences: [],
    }], error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'winback', stage: 1, url: 'mori://' }),
    }));
  });
});
