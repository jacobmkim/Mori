/**
 * Tests for api/rc-webhook.ts — the sole writer of profiles.is_premium.
 * Covers verifyWebhookAuth, the pure computePremiumUpdate mapping (every event
 * type + degenerate fields), and the handler's idempotency/transfer/guards.
 * Each fixed bug from the 2026-06-11 adversarial review has a regression test.
 */

const mockFrom = jest.fn();
const mockCaptureException = jest.fn();
const mockFlushSentry = jest.fn().mockResolvedValue(true);

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));
jest.mock('@/api/_sentry', () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  flushSentry: (...a: unknown[]) => mockFlushSentry(...a),
}));

import handler, { verifyWebhookAuth, computePremiumUpdate } from '@/api/rc-webhook';

const NOW = 1_800_000_000_000; // fixed reference instant (ms)
const FUTURE = NOW + 1_000_000_000;
const PAST = NOW - 1_000_000_000;
const UID = '11111111-2222-3333-4444-555555555555';

const ev = (over: Record<string, unknown> = {}) => ({
  app_user_id: UID,
  type: 'RENEWAL',
  entitlement_ids: ['mori_plus'],
  expiration_at_ms: FUTURE,
  ...over,
});

// ─── verifyWebhookAuth ───────────────────────────────────────────────────────
describe('verifyWebhookAuth', () => {
  const SECRET = 'a'.repeat(40);
  const makeReq = (authHeader?: string) =>
    ({ headers: authHeader ? { authorization: authHeader } : {} } as any);

  beforeEach(() => { process.env.RC_WEBHOOK_SECRET = SECRET; });
  afterEach(() => { delete process.env.RC_WEBHOOK_SECRET; });

  it('accepts the correct Bearer secret', () => {
    expect(verifyWebhookAuth(makeReq(`Bearer ${SECRET}`))).toBe(true);
  });
  it('rejects a same-length wrong secret (constant-time path)', () => {
    expect(verifyWebhookAuth(makeReq(`Bearer ${'b'.repeat(40)}`))).toBe(false);
  });
  it('rejects a wrong-length token without throwing', () => {
    expect(verifyWebhookAuth(makeReq(`Bearer ${SECRET}x`))).toBe(false);
  });
  it('rejects a missing header', () => {
    expect(verifyWebhookAuth(makeReq())).toBe(false);
  });
  it('fails CLOSED when RC_WEBHOOK_SECRET is unset (rejects everything)', () => {
    delete process.env.RC_WEBHOOK_SECRET;
    expect(verifyWebhookAuth(makeReq(`Bearer ${SECRET}`))).toBe(false);
    expect(verifyWebhookAuth(makeReq('Bearer '))).toBe(false);
  });
});

// ─── computePremiumUpdate — app_user_id mapping ──────────────────────────────
describe('computePremiumUpdate — app_user_id', () => {
  it('maps a valid UUID and echoes it as revenuecat_user_id', () => {
    const u = computePremiumUpdate(ev(), NOW)!;
    expect(u).not.toBeNull();
    expect(u.revenuecat_user_id).toBe(UID);
  });
  it('lowercases an uppercase UUID (canonicalization — Bug #5)', () => {
    const u = computePremiumUpdate(ev({ app_user_id: UID.toUpperCase() }), NOW)!;
    expect(u.revenuecat_user_id).toBe(UID);
  });
  it.each([undefined, null, '', 'not-a-uuid', `  ${UID}  `, 42])(
    'returns null for unmappable app_user_id: %p',
    (bad) => { expect(computePremiumUpdate(ev({ app_user_id: bad }), NOW)).toBeNull(); },
  );
});

