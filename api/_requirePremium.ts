/**
 * api/_requirePremium.ts
 * Server-side Mori+ entitlement gate. Premium-only endpoints (Auto Plan,
 * Sunday Drop generation, unlimited AI) call requirePremium(req) at the top.
 *
 * Reads the authoritative profiles.is_premium — written ONLY by
 * api/rc-webhook.ts. NEVER trusts a client header. Uses the service-role key so
 * the check doesn't depend on the request's RLS context.
 */
import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, AuthError } from './_apiAuth';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AuthError(500, 'Supabase env vars not configured');
  return createClient(url, key);
}

export type PremiumRow = {
  is_premium?: boolean | null;
  premium_in_grace_period?: boolean | null;
  premium_expires_at?: string | null;
};

/**
 * Pure check: is this profile entitled to premium right now?
 * Premium when in grace (Apple's 16-day billing-retry window) OR is_premium AND
 * not past expiry. Re-checks expiry as defense-in-depth even though the webhook
 * sets is_premium=false on EXPIRATION — guards against a missed/late webhook.
 */
export function isPremiumActive(p: PremiumRow | null | undefined, now: number = Date.now()): boolean {
  if (!p) return false;
  if (p.premium_in_grace_period === true) return true;
  if (p.is_premium !== true) return false;
  if (p.premium_expires_at == null) return true; // ONLY null/undefined = "no expiry"
  // An empty or unparseable expiry string must NOT be read as "no expiry" — it
  // falls through to the NaN guard and fails closed (a "" here would otherwise
  // grant premium forever).
  const expMs = new Date(p.premium_expires_at).getTime();
  if (Number.isNaN(expMs)) return false;
  return expMs > now; // expiry is exclusive — expired at the exact instant
}

/**
 * Throws AuthError(401) if unauthenticated, AuthError(402) if not premium.
 * Returns the verified userId on success. Render failures with handleAuthError.
 */
export async function requirePremium(req: VercelRequest): Promise<string> {
  const userId = await requireAuth(req); // throws AuthError(401) on bad/missing token
  const sb = getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('is_premium, premium_in_grace_period, premium_expires_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new AuthError(500, 'Could not verify subscription');
  if (!isPremiumActive(data as PremiumRow | null)) {
    throw new AuthError(402, 'Mori+ subscription required');
  }
  return userId;
}
