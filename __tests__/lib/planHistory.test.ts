/**
 * lib/planHistory.ts — the cross-week plan memory that fixes "same recipes every week".
 *
 * Covers: the penalty curve (exact values, proposed-only halving, zero outside the window),
 * the date math (weeksAgo bucketing, Sunday→Monday drop normalization, current/future weeks
 * excluded), and the merge rules (strongest occurrence wins, wasCooked ORs, dismissed drops
 * count the same as ignored ones).
 */
import {
  HISTORY_WEEKS,
  RECENT_PLAN_PENALTY,
  PROPOSED_ONLY_FACTOR,
  recentPlanPenalty,
  addDaysUtc,
  buildRecentPlanHistory,
  type PlanHistoryEntry,
} from '@/lib/planHistory';
import type { MealSlot } from '@/types';

const TARGET = '2026-07-13'; // a Monday

const entry = (over: Partial<PlanHistoryEntry> = {}): PlanHistoryEntry => ({
  weeksAgo: 1,
  wasCooked: false,
  proposedOnly: false,
  ...over,
});

const slot = (recipeId: string, cookedAt: string | null = null): MealSlot => ({
  day: 0,
  meal_type: 'dinner',
  recipe_id: recipeId,
  servings_multiplier: 1,
  cooked_at: cookedAt,
});

/** meal_plans row N weeks before TARGET. */
const planRow = (weeksAgo: number, slots: MealSlot[]) => ({
  week_start_date: addDaysUtc(TARGET, -7 * weeksAgo),
  slots,
});

/** sunday_drops row whose drop populates the week N weeks before TARGET
 *  (week_start = the SUNDAY before that Monday). */
const dropRow = (weeksAgo: number, recipeIds: string[]) => ({
  week_start: addDaysUtc(TARGET, -7 * weeksAgo - 1),
  recipe_ids: recipeIds,
});

describe('recentPlanPenalty — the curve', () => {
  it('is −12/−8/−4 (as magnitudes) for weeks 1/2/3 of a written plan', () => {
    expect(recentPlanPenalty(entry({ weeksAgo: 1 }))).toBe(12);
    expect(recentPlanPenalty(entry({ weeksAgo: 2 }))).toBe(8);
    expect(recentPlanPenalty(entry({ weeksAgo: 3 }))).toBe(4);
  });

  it('halves for proposed-only occurrences', () => {
    expect(recentPlanPenalty(entry({ weeksAgo: 1, proposedOnly: true }))).toBe(6);
    expect(recentPlanPenalty(entry({ weeksAgo: 2, proposedOnly: true }))).toBe(4);
    expect(recentPlanPenalty(entry({ weeksAgo: 3, proposedOnly: true }))).toBe(2);
  });

  it('is 0 beyond the window', () => {
    expect(recentPlanPenalty(entry({ weeksAgo: 4 }))).toBe(0);
    expect(recentPlanPenalty(entry({ weeksAgo: 0 }))).toBe(0);
  });

  it('constants stay in sync with HISTORY_WEEKS', () => {
    expect(RECENT_PLAN_PENALTY).toHaveLength(HISTORY_WEEKS + 1);
    expect(PROPOSED_ONLY_FACTOR).toBe(0.5);
  });
});

describe('addDaysUtc', () => {
  it('adds and subtracts across month boundaries', () => {
    expect(addDaysUtc('2026-07-13', -21)).toBe('2026-06-22');
    expect(addDaysUtc('2026-06-29', 1)).toBe('2026-06-30');
    expect(addDaysUtc('2026-06-30', 1)).toBe('2026-07-01');
  });
});

