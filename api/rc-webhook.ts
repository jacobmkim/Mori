/**
 * Vercel function: /api/rc-webhook
 *
 * The SOLE writer of profiles.is_premium (+ the other entitlement columns).
 * RevenueCat POSTs a subscription-lifecycle event here; we map it to the user's
 * profile and set their premium state. The client NEVER writes these columns
 * (the protect_premium_columns trigger blocks authenticated/anon roles; the
 * service-role key used here is exempt — current_user = 'service_role').
 *
 * Idempotency (apply-then-mark, NOT mark-then-apply): we apply the profile
 * update FIRST — it is idempotent (same event → same column values, last-write-
 * wins) — then record event_id in rc_webhook_events LAST. A duplicate delivery
 * re-applies the same values harmlessly and the marker insert dups (23505 → 200).
 * A transient update failure leaves NO marker, so RC's retry reprocesses — a paid
 * entitlement is never stranded. (The naive "log-first" ordering would strand it.)
 *
 * Auth: timing-safe Bearer compare against RC_WEBHOOK_SECRET (mirrors cron/_auth).
 * Validation: no Zod — conscious exception; the shared secret is the gate and
 * every field is individually guarded. Sandbox AND production events both run
 * against the shared DB ON PURPOSE, so App Review's sandbox trial actually grants
 * premium; `environment` is on the event for future auditing if needed.
 *
 * Errors: generic bodies only; real detail → Sentry, flushed in finally.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { captureException, flushSentry } from './_sentry';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

/** Timing-safe Bearer check against RC_WEBHOOK_SECRET (mirrors verifyCronAuth). */
export function verifyWebhookAuth(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  const secret = process.env.RC_WEBHOOK_SECRET;
  if (!secret || typeof auth !== 'string') return false; // unset secret → reject all
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false; // guard the timingSafeEqual length throw
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  } catch {
    return false;
  }
}

const ENTITLEMENT_ID = 'mori_plus';

// How long a TRANSFER grant is trusted when the event carries no expiry — long enough that a
// legitimate device restore isn't interrupted, short enough that an expired receipt can't buy
// free premium. The next lifecycle event overwrites it with the real date.
const TRANSFER_RECONCILE_MS = 48 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only EXPIRATION immediately revokes access (RC's explicit rule). CANCELLATION
// and SUBSCRIPTION_PAUSED keep access until the paid term ends (expiration_at_ms).
const RENEWING_EVENTS = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED',
]);

type RcEvent = {
  id?: unknown;
  type?: unknown;
  app_user_id?: unknown;
  product_id?: unknown;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  expiration_at_ms?: unknown;
  purchased_at_ms?: unknown;
  grace_period_expiration_at_ms?: unknown;
  transferred_from?: unknown;
  transferred_to?: unknown;
  environment?: unknown;
};

// Max representable JS Date is ±8.64e15 ms. Bound here so a finite-but-absurd
// timestamp (e.g. 1e20) degrades to null instead of throwing RangeError in
// toISOString() — which, pre-guard, would 500 the webhook.
const MAX_DATE_MS = 8.64e15;
const asMs = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_DATE_MS ? v : null;
const asIso = (ms: number | null): string | null => {
  if (ms == null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const uuidList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)).map((s) => s.toLowerCase())
    : [];

/**
 * Pure mapping from a single-user lifecycle event → the profiles entitlement
 * columns. Exported for unit testing without a DB. Returns null when the event
 * doesn't touch us (other entitlement, or unmappable app_user_id) so the caller
 * no-ops. Never throws on a malformed field (degrades to null/false).
 *
 * NOTE: TRANSFER is NOT handled here — it has no app_user_id and is processed
 * separately by applyTransfer().
 */
export function computePremiumUpdate(event: RcEvent, now: number): Record<string, unknown> | null {
  const rawId = event.app_user_id;
  if (typeof rawId !== 'string' || !UUID_RE.test(rawId)) return null; // anonymous / unmappable
  const appUserId = rawId.toLowerCase();

  const entIds = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  // Empty list = lifecycle event without entitlement detail. Safe to assume ours
  // ONLY while mori_plus is the sole entitlement — revisit if a 2nd product ships.
  if (entIds.length > 0 && !entIds.includes(ENTITLEMENT_ID)) return null;

  const type = typeof event.type === 'string' ? event.type : '';
  const expMs = asMs(event.expiration_at_ms);
  const notExpired = expMs == null || expMs > now;
  const graceMs = asMs(event.grace_period_expiration_at_ms);
  const graceActive = graceMs != null && graceMs > now;

  let isPremium: boolean;
  if (type === 'EXPIRATION') isPremium = false; // sole immediate-revoke event
  else if (type === 'BILLING_ISSUE') isPremium = graceActive || notExpired; // grace window
  else isPremium = notExpired; // INITIAL/RENEWAL/CANCELLATION/PAUSED/unknown → trust expiry

  const update: Record<string, unknown> = {
    is_premium: isPremium,
    premium_product_id: typeof event.product_id === 'string' ? event.product_id : null,
    premium_expires_at: asIso(expMs),
    premium_will_renew: RENEWING_EVENTS.has(type), // positive allowlist (NON_RENEWING/TEMP/CANCEL/etc → false)
    premium_in_grace_period: type === 'BILLING_ISSUE' && graceActive,
    revenuecat_user_id: appUserId,
  };
  if (type === 'INITIAL_PURCHASE') {
    update.premium_started_at = asIso(asMs(event.purchased_at_ms)) ?? new Date(now).toISOString();
  }
  return update;
}

