/**
 * savedStore persistence — regression guard for the partialize fix.
 *
 * Before this fix, only `mealPrepIds` was persisted. If `loadSavedRecipes()`
 * was slow or failed at cold start, `isSaved()` returned false and the user
 * could re-save the same recipe, producing a duplicate optimistic insert and
 * a duplicate Supabase upsert. Optimistic offline saves were also lost on
 * relaunch. The fix adds `savedRecipes` and `_removedPositions` to partialize.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/api', () => ({
  upsertRecipeByExternalId: jest.fn(),
  saveRecipe: jest.fn(),
  unsaveRecipe: jest.fn(),
  getSavedRecipesWithDetails: jest.fn(),
}));

import { useSavedStore } from '@/stores/savedStore';
import { getSavedRecipesWithDetails } from '@/lib/api';

const STORAGE_KEY = 'mori-saved-store';

const makeRecipe = (id: string, title?: string) =>
  ({
    id,
    title: title ?? `Recipe ${id}`,
    supabase_id: `s-${id}`,
    external_id: id,
    ingredients: [],
    steps: [],
    dietary_tags: [],
    image_url: null,
    macros: null,
  } as any);

beforeEach(async () => {
  await AsyncStorage.clear();
  useSavedStore.setState({ savedRecipes: [], mealPrepIds: [], _removedPositions: {} });
  jest.clearAllMocks();
});

describe('savedStore — partialize writes all needed fields', () => {
  it('persists savedRecipes, mealPrepIds, and _removedPositions to AsyncStorage', async () => {
    useSavedStore.setState({
      savedRecipes: [makeRecipe('r1')],
      mealPrepIds: ['r1'],
      _removedPositions: { 'r-old': 4 },
    });
    // Allow the persist middleware's debounced write to flush.
    await new Promise((r) => setTimeout(r, 20));

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.savedRecipes).toHaveLength(1);
    expect(parsed.state.savedRecipes[0].id).toBe('r1');
    expect(parsed.state.mealPrepIds).toEqual(['r1']);
    expect(parsed.state._removedPositions).toEqual({ 'r-old': 4 });
  });
});

describe('savedStore — hydrates savedRecipes from AsyncStorage', () => {
  it('isSaved() answers correctly after rehydration without calling Supabase', async () => {
    const seedState = {
      state: {
        savedRecipes: [makeRecipe('r1', 'Hydrated 1'), makeRecipe('r2', 'Hydrated 2')],
        mealPrepIds: ['r2'],
        _removedPositions: {},
      },
      version: 0,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seedState));

    // Trigger the persist middleware to re-read storage.
    await (useSavedStore as any).persist.rehydrate();

    const state = useSavedStore.getState();
    expect(state.savedRecipes.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(state.mealPrepIds).toEqual(['r2']);
    expect(state.isSaved('r1')).toBe(true);
    expect(state.isSaved('r2')).toBe(true);
    expect(state.isSaved('not-saved')).toBe(false);

    // The whole point of the fix: hydrated state answers isSaved() WITHOUT a
    // network call. If the user is offline at cold start, isSaved must still
    // return true so they don't double-save.
    expect(getSavedRecipesWithDetails).not.toHaveBeenCalled();
  });

  it('restores _removedPositions so re-saves land in original slot after restart', async () => {
    const seedState = {
      state: {
        savedRecipes: [makeRecipe('r1')],
        mealPrepIds: [],
        _removedPositions: { 'r-removed': 7 },
      },
      version: 0,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seedState));

    await (useSavedStore as any).persist.rehydrate();

    expect((useSavedStore.getState() as any)._removedPositions).toEqual({ 'r-removed': 7 });
  });
});
