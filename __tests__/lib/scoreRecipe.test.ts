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

function callScore(recipe: any, leftoversSet?: Set<string>): number {
  return scoreRecipe(
    recipe,
    NO_PROFILE,
    EMPTY_MAP,        // swipeMap
    EMPTY_SET,        // savedExternalIds
    EMPTY_MAP,        // affinityMap
    EMPTY_MAP,        // interactionMap
    EMPTY_SET,        // pantrySet
    leftoversSet,
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