/**
 * TRANSFER moves an entitlement between app_user_ids (restore on a new device,
 * anonymous→identified login, Family Sharing). The event has NO app_user_id —
 * only transferred_from / transferred_to arrays (which may contain anonymous
 * non-UUID ids we skip). Revoke the old owners (fail-safe: never leave a stale
 * grant) and grant the new owner(s). TRANSFER carries no expiration, so the next
 * lifecycle event (RENEWAL/EXPIRATION) for the new id reconciles the real dates.
 */
async function applyTransfer(sb: SupabaseClient, event: RcEvent): Promise<void> {
  // Scope to our entitlement, like computePremiumUpdate — a transfer of some future
  // second product must not move mori_plus.
  const entIds = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  if (entIds.length > 0 && !entIds.includes(ENTITLEMENT_ID)) return;

  const from = uuidList(event.transferred_from);
  const to = uuidList(event.transferred_to);
  if (from.length) {
    const { error } = await sb
      .from('profiles')
      .update({ is_premium: false, premium_will_renew: false, premium_in_grace_period: false })
      .in('id', from);
    if (error) throw new Error(`transfer revoke failed: ${error.code ?? 'unknown'}`);
  }
  if (to.length) {
    // ALWAYS write an expiry. Leaving it untouched was a free-premium hole: a fresh profile's
    // premium_expires_at is NULL and isPremiumActive reads NULL as "never expires", so restoring
    // an EXPIRED receipt onto a new account granted premium permanently — repeatable per account.
    // Use the event's expiry when present; otherwise a short reconciliation window that the next
    // lifecycle event replaces with the real date (also fixes the mirror case, where a stale PAST
    // expiry on the receiving profile would have denied a legitimate transferred payer).
    const expMs = asMs(event.expiration_at_ms);
    const expiresAt = asIso(expMs) ?? new Date(Date.now() + TRANSFER_RECONCILE_MS).toISOString();
    const { error } = await sb
      .from('profiles')
      .update({
        is_premium: expMs == null || expMs > Date.now(),
        premium_expires_at: expiresAt,
        premium_in_grace_period: false,
      })
      .in('id', to);
    if (error) throw new Error(`transfer grant failed: ${error.code ?? 'unknown'}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyWebhookAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const event: RcEvent | undefined = req.body?.event;
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }
    const sb = getSupabase();

    // 1. Apply the side effect FIRST (idempotent / last-write-wins).
    if (event.type === 'TRANSFER') {
      await applyTransfer(sb, event);
    } else {
      const update = computePremiumUpdate(event, Date.now());
      if (update) {
        const targetId = update.revenuecat_user_id as string;
        // Ordering guard. RC retries/cold-start jitter can deliver a STALE revoke after a newer
        // grant; applying it would both drop is_premium and rewind premium_expires_at, locking a
        // live subscriber out with no self-service fix. Never let an older expiry revoke a
        // currently-valid one (grants are unaffected — a later real expiry still applies).
        if (update.is_premium === false) {
          const { data: cur } = await sb
            .from('profiles').select('premium_expires_at').eq('id', targetId).maybeSingle();
          const curMs = cur?.premium_expires_at ? Date.parse(cur.premium_expires_at) : NaN;
          const evtMs = asMs(event.expiration_at_ms);
          if (Number.isFinite(curMs) && curMs > Date.now() && (evtMs == null || evtMs < curMs)) {
            captureException(new Error(`rc-webhook: ignored stale ${event.type} for ${event.id}`));
            return res.status(200).json({ received: true, ignored: 'stale' });
          }
        }
        // .select() so a 0-row match is detectable: PostgREST reports success when the WHERE
        // matches nothing, which silently swallowed "user paid but their profile row didn't
        // exist yet" — RC would mark it delivered and never retry. 500 makes RC retry instead.
        const { data: rows, error: upErr } = await sb
          .from('profiles').update(update).eq('id', targetId).select('id');
        if (upErr) throw new Error(`profiles premium update failed: ${upErr.code ?? 'unknown'}`);
        if (!rows?.length) throw new Error(`profiles premium update matched no row for ${targetId}`);
      }
    }

    // 2. Record the processed marker LAST. A duplicate (23505) means RC re-
    //    delivered an event we already applied (the update above was a harmless
    //    re-apply) → 200. Any other insert error is a real failure → 500 → retry.
    const mappable =
      typeof event.app_user_id === 'string' && UUID_RE.test(event.app_user_id)
        ? event.app_user_id.toLowerCase()
        : null;
    const { error: insErr } = await sb
      .from('rc_webhook_events')
      .insert({ event_id: event.id, event_type: event.type, user_id: mappable });
    if (insErr && insErr.code !== '23505') {
      throw new Error(`rc_webhook_events insert failed: ${insErr.code ?? 'unknown'}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    captureException(err);
    return res.status(500).json({ error: 'Failed to process webhook' });
  } finally {
    await flushSentry(2000);
  }
}
