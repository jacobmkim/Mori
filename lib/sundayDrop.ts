// lib/sundayDrop.ts — PURE helpers for the Sunday Drop weekly auto-plan cron
// (api/cron/sunday-drop.ts). No I/O, no api/ imports (premium logic stays in
// api/_requirePremium.ts — the cron composes that with these), so this module is
// unit-testable in the app jest context and safe wherever it's imported.

import type { AutoPlanResult, AutoPlanSlot, MealSlot } from '@/types';
import { localDayOfWeekFor, localHourFor } from './timezone';
import { DECK_ALL_MEAT, DECK_LAND_MEAT, buildIngredientText } from './deckFilter';

// Sunday Drop fires in a 2-hour local window so the hourly cron catches every IANA zone's
// local Sunday morning, and DST spring-forward (which jumps ~02:00, never 09:00) can't skip it.
// Matching two consecutive cron runs is harmless — the cron's atomic per-week claim dedupes.
export const SUNDAY_DROP_HOUR_START = 9;  // inclusive
export const SUNDAY_DROP_HOUR_END = 11;   // exclusive

// Don't push a half-empty week. Below this many filled slots (cold start / catalog too small /
// budget-unsatisfiable) the cron keeps the claim row but skips the notification.
export const MIN_FILL = 4;

/** True when it is currently Sunday within [09:00, 11:00) local time for `tz`. */
export function isSundayDropTime(tz: string | null | undefined, now: Date): boolean {
  const zone = tz ?? 'UTC';
  if (localDayOfWeekFor(zone, now) !== 0) return false;
  const h = localHourFor(zone, now);
  return h >= SUNDAY_DROP_HOUR_START && h < SUNDAY_DROP_HOUR_END;
}

/**
 * The Monday that STARTS the week after the given local Sunday — i.e. the
 * meal_plans.week_start_date the drop should populate (next week). Input + output are
 * 'YYYY-MM-DD'. Pure UTC-epoch math (DST-immune).
 */
export function mondayAfter(sundayDate: string): string {
  const [y, m, d] = sundayDate.split('-').map(Number);
  // The Sunday + 1 day = the Monday that starts the upcoming week.
  const monday = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
  const yy = monday.getUTCFullYear();
  const mm = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(monday.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * The user's already-placed (non-auto) DINNER slots for a week, as autoPlan lockedSlots input.
 * A drop must never clobber a meal the user set manually — these are passed to planWeekFromInputs
 * so the optimizer keeps them on their day and won't re-pick the same recipe elsewhere.
 * `catalogById` resolves recipe_id → Recipe (only resolvable picks can be locked).
 */
export function existingManualDinnerSlots(
  slots: MealSlot[] | null | undefined,
  catalogById: Map<string, import('@/types').Recipe>,
): { day: number; recipe: import('@/types').Recipe }[] {
  if (!slots?.length) return [];
  const out: { day: number; recipe: import('@/types').Recipe }[] = [];
  for (const s of slots) {
    if (s.meal_type !== 'dinner') continue;
    // Mori's own prior picks (auto_plan / a previous sunday_drop) are replaceable — only a
    // truly manual/legacy dinner is locked. (In prod the idempotency claim prevents a same-week
    // re-generation seeing a prior sunday_drop here, but keep the semantics correct regardless.)
    if (s.provenance === 'auto_plan' || s.provenance === 'sunday_drop') continue;
    const recipe = catalogById.get(s.recipe_id);
    if (recipe) out.push({ day: s.day, recipe });
  }
  return out;
}

/**
 * Re-tag optimizer output as a Sunday Drop: auto_plan → sunday_drop, manual stays manual
 * (a locked user pick re-overlaid by mergeLockedSlots keeps its provenance). Returns a new array.
 */
export function retagSundayDropProvenance(slots: AutoPlanSlot[]): AutoPlanSlot[] {
  return slots.map((s) => ({
    ...s,
    provenance: s.provenance === 'manual' ? 'manual' : 'sunday_drop',
  }));
}

/** Count of filled (recipe !== null) slots — gates the MIN_FILL push decision. */
export function filledCount(slots: AutoPlanSlot[]): number {
  return slots.filter((s) => s.recipe !== null).length;
}

/**
 * True when a recipe violates the user's CURRENT hard filters (dietary goals + ingredient
 * dislikes). A stored proposal is generated against Sunday's profile, and prefs can change
 * before review (went vegetarian, added an allergy dislike) — hydration re-validates every
 * slot + alternate through this so the dislike/dietary commandments hold at ACCEPT time,
 * not just at generation time. Same keyword semantics as deckFilter (dietary hard filter)
 * and weekPlanCore (dislike substring match on ingredient names).
 */
export function violatesCurrentPrefs(
  recipe: import('@/types').Recipe,
  dietaryGoals: string[] | null | undefined,
  ingredientDislikes: string[] | null | undefined,
): boolean {
  const dislikes = (ingredientDislikes ?? []).map((d) => d.toLowerCase()).filter(Boolean);
  if (dislikes.length > 0) {
    const ings = (recipe.ingredients ?? []) as { name?: string }[];
    if (ings.some((ing) => ing?.name && dislikes.some((d) => ing.name!.toLowerCase().includes(d)))) {
      return true;
    }
  }
  const goals = dietaryGoals ?? [];
  if (goals.length > 0) {
    const title = (recipe.title ?? '').toLowerCase();
    if (goals.includes('vegan') || goals.includes('vegetarian')) {
      if (DECK_ALL_MEAT.some((w) => title.includes(w))) return true;
      const ingText = buildIngredientText((recipe.ingredients ?? []) as any[]);
      if (DECK_ALL_MEAT.some((w) => ingText.includes(w))) return true;
    } else if (goals.includes('pescatarian')) {
      if (DECK_LAND_MEAT.some((w) => title.includes(w))) return true;
      const ingText = buildIngredientText((recipe.ingredients ?? []) as any[]);
      if (DECK_LAND_MEAT.some((w) => ingText.includes(w))) return true;
    }
  }
  return false;
}

/**
 * Push body for the "Your week is ready" notification. Prefers the optimizer's human
 * explanation; falls back to a generic line. Trimmed to a notification-friendly length.
 */
export function summarizeDrop(result: AutoPlanResult): string {
  const n = filledCount(result.slots);
  const base = result.explanation?.trim();
  if (base) return base.length > 140 ? `${base.slice(0, 137).trimEnd()}…` : base;
  return `${n} dinner${n === 1 ? '' : 's'} planned around your taste — tap to see why these picks.`;
}
