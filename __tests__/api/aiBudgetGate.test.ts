/**
 * AI-budget gate wiring — generate-recipe / taste-profile / substitutions.
 *
 * The contract under test (Mori+ M4, wired 2026-07-03):
 *  - checkAiBudget runs BEFORE any Claude spend; a capped free user gets 402
 *    { code: 'ai_budget_exhausted' } and Anthropic is never called.
 *  - incrementAiUsage runs ONLY after a successful generation (never on failure,
 *    never on the not_enough_data early return), and a failed increment never
 *    blocks the response the user already paid tokens for.
 *  - Premium status flows from isPremiumUserId into checkAiBudget (which returns
 *    unlimited for premium — that logic is covered in aiUsage.test.ts).
 *  - The generate-recipe seed path (x-seed-secret, no user) bypasses the budget.
 */

const mockCreate = jest.fn();
const mockCheckAiBudget = jest.fn();
const mockIncrementAiUsage = jest.fn();
const mockIsPremiumUserId = jest.fn();
const mockValidate = jest.fn();
const mockRequireAuth = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn(() => ({ messages: { create: mockCreate } })),
}));

// Chainable supabase stub: every query method returns the chain; awaiting it resolves
// the canned per-table result (taste-profile runs a Promise.all of three queries).
function chain(result: any): any {
  const c: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'update', 'insert', 'single', 'maybeSingle']) {
    c[m] = jest.fn(() => c);
  }
  c.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject);
  return c;
}
const mockFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ from: mockFrom })) }));

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
  rateLimitUser: jest.fn().mockResolvedValue({ success: true }),
  rateLimitIP: jest.fn().mockResolvedValue({ success: true }),
  getClientIP: jest.fn(() => '1.2.3.4'),
}));
jest.mock('@/api/_sentry', () => ({
  captureException: (...a: any[]) => mockCaptureException(...a),
  flushSentry: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/validation', () => ({
  validate: (...a: any[]) => mockValidate(...a),
  GenerateRecipeRequestSchema: {},
  TasteProfileRequestSchema: {},
  SubstitutionsRequestSchema: {},
  ValidationError: class ValidationError extends Error {},
  formatValidationError: jest.fn(() => ({ error: 'Invalid input' })),
}));

import generateRecipeHandler from '@/api/generate-recipe';
import tasteProfileHandler from '@/api/taste-profile';
import substitutionsHandler from '@/api/substitutions';

const USER = 'user-1';
const ALLOWED = { allowed: true, used: 0, remaining: 3, limit: 3 };
const EXHAUSTED = { allowed: false, used: 3, remaining: 0, limit: 3 };

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn();
  return res;
};

const RECIPE_JSON = JSON.stringify({
  title: 'Test Pasta', description: 'd', cuisine: 'italian',
  ingredients: [{ name: 'pasta', quantity: '8', unit: 'oz' }],
  steps: [{ order: 1, instruction: 'cook' }],
  prep_time_mins: 5, cook_time_mins: 10, servings: 2,
  dietary_tags: [], meal_prep_friendly: false,
  estimated_macros: { calories: 400, protein: 12, carbohydrates: 60, fat: 8, fibre: 3 },
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.SEED_SECRET = 'seed-secret-for-tests-1234567890';
  mockRequireAuth.mockResolvedValue(USER);
  mockIsPremiumUserId.mockResolvedValue(false);
  mockCheckAiBudget.mockResolvedValue(ALLOWED);
  mockIncrementAiUsage.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.SEED_SECRET;
});

// ─── generate-recipe ────────────────────────────────────────────────────────────

