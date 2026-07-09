/**
 * api/generate-from-pantry.ts (M8 stage 3) — the premium constrained-generation
 * endpoint. Contract: auth required; 5/day rate limit; budget gate BEFORE Claude
 * (free 1/month → 402 ai_budget_exhausted = the client's paywall trigger); premium
 * counts into ':premium'; increment only on a DELIVERED result; dislike-violating
 * recipes are dropped server-side; count hard-capped at 3.
 */

const mockCreate = jest.fn();
const mockCheckAiBudget = jest.fn();
const mockIncrementAiUsage = jest.fn();
const mockIsPremiumUserId = jest.fn();
const mockRequireAuth = jest.fn();
const mockRateLimitUser = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(() => ({ messages: { create: mockCreate } })),
}));
jest.mock('@/api/_aiUsage', () => ({
  checkAiBudget: (...a: any[]) => mockCheckAiBudget(...a),
  incrementAiUsage: (...a: any[]) => mockIncrementAiUsage(...a),
}));
jest.mock('@/api/_requirePremium', () => ({
  isPremiumUserId: (...a: any[]) => mockIsPremiumUserId(...a),
}));
jest.mock('@/api/_apiAuth', () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
}));
jest.mock('@/api/_rateLimit', () => ({
  rateLimitUser: (...a: any[]) => mockRateLimitUser(...a),
}));
jest.mock('@/api/_sentry', () => ({
  captureException: (...a: any[]) => mockCaptureException(...a),
  flushSentry: jest.fn().mockResolvedValue(true),
}));

import handler from '@/api/generate-from-pantry';

const USER = 'user-1';
const ALLOWED = { allowed: true, used: 0, remaining: 1, limit: 1 };
const EXHAUSTED = { allowed: false, used: 1, remaining: 0, limit: 1 };

const recipe = (title: string, ingNames: string[]) => ({
  title,
  description: 'd',
  cuisine: 'american',
  ingredients: ingNames.map((name) => ({ name, quantity: '1', unit: 'cup' })),
  steps: [{ order: 1, title: 'Cook everything', instruction: 'Cook it.' }],
  prep_time_mins: 10, cook_time_mins: 20, servings: 2,
  dietary_tags: [], meal_prep_friendly: false,
  estimated_macros: { calories: 400, protein: 20, carbohydrates: 40, fat: 12, fibre: 4 },
});

const makeReq = (body: Record<string, unknown> = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body: { ingredients: ['chicken breast', 'spinach', 'soy sauce'], ...body },
} as any);

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn();
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mockRequireAuth.mockResolvedValue(USER);
  mockRateLimitUser.mockResolvedValue({ success: true });
  mockIsPremiumUserId.mockResolvedValue(false);
  mockCheckAiBudget.mockResolvedValue(ALLOWED);
  mockIncrementAiUsage.mockResolvedValue(undefined);
  mockCreate.mockResolvedValue({
    content: [{ text: JSON.stringify([recipe('Chicken Stir Fry', ['chicken breast', 'spinach', 'soy sauce']), recipe('Garlic Chicken', ['chicken breast', 'garlic'])]) }],
  });
});

describe('generate-from-pantry — guards', () => {
  it('405s non-POST', async () => {
    const res = makeRes();
    await handler({ method: 'GET', headers: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('401s without a valid JWT', async () => {
    mockRequireAuth.mockRejectedValue(Object.assign(new Error('Invalid token'), { name: 'AuthError', statusCode: 401 }));
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('400s on invalid input (single ingredient is not a dish)', async () => {
    const res = makeRes();
    await handler(makeReq({ ingredients: ['salt'] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('429s when rate limited, before any Claude spend', async () => {
    mockRateLimitUser.mockResolvedValue({ success: false, retryAfter: 3600 });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rate limit gives premium more headroom than free (20 vs 5 per day)', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(mockRateLimitUser).toHaveBeenCalledWith(USER, 'generate-from-pantry', 5, 86400);
    mockIsPremiumUserId.mockResolvedValue(true);
    await handler(makeReq(), makeRes());
    expect(mockRateLimitUser).toHaveBeenLastCalledWith(USER, 'generate-from-pantry', 20, 86400);
  });

  it('400s pre-Claude when dislikes swallow the whole on-hand list (no unbilled spend loop)', async () => {
    const res = makeRes();
    await handler(makeReq({ ingredients: ['chicken breast', 'chicken thighs'], avoidIngredients: ['chicken'] }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('an empty-string avoid entry cannot blank the list (\'\'.includes matches everything)', async () => {
    const res = makeRes();
    await handler(makeReq({ avoidIngredients: [''] }), res);
    expect(res.status).toHaveBeenCalledWith(200); // ingredients survive; gen proceeds
  });
});

describe('generate-from-pantry — budget gate', () => {
  it('402s a capped free user BEFORE Claude (the paywall trigger), never increments — and never burns a rate-limit token', async () => {
    mockCheckAiBudget.mockResolvedValue(EXHAUSTED);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ai_budget_exhausted' }));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
    // Budget runs FIRST: capped taps + the post-purchase retry must not be able to
    // 429 a just-subscribed user out of the feature during webhook lag.
    expect(mockRateLimitUser).not.toHaveBeenCalled();
  });

  it('free success → increments the plain bucket exactly once', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckAiBudget).toHaveBeenCalledWith(USER, 'generate-from-pantry', false);
    expect(mockIncrementAiUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'generate-from-pantry');
  });

  it('premium success → counts into the separate :premium bucket', async () => {
    mockIsPremiumUserId.mockResolvedValue(true);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'generate-from-pantry:premium');
  });

  it('unknown premium (null) skips gate + count', async () => {
    mockIsPremiumUserId.mockResolvedValue(null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckAiBudget).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('does NOT increment when Claude fails', async () => {
    mockCreate.mockRejectedValue(new Error('anthropic down'));
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });
});

describe('generate-from-pantry — output validation', () => {
  it('drops a recipe containing a disliked ingredient (allergy-grade, prompt is not a guarantee)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ text: JSON.stringify([
        recipe('Mushroom Chicken', ['chicken breast', 'button mushrooms']),
        recipe('Plain Chicken', ['chicken breast', 'spinach']),
      ]) }],
    });
    const res = makeRes();
    await handler(makeReq({ avoidIngredients: ['mushroom'] }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls.at(-1)[0];
    expect(payload.recipes.map((r: any) => r.title)).toEqual(['Plain Chicken']);
  });

  it('caps the response at the requested count (never more than 3)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ text: JSON.stringify([recipe('A', ['x', 'y']), recipe('B', ['x', 'y']), recipe('C', ['x', 'y']), recipe('D', ['x', 'y'])]) }],
    });
    const res = makeRes();
    await handler(makeReq(), res);
    const payload = res.json.mock.calls.at(-1)[0];
    expect(payload.recipes.length).toBeLessThanOrEqual(3);
  });

  it('502s (and never bills) when every candidate is unusable', async () => {
    mockCreate.mockResolvedValue({ content: [{ text: JSON.stringify([{ title: 'Broken' }]) }] });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('sanitizes contradictory dietary tags (chicken recipe can never be vegan)', async () => {
    const r = recipe('Chicken Bowl', ['chicken breast', 'rice']);
    (r as any).dietary_tags = ['vegan', 'high_protein', 'made_up_tag'];
    mockCreate.mockResolvedValue({ content: [{ text: JSON.stringify([r]) }] });
    const res = makeRes();
    await handler(makeReq(), res);
    const payload = res.json.mock.calls.at(-1)[0];
    expect(payload.recipes[0].dietary_tags).toEqual(['high_protein']);
  });
});
