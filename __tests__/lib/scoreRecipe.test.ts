/**
 * Tests for the leftover-bonus branch inside scoreRecipe.
 * scoreRecipe is a pure function — we supply minimal args to isolate the bonus.
 */

// Suppress Supabase client init (it requires env vars not present in test)
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ select: jest.fn(), eq: jest.fn(), is: jest.fn(), gt: jest.fn(), contains: jest.fn(), single: jest.fn() })),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

import { scoreRecipe, recordSessionSwipe, clearSessionState } from '@/lib/api';

// Minimal stubs so other scorer branches don't interfere
const NO_PROFILE = null;
const EMPTY_MAP = new Map();
const EMPTY_SET = new Set<string>();

function makeRecipe(ingredients: string[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    supabase_id: 'sb-r1',
    external_id: 'r1',
    title: 'Test Recipe',
    cuisine: '',
    dietary_tags: [],
    steps: [],
    macros: null,
    image_url: null,
    prep_time_mins: 0,
    cook_time_mins: 0,
    ingredients: ingredients.map((name) => ({ name, quantity: '', unit: '' })),
    ...overrides,
  } as any;
}

function callScore(recipe: any, leftoversSet?: Set<string>, ratingMap?: Map<string, number>): number {
  return scoreRecipe(
    recipe,
    NO_PROFILE,
    EMPTY_MAP,        // swipeMap
    EMPTY_SET,        // savedExternalIds
    EMPTY_MAP,        // affinityMap
    EMPTY_MAP,        // interactionMap
    EMPTY_SET,        // pantrySet
    leftoversSet,
    ratingMap,
  );
}

// ─── Leftover bonus — core logic ─────────────────────────────────────────────

describe('scoreRecipe — leftover bonus', () => {
  it('adds 0 when leftoversSet is undefined', () => {
    // Run twice for jitter stability check — use a range rather than exact value
    const s = callScore(makeRecipe(['chicken', 'salmon']), undefined);
    // No bonus; score is jitter only (0–3 range)
    expect(s).toBeLessThan(5);
  });

  it('adds 0 when leftoversSet is empty', () => {
    const s = callScore(makeRecipe(['chicken']), new Set());
    expect(s).toBeLessThan(5);
  });

  it('adds +2 for a single matching ingredient', () => {
    // To isolate the bonus, run with and without the leftover and diff
    const without = callScore(makeRecipe(['chicken', 'rice']));
    const with_ = callScore(makeRecipe(['chicken', 'rice']), new Set(['chicken']));
    // diff should be exactly +2 regardless of jitter (same recipe, same session state)
    // jitter is random so we can't diff — instead assert with_ >= without + 2 is unstable.
    // Best approach: check with_ is in a higher range by confirming bonus applied.
    // We inject 0-jitter by mocking Math.random:
    const origRandom = Math.random;
    Math.random = () => 0;
    const noBonus = callScore(makeRecipe(['chicken', 'rice']));
    const withBonus = callScore(makeRecipe(['chicken', 'rice']), new Set(['chicken']));
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(2);
  });

  it('adds +2 per matching ingredient', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const noBonus = callScore(makeRecipe(['chicken', 'salmon', 'onion']));
    const withBonus = callScore(
      makeRecipe(['chicken', 'salmon', 'onion']),
      new Set(['chicken', 'salmon']),
    );
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(4); // 2 matches × 2
  });

  it('caps bonus at +10 (5 matches)', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const noBonus = callScore(makeRecipe(['a', 'b', 'c', 'd', 'e', 'f']));
    const withBonus = callScore(
      makeRecipe(['a', 'b', 'c', 'd', 'e', 'f']),
      new Set(['a', 'b', 'c', 'd', 'e', 'f']),
    );
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(10); // capped at 10, not 12
  });

  it('matches via substring (leftover "chicken" matches "chicken breast")', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const noBonus = callScore(makeRecipe(['chicken breast']));
    const withBonus = callScore(makeRecipe(['chicken breast']), new Set(['chicken']));
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(2);
  });

  it('matches via reverse substring (leftover "chicken breast" matches ingredient "chicken")', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const noBonus = callScore(makeRecipe(['chicken']));
    const withBonus = callScore(makeRecipe(['chicken']), new Set(['chicken breast']));
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(2);
  });

  it('does not double-count same ingredient matching multiple leftovers', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const noBonus = callScore(makeRecipe(['chicken']));
    // "chicken breast" and "chicken thigh" both substring-match "chicken" — still only 1 match
    const withBonus = callScore(makeRecipe(['chicken']), new Set(['chicken breast', 'chicken thigh']));
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(2); // not 4
  });

  it('handles recipe with null/empty ingredients gracefully', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const noBonus = callScore(makeRecipe([]));
    const withBonus = callScore(makeRecipe([]), new Set(['chicken']));
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(0);
  });

  it('handles ingredients with undefined name gracefully', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const recipe = makeRecipe([]);
    recipe.ingredients = [{ name: undefined }, { name: 'chicken' }];
    const noBonus = callScore(recipe);
    const withBonus = callScore(recipe, new Set(['chicken']));
    Math.random = origRandom;
    expect(withBonus - noBonus).toBe(2); // only valid ingredient matches
  });
});