// ─── computePremiumUpdate — entitlement scoping ──────────────────────────────
describe('computePremiumUpdate — entitlement scoping', () => {
  it('applies for ["mori_plus"]', () => {
    expect(computePremiumUpdate(ev({ entitlement_ids: ['mori_plus'] }), NOW)).not.toBeNull();
  });
  it('assumes ours for an empty entitlement list', () => {
    expect(computePremiumUpdate(ev({ entitlement_ids: [] }), NOW)).not.toBeNull();
  });
  it('assumes ours when entitlement_ids is null/undefined', () => {
    expect(computePremiumUpdate(ev({ entitlement_ids: null }), NOW)).not.toBeNull();
    expect(computePremiumUpdate(ev({ entitlement_ids: undefined }), NOW)).not.toBeNull();
  });
  it('applies when mori_plus is among multiple entitlements', () => {
    expect(computePremiumUpdate(ev({ entitlement_ids: ['mori_plus', 'other'] }), NOW)).not.toBeNull();
  });
  it('no-ops for a foreign entitlement only', () => {
    expect(computePremiumUpdate(ev({ entitlement_ids: ['other'] }), NOW)).toBeNull();
  });
  it('honors the deprecated singular entitlement_id', () => {
    expect(computePremiumUpdate(ev({ entitlement_ids: undefined, entitlement_id: 'mori_plus' }), NOW)).not.toBeNull();
    expect(computePremiumUpdate(ev({ entitlement_ids: undefined, entitlement_id: 'other' }), NOW)).toBeNull();
  });
});

// ─── computePremiumUpdate — event types (future expiry) ──────────────────────
describe('computePremiumUpdate — event-type semantics (active term)', () => {
  const run = (type: string, over: Record<string, unknown> = {}) =>
    computePremiumUpdate(ev({ type, ...over }), NOW)!;

  it('INITIAL_PURCHASE → premium, renewing, started_at set', () => {
    const u = run('INITIAL_PURCHASE', { purchased_at_ms: PAST });
    expect(u.is_premium).toBe(true);
    expect(u.premium_will_renew).toBe(true);
    expect(u.premium_in_grace_period).toBe(false);
    expect(u.premium_started_at).toBe(new Date(PAST).toISOString());
  });
  it('RENEWAL / UNCANCELLATION / PRODUCT_CHANGE / SUBSCRIPTION_EXTENDED → premium + renewing', () => {
    for (const t of ['RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED']) {
      const u = run(t);
      expect(u.is_premium).toBe(true);
      expect(u.premium_will_renew).toBe(true);
    }
  });
  it('CANCELLATION → premium until term end, NOT renewing (L9)', () => {
    const u = run('CANCELLATION');
    expect(u.is_premium).toBe(true);        // access continues to expiry
    expect(u.premium_will_renew).toBe(false);
  });
  it('SUBSCRIPTION_PAUSED → keeps access to term end, not renewing (H3 fix)', () => {
    const u = run('SUBSCRIPTION_PAUSED');
    expect(u.is_premium).toBe(true);        // was wrongly false before the fix
    expect(u.premium_will_renew).toBe(false);
  });
  it('NON_RENEWING_PURCHASE / TEMPORARY_ENTITLEMENT_GRANT → premium but NOT renewing (M5 fix)', () => {
    expect(run('NON_RENEWING_PURCHASE').premium_will_renew).toBe(false);
    expect(run('TEMPORARY_ENTITLEMENT_GRANT').premium_will_renew).toBe(false);
  });
  it('unknown/garbage type → trusts expiry, NOT renewing (Bug #4 fix)', () => {
    const u = run('SOME_FUTURE_RC_EVENT');
    expect(u.is_premium).toBe(true);        // future expiry
    expect(u.premium_will_renew).toBe(false);
  });
});

