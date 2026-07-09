/**
 * Regression guard for the lib/api.ts → lib/weekPlanCore.ts extraction.
 *
 * generateWeekPlan's pure body (dislike + skill + persistable + locked filters, scoreRecipe
 * binding, autoPlanWeek + mergeLockedSlots) was lifted verbatim into planWeekFromInputs so the
 * Sunday Drop Vercel cron can share it. These tests lock that behavior: the hard filters still
 * apply, locked slots are preserved, and the same seed yields the same plan (server determinism).
 *
 * scoreRecipe itself is covered byte-for-byte by scoreRecipe.test.ts; autoPlanWeek by
 * autoPlan.test.ts. This file proves the WIRING between them is intact post-refactor.
 */
import {
  planWeekFromInputs,
  scoreRecipe,
  sessionLeftSwipes,
  sessionShownIds,
  sessionCuisineSwipes,
} from '@/lib/weekPlanCore';
import type { Profile, Recipe } from '@/types';

// Deterministic seeded RNG (same as autoPlan.test.ts) so jitter tie-breaks are reproducible.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idc = 0;
beforeEach(() => { idc = 0; });

interface Opt {
  id?: string; cuisine?: string; mealTypes?: string[]; ingredients?: string[];
  skill?: string; cost?: number; supabaseId?: string | null;
}
function mr(opt: Opt = {}): Recipe {
  const id = opt.id ?? `r${idc++}`;
  return {
    id,
    supabase_id: opt.supabaseId === undefined ? id : opt.supabaseId,
    external_id: id,
    title: `dish ${id}`,
    cuisine: opt.cuisine ?? null,
    meal_types: opt.mealTypes ?? ['dinner'],
    cost_per_serving: opt.cost ?? 5,
    macros: null,
    ingredients: (opt.ingredients ?? []).map((n) => ({ name: n })),
    dietary_tags: [],
    skill_level: opt.skill ?? null,
    prep_time_mins: 10,
    cook_time_mins: 10,
  } as any;
}

const EMPTY = {
  swipeMap: new Map(),
  savedExternalIds: new Set<string>(),
  affinityMap: new Map(),
  interactionMap: new Map(),
  pantrySet: new Set<string>(),
  leftoversSet: new Set<string>(),
  ratingMap: new Map(),
  savedAtMap: new Map(),
} as const;

function plan(catalog: Recipe[], profile: Profile | null, over: Record<string, unknown> = {}) {
  return planWeekFromInputs({
    catalog,
    profile,
    ...EMPTY,
    mealTypes: ['dinner'],
    days: 7,
    random: mulberry32(42),
    ...over,
  });
}

const filledIds = (res: ReturnType<typeof planWeekFromInputs>) =>
  res.slots.filter((s) => s.recipe !== null).map((s) => s.recipe!.id);

describe('planWeekFromInputs — integration wiring', () => {
  it('fills 7 dinner slots with no repeats from an ample catalog', () => {
    const catalog = Array.from({ length: 12 }, () => mr());
    const res = plan(catalog, null);
    expect(filledIds(res)).toHaveLength(7);
    expect(new Set(filledIds(res)).size).toBe(7);
  });

  it('is deterministic — same seed yields the identical plan', () => {
    const catalog = Array.from({ length: 12 }, (_, i) => mr({ id: `r${i}` }));
    const a = planWeekFromInputs({ catalog, profile: null, ...EMPTY, days: 7, random: mulberry32(7) });
    const b = planWeekFromInputs({ catalog, profile: null, ...EMPTY, days: 7, random: mulberry32(7) });
    expect(filledIds(a)).toEqual(filledIds(b));
  });
});