// ─── Rating quality bonus ────────────────────────────────────────────────────

describe('scoreRecipe — rating quality bonus', () => {
  it('adds nothing below 3 reviews (cold start)', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const r1 = callScore(makeRecipe(['chicken'], { avg_rating: 5, rating_count: 0 }));
    const r2 = callScore(makeRecipe(['chicken'], { avg_rating: 5, rating_count: 2 }));
    Math.random = origRandom;
    expect(r1 - baseline).toBe(0);
    expect(r2 - baseline).toBe(0);
  });

  it('adds +3 for a 5-star recipe with 10 reviews', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken'], { avg_rating: 5, rating_count: 10 }));
    Math.random = origRandom;
    expect(rated - baseline).toBe(3); // (5 - 3) * 1.5
  });

  it('subtracts 3 for a 1-star recipe with 10 reviews', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken'], { avg_rating: 1, rating_count: 10 }));
    Math.random = origRandom;
    expect(rated - baseline).toBe(-3); // (1 - 3) * 1.5
  });

  it('is neutral at 3 stars (no influence)', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken'], { avg_rating: 3, rating_count: 10 }));
    Math.random = origRandom;
    expect(rated - baseline).toBe(0);
  });

  it('handles null avg_rating gracefully', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken'], { avg_rating: null, rating_count: 10 }));
    Math.random = origRandom;
    expect(rated - baseline).toBe(0);
  });
});

// ─── Personal user_rating signal ────────────────────────────────────────────

describe('scoreRecipe — personal user_rating signal', () => {
  const SID = 'sb-r1';

  it('adds +4 for a 5-star personal rating', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken']), undefined, new Map([[SID, 5]]));
    Math.random = origRandom;
    expect(rated - baseline).toBe(4); // (5 - 3) * 2
  });

  it('subtracts 4 for a 1-star personal rating', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken']), undefined, new Map([[SID, 1]]));
    Math.random = origRandom;
    expect(rated - baseline).toBe(-4); // (1 - 3) * 2
  });

  it('is neutral at 3 stars', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken']), undefined, new Map([[SID, 3]]));
    Math.random = origRandom;
    expect(rated - baseline).toBe(0);
  });

  it('ignores rating for a different recipe id', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const rated = callScore(makeRecipe(['chicken']), undefined, new Map([['other-id', 5]]));
    Math.random = origRandom;
    expect(rated - baseline).toBe(0);
  });
});

// ─── Cooked repeat-boost × eating style ──────────────────────────────────────
// Penalties for recently-cooked recipes are style-blind; the positive
// "familiar favourite" boost scales: favourites_rotation ×1, default ×0.5,
// variety ×0 (fresh recipes win ties over the back-catalog).