describe('computePremiumUpdate — EXPIRATION & BILLING_ISSUE/grace', () => {
  it('EXPIRATION → not premium even with a future expiry field', () => {
    const u = computePremiumUpdate(ev({ type: 'EXPIRATION', expiration_at_ms: FUTURE }), NOW)!;
    expect(u.is_premium).toBe(false);
    expect(u.premium_will_renew).toBe(false);
    expect(u.premium_in_grace_period).toBe(false);
  });
  it('BILLING_ISSUE with active grace → premium + in grace (H2 fix)', () => {
    const u = computePremiumUpdate(
      ev({ type: 'BILLING_ISSUE', expiration_at_ms: PAST, grace_period_expiration_at_ms: FUTURE }), NOW)!;
    expect(u.is_premium).toBe(true);
    expect(u.premium_in_grace_period).toBe(true);
  });
  it('BILLING_ISSUE past expiry + NO grace configured → NOT premium (H2 fix: no free premium)', () => {
    const u = computePremiumUpdate(
      ev({ type: 'BILLING_ISSUE', expiration_at_ms: PAST }), NOW)!;
    expect(u.is_premium).toBe(false);
    expect(u.premium_in_grace_period).toBe(false);
  });
  it('BILLING_ISSUE past expiry + EXPIRED grace → NOT premium', () => {
    const u = computePremiumUpdate(
      ev({ type: 'BILLING_ISSUE', expiration_at_ms: PAST, grace_period_expiration_at_ms: PAST }), NOW)!;
    expect(u.is_premium).toBe(false);
    expect(u.premium_in_grace_period).toBe(false);
  });
});

// ─── computePremiumUpdate — expiration edge cases (no throws) ─────────────────
describe('computePremiumUpdate — expiration_at_ms robustness', () => {
  it('future vs past sets is_premium correctly', () => {
    expect(computePremiumUpdate(ev({ expiration_at_ms: FUTURE }), NOW)!.is_premium).toBe(true);
    expect(computePremiumUpdate(ev({ expiration_at_ms: PAST }), NOW)!.is_premium).toBe(false);
  });
  it('exact-instant expiry is exclusive (expired AT now)', () => {
    expect(computePremiumUpdate(ev({ expiration_at_ms: NOW }), NOW)!.is_premium).toBe(false);
  });
  it('null/undefined expiry → no-expiry, premium, null column', () => {
    const u = computePremiumUpdate(ev({ expiration_at_ms: null }), NOW)!;
    expect(u.is_premium).toBe(true);
    expect(u.premium_expires_at).toBeNull();
  });
  it('expiry = 0 keeps the timestamp instead of dropping it (Bug #2 fix)', () => {
    const u = computePremiumUpdate(ev({ expiration_at_ms: 0 }), NOW)!;
    expect(u.is_premium).toBe(false);
    expect(u.premium_expires_at).toBe(new Date(0).toISOString()); // NOT null
  });
  it.each(['1700000000000', 'abc', NaN, Infinity, 1e20, {}, true])(
    'does NOT throw on a malformed expiration_at_ms: %p (Bug #1 fix)',
    (bad) => {
      expect(() => computePremiumUpdate(ev({ expiration_at_ms: bad as any }), NOW)).not.toThrow();
      const u = computePremiumUpdate(ev({ expiration_at_ms: bad as any }), NOW)!;
      expect(u.premium_expires_at).toBeNull(); // unparseable → null, treated as no-expiry
    },
  );
});

