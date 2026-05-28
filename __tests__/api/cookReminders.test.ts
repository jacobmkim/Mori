/**
 * Tests for /api/cron/cook-reminders — daily push for tonight's planned meal.
 *
 * Key invariants:
 *  - Auth + method gate.
 *  - Picks today's slot from the latest meal_plan per user.
 *  - Prefers dinner > lunch > breakfast (since cron fires at dinner time).
 *  - Skips users who already cooked today's featured recipe.
 *  - Respects the `notify_meal_plan` opt-out + cooldown timestamp.
 *  - Pure helpers (utcDayToSlotDay, pickFeaturedSlot) are unit-tested.
 */

const mockVerifyCronAuth = jest.fn();
const mockSendExpoPush = jest.fn();

jest.mock('@/api/cron/_auth', () => ({
  verifyCronAuth: (...args: any[]) => mockVerifyCronAuth(...args),
}));

jest.mock('@/api/_pushUtils', () => ({
  sendExpoPush: (...args: any[]) => mockSendExpoPush(...args),
}));

let mockPlansResult: { data: any[] | null; error: any } = { data: [], error: null };
let mockProfilesResult: { data: any[] | null; error: any } = { data: [], error: null };
let mockRecipesResult: { data: any[] | null; error: any } = { data: [], error: null };
let mockCookedResult: { data: any[] | null; error: any } = { data: [], error: null };
const mockProfileUpdates: Array<{ patch: any; id: string }> = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'meal_plans') {
        return {
          select: jest.fn(() => ({
            order: jest.fn().mockImplementation(() => Promise.resolve(mockPlansResult)),
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
          update: jest.fn((patch: any) => ({
            eq: jest.fn(async (_col: string, id: string) => {
              mockProfileUpdates.push({ patch, id });
              return { error: null };
            }),
          })),
        };
      }
      if (table === 'recipes') {
        return {
          select: jest.fn(() => ({
            in: jest.fn().mockImplementation(() => Promise.resolve(mockRecipesResult)),
          })),
        };
      }
      if (table === 'recipe_interactions') {
        return {
          select: jest.fn(() => ({
            in: jest.fn(() => ({
              in: jest.fn(() => ({
                eq: jest.fn(() => ({
                  gte: jest.fn().mockImplementation(() => Promise.resolve(mockCookedResult)),
                })),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  })),
}));

import handler, { utcDayToSlotDay, pickFeaturedSlot } from '@/api/cron/cook-reminders';

const makeReq = (overrides: Record<string, any> = {}) => ({ method: 'GET', headers: {}, ...overrides });
const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const end = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json, end });
  return { status, json, end };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPlansResult = { data: [], error: null };
  mockProfilesResult = { data: [], error: null };
  mockRecipesResult = { data: [], error: null };
  mockCookedResult = { data: [], error: null };
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

// ─── Pure helper unit tests ───────────────────────────────────────────────────

describe('utcDayToSlotDay — maps Sun-anchored to Mon-anchored', () => {
  it('Monday (UTC=1) → slot 0', () => expect(utcDayToSlotDay(1)).toBe(0));
  it('Tuesday (UTC=2) → slot 1', () => expect(utcDayToSlotDay(2)).toBe(1));
  it('Saturday (UTC=6) → slot 5', () => expect(utcDayToSlotDay(6)).toBe(5));
  it('Sunday (UTC=0) → slot 6', () => expect(utcDayToSlotDay(0)).toBe(6));
});

describe('pickFeaturedSlot — meal-priority order', () => {
  const today = 2;
  it('returns null when no slot matches today', () => {
    expect(pickFeaturedSlot([{ day: 0, meal_type: 'dinner', recipe_id: 'r' }], today)).toBeNull();
  });
  it('prefers dinner over lunch', () => {
    const slot = pickFeaturedSlot([
      { day: today, meal_type: 'lunch', recipe_id: 'lunch-r' },
      { day: today, meal_type: 'dinner', recipe_id: 'dinner-r' },
    ], today);
    expect(slot?.recipe_id).toBe('dinner-r');
  });
  it('falls back to lunch when no dinner', () => {
    const slot = pickFeaturedSlot([
      { day: today, meal_type: 'lunch', recipe_id: 'lunch-r' },
      { day: today, meal_type: 'breakfast', recipe_id: 'breakfast-r' },
    ], today);
    expect(slot?.recipe_id).toBe('lunch-r');
  });
  it('falls back to breakfast as last resort', () => {
    const slot = pickFeaturedSlot([{ day: today, meal_type: 'breakfast', recipe_id: 'breakfast-r' }], today);
    expect(slot?.recipe_id).toBe('breakfast-r');
  });
});

// ─── Auth + no-op ─────────────────────────────────────────────────────────────

describe('cook-reminders — gate + no-op', () => {
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

  it('returns 0/0 when no plans exist', async () => {
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 0 });
  });

  it('returns 0/0 when no plans have a slot on today', async () => {
    // Slot exists but for a different day-of-week.
    mockPlansResult = {
      data: [{ user_id: 'u1', slots: [{ day: 99, meal_type: 'dinner', recipe_id: 'r' }], week_start_date: '2026-05-11' }],
      error: null,
    };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ sent: 0, checked: 0 });
  });
});

// ─── Happy + skip paths ───────────────────────────────────────────────────────

describe('cook-reminders — push behaviour', () => {
  // Use today (in UTC) so the cron's "is this slot today?" check passes.
  const today = utcDayToSlotDay(new Date().getUTCDay());

  it('sends one push for a user with a slot today', async () => {
    mockPlansResult = {
      data: [{
        user_id: 'u1',
        slots: [{ day: today, meal_type: 'dinner', recipe_id: 'r1' }],
        week_start_date: '2026-05-11',
      }],
      error: null,
    };
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_meal_plan: true, last_meal_plan_reminder_at: null }],
      error: null,
    };
    mockRecipesResult = {
      data: [{ id: 'r1', title: 'Lemon Pepper Salmon', prep_time_mins: 5, cook_time_mins: 15 }],
      error: null,
    };

    const res = makeRes();
    await handler(makeReq() as any, res as any);

    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.title).toContain('Lemon Pepper Salmon');
    expect(call.body).toContain('20 min');
    expect(call.data).toEqual(expect.objectContaining({ type: 'cook_reminder', recipe_id: 'r1' }));
    expect(res.json).toHaveBeenCalledWith({ sent: 1, checked: 1 });
    expect(mockProfileUpdates).toHaveLength(1);
  });

  it('skips users who already cooked today\'s featured recipe', async () => {
    mockPlansResult = {
      data: [{
        user_id: 'u1',
        slots: [{ day: today, meal_type: 'dinner', recipe_id: 'r1' }],
        week_start_date: '2026-05-11',
      }],
      error: null,
    };
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_meal_plan: true, last_meal_plan_reminder_at: null }],
      error: null,
    };
    mockRecipesResult = {
      data: [{ id: 'r1', title: 'X', prep_time_mins: 5, cook_time_mins: 15 }],
      error: null,
    };
    mockCookedResult = {
      data: [{ user_id: 'u1', recipe_id: 'r1', created_at: new Date().toISOString() }],
      error: null,
    };

    await handler(makeReq() as any, makeRes() as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('skips users inside the cooldown window', async () => {
    mockPlansResult = {
      data: [{
        user_id: 'u1',
        slots: [{ day: today, meal_type: 'dinner', recipe_id: 'r1' }],
        week_start_date: '2026-05-11',
      }],
      error: null,
    };
    const recent = new Date(Date.now() - 60_000).toISOString();
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_meal_plan: true, last_meal_plan_reminder_at: recent }],
      error: null,
    };
    mockRecipesResult = {
      data: [{ id: 'r1', title: 'X', prep_time_mins: 5, cook_time_mins: 15 }],
      error: null,
    };

    await handler(makeReq() as any, makeRes() as any);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('takes only the latest meal_plan per user when multiple weeks exist', async () => {
    // Two plans for the same user — DB returns desc, so the FIRST one wins.
    mockPlansResult = {
      data: [
        { user_id: 'u1', slots: [{ day: today, meal_type: 'dinner', recipe_id: 'new' }], week_start_date: '2026-05-11' },
        { user_id: 'u1', slots: [{ day: today, meal_type: 'dinner', recipe_id: 'old' }], week_start_date: '2026-05-04' },
      ],
      error: null,
    };
    mockProfilesResult = {
      data: [{ id: 'u1', push_token: 'tok', notify_meal_plan: true, last_meal_plan_reminder_at: null }],
      error: null,
    };
    mockRecipesResult = {
      data: [{ id: 'new', title: 'New', prep_time_mins: 5, cook_time_mins: 10 }],
      error: null,
    };
    await handler(makeReq() as any, makeRes() as any);
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.data.recipe_id).toBe('new');
  });
});
