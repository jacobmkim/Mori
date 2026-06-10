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

import { scoreRecipe } from '@/lib/api';

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
