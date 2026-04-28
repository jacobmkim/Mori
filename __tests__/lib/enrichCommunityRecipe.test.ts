/**
 * Tests for enrichCommunityRecipe — the fire-and-forget post-insert enrichment
 * that infers dietary tags and kicks off macro computation.
 *
 * Key invariants:
 *  - Calls inferDietaryTags and persists the result to the DB.
 *  - Calls /api/macros with the correct payload + auth token.
 *  - NEVER throws — both try/catch blocks swallow failures.
 *  - Skips the macro fetch when EXPO_PUBLIC_API_URL is missing or session is absent.
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

// Mock the classifier so this test doesn't depend on keyword lists.
jest.mock('@/lib/dietaryClassifier', () => ({
  inferDietaryTags: jest.fn().mockReturnValue(['vegan', 'gluten_free']),
}));

import { enrichCommunityRecipe } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { inferDietaryTags } from '@/lib/dietaryClassifier';

const mockFrom = supabase.from as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockInferTags = inferDietaryTags as jest.Mock;

const RECIPE_ID = 'recipe-uuid-123';
const PAYLOAD = {
  title: 'Vegan Tacos',
  ingredients: [
    { name: 'black beans', quantity: '1', unit: 'cup' },
    { name: 'corn tortillas', quantity: '4', unit: '' },
  ],
};

// Builds a fully chainable supabase node that resolves with a given error.
function makeChainNode(error: unknown = null) {
  const result = { data: null, error };
  const node: any = {};
  ['update', 'eq', 'select', 'single', 'insert'].forEach((m) => {
    node[m] = jest.fn(() => node);
  });
  node.then = (r: any, j?: any) => Promise.resolve(result).then(r, j);
  node.catch = (fn: any) => Promise.resolve(result).catch(fn);
  node.finally = (fn: any) => Promise.resolve(result).finally(fn);
  return node;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_API_URL = 'https://test.vercel.app';
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } });
  mockFrom.mockReturnValue(makeChainNode());
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_API_URL;
  jest.restoreAllMocks();
});

// ─── Dietary tag enrichment ───────────────────────────────────────────────────

describe('enrichCommunityRecipe — dietary tag enrichment', () => {
  it('calls inferDietaryTags with the recipe title and ingredients', async () => {
    await enrichCommunityRecipe(RECIPE_ID, PAYLOAD);
    expect(mockInferTags).toHaveBeenCalledWith(PAYLOAD.title, PAYLOAD.ingredients);
  });

  it('updates dietary_tags in the DB with inferred tags', async () => {
    const node = makeChainNode();
    mockFrom.mockReturnValue(node);

    await enrichCommunityRecipe(RECIPE_ID, PAYLOAD);

    expect(node.update).toHaveBeenCalledWith({ dietary_tags: ['vegan', 'gluten_free'] });
    expect(node.eq).toHaveBeenCalledWith('id', RECIPE_ID);
  });

  it('does not throw when supabase update returns an error', async () => {
    mockFrom.mockReturnValue(makeChainNode(new Error('DB unreachable')));
    await expect(enrichCommunityRecipe(RECIPE_ID, PAYLOAD)).resolves.toBeUndefined();
  });

  it('does not throw when inferDietaryTags throws', async () => {
    mockInferTags.mockImplementationOnce(() => { throw new Error('classifier crash'); });
    await expect(enrichCommunityRecipe(RECIPE_ID, PAYLOAD)).resolves.toBeUndefined();
  });
});

// ─── Macro fetch ─────────────────────────────────────────────────────────────

describe('enrichCommunityRecipe — macro fetch', () => {
  it('calls /api/macros with the correct endpoint and body', async () => {
    await enrichCommunityRecipe(RECIPE_ID, PAYLOAD);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://test.vercel.app/api/macros',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          supabaseId: RECIPE_ID,
          recipeTitle: PAYLOAD.title,
          ingredients: PAYLOAD.ingredients,
        }),
      })
    );
  });

  it('includes the Bearer token in the Authorization header', async () => {
    await enrichCommunityRecipe(RECIPE_ID, PAYLOAD);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok-abc');
  });

  it('does not throw when the fetch request fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network timeout'));
    await expect(enrichCommunityRecipe(RECIPE_ID, PAYLOAD)).resolves.toBeUndefined();
  });

  it('skips macro fetch when EXPO_PUBLIC_API_URL is not set', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    await enrichCommunityRecipe(RECIPE_ID, PAYLOAD);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips macro fetch when auth session is null', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    await enrichCommunityRecipe(RECIPE_ID, PAYLOAD);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips macro fetch when getSession throws', async () => {
    mockGetSession.mockRejectedValueOnce(new Error('auth service down'));
    await enrichCommunityRecipe(RECIPE_ID, PAYLOAD);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