describe('planWeekFromInputs — hard filters (mirror fetchScoredDeck)', () => {
  it('excludes recipes containing a disliked ingredient', () => {
    const catalog = [
      mr({ id: 'has-mushroom', ingredients: ['portobello mushroom'] }),
      ...Array.from({ length: 8 }, (_, i) => mr({ id: `ok${i}`, ingredients: ['chicken'] })),
    ];
    const profile = { ingredient_dislikes: ['mushroom'] } as any as Profile;
    const res = plan(catalog, profile);
    expect(filledIds(res)).not.toContain('has-mushroom');
  });

  it('excludes recipes above the user skill level (confident_chef vs beginner)', () => {
    const catalog = [
      mr({ id: 'hard', skill: 'confident_chef' }),
      ...Array.from({ length: 8 }, (_, i) => mr({ id: `easy${i}`, skill: 'beginner' })),
    ];
    const profile = { skill_level: 'beginner' } as any as Profile;
    const res = plan(catalog, profile);
    expect(filledIds(res)).not.toContain('hard');
  });

  it('excludes recipes without a supabase_id (not persistable to meal_plans)', () => {
    const catalog = [
      mr({ id: 'no-sb', supabaseId: null }),
      ...Array.from({ length: 8 }, (_, i) => mr({ id: `ok${i}` })),
    ];
    const res = plan(catalog, null);
    expect(filledIds(res)).not.toContain('no-sb');
  });
});

describe('planWeekFromInputs — locked slots', () => {
  it('keeps a user-locked recipe on its day and never re-picks it elsewhere', () => {
    const locked = mr({ id: 'locked-dish' });
    const catalog = [locked, ...Array.from({ length: 10 }, (_, i) => mr({ id: `c${i}` }))];
    const res = plan(catalog, null, { lockedSlots: [{ day: 2, recipe: locked }] });
    const day2 = res.slots.find((s) => s.day === 2 && s.mealType === 'dinner');
    expect(day2?.recipe?.id).toBe('locked-dish');
    // Appears exactly once across the week (not auto-picked on another day).
    expect(filledIds(res).filter((id) => id === 'locked-dish')).toHaveLength(1);
  });
});

describe('planWeekFromInputs — no server-side session-state leak (cron warm-invocation safety)', () => {
  it('never populates the module session containers (they are client-logger-only)', () => {
    const userA = Array.from({ length: 10 }, (_, i) => mr({ id: `a${i}` }));
    const userB = Array.from({ length: 10 }, (_, i) => mr({ id: `b${i}` }));
    // Two back-to-back plans (as the cron loops users in one warm invocation).
    plan(userA, null);
    plan(userB, null);
    // The cron never calls the api.ts swipe-loggers, so these MUST stay empty — otherwise
    // user A's session would bleed into user B on a warm Vercel instance.
    expect(sessionLeftSwipes.size).toBe(0);
    expect(sessionShownIds.size).toBe(0);
    expect(sessionCuisineSwipes.size).toBe(0);
  });
});

describe('scoreRecipe — server-safe (forPlanning skips session-shown veto)', () => {
  it('does not return -999 for a planning call when no session state is set', () => {
    const r = mr({ id: 'x' });
    const s = scoreRecipe(r, null, new Map(), new Set(), new Map(), new Map(), new Set(),
      undefined, undefined, undefined, null, /* forPlanning */ true, () => 0.5);
    expect(s).toBeGreaterThan(-999);
  });
});

// ─── Cross-week variety (the "same plan every Sunday" fix) ─────────────────────────
import { pickAnchorIds, ANCHOR_BUDGET } from '@/lib/weekPlanCore';
import type { RecentPlanHistory } from '@/lib/planHistory';

const noJitter = () => 0;
const hist = (
  entries: [string, { weeksAgo: number; wasCooked?: boolean; proposedOnly?: boolean }][],
): RecentPlanHistory =>
  new Map(entries.map(([id, e]) => [id, { wasCooked: false, proposedOnly: false, ...e }]));