describe('buildRecentPlanHistory — meal_plans source', () => {
  it('buckets each prior week by weeksAgo', () => {
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [
        planRow(1, [slot('a')]),
        planRow(2, [slot('b')]),
        planRow(3, [slot('c')]),
      ],
      dropRows: [],
    });
    expect(h.get('a')).toEqual({ weeksAgo: 1, wasCooked: false, proposedOnly: false });
    expect(h.get('b')).toEqual({ weeksAgo: 2, wasCooked: false, proposedOnly: false });
    expect(h.get('c')).toEqual({ weeksAgo: 3, wasCooked: false, proposedOnly: false });
  });

  it('ignores the current week, future weeks, and weeks beyond the window', () => {
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [
        { week_start_date: TARGET, slots: [slot('current')] },
        { week_start_date: addDaysUtc(TARGET, 7), slots: [slot('future')] },
        planRow(HISTORY_WEEKS + 1, [slot('too-old')]),
      ],
      dropRows: [],
    });
    expect(h.size).toBe(0);
  });

  it('nearest (highest-penalty) occurrence wins when a recipe repeats across weeks', () => {
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [planRow(3, [slot('a')]), planRow(1, [slot('a')])],
      dropRows: [],
    });
    expect(h.get('a')!.weeksAgo).toBe(1);
  });

  it('wasCooked comes from cooked_at and ORs across occurrences', () => {
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [
        planRow(1, [slot('a')]),
        planRow(2, [slot('a', '2026-07-01T19:00:00Z'), slot('b')]),
      ],
      dropRows: [],
    });
    expect(h.get('a')).toEqual({ weeksAgo: 1, wasCooked: true, proposedOnly: false });
    expect(h.get('b')!.wasCooked).toBe(false);
  });

  it('tolerates null/missing slots and recipe_ids', () => {
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [{ week_start_date: addDaysUtc(TARGET, -7), slots: null }],
      dropRows: [{ week_start: addDaysUtc(TARGET, -8), recipe_ids: null }],
    });
    expect(h.size).toBe(0);
  });
});

describe('buildRecentPlanHistory — sunday_drops source', () => {
  it('normalizes the Sunday week_start to the Monday it populates', () => {
    // Drop with week_start Sunday 2026-07-05 populates Monday 2026-07-06 = 1 week before TARGET.
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [],
      dropRows: [{ week_start: '2026-07-05', recipe_ids: ['a'] }],
    });
    expect(h.get('a')).toEqual({ weeksAgo: 1, wasCooked: false, proposedOnly: true });
  });

  it("excludes the current week's in-flight drop claim (weeksAgo 0)", () => {
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [],
      // This Sunday's claim row: week_start = TARGET − 1 day → populates TARGET itself.
      dropRows: [{ week_start: addDaysUtc(TARGET, -1), recipe_ids: ['a'] }],
    });
    expect(h.size).toBe(0);
  });

  it('a dismissed drop counts exactly like an ignored one (only recipe_ids matter)', () => {
    // buildRecentPlanHistory never reads accepted_at/dismissed_at — proposals count either way.
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [],
      dropRows: [dropRow(1, ['dismissed-or-ignored'])],
    });
    expect(recentPlanPenalty(h.get('dismissed-or-ignored')!)).toBe(6);
  });

  it('an ACCEPTED drop is classified as planned — the meal_plans occurrence outranks the proposal', () => {
    // Accepting a drop writes meal_plans for the same week, so the same recipe arrives from
    // both sources at the same weeksAgo. The planned (full-penalty) occurrence must win.
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [planRow(1, [slot('a')])],
      dropRows: [dropRow(1, ['a'])],
    });
    expect(h.get('a')).toEqual({ weeksAgo: 1, wasCooked: false, proposedOnly: false });
    expect(recentPlanPenalty(h.get('a')!)).toBe(12);
  });

  it('keeps the strongest signal when planned and proposed occurrences differ in week', () => {
    // Planned 2 weeks ago (penalty 8) beats proposed-only 1 week ago (penalty 6).
    const h = buildRecentPlanHistory({
      targetWeekStart: TARGET,
      mealPlanRows: [planRow(2, [slot('a')])],
      dropRows: [dropRow(1, ['a'])],
    });
    expect(h.get('a')).toEqual({ weeksAgo: 2, wasCooked: false, proposedOnly: false });
  });
});
