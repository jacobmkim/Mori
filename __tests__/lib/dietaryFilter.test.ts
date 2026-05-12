/**
 * Tests for the dietary goal filter inside fetchDiscoverRecipes.
 * We mock Supabase to return controlled recipe rows and assert that only
 * safe recipes pass through for vegetarian, vegan, and pescatarian users.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
}));

import { fetchDiscoverRecipes } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

function makeRow(overrides: Partial<{
  id: string;
  external_id: string;
  title: string;
  ingredients: { name: string; quantity: string; unit: string }[];
  dietary_tags: string[];
}>) {
  return {
    id: overrides.id ?? 'uuid-1',
    external_id: overrides.external_id ?? 'ext-1',
    title: overrides.title ?? 'Test Recipe',
    description: null,
    cuisine: 'Italian',
    source_type: 'curated',
    dietary_tags: overrides.dietary_tags ?? [],
    badge: 'none',
    avg_rating: 0,
    save_count: 0,
    image_url: null,
    prep_time_mins: 30,
    cook_time_mins: 20,
    servings: 2,
    cost_per_serving: null,
    macros: null,
    ingredients: overrides.ingredients ?? [],
    steps: [],
    meal_prep_friendly: null,
    skill_level: null,
  };
}

function setupDB(rows: ReturnType<typeof makeRow>[]) {
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      or: jest.fn().mockReturnValue({
        is: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
    }),
  });
}

// Advance time by more than DECK_CACHE_TTL (30 min) per test so cache always misses.
// Using an incrementing base ensures consecutive tests stay > 30 min apart.
let mockNow = 1_700_000_000_000;
const THIRTY_ONE_MINUTES = 31 * 60 * 1000;

beforeEach(() => {
  mockNow += THIRTY_ONE_MINUTES;
  jest.spyOn(Date, 'now').mockReturnValue(mockNow);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Vegetarian filter ────────────────────────────────────────────────────────

describe('fetchDiscoverRecipes — vegetarian filter', () => {
  it('excludes recipe with meat in title', async () => {
    setupDB([
      makeRow({ id: 'a', title: 'Chicken Tikka Masala' }),
      makeRow({ id: 'b', title: 'Vegetable Curry' }),
    ]);
    const result = await fetchDiscoverRecipes(['vegetarian']);
    expect(result.map((r) => r.title)).toEqual(['Vegetable Curry']);
  });

  it('excludes recipe with meat only in ingredients — the regression case', async () => {
    // "Pasta Carbonara" has bacon in ingredients but NOT in title
    setupDB([
      makeRow({
        id: 'a',
        title: 'Pasta Carbonara',
        ingredients: [
          { name: 'bacon', quantity: '200', unit: 'g' },
          { name: 'eggs', quantity: '3', unit: '' },
          { name: 'parmesan', quantity: '50', unit: 'g' },
        ],
      }),
      makeRow({
        id: 'b',
        title: 'Mushroom Risotto',
        ingredients: [
          { name: 'arborio rice', quantity: '1', unit: 'cup' },
          { name: 'mushrooms', quantity: '200', unit: 'g' },
        ],
      }),
    ]);
    const result = await fetchDiscoverRecipes(['vegetarian']);
    expect(result.map((r) => r.title)).toEqual(['Mushroom Risotto']);
  });

  it('excludes seafood in ingredients for vegan', async () => {
    setupDB([
      makeRow({
        id: 'a',
        title: 'Mediterranean Bowl',
        ingredients: [{ name: 'shrimp', quantity: '200', unit: 'g' }],
      }),
      makeRow({
        id: 'b',
        title: 'Lentil Soup',
        ingredients: [{ name: 'lentils', quantity: '1', unit: 'cup' }],
      }),
    ]);
    const result = await fetchDiscoverRecipes(['vegan']);
    expect(result.map((r) => r.title)).toEqual(['Lentil Soup']);
  });

  it('allows clean vegetarian recipe through', async () => {
    setupDB([
      makeRow({
        id: 'a',
        title: 'Spinach Dal',
        ingredients: [
          { name: 'spinach', quantity: '2', unit: 'cups' },
          { name: 'red lentils', quantity: '1', unit: 'cup' },
          { name: 'garlic', quantity: '3', unit: 'cloves' },
        ],
      }),
    ]);
    const result = await fetchDiscoverRecipes(['vegetarian']);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Spinach Dal');
  });
});

// ─── Pescatarian filter ───────────────────────────────────────────────────────

describe('fetchDiscoverRecipes — pescatarian filter', () => {
  it('excludes recipe with land meat in title', async () => {
    setupDB([
      makeRow({ id: 'a', title: 'Beef Stir Fry' }),
      makeRow({ id: 'b', title: 'Salmon Teriyaki' }),
    ]);
    const result = await fetchDiscoverRecipes(['pescatarian']);
    expect(result.map((r) => r.title)).toEqual(['Salmon Teriyaki']);
  });

  it('excludes recipe with land meat only in ingredients', async () => {
    setupDB([
      makeRow({
        id: 'a',
        title: 'Asian Noodle Bowl',
        ingredients: [
          { name: 'chicken breast', quantity: '200', unit: 'g' },
          { name: 'noodles', quantity: '100', unit: 'g' },
        ],
      }),
      makeRow({
        id: 'b',
        title: 'Prawn Pad Thai',
        ingredients: [
          { name: 'prawn', quantity: '200', unit: 'g' },
          { name: 'rice noodles', quantity: '100', unit: 'g' },
        ],
      }),
    ]);
    const result = await fetchDiscoverRecipes(['pescatarian']);
    expect(result.map((r) => r.title)).toEqual(['Prawn Pad Thai']);
  });

  it('allows seafood through for pescatarian', async () => {
    setupDB([
      makeRow({
        id: 'a',
        title: 'Grilled Salmon',
        ingredients: [{ name: 'salmon fillet', quantity: '200', unit: 'g' }],
      }),
    ]);
    const result = await fetchDiscoverRecipes(['pescatarian']);
    expect(result).toHaveLength(1);
  });

  it('allows vegetarian recipe through for pescatarian', async () => {
    setupDB([
      makeRow({
        id: 'a',
        title: 'Caprese Salad',
        ingredients: [
          { name: 'tomatoes', quantity: '3', unit: '' },
          { name: 'mozzarella', quantity: '150', unit: 'g' },
          { name: 'basil', quantity: '10', unit: 'leaves' },
        ],
      }),
    ]);
    const result = await fetchDiscoverRecipes(['pescatarian']);
    expect(result).toHaveLength(1);
  });
});

// ─── No dietary goals ─────────────────────────────────────────────────────────

describe('fetchDiscoverRecipes — no dietary goals', () => {
  it('passes all non-dessert recipes through when no dietary goals set', async () => {
    setupDB([
      makeRow({ id: 'a', title: 'Chicken Tikka' }),
      makeRow({ id: 'b', title: 'Beef Tacos' }),
      makeRow({ id: 'c', title: 'Mushroom Risotto' }),
    ]);
    const result = await fetchDiscoverRecipes([]);
    expect(result).toHaveLength(3);
  });
});