describe('scoreRecipe — recent-plan penalty', () => {
  const base = (r: Recipe, history?: RecentPlanHistory) =>
    scoreRecipe(r, null, new Map(), new Set(), new Map(), new Map(), new Set(), undefined, undefined, undefined, null, true, noJitter, history);

  it('applies −12/−8/−4 for a recipe planned 1/2/3 weeks ago', () => {
    const r = mr({ id: 'a' });
    const clean = base(r);
    expect(base(r, hist([['a', { weeksAgo: 1 }]]))).toBeCloseTo(clean - 12);
    expect(base(r, hist([['a', { weeksAgo: 2 }]]))).toBeCloseTo(clean - 8);
    expect(base(r, hist([['a', { weeksAgo: 3 }]]))).toBeCloseTo(clean - 4);
  });

  it('halves the penalty for proposed-only (dismissed/ignored drop) occurrences', () => {
    const r = mr({ id: 'a' });
    const clean = base(r);
    expect(base(r, hist([['a', { weeksAgo: 1, proposedOnly: true }]]))).toBeCloseTo(clean - 6);
  });

  it('leaves recipes not in the history untouched', () => {
    const r = mr({ id: 'b' });
    expect(base(r, hist([['a', { weeksAgo: 1 }]]))).toBeCloseTo(base(r));
  });
});

describe('pickAnchorIds — the 1–2 recurring favourites', () => {
  const ix = (cooked: number) => ({ grocery_add: 0, cooked, unsave: 0, view: 0, lastCookedAt: null });

  it('picks at most ANCHOR_BUDGET proven favourites, ranked by merit', () => {
    const pool = [mr({ id: 'a' }), mr({ id: 'b' }), mr({ id: 'c' }), mr({ id: 'd' })];
    const history = hist([['a', { weeksAgo: 1 }], ['b', { weeksAgo: 1 }], ['c', { weeksAgo: 2 }], ['d', { weeksAgo: 3 }]]);
    const anchors = pickAnchorIds(
      history,
      pool,
      new Map([['a', 5], ['b', 4], ['c', 4]]),          // ratings
      new Map([['a', ix(3)], ['b', ix(1)], ['c', ix(0)], ['d', ix(2)]]),
      new Set(),
    );
    // a: 5*2 + 3*3 = 19; d: 0 + 2*3 = 6; b: 4*2 + 3 = 11; c: 8. Top-2 = a, b.
    expect(anchors.size).toBe(ANCHOR_BUDGET);
    expect(anchors.has('a')).toBe(true);
    expect(anchors.has('b')).toBe(true);
  });

  it('excludes unproven recipes (never cooked, unrated, unsaved) even when they were planned', () => {
    const pool = [mr({ id: 'a' })];
    const anchors = pickAnchorIds(hist([['a', { weeksAgo: 1 }]]), pool, new Map(), new Map(), new Set());
    expect(anchors.size).toBe(0);
  });

  it('a saved recipe qualifies; recipes not in the pool never do', () => {
    const inPool = mr({ id: 'a' });
    const anchors = pickAnchorIds(
      hist([['a', { weeksAgo: 1 }], ['ghost', { weeksAgo: 1 }]]),
      [inPool],
      new Map(),
      new Map(),
      new Set(['a']), // savedExternalIds keyed by external_id ?? supabase_id (= 'a' here)
    );
    expect([...anchors]).toEqual(['a']);
  });

  it('breaks merit ties deterministically by supabase_id (rng-free)', () => {
    const pool = [mr({ id: 'z' }), mr({ id: 'y' }), mr({ id: 'x' })];
    const history = hist([['z', { weeksAgo: 1 }], ['y', { weeksAgo: 1 }], ['x', { weeksAgo: 1 }]]);
    const ratings = new Map([['z', 4], ['y', 4], ['x', 4]]); // merit 8 each
    const anchors = pickAnchorIds(history, pool, ratings, new Map(), new Set());
    expect([...anchors].sort()).toEqual(['x', 'y']); // lowest ids win the tie
  });
});

