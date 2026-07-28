/**
 * api/_aiUsage.ts
 * Free-tier monthly AI budgets. Premium users are unlimited. Endpoints that
 * spend Claude tokens call checkAiBudget() BEFORE generating and
 * incrementAiUsage() ONLY after a successful generation — never burn a user's
 * budget on a failed gen (Mori+ commandment).
 *
 * The count lives in ai_usage (user, endpoint, UTC YYYY-MM); the atomic
 * increment goes through the service-role-only increment_ai_usage RPC.
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

// Free-tier monthly caps per AI endpoint. Premium bypasses all of these.
export const FREE_AI_LIMITS: Record<string, number> = {
  'generate-recipe': 3,
  'generate-from-pantry': 1,
  // 3, not 1: manual taste-profile refresh was uncapped in the shipped free app,
  // so a low cap would put an upsell on a button users already had. At Haiku
  // prices the headroom is ~free; the cron still refreshes everyone at 30 days.
  'taste-profile': 3,
  'substitutions': 5,
};
export const DEFAULT_FREE_AI_LIMIT = 3;

// Sentinel for "unlimited" (premium). JSON-safe, unlike Infinity — which
// JSON.stringify silently turns into null, giving premium vs. free callers an
// inconsistent response shape.
export const UNLIMITED = -1;

/**
 * Current UTC month key 'YYYY-MM'. Matches the RPC's `to_char(now() AT TIME ZONE
 * 'UTC',...)` in the common case. They can differ by one month for a request
 * that straddles the UTC month boundary (read here at request start, RPC
 * increments at DB-exec time) — benign: at most one extra free gen at the seam,
 * never a lockout or a paywall bypass.
 */
export function currentMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export type BudgetResult = { allowed: boolean; used: number; remaining: number; limit: number };

/**
 * Premium → unlimited. Free → compare this month's count against the endpoint
 * cap. Read-only; does NOT increment. Call before generating.
 *
 * Not atomic with incrementAiUsage: two concurrent free requests can both read
 * used<limit and both proceed, overshooting the cap by (concurrency − 1). It is
 * a bounded cost-leak, NOT a paywall bypass (a free user can't get unlimited
 * gens). Pair AI endpoints with rateLimitUser to bound the burst.
 */
export async function checkAiBudget(
  userId: string,
  endpoint: string,
  isPremium: boolean,
): Promise<BudgetResult> {
  const limit = FREE_AI_LIMITS[endpoint] ?? DEFAULT_FREE_AI_LIMIT;
  if (isPremium) {
    return { allowed: true, used: 0, remaining: UNLIMITED, limit: UNLIMITED };
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('ai_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .eq('month', currentMonthKey())
    .maybeSingle();
  if (error) throw new Error(`ai_usage read failed: ${error.code ?? 'unknown'}`);
  const used = (data?.count as number | undefined) ?? 0;
  return { allowed: used < limit, used, remaining: Math.max(0, limit - used), limit };
}

/** Atomic +1 via the service-role-only RPC. Call ONLY after a successful gen. */
export async function incrementAiUsage(userId: string, endpoint: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc('increment_ai_usage', { p_user: userId, p_endpoint: endpoint });
  if (error) throw new Error(`increment_ai_usage failed: ${error.code ?? 'unknown'}`);
}
