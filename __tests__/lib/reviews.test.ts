/**
 * Tests for the recipe review API layer:
 *   fetchRecipeReviews, getUserReviewForRecipe, hasUserCookedRecipe,
 *   submitReview, updateReview, deleteReview, fetchCreatorStats, getUserRatings
 *
 * All Supabase calls are mocked. Tests verify:
 *   - Correct payloads sent to DB
 *   - Correct mapping of raw DB rows → typed Review / CreatorStats
 *   - Edge cases: nulls, empty results, DB errors
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

import {
  fetchRecipeReviews,
  fetchRecipeCookPhotos,
  getUserReviewForRecipe,
  hasUserCookedRecipe,
  submitReview,
  updateReview,
  deleteReview,
  fetchCreatorStats,
  getUserRatings,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

// ── Chain helper ──────────────────────────────────────────────────────────────
// Builds a thenable Supabase query chain so both `await chain` and
// `chain.single()` / `chain.maybeSingle()` work correctly.
function makeChain(data: unknown = null, count: number | null = null, error: unknown = null) {
  const result = { data, count, error };
  const promise = Promise.resolve(result);
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  return chain;
}

// Raw DB row shape returned by Supabase (with reviewer join)
function makeRawReview(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rev-1',
    recipe_id: 'recipe-1',
    user_id: 'user-1',
    rating: 4,
    review_text: 'Great recipe!',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    reviewer: { name: 'Alice', username: 'alice99', avatar_url: 'https://cdn.example.com/alice.jpg' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── fetchRecipeReviews ───────────────────────────────────────────────────────

describe('fetchRecipeReviews', () => {
  it('returns mapped reviews with reviewer fields flattened', async () => {
    mockFrom.mockReturnValue(makeChain([makeRawReview()]));
    const reviews = await fetchRecipeReviews('recipe-1');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      id: 'rev-1',
      rating: 4,
      review_text: 'Great recipe!',
      reviewer_name: 'Alice',
      reviewer_username: 'alice99',
      reviewer_avatar: 'https://cdn.example.com/alice.jpg',
    });
  });

  it('returns empty array when no reviews exist', async () => {
    mockFrom.mockReturnValue(makeChain([]));
    const reviews = await fetchRecipeReviews('recipe-99');
    expect(reviews).toEqual([]);
  });

  it('handles null reviewer join gracefully (deleted profile)', async () => {
    mockFrom.mockReturnValue(makeChain([makeRawReview({ reviewer: null })]));
    const reviews = await fetchRecipeReviews('recipe-1');
    expect(reviews[0].reviewer_name).toBeNull();
    expect(reviews[0].reviewer_username).toBeNull();
    expect(reviews[0].reviewer_avatar).toBeNull();
  });

  it('handles null review_text', async () => {
    mockFrom.mockReturnValue(makeChain([makeRawReview({ review_text: null })]));
    const reviews = await fetchRecipeReviews('recipe-1');
    expect(reviews[0].review_text).toBeNull();
  });

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(makeChain(null, null, new Error('DB unavailable')));
    await expect(fetchRecipeReviews('recipe-1')).rejects.toThrow('DB unavailable');
  });
});

// ─── getUserReviewForRecipe ───────────────────────────────────────────────────

describe('getUserReviewForRecipe', () => {
  it('returns mapped review when found', async () => {
    mockFrom.mockReturnValue(makeChain(makeRawReview()));
    const review = await getUserReviewForRecipe('user-1', 'recipe-1');
    expect(review).toMatchObject({ id: 'rev-1', rating: 4, reviewer_name: 'Alice' });
  });

  it('returns null when user has not reviewed the recipe', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const review = await getUserReviewForRecipe('user-1', 'recipe-999');
    expect(review).toBeNull();
  });

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(makeChain(null, null, new Error('Connection error')));
    await expect(getUserReviewForRecipe('user-1', 'recipe-1')).rejects.toThrow('Connection error');
  });
});

// ─── hasUserCookedRecipe ──────────────────────────────────────────────────────

describe('hasUserCookedRecipe', () => {
  it('returns true when a cooked interaction exists', async () => {
    mockFrom.mockReturnValue(makeChain({ id: 'int-1' }));
    const cooked = await hasUserCookedRecipe('user-1', 'recipe-1');
    expect(cooked).toBe(true);
  });

  it('returns false when no cooked interaction found', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const cooked = await hasUserCookedRecipe('user-1', 'recipe-1');
    expect(cooked).toBe(false);
  });
});

// ─── submitReview ─────────────────────────────────────────────────────────────

describe('submitReview', () => {
  let capturedInsertPayload: Record<string, unknown> | null = null;

  function setupInsert(rawReview = makeRawReview(), dbError: unknown = null) {
    capturedInsertPayload = null;
    const chain = makeChain(rawReview, null, dbError);
    chain.insert = jest.fn((payload: Record<string, unknown>) => {
      capturedInsertPayload = payload;
      return chain;
    });
    mockFrom.mockReturnValue(chain);
  }

  it('inserts with correct user_id, recipe_id, rating, and review_text', async () => {
    setupInsert();
    await submitReview('user-1', 'recipe-1', 5, 'Amazing!');
    expect(capturedInsertPayload).toMatchObject({
      user_id: 'user-1',
      recipe_id: 'recipe-1',
      rating: 5,
      review_text: 'Amazing!',
    });
  });

  it('passes null review_text when omitted', async () => {
    setupInsert();
    await submitReview('user-1', 'recipe-1', 3, null);
    expect(capturedInsertPayload).toMatchObject({ review_text: null });
  });

  it('returns the mapped review with reviewer fields', async () => {
    setupInsert(makeRawReview({ rating: 5, review_text: 'Amazing!' }));
    const review = await submitReview('user-1', 'recipe-1', 5, 'Amazing!');
    expect(review).toMatchObject({
      rating: 5,
      review_text: 'Amazing!',
      reviewer_name: 'Alice',
      reviewer_username: 'alice99',
    });
  });

  it('throws on duplicate review (unique constraint)', async () => {
    setupInsert(null as any, { code: '23505', message: 'duplicate key' });
    await expect(submitReview('user-1', 'recipe-1', 4, null)).rejects.toMatchObject({ code: '23505' });
  });

  it('throws when user has not cooked the recipe (RLS violation)', async () => {
    setupInsert(null as any, { code: '42501', message: 'review_insert policy denied' });
    await expect(submitReview('user-1', 'recipe-1', 4, null)).rejects.toMatchObject({ code: '42501' });
  });
});

// ─── updateReview ─────────────────────────────────────────────────────────────

describe('updateReview', () => {
  let capturedUpdatePayload: Record<string, unknown> | null = null;

  function setupUpdate(rawReview = makeRawReview(), dbError: unknown = null) {
    capturedUpdatePayload = null;
    const chain = makeChain(rawReview, null, dbError);
    chain.update = jest.fn((payload: Record<string, unknown>) => {
      capturedUpdatePayload = payload;
      return chain;
    });
    mockFrom.mockReturnValue(chain);
  }

  it('updates rating and review_text', async () => {
    setupUpdate();
    await updateReview('rev-1', 3, 'Pretty good');
    expect(capturedUpdatePayload).toMatchObject({ rating: 3, review_text: 'Pretty good' });
  });

  it('includes updated_at in the update payload', async () => {
    setupUpdate();
    await updateReview('rev-1', 3, null);
    expect(capturedUpdatePayload).toHaveProperty('updated_at');
  });

  it('returns the updated mapped review', async () => {
    setupUpdate(makeRawReview({ rating: 2, review_text: 'Not great' }));
    const review = await updateReview('rev-1', 2, 'Not great');
    expect(review.rating).toBe(2);
    expect(review.review_text).toBe('Not great');
  });

  it('throws on error', async () => {
    setupUpdate(null as any, new Error('Row not found'));
    await expect(updateReview('rev-99', 4, null)).rejects.toThrow('Row not found');
  });
});

// ─── deleteReview ─────────────────────────────────────────────────────────────

describe('deleteReview', () => {
  it('calls delete with the review id', async () => {
    const chain = makeChain(null, null, null);
    const eqSpy = jest.fn().mockReturnValue(chain);
    chain.delete = jest.fn().mockReturnValue({ eq: eqSpy });
    mockFrom.mockReturnValue(chain);
    await deleteReview('rev-abc');
    expect(eqSpy).toHaveBeenCalledWith('id', 'rev-abc');
  });

  it('throws when Supabase returns an error', async () => {
    const chain = makeChain(null, null, new Error('Not found'));
    mockFrom.mockReturnValue(chain);
    await expect(deleteReview('rev-missing')).rejects.toThrow('Not found');
  });
});

// ─── fetchCreatorStats ────────────────────────────────────────────────────────

describe('fetchCreatorStats', () => {
  function setupStats({
    swipes = [{ direction: 'right' }, { direction: 'left' }, { direction: 'right' }],
    savesCount = 7,
    interactions = [
      { interaction_type: 'cooked' },
      { interaction_type: 'view' },
      { interaction_type: 'view' },
    ],
    recipeData = { avg_rating: 4.5, rating_count: 12 },
  } = {}) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'swipe_events') return makeChain(swipes);
      if (table === 'saved_recipes') return makeChain(null, savesCount);
      if (table === 'recipe_interactions') return makeChain(interactions);
      if (table === 'recipes') return makeChain(recipeData);
      return makeChain(null);
    });
  }

  it('counts right and left swipes separately', async () => {
    setupStats();
    const stats = await fetchCreatorStats('recipe-1');
    expect(stats.right_swipes).toBe(2);
    expect(stats.left_swipes).toBe(1);
  });

  it('returns saves count', async () => {
    setupStats({ savesCount: 7 });
    const stats = await fetchCreatorStats('recipe-1');
    expect(stats.saves).toBe(7);
  });

  it('counts cooks and views from interactions', async () => {
    setupStats();
    const stats = await fetchCreatorStats('recipe-1');
    expect(stats.cooks).toBe(1);
    expect(stats.views).toBe(2);
  });

  it('returns avg_rating and rating_count from recipes table', async () => {
    setupStats({ recipeData: { avg_rating: 4.5, rating_count: 12 } });
    const stats = await fetchCreatorStats('recipe-1');
    expect(stats.avg_rating).toBe(4.5);
    expect(stats.rating_count).toBe(12);
  });

  it('returns all zeros for a recipe with no activity', async () => {
    setupStats({
      swipes: [],
      savesCount: 0,
      interactions: [],
      recipeData: { avg_rating: 0, rating_count: 0 },
    });
    const stats = await fetchCreatorStats('recipe-1');
    expect(stats).toEqual({
      right_swipes: 0, left_swipes: 0,
      saves: 0, cooks: 0, views: 0,
      avg_rating: 0, rating_count: 0,
    });
  });

  it('coerces avg_rating to a number', async () => {
    setupStats({ recipeData: { avg_rating: '4.3' as unknown as number, rating_count: 5 } });
    const stats = await fetchCreatorStats('recipe-1');
    expect(typeof stats.avg_rating).toBe('number');
    expect(stats.avg_rating).toBeCloseTo(4.3);
  });
});

// ─── cook photos (photo_url) ──────────────────────────────────────────────────

describe('cook photo support', () => {
  it('fetchRecipeReviews maps photo_url when present', async () => {
    mockFrom.mockReturnValue(makeChain([makeRawReview({ photo_url: 'https://cdn.example.com/dish.jpg' })]));
    const reviews = await fetchRecipeReviews('recipe-1');
    expect(reviews[0].photo_url).toBe('https://cdn.example.com/dish.jpg');
  });

  it('fetchRecipeReviews defaults photo_url to null when absent', async () => {
    mockFrom.mockReturnValue(makeChain([makeRawReview()]));
    const reviews = await fetchRecipeReviews('recipe-1');
    expect(reviews[0].photo_url).toBeNull();
  });

  it('getUserReviewForRecipe maps photo_url', async () => {
    mockFrom.mockReturnValue(makeChain(makeRawReview({ photo_url: 'https://cdn.example.com/dish.jpg' })));
    const review = await getUserReviewForRecipe('user-1', 'recipe-1');
    expect(review?.photo_url).toBe('https://cdn.example.com/dish.jpg');
  });

  it('submitReview writes photo_url when provided and maps it back', async () => {
    let payload: Record<string, unknown> | null = null;
    const chain = makeChain(makeRawReview({ photo_url: 'https://cdn.example.com/dish.jpg' }));
    chain.insert = jest.fn((p: Record<string, unknown>) => { payload = p; return chain; });
    mockFrom.mockReturnValue(chain);
    const review = await submitReview('user-1', 'recipe-1', 5, 'Yum', 'https://cdn.example.com/dish.jpg');
    expect(payload).toMatchObject({ photo_url: 'https://cdn.example.com/dish.jpg' });
    expect(review.photo_url).toBe('https://cdn.example.com/dish.jpg');
  });

  it('submitReview defaults photo_url to null when omitted', async () => {
    let payload: Record<string, unknown> | null = null;
    const chain = makeChain(makeRawReview());
    chain.insert = jest.fn((p: Record<string, unknown>) => { payload = p; return chain; });
    mockFrom.mockReturnValue(chain);
    await submitReview('user-1', 'recipe-1', 4, null);
    expect(payload).toMatchObject({ photo_url: null });
  });

  it('updateReview includes photo_url in the payload only when explicitly passed', async () => {
    let payload: Record<string, unknown> | null = null;
    const chain = makeChain(makeRawReview());
    chain.update = jest.fn((p: Record<string, unknown>) => { payload = p; return chain; });
    mockFrom.mockReturnValue(chain);

    // text-only edit (photoUrl omitted) → no photo_url key, leaves existing photo intact
    await updateReview('rev-1', 3, 'edit');
    expect(payload).not.toHaveProperty('photo_url');

    // set a new photo
    await updateReview('rev-1', 3, 'edit', 'https://cdn.example.com/new.jpg');
    expect(payload).toMatchObject({ photo_url: 'https://cdn.example.com/new.jpg' });

    // clear the photo
    await updateReview('rev-1', 3, 'edit', null);
    expect(payload).toHaveProperty('photo_url', null);
  });
});

// ─── fetchRecipeCookPhotos ────────────────────────────────────────────────────

describe('fetchRecipeCookPhotos', () => {
  it('maps id, photo_url and reviewer fields', async () => {
    mockFrom.mockReturnValue(makeChain([
      { id: 'rev-1', photo_url: 'https://cdn.example.com/a.jpg', reviewer: { name: 'Alice', username: 'alice99' } },
      { id: 'rev-2', photo_url: 'https://cdn.example.com/b.jpg', reviewer: null },
    ]));
    const photos = await fetchRecipeCookPhotos('recipe-1');
    expect(photos).toHaveLength(2);
    expect(photos[0]).toEqual({
      id: 'rev-1',
      photo_url: 'https://cdn.example.com/a.jpg',
      reviewer_name: 'Alice',
      reviewer_username: 'alice99',
    });
    expect(photos[1].reviewer_name).toBeNull();
    expect(photos[1].reviewer_username).toBeNull();
  });

  it('returns an empty array when no cook photos exist', async () => {
    mockFrom.mockReturnValue(makeChain([]));
    const photos = await fetchRecipeCookPhotos('recipe-1');
    expect(photos).toEqual([]);
  });

  it('throws when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(makeChain(null, null, new Error('DB down')));
    await expect(fetchRecipeCookPhotos('recipe-1')).rejects.toThrow('DB down');
  });
});

// ─── getUserRatings ───────────────────────────────────────────────────────────

describe('getUserRatings', () => {
  it('returns a Map of recipe_id → user_rating', async () => {
    mockFrom.mockReturnValue(makeChain([
      { recipe_id: 'r-1', user_rating: 5 },
      { recipe_id: 'r-2', user_rating: 2 },
    ]));
    const map = await getUserRatings('user-1');
    expect(map.get('r-1')).toBe(5);
    expect(map.get('r-2')).toBe(2);
  });

  it('returns an empty Map when the user has rated nothing', async () => {
    mockFrom.mockReturnValue(makeChain([]));
    const map = await getUserRatings('user-1');
    expect(map.size).toBe(0);
  });

  it('returns an empty Map when data is null', async () => {
    mockFrom.mockReturnValue(makeChain(null));
    const map = await getUserRatings('user-1');
    expect(map.size).toBe(0);
  });
});
