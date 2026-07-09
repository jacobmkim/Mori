/**
 * api/delete-account.ts — destructive, irreversible, Apple-required (Guideline
 * 5.1.1(v)). These tests lock the contract: method guard, auth, rate limit,
 * password re-verification (anti-theft + anti-spoof), the cascade delete order,
 * tolerance of missing tables/columns, and the final auth-user delete.
 */

const mockRequireAuth = jest.fn();
const mockRateLimitUser = jest.fn();
const mockCaptureException = jest.fn();
const mockCreateClient = jest.fn();

jest.mock('@/api/_apiAuth', () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
  AuthError: class AuthError extends Error {
    statusCode: number;
    // Same arg order as the real api/_apiAuth AuthError(statusCode, message) — tsc checks
    // constructions in this file against the real signature.
    constructor(code: number, msg: string) { super(msg); this.name = 'AuthError'; this.statusCode = code; }
  },
}));
jest.mock('@/api/_rateLimit', () => ({ rateLimitUser: (...a: any[]) => mockRateLimitUser(...a) }));
jest.mock('@/api/_sentry', () => ({ captureException: (...a: any[]) => mockCaptureException(...a) }));
jest.mock('@supabase/supabase-js', () => ({ createClient: (...a: any[]) => mockCreateClient(...a) }));

import handler from '@/api/delete-account';
import { AuthError } from '@/api/_apiAuth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-123';
const EMAIL = 'user@example.com';
const SERVICE_KEY = 'service-key';
const ANON_KEY = 'anon-key';

let serviceClient: any;
let anonClient: any;

const makeReq = (overrides: Record<string, any> = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-token' },
  body: { password: 'correct-password' },
  ...overrides,
});

const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  return { status, json, setHeader } as any;
};

// A `from(table)` whose .delete().eq() / .update().eq() resolve to {error}.
// `tableErrors` maps a table name → the error object that table's op resolves to.
function makeFrom(tableErrors: Record<string, any> = {}) {
  return jest.fn((table: string) => ({
    delete: () => ({ eq: () => Promise.resolve({ error: tableErrors[table] ?? null }) }),
    update: () => ({ eq: () => Promise.resolve({ error: tableErrors[table] ?? null }) }),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();

  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;

  serviceClient = {
    auth: {
      admin: {
        getUserById: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } }, error: null }),
        deleteUser: jest.fn().mockResolvedValue({ error: null }),
      },
    },
    from: makeFrom(),
  };
  anonClient = {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { session: { access_token: 's' }, user: { id: USER_ID } }, error: null,
      }),
      signOut: jest.fn().mockResolvedValue({}),
    },
  };

  mockCreateClient.mockImplementation((_url: string, key: string) =>
    key === SERVICE_KEY ? serviceClient : anonClient);
  mockRequireAuth.mockResolvedValue(USER_ID);
  mockRateLimitUser.mockResolvedValue({ success: true });
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('delete-account — guards', () => {
  it('405s on non-POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }) as any, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns the AuthError status when auth fails', async () => {
    mockRequireAuth.mockRejectedValueOnce(new AuthError(401, 'Unauthorized'));
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('429s when rate limited (and sets Retry-After)', async () => {
    mockRateLimitUser.mockResolvedValueOnce({ success: false, retryAfter: 3600 });
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 3600);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('400s when password is missing', async () => {
    const res = makeRes();
    await handler(makeReq({ body: {} }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(serviceClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('500s when service env is not configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('delete-account — password re-verification', () => {
  it('401s on a wrong password (sign-in error) without deleting anything', async () => {
    anonClient.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { message: 'bad' } });
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(serviceClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('401s on the anti-spoof check when the signed-in id != JWT user id', async () => {
    anonClient.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 's' }, user: { id: 'someone-else' } }, error: null,
    });
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(serviceClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('500s when the user has no email to verify against', async () => {
    serviceClient.auth.admin.getUserById.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('delete-account — happy path + resilience', () => {
  it('deletes user data, de-attributes recipes, removes the auth user, returns ok', async () => {
    const res = makeRes();
    await handler(makeReq() as any, res);

    expect(anonClient.auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: 'correct-password' });
    expect(anonClient.auth.signOut).toHaveBeenCalled();
    // child user-data tables wiped + recipes/waitlist/profiles touched
    expect(serviceClient.from).toHaveBeenCalledWith('saved_recipes');
    expect(serviceClient.from).toHaveBeenCalledWith('recipes');
    expect(serviceClient.from).toHaveBeenCalledWith('profiles');
    expect(serviceClient.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('tolerates missing tables/columns (42P01/42703) without aborting or logging', async () => {
    serviceClient.from = makeFrom({
      recipe_notes: { code: '42P01', message: 'no relation' },
      recipe_flags: { code: '42703', message: 'no column' },
    });
    const res = makeRes();
    await handler(makeReq() as any, res);
    // Still completes the deletion despite the tolerated child-table errors.
    expect(serviceClient.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('logs (but does not abort on) a real child-table delete error', async () => {
    serviceClient.from = makeFrom({ swipe_events: { code: '500', message: 'boom' } });
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(mockCaptureException).toHaveBeenCalled();
    expect(serviceClient.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('500s when the final auth-user delete fails', async () => {
    serviceClient.auth.admin.deleteUser.mockResolvedValueOnce({ error: { message: 'auth delete failed' } });
    const res = makeRes();
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
