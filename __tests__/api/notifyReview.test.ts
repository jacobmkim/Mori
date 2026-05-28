/**
 * Tests for /api/notify-review — transactional creator push fired after a
 * fresh review submission.
 *
 * Key invariants:
 *  - JWT auth required.
 *  - reviewer (auth user) must match review.user_id (IDOR guard).
 *  - Review must have been created within FRESH_WINDOW (replay guard).
 *  - Self-review (creator === reviewer) → skipped silently.
 *  - Creator opt-out (notify_creator_events=false) → skipped.
 *  - Missing push_token → skipped.
 */

const mockRequireAuth = jest.fn();
const mockHandleAuthError = jest.fn();
const mockRateLimit = jest.fn();
const mockSendExpoPush = jest.fn();

class MockAuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

jest.mock('@/api/_apiAuth', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  handleAuthError: (...args: any[]) => mockHandleAuthError(...args),
  AuthError: MockAuthError,
}));

jest.mock('@/api/_rateLimit', () => ({
  rateLimitUser: (...args: any[]) => mockRateLimit(...args),
}));

jest.mock('@/api/_pushUtils', () => ({
  sendExpoPush: (...args: any[]) => mockSendExpoPush(...args),
}));

let mockReviewResult: { data: any; error: any } = { data: null, error: null };
let mockRecipeResult: { data: any; error: any } = { data: null, error: null };
let mockProfileResult: { data: any; error: any } = { data: null, error: null };

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'recipe_reviews') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(mockReviewResult)),
            })),
          })),
        };
      }
      if (table === 'recipes') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(mockRecipeResult)),
            })),
          })),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(mockProfileResult)),
            })),
          })),
        };
      }
      return {};
    }),
  })),
}));

import handler from '@/api/notify-review';

const REVIEWER_ID = '00000000-0000-0000-0000-000000000001';
const CREATOR_ID = '00000000-0000-0000-0000-000000000002';
const REVIEW_ID = '11111111-1111-1111-1111-111111111111';
const RECIPE_ID = '22222222-2222-2222-2222-222222222222';

const makeReq = (body: any = { reviewId: REVIEW_ID }, method = 'POST') =>
  ({ method, headers: {}, body } as any);

const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const end = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json, end });
  return { status, json, end };
};

const freshReview = (overrides: Record<string, any> = {}) => ({
  id: REVIEW_ID,
  user_id: REVIEWER_ID,
  recipe_id: RECIPE_ID,
  rating: 5,
  review_text: 'Loved this',
  created_at: new Date().toISOString(),
  reviewer: { name: 'Alex K', username: 'alex' },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockReviewResult = { data: freshReview(), error: null };
  mockRecipeResult = { data: { id: RECIPE_ID, title: 'Lemon Pepper Salmon', submitted_by: CREATOR_ID }, error: null };
  mockProfileResult = { data: { push_token: 'ExponentPushToken[creator]', notify_creator_events: true }, error: null };
  mockRequireAuth.mockResolvedValue(REVIEWER_ID);
  mockRateLimit.mockResolvedValue({ success: true });
  mockSendExpoPush.mockResolvedValue(undefined);
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ─── Method + auth + input ────────────────────────────────────────────────────

describe('notify-review — guards', () => {
  it('rejects non-POST methods', async () => {
    const res = makeRes();
    await handler(makeReq({}, 'GET') as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    mockRateLimit.mockResolvedValueOnce({ success: false });
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('rejects a malformed reviewId', async () => {
    const res = makeRes();
    await handler(makeReq({ reviewId: 'not-a-uuid' }) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a missing reviewId', async () => {
    const res = makeRes();
    await handler(makeReq({}) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── IDOR + replay guards ─────────────────────────────────────────────────────

describe('notify-review — IDOR + replay guards', () => {
  it('returns 403 when the authenticated user is not the review author', async () => {
    mockRequireAuth.mockResolvedValueOnce('99999999-9999-9999-9999-999999999999');
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('returns 404 when the review does not exist', async () => {
    mockReviewResult = { data: null, error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('skips stale reviews (replay older than the freshness window)', async () => {
    const oldCreated = new Date(Date.now() - 5 * 60_000).toISOString();
    mockReviewResult = { data: freshReview({ created_at: oldCreated }), error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ skipped: 'stale' });
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });
});

// ─── Opt-out + self-review skips ──────────────────────────────────────────────

describe('notify-review — skips', () => {
  it('skips self-reviews (creator reviewing their own recipe)', async () => {
    mockRecipeResult = { data: { id: RECIPE_ID, title: 'Self', submitted_by: REVIEWER_ID }, error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ skipped: 'self_review' });
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('skips when the recipe has no submitter (curated, MealDB import, etc.)', async () => {
    mockRecipeResult = { data: { id: RECIPE_ID, title: 'Curated', submitted_by: null }, error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ skipped: 'no_submitter' });
  });

  it('skips when the creator has opted out of creator events', async () => {
    mockProfileResult = { data: { push_token: 'tok', notify_creator_events: false }, error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ skipped: 'opted_out' });
    expect(mockSendExpoPush).not.toHaveBeenCalled();
  });

  it('skips when the creator has no push_token registered', async () => {
    mockProfileResult = { data: { push_token: null, notify_creator_events: true }, error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ skipped: 'opted_out' });
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('notify-review — happy path', () => {
  it('sends a push with star count + reviewer @username + recipe title', async () => {
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    expect(mockSendExpoPush).toHaveBeenCalledTimes(1);
    expect(mockSendExpoPush).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ExponentPushToken[creator]',
      title: expect.stringContaining('★★★★★'),
      data: expect.objectContaining({ type: 'review_received', recipe_id: RECIPE_ID }),
    }));
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.title).toContain('@alex');
    expect(call.body).toContain('Loved this');
    expect(res.json).toHaveBeenCalledWith({ sent: 1 });
  });

  it('falls back to "Someone" when reviewer profile has neither name nor username', async () => {
    mockReviewResult = { data: freshReview({ reviewer: null }), error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.title).toContain('Someone');
  });

  it('truncates long review text in the push body', async () => {
    const longText = 'A'.repeat(200);
    mockReviewResult = { data: freshReview({ review_text: longText }), error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.body.length).toBeLessThan(150);
    expect(call.body).toContain('…');
  });

  it('uses generic body when review_text is empty', async () => {
    mockReviewResult = { data: freshReview({ review_text: null }), error: null };
    const res = makeRes();
    await handler(makeReq() as any, res as any);
    const call = mockSendExpoPush.mock.calls[0][0];
    expect(call.body).toContain('Lemon Pepper Salmon');
  });
});
