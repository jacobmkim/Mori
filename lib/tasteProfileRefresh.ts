/**
 * Client-side auto-refresh policy for the taste profile ("mori says" card).
 *
 * Background: the free tier gets ONE taste-profile generation per month
 * (FREE_AI_LIMITS in api/_aiUsage.ts) — that credit belongs to the MANUAL
 * refresh button. The monthly taste-notifications cron regenerates stale
 * (30+ day) profiles server-side at no budget cost, so a free user's profile
 * never rots. An unconditional client auto-refresh would silently spend the
 * user's only credit in the background and permanently 402 the visible
 * Refresh button (cardinal-rule degradation — caught by the 2026-07-03 audit).
 *
 * Policy:
 *  - No profile at all → generate (first-value delivery; a brand-new user's
 *    credit IS the first profile). Callers handle this case themselves — this
 *    helper decides only the refresh-an-EXISTING-profile question.
 *  - Free tier → never auto-refresh. The cron keeps them fresh; the credit
 *    stays reserved for the button.
 *  - Premium → auto-refresh when stale (14+ days) or when flavourDna is
 *    missing (legacy / parse-failure profiles). Unlimited, so no 402 risk.
 *
 * Callers should also guard with a once-per-session marker so a profile that
 * repeatedly fails to produce flavourDna can't re-fire on every open.
 */
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * One background refresh attempt per profile per app session, SHARED across every
 * surface (Profile tab + ProfileSheet) — two independent guards would double the cap,
 * and a profile that repeatedly fails to produce flavourDna must not re-fire per open.
 */
export const autoRefreshAttempted = new Set<string>();

export function shouldAutoRefreshTasteProfile(opts: {
  generatedAt: string | null | undefined;
  hasFlavourDna: boolean;
  /**
   * MUST be the SERVER-view entitlement (profiles.is_premium — written only by the RC
   * webhook), NOT the RC client flag. The server bills by its own flag; during webhook
   * lag (or before the webhook is deployed) an RC-"premium" client would otherwise
   * auto-fire and silently spend the FREE bucket's single monthly credit.
   */
  isPremium: boolean;
  now?: number;
}): boolean {
  if (!opts.isPremium) return false;
  if (!opts.hasFlavourDna) return true;
  const t = opts.generatedAt ? new Date(opts.generatedAt).getTime() : NaN;
  return Number.isNaN(t) || t < (opts.now ?? Date.now()) - STALE_MS;
}