describe('scoreRecipe — cooked repeat boost scales by eating style', () => {
  const SID = 'sb-r1';
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

  function scoreWithCook(eatingStyle: string | null, daysSince: number, cookedCount = 2): number {
    const profile = eatingStyle
      ? ({ eating_style: eatingStyle, cuisine_preferences: [], dietary_goals: [], ingredient_dislikes: [] } as any)
      : null;
    const interactionMap = new Map([
      [SID, { grocery_add: 0, cooked: cookedCount, unsave: 0, view: 0, lastCookedAt: daysAgo(daysSince) }],
    ]);
    return scoreRecipe(
      makeRecipe(['chicken']),
      profile,
      EMPTY_MAP,        // swipeMap
      EMPTY_SET,        // savedExternalIds
      EMPTY_MAP,        // affinityMap
      interactionMap,
      EMPTY_SET,        // pantrySet
    );
  }

  let origRandom: () => number;
  beforeEach(() => { origRandom = Math.random; Math.random = () => 0; });
  afterEach(() => { Math.random = origRandom; });

  it('favourites_rotation keeps the full +8 familiar-favourite boost (>30d, cooked ×2)', () => {
    expect(scoreWithCook('favourites_rotation', 60)).toBe(8);
  });

  it('default/unset style gets half the boost (+4)', () => {
    expect(scoreWithCook(null, 60)).toBe(4);
  });

  it('variety gets no repeat boost — fresh recipes win ties', () => {
    expect(scoreWithCook('variety', 60)).toBe(0);
  });

  it('variety still gets the just-cooked penalty (style-blind)', () => {
    expect(scoreWithCook('variety', 2)).toBe(-20);
  });

  it('favourites_rotation also keeps the just-cooked penalty', () => {
    expect(scoreWithCook('favourites_rotation', 2)).toBe(-20);
  });

  it('scales the 14–30 day window the same way (+2 / +1 / 0)', () => {
    expect(scoreWithCook('favourites_rotation', 20)).toBe(2);
    expect(scoreWithCook(null, 20)).toBe(1);
    expect(scoreWithCook('variety', 20)).toBe(0);
  });

  it('adds nothing when ratingMap is undefined', () => {
    const origRandom = Math.random;
    Math.random = () => 0;
    const baseline = callScore(makeRecipe(['chicken']));
    const noMap = callScore(makeRecipe(['chicken']), undefined, undefined);
    Math.random = origRandom;
    expect(noMap - baseline).toBe(0);
  });
});

// ─── Cook DNA (flavourDna) personalization ──────────────────────────────────
// Soft behavioural nudges from the taste profile (explorer/committed/speed/planner/
// devoted, each 0–100). Each test holds the recipe/profile fixed and only changes the
// DNA score (jitter pinned to 0) so the diff isolates one dimension's contribution.
describe('scoreRecipe — flavourDna (Cook DNA) bonuses', () => {
  const baseProfile = (overrides: Record<string, unknown> = {}) =>
    ({ eating_style: null, cuisine_preferences: [], dietary_goals: [], ingredient_dislikes: [], ...overrides } as any);

  // Build a flavourDna object from a {dimension: score} map
  const dna = (dims: Record<string, number>) =>
    Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, { score: v, note: '' }]));

  function score(recipe: any, profile: any, flavourDna: any): number {
    return scoreRecipe(
      recipe, profile,
      EMPTY_MAP,   // swipeMap
      EMPTY_SET,   // savedExternalIds
      EMPTY_MAP,   // affinityMap
      EMPTY_MAP,   // interactionMap
      EMPTY_SET,   // pantrySet
      undefined,   // leftoversSet
      undefined,   // ratingMap
      undefined,   // savedAtMap
      flavourDna,
    );
  }

  let origRandom: () => number;
  beforeEach(() => { origRandom = Math.random; Math.random = () => 0; });
  afterEach(() => { Math.random = origRandom; });

  it('null flavourDna is a no-op (regression — identical to the pre-DNA signature)', () => {
    const r = makeRecipe(['chicken'], { cuisine: 'Thai' });
    const withNull = score(r, baseProfile(), null);
    const preDna = scoreRecipe(r, baseProfile(), EMPTY_MAP, EMPTY_SET, EMPTY_MAP, EMPTY_MAP, EMPTY_SET);
    expect(withNull).toBe(preDna);
  });

  it('explorer >65 rewards a non-preferred cuisine (+1.5)', () => {
    const r = makeRecipe(['chicken'], { cuisine: 'Thai' });
    const p = baseProfile({ cuisine_preferences: ['Italian'] });
    expect(score(r, p, dna({ explorer: 80 })) - score(r, p, dna({ explorer: 50 }))).toBeCloseTo(1.5);
  });

  it('explorer does not fire for a cuisine the user already prefers', () => {
    const r = makeRecipe(['chicken'], { cuisine: 'Italian' });
    const p = baseProfile({ cuisine_preferences: ['Italian'] });
    expect(score(r, p, dna({ explorer: 80, devoted: 0 })) - score(r, p, dna({ explorer: 50, devoted: 0 }))).toBe(0);
  });

  it('devoted >65 penalizes a non-preferred cuisine (-1.5) and never double-counts the +3 on a preferred one', () => {
    const p = baseProfile({ cuisine_preferences: ['Italian'] });
    const nonPref = makeRecipe(['chicken'], { cuisine: 'Thai' });
    const pref = makeRecipe(['chicken'], { cuisine: 'Italian' });
    // devoted nudges the loyal cook away from an unfamiliar cuisine
    expect(score(nonPref, p, dna({ devoted: 80 })) - score(nonPref, p, dna({ devoted: 50 }))).toBeCloseTo(-1.5);
    // and leaves a preferred cuisine to the base +3 match (no double-count)
    expect(score(pref, p, dna({ devoted: 80 })) - score(pref, p, dna({ devoted: 50 }))).toBe(0);
  });

  it('speed >65 rewards quick recipes (+1) and penalizes slow ones (-1.5)', () => {
    const p = baseProfile();
    const quick = makeRecipe(['chicken'], { prep_time_mins: 10, cook_time_mins: 10 }); // 20m
    const slow = makeRecipe(['chicken'], { prep_time_mins: 30, cook_time_mins: 40 });  // 70m
    expect(score(quick, p, dna({ speed: 80 })) - score(quick, p, dna({ speed: 50 }))).toBeCloseTo(1);
    expect(score(slow, p, dna({ speed: 80 })) - score(slow, p, dna({ speed: 50 }))).toBeCloseTo(-1.5);
  });

  it('planner >65 rewards meal-prep-friendly recipes (+1)', () => {
    const p = baseProfile();
    const r = makeRecipe(['chicken'], { meal_prep_friendly: true });
    expect(score(r, p, dna({ planner: 80 })) - score(r, p, dna({ planner: 50 }))).toBeCloseTo(1);
  });

  it('a missing dimension defaults to neutral — no throw, no effect', () => {
    const r = makeRecipe(['chicken'], { cuisine: 'Thai', meal_prep_friendly: true });
    const p = baseProfile({ cuisine_preferences: ['Italian'] });
    // only explorer supplied; speed/planner/devoted absent → only explorer fires
    expect(score(r, p, dna({ explorer: 80 })) - score(r, p, dna({ explorer: 50 }))).toBeCloseTo(1.5);
  });

  it('all bonuses combined stay small — never dominating the +20 dietary cap', () => {
    const r = makeRecipe(['chicken'], { cuisine: 'Thai', prep_time_mins: 5, cook_time_mins: 10, meal_prep_friendly: true });
    const p = baseProfile({ cuisine_preferences: ['Italian'] });
    const delta = score(r, p, dna({ explorer: 80, speed: 80, planner: 80 }))
                - score(r, p, dna({ explorer: 50, speed: 50, planner: 50 }));
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(4); // 1.5 + 1 + 1 = 3.5
  });
});

