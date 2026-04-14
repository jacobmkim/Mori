/**
 * generate-recipe.ts — auth gate tests
 *
 * Verifies that the endpoint rejects requests that provide neither a valid
 * JWT nor a correct x-seed-secret header.  Anthropic / Supabase are mocked
 * so no external calls are made.
 */

import handler from '@/api/generate-recipe';

jest.mock('@anthropic-ai/sdk', () => ({ default: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/api/_rateLimit', () => ({
  rateLimitUser: jest.fn().mockResolvedValue({ success: true, remaining: 4, resetAt: 0 }),
}));
jest.mock('@/lib/validation', () => ({
  validate: jest.fn().mockResolvedValue({ cuisine: 'italian', save: false }),
  GenerateRecipeRequestSchema: {},
  ValidationError: class extends Error {},
  formatValidationError: jest.fn(),
}));
jest.mock('@/api/_apiAuth', () => ({
  requireAuth: jest.fn().mockRejectedValue(
    Object.assign(new Error('Invalid token'), { name: 'AuthError', statusCode: 401 })
  ),
}));

const VALID_SECRET = 'test-seed-secret-abcdef1234567890ab';

const makeReq = (overrides: Record<string, any> = {}) => ({
  method: 'POST',
  headers: {},
  body: { cuisine: 'italian' },
  ...overrides,
});

const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  return { status, json, setHeader };
};

describe('generate-recipe auth gate', () => {
  beforeEach(() => {
    process.env.SEED_SECRET = VALID_SECRET;
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.SEED_SECRET;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns 405 for non-POST requests', async () => {
    const req = makeReq({ method: 'GET' }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 401 when no authorization header and no x-seed-secret', async () => {
    const req = makeReq({ headers: {} }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.status(401).json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('returns 401 when x-seed-secret is incorrect', async () => {
    const req = makeReq({ headers: { 'x-seed-secret': 'wrong-secret' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when x-seed-secret has correct prefix but wrong length', async () => {
    const req = makeReq({ headers: { 'x-seed-secret': VALID_SECRET + 'x' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when x-seed-secret is empty string', async () => {
    const req = makeReq({ headers: { 'x-seed-secret': '' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('does not return 401 when correct x-seed-secret is provided', async () => {
    const req = makeReq({ headers: { 'x-seed-secret': VALID_SECRET } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(401);
  });
});
