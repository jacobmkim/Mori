/**
 * Vercel Cron: /api/cron/sunday-drop  (Mori+ flagship — proactive weekly auto-plan)
 *
 * Runs hourly across the weekend (Sat–Mon UTC, see vercel.json). For each PREMIUM user, if it is
 * currently Sunday within [09:00, 11:00) in THEIR local timezone and they haven't already received
 * this week's drop, it generates NEXT week's dinners from their taste profile (the SAME engine as
 * the manual "Build my week") and stores them as a PROPOSAL on the sunday_drops row, then pushes
 * "Your week is ready 🌲". It does NOT write meal_plans — the user reviews + accepts the proposal
 * in the Plan tab (review card → Build-my-week sheet), and only acceptance writes the week. The
 * proposal is lean (recipe ids + alternate ids + meta); the client hydrates it on review.
 *
 * Idempotency: an atomic claim into sunday_drops (UNIQUE user_id, week_start) via upsert +
 * ignoreDuplicates — only the invocation that inserts the row proceeds; overlapping/retried runs
 * no-op. notified_at is written ONLY after a successful push. NOTE: this is conservative — a
 * transient Expo push failure means NO push this week (the proposal is still stored and the review
 * card shows when the user opens the app). We accept a rare missed push over ANY risk of a double-push.
 *
 * Premium is re-checked inline with isPremiumActive (grace + expiry vs now), not a stale snapshot.
 *
 * Trigger manually:  GET /api/cron/sunday-drop   (Authorization: Bearer <CRON_SECRET>)
 * Dev single-user:   GET /api/cron/sunday-drop?userId=<id>&force=1
 *   — bypasses ONLY the Sunday/hour/idempotency time-gates (still requires CRON_SECRET + premium +
 *     push_token). Honored ONLY when NODE_ENV !== 'production'. NEVER add a NODE_ENV auth bypass to
 *     _auth.ts — verifyCronAuth runs first and unconditionally.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import type { Profile, MealSlot, Recipe, ProposedPlan } from '../../types';
import { sendExpoPush } from '../_pushUtils';
import { verifyCronAuth } from './_auth';
import { isPremiumActive } from '../_requirePremium';
import { planWeekFromInputs } from '../../lib/weekPlanCore';
import { localSundayFor } from '../../lib/timezone';
import {
  isSundayDropTime,
  mondayAfter,
  existingManualDinnerSlots,
  retagSundayDropProvenance,
  filledCount,
  summarizeDrop,
  MIN_FILL,
} from '../../lib/sundayDrop';
import { fetchCatalogRows, buildCatalog, fetchUserSignals, fetchRecentPlanHistory } from './_sundayDropData';
import type { RecentPlanHistory } from '../../lib/planHistory';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

// The profile columns the scorer + eligibility gate need.
const PROFILE_COLUMNS =
  'id, timezone, push_token, is_premium, premium_in_grace_period, premium_expires_at, ' +
  'notify_sunday_drop, dietary_goals, ingredient_dislikes, skill_level, cooking_frequency, ' +
  'eating_style, cuisine_preferences, taste_profile, weekly_budget';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const isProd = process.env.NODE_ENV === 'production';
  const force = !isProd && req.query.force === '1';
  const onlyUserId = !isProd && typeof req.query.userId === 'string' ? req.query.userId : null;

  const sb = getSupabase();
  const now = new Date();

  // Premium candidates with a push token. is_premium is a coarse pre-filter; isPremiumActive
  // (grace + expiry) is re-checked per user below.
  let q = sb.from('profiles').select(PROFILE_COLUMNS).eq('is_premium', true).not('push_token', 'is', null);
  if (onlyUserId) q = q.eq('id', onlyUserId);
  const { data: users, error: usersErr } = await q;
  if (usersErr) return res.status(500).json({ error: 'Failed to fetch users' });
  if (!users?.length) return res.status(200).json({ checked: 0, generated: 0, pushed: 0 });

  // The raw catalog is identical for everyone — fetch once, dietary-filter per user.
  let catalogRows: any[];
  try {
    catalogRows = await fetchCatalogRows(sb);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch catalog' });
  }

  let checked = 0;
  let generated = 0;
  let pushed = 0;

  for (const user of users as any[]) {
    checked++;

    // ── Eligibility (premium re-check + opt-in + token + local Sunday-morning window) ──
    if (!isPremiumActive(user, now.getTime())) continue;
    if (user.notify_sunday_drop === false) continue;
    if (!user.push_token) continue;
    if (!force && !isSundayDropTime(user.timezone, now)) continue;

    const weekStart = localSundayFor(user.timezone ?? 'UTC', now); // this local week's Sunday
    const nextMon = mondayAfter(weekStart);                         // the week the drop populates

    // ── Atomic idempotency claim: only the inserter proceeds ──
    const { data: claim, error: claimErr } = await sb
      .from('sunday_drops')
      .upsert({ user_id: user.id, week_start: weekStart, recipe_ids: [] }, {
        onConflict: 'user_id,week_start',
        ignoreDuplicates: true,
      })
      .select('id');
    if (claimErr) continue; // never block the loop on one user's failure
    const won = (claim?.length ?? 0) > 0;
    if (!won && !force) continue; // already dropped this week

    // ── Build the PROPOSAL (same engine as manual Build my week) ──
    // The cron no longer writes meal_plans. It stores a proposed week on the sunday_drops row;
    // the user reviews + accepts it in the Plan tab (which then writes meal_plans).
    let proposedPlan: ProposedPlan;
    let recipeIds: string[];
    let body: string;
    try {
      const dietaryGoals: string[] = Array.isArray(user.dietary_goals) ? user.dietary_goals : [];
      const catalog = buildCatalog(catalogRows, dietaryGoals);
      const bySupabaseId = new Map<string, Recipe>(
        catalog.filter((r) => r.supabase_id).map((r) => [r.supabase_id as string, r]),
      );

      // Recent-plan history rides the same await as the signals (no added latency); its
      // failure degrades to an empty map — variety is a nice-to-have, the drop is not.
      const [signals, recentHistory] = await Promise.all([
        fetchUserSignals(sb, user.id),
        fetchRecentPlanHistory(sb, user.id, nextMon).catch((): RecentPlanHistory => new Map()),
      ]);
      // savedExternalIds is keyed by external_id ?? supabase_id (= Recipe.id), mirroring the client.
      const savedExternalIds = new Set<string>(
        signals.savedRecipeIds.map((id) => bySupabaseId.get(id)?.id).filter((x): x is string => !!x),
      );

      // Respect dinners the user already placed for next week — they show as locked in the proposal
      // and stay theirs on accept (the optimizer won't re-pick them on another day).
      const { data: existing } = await sb
        .from('meal_plans')
        .select('slots')
        .eq('user_id', user.id)
        .eq('week_start_date', nextMon)
        .maybeSingle();
      const existingSlots: MealSlot[] = Array.isArray(existing?.slots) ? existing!.slots : [];
      const lockedSlots = existingManualDinnerSlots(existingSlots, bySupabaseId);

      const result = planWeekFromInputs({
        catalog,
        profile: user as Profile,
        swipeMap: signals.swipeMap,
        savedExternalIds,
        affinityMap: signals.affinityMap,
        interactionMap: signals.interactionMap,
        pantrySet: signals.pantrySet,
        leftoversSet: signals.leftoversSet,
        ratingMap: signals.ratingMap,
        savedAtMap: signals.savedAtMap,
        mealTypes: ['dinner'],
        days: 7,
        startDay: 0,
        lockedSlots,
        recentHistory,
        // No weekly budget + no tunings for v1 — mirrors the manual flow's defaults.
      });

      if (filledCount(result.slots) < MIN_FILL) continue; // cold start / too-small catalog — keep claim, no push

      // Serialize a LEAN proposal: recipe ids + alternate ids (the client hydrates on review, so the
      // proposal never goes stale and the row stays small). Provenance from retag (manual stays manual).
      const proposedSlots = retagSundayDropProvenance(result.slots)
        .filter((s) => s.recipe?.supabase_id)
        .map((s) => ({
          day: s.day,
          mealType: s.mealType,
          recipeId: s.recipe!.supabase_id as string,
          servingsMultiplier: s.servingsMultiplier ?? 1,
          explanation: s.explanation ?? null,
          provenance: s.provenance,
          alternateIds: (s.alternates ?? []).map((a) => a.supabase_id).filter((x): x is string => !!x),
        }));
      // recipe_ids audit = the drop's OWN picks (exclude re-overlaid manual dinners).
      recipeIds = proposedSlots.filter((s) => s.provenance === 'sunday_drop').map((s) => s.recipeId);
      if (recipeIds.length === 0) continue; // week already fully manual — nothing to propose

      proposedPlan = {
        slots: proposedSlots,
        explanation: result.explanation,
        totalCost: result.totalCost,
        overBudget: result.overBudget,
        generateNeeded: result.generateNeeded,
      };
      body = summarizeDrop(result);
    } catch {
      continue; // generation failed for this user — claim row stays (no retry-storm), no push
    }

    // ── Store the proposal (NOT meal_plans — the user accepts it in the app) ──
    const { error: dropErr } = await sb
      .from('sunday_drops')
      .update({ proposed_plan: proposedPlan, recipe_ids: recipeIds, generated_at: now.toISOString() })
      .eq('user_id', user.id).eq('week_start', weekStart);
    if (dropErr) continue; // don't push a proposal we failed to store
    generated++;

    // ── Push (notified_at only on success; clear dead tokens) ──
    const push = await sendExpoPush({
      to: user.push_token,
      title: 'Your week is ready 🌲',
      // Carry the populated week (next Monday) so the tap opens the Plan tab ON the dropped
      // week, not the current one (the drop is always for the upcoming week).
      data: { type: 'sunday_drop', url: `mori://plan?week=${nextMon}` },
      body,
    });
    if (push.ok) {
      pushed++;
      await sb.from('sunday_drops')
        .update({ notified_at: now.toISOString() })
        .eq('user_id', user.id).eq('week_start', weekStart);
    } else if (push.deviceNotRegistered) {
      // Token is dead (uninstall/reinstall) — clear it so we stop trying. Re-registers on next open.
      await sb.from('profiles').update({ push_token: null }).eq('id', user.id);
    }

    await new Promise((r) => setTimeout(r, 50)); // pace Expo + DB writes
  }

  // Metadata only — never log recipe titles / dietary data (health-adjacent PII).
  return res.status(200).json({ checked, generated, pushed });
}