describe('generate-recipe budget gate', () => {
  const req = (headers: Record<string, string> = { authorization: 'Bearer t' }) =>
    ({ method: 'POST', headers, body: {} } as any);

  beforeEach(() => {
    mockValidate.mockResolvedValue({ cuisine: 'italian', save: false });
    mockCreate.mockResolvedValue({ content: [{ text: RECIPE_JSON }] });
  });

  it('402s a capped free user BEFORE calling Claude, and never increments', async () => {
    mockCheckAiBudget.mockResolvedValue(EXHAUSTED);
    const res = makeRes();
    await generateRecipeHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ai_budget_exhausted' }));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('generates + increments exactly once for an in-budget user', async () => {
    const res = makeRes();
    await generateRecipeHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckAiBudget).toHaveBeenCalledWith(USER, 'generate-recipe', false);
    expect(mockIncrementAiUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'generate-recipe');
  });

  it('premium: passes true into the check and counts usage into the SEPARATE :premium bucket', async () => {
    mockIsPremiumUserId.mockResolvedValue(true);
    const res = makeRes();
    await generateRecipeHandler(req(), res);
    expect(mockCheckAiBudget).toHaveBeenCalledWith(USER, 'generate-recipe', true);
    expect(res.status).toHaveBeenCalledWith(200);
    // A mid-month downgrader's FREE bucket must stay clean — premium usage never fills it.
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'generate-recipe:premium');
  });

  it('unknown premium (lookup failed → null) skips the gate AND the count — never 402s a possible payer', async () => {
    mockIsPremiumUserId.mockResolvedValue(null);
    const res = makeRes();
    await generateRecipeHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckAiBudget).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('does NOT increment when the generation fails', async () => {
    mockCreate.mockRejectedValue(new Error('anthropic down'));
    const res = makeRes();
    await generateRecipeHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('still returns the recipe when the increment itself fails (Sentry only)', async () => {
    mockIncrementAiUsage.mockRejectedValue(new Error('rpc down'));
    const res = makeRes();
    await generateRecipeHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('seed path (x-seed-secret, no user) bypasses the budget entirely', async () => {
    const res = makeRes();
    await generateRecipeHandler(req({ 'x-seed-secret': process.env.SEED_SECRET! }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckAiBudget).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });
});

// ─── taste-profile ──────────────────────────────────────────────────────────────

describe('taste-profile budget gate', () => {
  const req = () => ({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { userId: USER } } as any);
  const SWIPES = Array.from({ length: 6 }, (_, i) => ({ recipe_id: `r${i}`, direction: 'right' }));

  beforeEach(() => {
    mockValidate.mockResolvedValue({ userId: USER });
    mockCreate.mockResolvedValue({ content: [{ text: JSON.stringify({ tasteProfile: 'The pasta always wins.', flavourDna: {} }) }] });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'swipe_events') return chain({ data: SWIPES, error: null });
      if (table === 'recipe_interactions') return chain({ data: [], error: null });
      if (table === 'recipes') return chain({ data: [], error: null });
      return chain({ data: { dietary_goals: [], cuisine_preferences: [], eating_style: null, skill_level: null }, error: null });
    });
  });

  it('402s a capped free user before any data fetch or Claude call', async () => {
    mockCheckAiBudget.mockResolvedValue(EXHAUSTED);
    const res = makeRes();
    await tasteProfileHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('generates + increments exactly once on success (free bucket key)', async () => {
    const res = makeRes();
    await tasteProfileHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tasteProfile: 'The pasta always wins.' }));
    expect(mockCheckAiBudget).toHaveBeenCalledWith(USER, 'taste-profile', false);
    expect(mockIncrementAiUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'taste-profile');
  });

  it('premium usage counts into the separate :premium bucket', async () => {
    mockIsPremiumUserId.mockResolvedValue(true);
    const res = makeRes();
    await tasteProfileHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'taste-profile:premium');
  });

  it('a failed profile SAVE is not billed — the free credit survives for a retry', async () => {
    // Make ONLY the profiles UPDATE fail; the profile SELECT still succeeds.
    const failingUpdate = chain({ error: { code: 'XX000' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'swipe_events') return chain({ data: SWIPES, error: null });
      if (table === 'recipe_interactions') return chain({ data: [], error: null });
      if (table === 'recipes') return chain({ data: [], error: null });
      const profiles = chain({ data: { dietary_goals: [], cuisine_preferences: [], eating_style: null, skill_level: null }, error: null });
      (profiles as any).update = jest.fn(() => failingUpdate);
      return profiles;
    });
    const res = makeRes();
    await tasteProfileHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200); // the session still gets the text
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tasteProfile: 'The pasta always wins.' }));
    expect(mockIncrementAiUsage).not.toHaveBeenCalled(); // nothing persisted → nothing billed
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('not_enough_data early return does NOT burn the budget', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'swipe_events') return chain({ data: [{ recipe_id: 'r1', direction: 'right' }], error: null });
      if (table === 'recipe_interactions') return chain({ data: [], error: null });
      return chain({ data: {}, error: null });
    });
    const res = makeRes();
    await tasteProfileHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'not_enough_data' }));
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });
});

// ─── substitutions ──────────────────────────────────────────────────────────────

describe('substitutions budget gate', () => {
  const req = () => ({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { ingredient: 'butter' } } as any);

  beforeEach(() => {
    mockValidate.mockResolvedValue({ ingredient: 'butter', limit: 3 });
    mockCreate.mockResolvedValue({ content: [{ text: '[{"substitute":"margarine","reason":"same fat"}]' }] });
  });

  it('402s a capped free user without calling Claude', async () => {
    mockCheckAiBudget.mockResolvedValue(EXHAUSTED);
    const res = makeRes();
    await substitutionsHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ai_budget_exhausted' }));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('generates + increments exactly once on success (empty swaps still count)', async () => {
    const res = makeRes();
    await substitutionsHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckAiBudget).toHaveBeenCalledWith(USER, 'substitutions', false);
    expect(mockIncrementAiUsage).toHaveBeenCalledTimes(1);
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'substitutions');
  });

  it('unknown premium (null) skips gate + count', async () => {
    mockIsPremiumUserId.mockResolvedValue(null);
    const res = makeRes();
    await substitutionsHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCheckAiBudget).not.toHaveBeenCalled();
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });

  it('premium usage counts into the separate :premium bucket', async () => {
    mockIsPremiumUserId.mockResolvedValue(true);
    const res = makeRes();
    await substitutionsHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockIncrementAiUsage).toHaveBeenCalledWith(USER, 'substitutions:premium');
  });

  it('does NOT increment when Claude fails', async () => {
    mockCreate.mockRejectedValue(new Error('anthropic down'));
    const res = makeRes();
    await substitutionsHandler(req(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockIncrementAiUsage).not.toHaveBeenCalled();
  });
});
