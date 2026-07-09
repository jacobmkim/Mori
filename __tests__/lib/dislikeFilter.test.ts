/**
 * Integration tests for the ingredient dislike hard-filter inside fetchScoredDeck.
 *
 * We mock Supabase at the transport layer so fetchScoredDeck runs its full
 * pipeline.  All auxiliary tables (swipes, pantry, etc.) return empty data;
 * only the 'recipes' table returns our controlled test set.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    rpc:  jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem:     jest.fn().mockResolvedValue(null),
  setItem:     jest.fn().mockResolvedValue(null),
  removeItem:  jest.fn().mockResolvedValue(null),
  multiRemove: jest.fn().mockResolvedValue(null),
}));

import { fetchScoredDeck } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;
const mockRpc  = supabase.rpc  as jest.Mock;

// Creates a fully-chainable supabase query object that resolves with `data`.
// Every filter / modifier method returns the same node so any chaining pattern works.
// `.limit()` and the node itself are both thenable — covers both termination styles.
function makeChain(data: any[] = []) {
  const result = { data, error: null };
  const node: any = {};

  ['select', 'eq', 'neq', 'in', 'not', 'is', 'gte', 'lte', 'gt', 'lt',
   'order', 'ilike', 'contains', 'overlaps', 'limit', 'or'].forEach((m) => {
    node[m] = jest.fn(() => node);
  });

  // .range(from, to) terminates a paginated read (fetchAllCatalogRows) — returns a slice so
  // the short-page check stops after one page for these small test sets (no duplicate pages).
  node.range = jest.fn((from: number, to: number) =>
    Promise.resolve({ data: data.slice(from, to + 1), error: null }));

  // Make the node itself awaitable (for queries that don't call .limit())
  node.then    = (r: any, j?: any) => Promise.resolve(result).then(r, j);
  node.catch   = (fn: any)         => Promise.resolve(result).catch(fn);
  node.finally = (fn: any)         => Promise.resolve(result).finally(fn);

  // Terminal resolutions
  node.maybeSingle = jest.fn(() => Promise.resolve({ data: data[0] ?? null, error: null }));
  node.single      = jest.fn(() => Promise.resolve({ data: data[0] ?? null, error: null }));

  return node;
}

function makeRecipe(id: string, title: string, ingredients: { name: string }[]) {
  return {
    id,
    external_id: id,
    supabase_id: id,
    title,
    ingredients,
    dietary_tags:      [],
    cuisine:           'American',
    badge:             'none',
    avg_rating:        0,
    save_count:        0,
    image_url:         null,
    prep_time_mins:    30,
    cook_time_mins:    20,
    servings:          2,
    cost_per_serving:  null,
    macros:            null,
    steps:             [],
    meal_prep_friendly: null,
    skill_level:       null,
    source_type:       'curated',
    description:       null,
  };
}

// Advance clock past the 30-min deck cache TTL so each test gets a fresh fetch.
let mockNow = 1_700_000_000_000;
const THIRTY_ONE_MINUTES = 31 * 60 * 1_000;

beforeEach(() => {
  mockNow += THIRTY_ONE_MINUTES;
  jest.spyOn(Date, 'now').mockReturnValue(mockNow);
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
  // Default: every table returns empty
  mockFrom.mockImplementation(() => makeChain([]));
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Core dislike filter ──────────────────────────────────────────────────────

describe('fetchScoredDeck — ingredient_dislikes hard filter', () => {
  it('excludes a recipe that contains a disliked ingredient', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'recipes'
        ? makeChain([
            makeRecipe('a', 'Chicken Stir Fry', [{ name: 'chicken breast' }, { name: 'broccoli' }]),
            makeRecipe('b', 'Broccoli Soup',    [{ name: 'broccoli' },       { name: 'onion' }]),
          ])
        : makeChain([])
    );

    const profile = { ingredient_dislikes: ['chicken'] } as any;
    const { deck: result } = await fetchScoredDeck('user-1', [], profile, new Set());

    expect(result.map((r) => r.title)).not.toContain('Chicken Stir Fry');
    expect(result.some((r) => r.title === 'Broccoli Soup')).toBe(true);
  });

  it('filter is case-insensitive', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'recipes'
        ? makeChain([
            makeRecipe('a', 'Tuna Pasta', [{ name: 'TUNA' }, { name: 'pasta' }]),
            makeRecipe('b', 'Pasta Arrabbiata', [{ name: 'pasta' }, { name: 'tomatoes' }]),
          ])
        : makeChain([])
    );

    const profile = { ingredient_dislikes: ['tuna'] } as any;
    const { deck: result } = await fetchScoredDeck('user-1', [], profile, new Set());

    expect(result.map((r) => r.title)).not.toContain('Tuna Pasta');
  });

  it('passes all recipes through when ingredient_dislikes is empty', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'recipes'
        ? makeChain([
            makeRecipe('a', 'Chicken Tikka', [{ name: 'chicken' }]),
            makeRecipe('b', 'Fish Tacos',    [{ name: 'fish' }]),
          ])
        : makeChain([])
    );

    const { deck: result } = await fetchScoredDeck('user-1', [], null, new Set());

    expect(result.length).toBe(2);
  });

  it('passes all recipes through when profile is null', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'recipes'
        ? makeChain([makeRecipe('a', 'Beef Stew', [{ name: 'beef' }])])
        : makeChain([])
    );

    const { deck: result } = await fetchScoredDeck(undefined, [], null, new Set());

    expect(result.length).toBe(1);
  });

  it('excludes a recipe that matches any one of multiple dislikes', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'recipes'
        ? makeChain([
            makeRecipe('a', 'Shrimp Tacos',    [{ name: 'shrimp' }]),
            makeRecipe('b', 'Mushroom Risotto', [{ name: 'mushrooms' }, { name: 'arborio rice' }]),
            makeRecipe('c', 'Tofu Stir Fry',   [{ name: 'tofu' }, { name: 'bok choy' }]),
          ])
        : makeChain([])
    );

    const profile = { ingredient_dislikes: ['shrimp', 'tofu'] } as any;
    const { deck: result } = await fetchScoredDeck('user-1', [], profile, new Set());

    const titles = result.map((r) => r.title);
    expect(titles).not.toContain('Shrimp Tacos');
    expect(titles).not.toContain('Tofu Stir Fry');
    expect(titles).toContain('Mushroom Risotto');
  });

  it('uses substring matching — "salmon" dislike removes "smoked salmon" recipe', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'recipes'
        ? makeChain([
            makeRecipe('a', 'Bagel Platter',  [{ name: 'smoked salmon' }, { name: 'cream cheese' }]),
            makeRecipe('b', 'Avocado Toast',  [{ name: 'avocado' },       { name: 'sourdough' }]),
          ])
        : makeChain([])
    );

    const profile = { ingredient_dislikes: ['salmon'] } as any;
    const { deck: result } = await fetchScoredDeck('user-1', [], profile, new Set());

    expect(result.map((r) => r.title)).not.toContain('Bagel Platter');
    expect(result.some((r) => r.title === 'Avocado Toast')).toBe(true);
  });
});
