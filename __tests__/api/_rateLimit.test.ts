/**
 * _rateLimit.ts unit tests
 *
 * In the test environment @vercel/kv is not installed, so the module falls back
 * to InMemoryStore for all tests — the same code path used in local development.
 *
 * Each test uses a unique userId + endpoint combination to prevent cross-test
 * state pollution from the module-level InMemoryStore singleton.
 */

import { rateLimitUser, rateLimitIP, getClientIP } from '@/api/_rateLimit';

// ─── rateLimitUser ────────────────────────────────────────────────────────────

describe('rateLimitUser', () => {
  it('succeeds on the first request and returns correct remaining count', async () => {
    const result = await rateLimitUser('user-rl-1', 'macros', 5, 60);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('decrements remaining on subsequent requests within the limit', async () => {
    await rateLimitUser('user-rl-2', 'macros', 5, 60);
    const result = await rateLimitUser('user-rl-2', 'macros', 5, 60);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(3);
  });

  it('blocks when the limit is exceeded', async () => {
    const limit = 2;
    await rateLimitUser('user-rl-3', 'taste-profile', limit, 60);
    await rateLimitUser('user-rl-3', 'taste-profile', limit, 60);
    const blocked = await rateLimitUser('user-rl-3', 'taste-profile', limit, 60);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('returns a resetAt value in the future', async () => {
    const before = Date.now();
    const result = await rateLimitUser('user-rl-4', 'macros', 5, 60);
    expect(result.resetAt).toBeGreaterThan(before);
  });

  it('uses separate buckets for different endpoints', async () => {
    const limit = 1;
    // Exhaust limit on 'macros' endpoint
    await rateLimitUser('user-rl-5', 'macros', limit, 60);
    const blocked = await rateLimitUser('user-rl-5', 'macros', limit, 60);
    expect(blocked.success).toBe(false);

    // 'generate-recipe' endpoint is a separate bucket — should still succeed
    const different = await rateLimitUser('user-rl-5', 'generate-recipe', limit, 60);
    expect(different.success).toBe(true);
  });
});

// ─── rateLimitIP ──────────────────────────────────────────────────────────────

describe('rateLimitIP', () => {
  it('succeeds on the first request', async () => {
    const result = await rateLimitIP('1.2.3.4', 'waitlist', 10, 60);
    expect(result.success).toBe(true);
  });

  it('blocks when the limit is exceeded', async () => {
    const limit = 1;
    await rateLimitIP('5.6.7.8', 'waitlist', limit, 60);
    const blocked = await rateLimitIP('5.6.7.8', 'waitlist', limit, 60);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('uses separate buckets for different IPs', async () => {
    const limit = 1;
    await rateLimitIP('10.0.0.1', 'waitlist', limit, 60);
    const blocked = await rateLimitIP('10.0.0.1', 'waitlist', limit, 60);
    expect(blocked.success).toBe(false);

    // Different IP — separate bucket
    const other = await rateLimitIP('10.0.0.2', 'waitlist', limit, 60);
    expect(other.success).toBe(true);
  });
});

// ─── getClientIP ──────────────────────────────────────────────────────────────

describe('getClientIP', () => {
  const makeReq = (headers: Record<string, string>, socketAddress?: string) => ({
    headers,
    socket: socketAddress ? { remoteAddress: socketAddress } : {},
  });

  it('extracts IP from x-forwarded-for header', () => {
    const req = makeReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIP(req)).toBe('1.2.3.4');
  });

  it('extracts IP from x-real-ip when x-forwarded-for is absent', () => {
    const req = makeReq({ 'x-real-ip': '9.9.9.9' });
    expect(getClientIP(req)).toBe('9.9.9.9');
  });

  it('falls back to socket remoteAddress', () => {
    const req = makeReq({}, '127.0.0.1');
    expect(getClientIP(req)).toBe('127.0.0.1');
  });

  it('returns "unknown" when no IP source is available', () => {
    const req = makeReq({});
    expect(getClientIP(req)).toBe('unknown');
  });

  it('takes only the first IP from a comma-separated x-forwarded-for', () => {
    const req = makeReq({ 'x-forwarded-for': '  203.0.113.1 , 70.41.3.18' });
    expect(getClientIP(req)).toBe('203.0.113.1');
  });
});