// ─── Handler: method/auth/payload guards ─────────────────────────────────────
describe('rc-webhook handler — guards', () => {
  const SECRET = 'c'.repeat(40);
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RC_WEBHOOK_SECRET = SECRET;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  });

  const makeRes = () => {
    const json = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnValue({ json });
    return { status, json } as any;
  };
  const makeReq = (body: unknown, auth = `Bearer ${SECRET}`, method = 'POST') =>
    ({ method, headers: { authorization: auth }, body } as any);

  it('405 on non-POST', async () => {
    const res = makeRes();
    await handler(makeReq({}, undefined, 'GET'), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
  it('401 on bad auth', async () => {
    const res = makeRes();
    await handler(makeReq({ event: ev() }, 'Bearer wrong'), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it('400 on missing/invalid event (no id/type)', async () => {
    const res = makeRes();
    await handler(makeReq({ event: { app_user_id: UID } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  it('400 when event.id is a non-string', async () => {
    const res = makeRes();
    await handler(makeReq({ event: { id: 123, type: 'RENEWAL' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── Handler: idempotency ordering (the HIGH-1 fix) + transfer ───────────────
describe('rc-webhook handler — apply-then-mark idempotency', () => {
  const SECRET = 'd'.repeat(40);
  let profileUpdateError: any;
  let insertError: any;
  let order: string[];
  let inserted: any[];
  let updatedWith: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RC_WEBHOOK_SECRET = SECRET;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    profileUpdateError = null;
    insertError = null;
    order = [];
    inserted = [];
    updatedWith = [];
    mockFrom.mockImplementation((table: string) => ({
      update: (payload: any) => {
        updatedWith.push({ table, payload });
        return {
          eq: () => { order.push(`update:${table}`); return Promise.resolve({ error: profileUpdateError }); },
          in: () => { order.push(`update-in:${table}`); return Promise.resolve({ error: profileUpdateError }); },
        };
      },
      insert: (payload: any) => {
        order.push(`insert:${table}`);
        inserted.push({ table, payload });
        return Promise.resolve({ error: insertError });
      },
    }));
  });

  const makeRes = () => {
    const json = jest.fn().mockReturnThis();
    const status = jest.fn().mockReturnValue({ json });
    return { status, json, _status: status, _json: json } as any;
  };
  const post = (event: any) =>
    ({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` }, body: { event } } as any);

  it('applies the profile update BEFORE recording the marker', async () => {
    const res = makeRes();
    await handler(post(ev({ id: 'evt-1', type: 'INITIAL_PURCHASE' })), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(order).toEqual(['update:profiles', 'insert:rc_webhook_events']);
    expect(updatedWith[0].payload.is_premium).toBe(true);
    expect(inserted[0].payload.event_id).toBe('evt-1');
  });

  it('on a transient profile-update failure → 500 and NO marker (so RC retry reprocesses)', async () => {
    profileUpdateError = { code: 'XX000' };
    const res = makeRes();
    await handler(post(ev({ id: 'evt-2' })), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(inserted).toHaveLength(0);              // ← the HIGH-1 fix: marker never written
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('duplicate marker (23505) after a harmless re-apply → 200', async () => {
    insertError = { code: '23505' };
    const res = makeRes();
    await handler(post(ev({ id: 'evt-dup' })), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('a non-dup marker insert error → 500', async () => {
    insertError = { code: '23502' };
    const res = makeRes();
    await handler(post(ev({ id: 'evt-3' })), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('no-op event (foreign entitlement) still records the marker and 200s', async () => {
    const res = makeRes();
    await handler(post(ev({ id: 'evt-noop', entitlement_ids: ['other'] })), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updatedWith).toHaveLength(0);           // no profile write
    expect(inserted[0].payload.event_id).toBe('evt-noop');
  });

  it('TRANSFER revokes transferred_from and grants transferred_to (C1 fix)', async () => {
    const FROM = '99999999-0000-0000-0000-000000000001';
    const TO = '99999999-0000-0000-0000-000000000002';
    const res = makeRes();
    await handler(post({
      id: 'evt-xfer', type: 'TRANSFER',
      transferred_from: [FROM, '$RCAnonymousID:abc'], // anonymous id must be skipped
      transferred_to: [TO],
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const revoke = updatedWith.find((u) => u.payload.is_premium === false);
    const grant = updatedWith.find((u) => u.payload.is_premium === true);
    expect(revoke).toBeTruthy();
    expect(grant).toBeTruthy();
  });

  it('always flushes Sentry (finally)', async () => {
    const res = makeRes();
    await handler(post(ev({ id: 'evt-flush' })), res);
    expect(mockFlushSentry).toHaveBeenCalled();
  });
});
