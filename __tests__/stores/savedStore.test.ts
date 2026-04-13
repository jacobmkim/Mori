import { useSavedStore } from '@/stores/savedStore';

jest.mock('@/lib/api', () => ({
  upsertRecipeByExternalId: jest.fn(),
  saveRecipe: jest.fn(),
  unsaveRecipe: jest.fn(),
  getSavedRecipesWithDetails: jest.fn(),
}));

import {
  upsertRecipeByExternalId,
  saveRecipe,
  getSavedRecipesWithDetails,
} from '@/lib/api';

const mockUpsert = upsertRecipeByExternalId as jest.Mock;
const mockSave = saveRecipe as jest.Mock;
const mockLoad = getSavedRecipesWithDetails as jest.Mock;

const makeRecipe = (id: string) => ({
  id,
  title: `Recipe ${id}`,
  supabase_id: `supabase-${id}`,
  external_id: id,
  ingredients: [],
  steps: [],
  dietary_tags: [],
  image_url: null,
  macros: null,
});

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
    mockUpsert.mockResolvedValueOnce('supabase-r1');
    mockSave.mockResolvedValueOnce(undefined);

    const recipe = makeRecipe('r1');
    useSavedStore.getState().addRecipe(recipe, 'user-1');

    // Let promises resolve
    await new Promise((r) => setTimeout(r, 0));

    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('persists to Supabase when userId provided', async () => {
    mockUpsert.mockResolvedValueOnce('supabase-r1');
    mockSave.mockResolvedValueOnce(undefined);

    const recipe = makeRecipe('r1');
    useSavedStore.getState().addRecipe(recipe, 'user-1');

    await new Promise((r) => setTimeout(r, 0));

    expect(mockUpsert).toHaveBeenCalledWith(recipe);
    expect(mockSave).toHaveBeenCalledWith('user-1', 'supabase-r1');
  });

  it('skips Supabase call when no userId', async () => {
    const recipe = makeRecipe('r1');
    useSavedStore.getState().addRecipe(recipe);

    await new Promise((r) => setTimeout(r, 0));

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
