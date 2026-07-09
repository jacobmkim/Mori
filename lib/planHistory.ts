// lib/planHistory.ts — PURE, RN-free cross-week plan memory (server-safe).
//
// The week planner was memoryless: every past drop/plan is persisted
// (sunday_drops.recipe_ids + proposed_plan, meal_plans rows per week) but nothing read it
// back, so a deterministic scorer over near-static signals proposed the SAME week every
// Sunday. This module turns that persisted history into a graded, bounded score penalty
// ("you saw this recipe N weeks ago") that both the Sunday Drop cron and the client
// planner/deck feed into scoreRecipe. Penalties only — never pool exclusion (commandment:
// no binary scoring); the optimizer-level anchor cap lives in lib/autoPlan.ts.

import type { MealSlot } from '@/types';

// How many prior weeks of plans/drops count as "recent".
export const HISTORY_WEEKS = 3;

// Penalty magnitude by weeksAgo (index 1..3; 0 unused). Sized against the scorer's stable
// signal stack: a max-entrenched favourite carries ~+16 (grocery +6, cooked≥30d +4, 5★ +4,
// saved +2), so −12 at week 1 (stacking with the existing cooked-recency −4 when it was
// cooked) neutralizes it, and even the half-strength proposed-only −6 clears the ≤3.5
// jitter band that made drops identical. Decays to −4 by week 3 = a natural re-entry ramp.
export const RECENT_PLAN_PENALTY = [0, 12, 8, 4] as const;

// A recipe that was only PROPOSED (in a drop the user dismissed or ignored) was seen but
// never eaten — penalize it at half strength so it rotates without being buried.
export const PROPOSED_ONLY_FACTOR = 0.5;

export interface PlanHistoryEntry {
  weeksAgo: number;      // 1..HISTORY_WEEKS — the strongest-penalty occurrence's week
  wasCooked: boolean;    // any meal_plans occurrence in the window had cooked_at
  proposedOnly: boolean; // the scored occurrence was a drop proposal, not a written plan
}

/** recipes.id (supabase UUID) → how recently the user saw it in a plan/proposal. */
export type RecentPlanHistory = Map<string, PlanHistoryEntry>;

/**
 * Positive penalty magnitude for a history entry — the caller SUBTRACTS it from the score
 * (mirrors how the scorer applies its other penalties). 0 for anything outside the window.
 */
export function recentPlanPenalty(entry: PlanHistoryEntry): number {
  const base = RECENT_PLAN_PENALTY[entry.weeksAgo] ?? 0;
  return base * (entry.proposedOnly ? PROPOSED_ONLY_FACTOR : 1);
}

/**
 * Add days to a 'YYYY-MM-DD' date string. Pure UTC-epoch math (DST-immune) — the same
 * arithmetic as lib/sundayDrop's mondayAfter. Exported for the history-window queries.
 */
export function addDaysUtc(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/** Whole weeks between a week-start and the target week-start (rounded — tolerant of a
 *  ±1-day irregularity). <=0 = current/future week (excluded by the builder). */
function weeksBefore(targetWeekStart: string, weekStart: string): number {
  const [ty, tm, td] = targetWeekStart.split('-').map(Number);
  const [wy, wm, wd] = weekStart.split('-').map(Number);
  const diffDays = (Date.UTC(ty, tm - 1, td) - Date.UTC(wy, wm - 1, wd)) / 86_400_000;
  return Math.round(diffDays / 7);
}

/**
 * Build the RecentPlanHistory map for the week being planned.
 *
 * Sources (BOTH matter):
 *   - mealPlanRows: prior weeks' meal_plans (week_start_date = Monday). These are weeks the
 *     user actually held — accepted drops land here too (accept writes meal_plans).
 *   - dropRows: prior sunday_drops (week_start = the local SUNDAY before the week the drop
 *     populates — normalized to its Monday here). Load-bearing for users who never accept:
 *     without it, a dismissed/ignored proposal leaves zero trace and the next drop is
 *     identical.
 *
 * Merge rule: per recipe, the occurrence with the HIGHEST penalty wins (ties → nearer week,
 * then planned over proposed-only), so the strongest applicable freshness signal applies.
 * wasCooked ORs across planned occurrences in the window. Rows outside 1..HISTORY_WEEKS
 * (including the current week's in-flight drop claim) are ignored.
 */
export function buildRecentPlanHistory(opts: {
  targetWeekStart: string; // Monday 'YYYY-MM-DD' of the week being built
  mealPlanRows: { week_start_date: string; slots: MealSlot[] | null }[];
  dropRows: { week_start: string; recipe_ids: string[] | null }[];
}): RecentPlanHistory {
  const { targetWeekStart, mealPlanRows, dropRows } = opts;
  const history: RecentPlanHistory = new Map();

  const better = (a: PlanHistoryEntry, b: PlanHistoryEntry): PlanHistoryEntry => {
    const pa = recentPlanPenalty(a);
    const pb = recentPlanPenalty(b);
    if (pa !== pb) return pa > pb ? a : b;
    if (a.weeksAgo !== b.weeksAgo) return a.weeksAgo < b.weeksAgo ? a : b;
    return a.proposedOnly ? b : a;
  };

  const add = (recipeId: string, entry: PlanHistoryEntry): void => {
    const existing = history.get(recipeId);
    if (!existing) { history.set(recipeId, entry); return; }
    const kept = better(existing, entry);
    // Cooked-in-window is a property of the recipe across the window, not of one occurrence.
    history.set(recipeId, { ...kept, wasCooked: existing.wasCooked || entry.wasCooked });
  };

  for (const row of mealPlanRows ?? []) {
    if (!row?.week_start_date) continue;
    const weeksAgo = weeksBefore(targetWeekStart, row.week_start_date);
    if (weeksAgo < 1 || weeksAgo > HISTORY_WEEKS) continue;
    for (const slot of row.slots ?? []) {
      if (!slot?.recipe_id) continue;
      add(slot.recipe_id, { weeksAgo, wasCooked: !!slot.cooked_at, proposedOnly: false });
    }
  }

  for (const row of dropRows ?? []) {
    if (!row?.week_start) continue;
    // sunday_drops.week_start is the Sunday BEFORE the week the drop populates.
    const dropWeekMonday = addDaysUtc(row.week_start, 1);
    const weeksAgo = weeksBefore(targetWeekStart, dropWeekMonday);
    if (weeksAgo < 1 || weeksAgo > HISTORY_WEEKS) continue;
    for (const recipeId of row.recipe_ids ?? []) {
      if (!recipeId) continue;
      add(recipeId, { weeksAgo, wasCooked: false, proposedOnly: true });
    }
  }

  return history;
}
