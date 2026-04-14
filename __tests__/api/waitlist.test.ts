/**
 * waitlist.ts — CORS enforcement tests
 *
 * Verifies that browser requests from disallowed origins are rejected with 403,
 * while allowed origins and direct (no-origin) API calls proceed normally.
 */

import handler from '@/api/waitlist';

const mockInsert = jest.fn().mockReturnValue({
  single: jest.fn().mockResolvedValue({ error: null }),
});
const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));
jest.mock('@/api/_rateLimit', () => ({
  rateLimitIP: jest.fn().mockResolvedValue({ success: true, remaining: 4, resetAt: 0 }),
  getClientIP: jest.fn().mockReturnValue('1.2.3.4'),
}));
jest.mock('@/lib/validation', () => ({
  validate: jest.fn().mockResolvedValue({ email: 'test@example.com', name: null }),
  WaitlistRequestSchema: {},
  ValidationError: class extends Error {},
  formatValidationError: jest.fn(),
}));

const makeReq = (overrides: Record<string, any> = {}) => ({
  method: 'POST',
  headers: {},
  body: { email: 'test@example.com' },
  ...overrides,
});

const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const end = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end });
  const setHeader = jest.fn();
  return { status, json, setHeader, end };
};

describe('waitlist CORS enforcement', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('returns 403 for requests from disallowed origins', async () => {
    const req = makeReq({ headers: { origin: 'https://evil.com' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.status(403).json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('returns 403 for subdomain spoofing attempts', async () => {
    const req = makeReq({ headers: { origin: 'https://evil.getmori.app.evil.com' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('does not return 403 for getmori.app', async () => {
    const req = makeReq({ headers: { origin: 'https://getmori.app' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('does not return 403 for www.getmori.app', async () => {
    const req = makeReq({ headers: { origin: 'https://www.getmori.app' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('does not return 403 for localhost (dev)', async () => {
    const req = makeReq({ headers: { origin: 'http://localhost:3000' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('allows requests with no origin header (direct API calls)', async () => {
    const req = makeReq({ headers: {} }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('sets Access-Control-Allow-Origin for allowed origins', async () => {
    const req = makeReq({ headers: { origin: 'https://getmori.app' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://getmori.app');
  });

  it('does not set CORS headers when no origin is present', async () => {
    const req = makeReq({ headers: {} }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything());
  });

  it('returns 200 for OPTIONS preflight from allowed origin', async () => {
    const req = makeReq({ method: 'OPTIONS', headers: { origin: 'https://getmori.app' } }) as any;
    const res = makeRes() as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