describe('planWeekFromInputs — week-over-week variety', () => {
  const idsOf = (res: ReturnType<typeof planWeekFromInputs>) =>
    res.slots.filter((s) => s.recipe !== null).map((s) => s.recipe!.supabase_id as string);

  it('3 consecutive simulated weeks: overlap with the previous week never exceeds ANCHOR_BUDGET', () => {
    const catalog = Array.from({ length: 30 }, (_, i) => mr({ id: `r${i}` }));
    // Strong static preferences — exactly the entrenchment that caused identical weeks.
    const affinityMap = new Map(catalog.slice(0, 10).map((r) => [r.supabase_id as string, 1]));

    let history: RecentPlanHistory = new Map();
    let prevIds: string[] = [];
    const weeks: string[][] = [];
    for (let w = 0; w < 3; w++) {
      const res = planWeekFromInputs({
        catalog, profile: null, ...EMPTY, affinityMap,
        days: 7, random: mulberry32(100 + w),
        recentHistory: history,
      });
      const ids = idsOf(res);
      expect(ids).toHaveLength(7);
      if (prevIds.length) {
        const overlap = ids.filter((id) => prevIds.includes(id));
        expect(overlap.length).toBeLessThanOrEqual(ANCHOR_BUDGET);
      }
      weeks.push(ids);
      // Roll the history window forward: last week at weeksAgo 1, the week before at 2.
      const next: RecentPlanHistory = new Map();
      for (const id of ids) next.set(id, { weeksAgo: 1, wasCooked: false, proposedOnly: false });
      for (const id of prevIds) if (!next.has(id)) next.set(id, { weeksAgo: 2, wasCooked: false, proposedOnly: false });
      history = next;
      prevIds = ids;
    }
    // The three weeks are not all the same plan.
    expect(new Set(weeks.map((w) => w.join(','))).size).toBeGreaterThan(1);
  });

  it('an anchor favourite may recur while the rest of last week rotates out', () => {
    const catalog = Array.from({ length: 30 }, (_, i) => mr({ id: `r${i}` }));
    const lastWeek = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
    const history = hist(lastWeek.map((id) => [id, { weeksAgo: 1 }]));
    // r0 is a proven favourite: cooked twice, rated 5 — top anchor merit. Strong static
    // signals (affinity + rating) keep it at the top of the pool once the penalty is waived.
    const affinityMap = new Map([['r0', 1]]);
    const interactionMap = new Map([['r0', { grocery_add: 0, cooked: 2, unsave: 0, view: 0, lastCookedAt: null }]]);
    const ratingMap = new Map([['r0', 5]]);
    const res = planWeekFromInputs({
      catalog, profile: null, ...EMPTY,
      affinityMap, interactionMap, ratingMap,
      days: 7, random: mulberry32(5),
      recentHistory: history, shufflePool: 1,
    });
    const ids = idsOf(res);
    expect(ids).toContain('r0'); // the anchor survives
    const carryOvers = ids.filter((id) => lastWeek.includes(id));
    expect(carryOvers.length).toBeLessThanOrEqual(ANCHOR_BUDGET);
  });

  it('stays deterministic with history: same seed + same history → identical plan', () => {
    const catalog = Array.from({ length: 20 }, (_, i) => mr({ id: `r${i}` }));
    const history = hist([['r0', { weeksAgo: 1 }], ['r1', { weeksAgo: 2 }]]);
    const a = planWeekFromInputs({ catalog, profile: null, ...EMPTY, days: 7, random: mulberry32(7), recentHistory: history });
    const b = planWeekFromInputs({ catalog, profile: null, ...EMPTY, days: 7, random: mulberry32(7), recentHistory: history });
    expect(idsOf(a)).toEqual(idsOf(b));
  });

  it('an all-history pool still fills the week (penalties are graded, the cap self-disables)', () => {
    const catalog = Array.from({ length: 8 }, (_, i) => mr({ id: `r${i}` }));
    const history = hist(catalog.map((r) => [r.supabase_id as string, { weeksAgo: 1 }]));
    const res = planWeekFromInputs({ catalog, profile: null, ...EMPTY, days: 7, random: mulberry32(3), recentHistory: history });
    expect(idsOf(res)).toHaveLength(7);
  });
});