// ─── forPlanning flag — Auto Plan must not inherit the deck's "merely shown" exclusion ──
// Regression guard for the I5 audit C1 finding: scoreRecipe hard-returns -999 for any
// recipe in the session sets. For the DECK that's correct (don't re-show a card this
// session). For AUTO PLAN (forPlanning=true) a merely-shown recipe must stay eligible —
// otherwise an engaged user who browsed Discover before tapping "Build my week" gets an
// empty/degraded plan. An ACTIVE left-swipe is a real "no" and stays excluded either way.
describe('scoreRecipe — forPlanning relaxes the session-shown exclusion', () => {
  const SID = 'sb-r1';
  function callPlan(forPlanning: boolean): number {
    return scoreRecipe(
      makeRecipe(['chicken']),
      NO_PROFILE, EMPTY_MAP, EMPTY_SET, EMPTY_MAP, EMPTY_MAP, EMPTY_SET,
      undefined, undefined, undefined, null, forPlanning,
    );
  }

  beforeEach(() => clearSessionState());
  afterEach(() => clearSessionState());

  it('deck mode (default) excludes a recipe merely shown this session (-999)', () => {
    recordSessionSwipe(SID, 'right'); // right swipe → shown, not a reject
    expect(callPlan(false)).toBe(-999);
  });

  it('planning mode keeps a merely-shown recipe eligible (not -999)', () => {
    recordSessionSwipe(SID, 'right');
    expect(callPlan(true)).toBeGreaterThan(-999);
  });

  it('planning mode STILL excludes an active left-swipe this session (-999)', () => {
    recordSessionSwipe(SID, 'left'); // active reject
    expect(callPlan(true)).toBe(-999);
  });

  it('with no session state, planning and deck modes agree (no exclusion)', () => {
    expect(callPlan(false)).toBeGreaterThan(-999);
    expect(callPlan(true)).toBeGreaterThan(-999);
  });
});
