/**
 * _apiAuth.ts unit tests
 *
 * Covers pure utility functions that do not require a live Supabase client:
 *   - AuthError class
 *   - extractBearerToken()
 *   - handleAuthError()
 *
 * verifyJWT() and requireAuth() depend on a Supabase module-level singleton
 * and are covered by integration tests.
 */

import { AuthError, extractBearerToken, handleAuthError } from '@/api/_apiAuth';

// ─── AuthError ────────────────────────────────────────────────────────────────

describe('AuthError', () => {
  it('is an instance of Error', () => {
    const err = new AuthError(401, 'Unauthorized');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores statusCode correctly', () => {
    const err = new AuthError(403, 'Forbidden');
    expect(err.statusCode).toBe(403);
  });

  it('stores message correctly', () => {
    const err = new AuthError(401, 'Token expired');
    expect(err.message).toBe('Token expired');
  });

  it('has name set to AuthError', () => {
    const err = new AuthError(401, 'x');
    expect(err.name).toBe('AuthError');
  });
});

// ─── extractBearerToken ───────────────────────────────────────────────────────

describe('extractBearerToken', () => {
  const makeReq = (authHeader?: string) =>
    ({ headers: authHeader ? { authorization: authHeader } : {} } as any);

  it('returns undefined when no authorization header', () => {
    expect(extractBearerToken(makeReq())).toBeUndefined();
  });

  it('returns undefined when header does not start with Bearer', () => {
    expect(extractBearerToken(makeReq('Basic abc123'))).toBeUndefined();
  });

  it('returns undefined for malformed Bearer header (no trailing space)', () => {
    // 'Bearer' without a trailing space fails startsWith('Bearer ') check
    expect(extractBearerToken(makeReq('Bearer'))).toBeUndefined();
  });

  it('extracts the token from a valid Bearer header', () => {
    expect(extractBearerToken(makeReq('Bearer my-jwt-token'))).toBe('my-jwt-token');
  });

  it('handles tokens with dots (JWTs)', () => {
    const jwt = 'eyJ0.eyJ1.sig';
    expect(extractBearerToken(makeReq(`Bearer ${jwt}`))).toBe(jwt);
  });
});

// ─── handleAuthError ──────────────────────────────────────────────────────────

describe('handleAuthError', () => {
  const makeRes = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return { status, json, _json: json };
  };

  it('responds with AuthError statusCode for AuthError instances', () => {
    const res = makeRes() as any;
    handleAuthError(new AuthError(401, 'Invalid token'), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('includes the AuthError message in the response body', () => {
    const res = makeRes() as any;
    handleAuthError(new AuthError(403, 'Forbidden'), res);
    expect(res.status(403).json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('responds with 500 for unknown errors', () => {
    const res = makeRes() as any;
    handleAuthError(new Error('unexpected'), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('uses generic message for unknown errors', () => {
    const res = makeRes() as any;
    handleAuthError(new Error('db crash'), res);
    expect(res.status(500).json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('responds with 500 for non-Error thrown values', () => {
    const res = makeRes() as any;
    handleAuthError('some string error', res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
