/**
 * Tests for the content-flagging API:
 *   flagRecipe  → recipe_flags
 *   flagReview  → review_flags
 *
 * Both require a signed-in user, dedupe a repeat report (unique-violation 23505
 * resolves as success), and surface any other DB error.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
}));

import { flagRecipe, flagReview } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;
const mockGetUser = supabase.auth.getUser as jest.Mock;

function setupInsert(error: unknown = null) {
  const insert = jest.fn().mockResolvedValue({ error });
  mockFrom.mockReturnValue({ insert });
  return insert;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

// ─── flagRecipe ───────────────────────────────────────────────────────────────

describe('flagRecipe', () => {
  it('inserts into recipe_flags with the recipe + reason + flagger', async () => {
    const insert = setupInsert();
    await flagRecipe({ supabase_id: 'sb-1', id: 'ext-1', title: 'Tacos' }, 'Spam or fake recipe');
    expect(mockFrom).toHaveBeenCalledWith('recipe_flags');
    expect(insert.mock.calls[0][0]).toMatchObject({
      recipe_id: 'sb-1',
      external_id: 'ext-1',
      recipe_title: 'Tacos',
      reason: 'Spam or fake recipe',
      flagged_by: 'user-1',
    });
  });

  it('stores recipe_id as null for recipes without a supabase id', async () => {
    const insert = setupInsert();
    await flagRecipe({ id: 'ext-only', title: 'External' }, 'Other');
    expect(insert.mock.calls[0][0].recipe_id).toBeNull();
  });

  it('treats a duplicate flag (23505) as success', async () => {
    setupInsert({ code: '23505', message: 'duplicate key' });
    await expect(flagRecipe({ supabase_id: 'sb-1', id: 'e', title: 'T' }, 'Other')).resolves.toBeUndefined();
  });

  it('throws on a non-duplicate DB error', async () => {
    setupInsert({ code: '42501', message: 'rls denied' });
    await expect(flagRecipe({ supabase_id: 'sb-1', id: 'e', title: 'T' }, 'Other')).rejects.toMatchObject({ code: '42501' });
  });

  it('throws and does not insert when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const insert = setupInsert();
    await expect(flagRecipe({ supabase_id: 'sb-1', id: 'e', title: 'T' }, 'Other')).rejects.toThrow('Not signed in');
    expect(insert).not.toHaveBeenCalled();
  });
});

// ─── flagReview ───────────────────────────────────────────────────────────────

describe('flagReview', () => {
  it('inserts into review_flags with the review + recipe context + reason', async () => {
    const insert = setupInsert();
    await flagReview('rev-1', 'recipe-9', 'Inappropriate or offensive');
    expect(mockFrom).toHaveBeenCalledWith('review_flags');
    expect(insert.mock.calls[0][0]).toMatchObject({
      review_id: 'rev-1',
      recipe_id: 'recipe-9',
      reason: 'Inappropriate or offensive',
      flagged_by: 'user-1',
    });
  });

  it('allows a null recipe context', async () => {
    const insert = setupInsert();
    await flagReview('rev-1', null, 'Harassment');
    expect(insert.mock.calls[0][0].recipe_id).toBeNull();
  });

  it('treats a duplicate flag (23505) as success', async () => {
    setupInsert({ code: '23505', message: 'duplicate key' });
    await expect(flagReview('rev-1', 'recipe-9', 'Other')).resolves.toBeUndefined();
  });

  it('throws on a non-duplicate DB error', async () => {
    setupInsert({ code: '42501', message: 'rls denied' });
    await expect(flagReview('rev-1', 'recipe-9', 'Other')).rejects.toMatchObject({ code: '42501' });
  });

  it('throws and does not insert when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const insert = setupInsert();
    await expect(flagReview('rev-1', 'recipe-9', 'Other')).rejects.toThrow('Not signed in');
    expect(insert).not.toHaveBeenCalled();
  });
});
