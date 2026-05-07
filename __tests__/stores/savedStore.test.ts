import { useSavedStore } from '@/stores/savedStore';
import type { Recipe } from '@/types';

jest.mock('@/lib/api', () => ({
  saveRecipe: jest.fn(),
  unsaveRecipe: jest.fn(),
  getSavedRecipesWithDetails: jest.fn(),
}));

import {
  saveRecipe,
  getSavedRecipesWithDetails,
} from '@/lib/api';

const mockSave = saveRecipe as jest.Mock;
const mockLoad = getSavedRecipesWithDetails as jest.Mock;

const makeRecipe = (id: string, opts: { supabase_id?: string | null } = {}): Recipe =>
  ({
    id,
    title: `Recipe ${id}`,
    supabase_id: opts.supabase_id === null ? undefined : (opts.supabase_id ?? `supabase-${id}`),
    external_id: id,
    ingredients: [],
    steps: [],
    dietary_tags: [],
    image_url: null,
    macros: null,
  }) as unknown as Recipe;

beforeEach(() => {
  useSavedStore.setState({ savedRecipes: [], _removedPositions: {} });
  jest.clearAllMocks();
});

describe('savedStore — addRecipe', () => {
  it('optimistically adds recipe to store', () => {
    const recipe = makeRecipe('r1');
    useSavedStore.getState().addRecipe(recipe);
    expect(useSavedStore.getState().savedRecipes).toContainEqual(recipe);
  });

  it('does not add duplicate if already saved', () => {
    const recipe = makeRecipe('r1');
    useSavedStore.setState({ savedRecipes: [recipe] });
    useSavedStore.getState().addRecipe(recipe);
    expect(useSavedStore.getState().savedRecipes).toHaveLength(1);
  });

  it('does NOT call loadSavedRecipes after persisting (race condition fix)', async () => {
    mockSave.mockResolvedValueOnce(undefined);

    const recipe = makeRecipe('r1');
    useSavedStore.getState().addRecipe(recipe, 'user-1');

    // Let promises resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('calls saveRecipe directly with supabase_id when present (no upsert)', async () => {
    mockSave.mockResolvedValueOnce(undefined);

    const recipe = makeRecipe('r1');
    useSavedStore.getState().addRecipe(recipe, 'user-1');

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSave).toHaveBeenCalledWith('user-1', 'supabase-r1');
  });

  it('skips DB sync when recipe has no supabase_id (still updates local state)', async () => {
    const recipe = makeRecipe('r1', { supabase_id: null });
    useSavedStore.getState().addRecipe(recipe, 'user-1');

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSave).not.toHaveBeenCalled();
    // Local store still updated optimistically.
    expect(useSavedStore.getState().savedRecipes).toContainEqual(recipe);
  });

  it('skips Supabase call when no userId', async () => {
    const recipe = makeRecipe('r1');
    useSavedStore.getState().addRecipe(recipe);

    await new Promise((r) => setTimeout(r, 0));

    expect(mockSave).not.toHaveBeenCalled();
  });
});
