/**
 * Sign-out data isolation tests.
 * Verifies that per-user stores are cleared on sign-out so a second user on
 * the same device never sees the previous user's data.
 */

jest.mock('@/lib/api', () => ({
  getLeftovers: jest.fn(),
  addLeftovers: jest.fn(),
  dismissLeftover: jest.fn(),
  extendLeftover: jest.fn(),
  clearDiscoverCache: jest.fn(),
}));

import { useLeftoversStore } from '@/stores/leftoversStore';
import { useGroceryStore } from '@/stores/groceryStore';

// ─── leftoversStore.reset ─────────────────────────────────────────────────────

describe('leftoversStore.reset', () => {
  beforeEach(() => {
    useLeftoversStore.setState({
      leftovers: [
        {
          id: 'left-1',
          user_id: 'user-1',
          ingredient_id: null,
          ingredient_name: 'chicken',
          added_at: new Date().toISOString(),
          storage_method: 'fridge',
          spoils_at: new Date(Date.now() + 86_400_000).toISOString(),
          dismissed_at: null,
          extended_count: 0,
        },
      ],
      loading: true,
      error: 'some error',
    });
  });

  it('clears leftovers array', () => {
    useLeftoversStore.getState().reset();
    expect(useLeftoversStore.getState().leftovers).toHaveLength(0);
  });

  it('resets loading to false', () => {
    useLeftoversStore.getState().reset();
    expect(useLeftoversStore.getState().loading).toBe(false);
  });

  it('clears error', () => {
    useLeftoversStore.getState().reset();
    expect(useLeftoversStore.getState().error).toBeNull();
  });

  it('does nothing if store is already empty', () => {
    useLeftoversStore.setState({ leftovers: [], loading: false, error: null });
    expect(() => useLeftoversStore.getState().reset()).not.toThrow();
    expect(useLeftoversStore.getState().leftovers).toHaveLength(0);
  });
});

// ─── groceryStore.clearAll ────────────────────────────────────────────────────

describe('groceryStore.clearAll', () => {
  beforeEach(() => {
    useGroceryStore.setState({
      list: {
        id: 'list-1',
        name: 'Grocery list',
        createdAt: new Date().toISOString(),
        items: [{ id: 'i1', name: 'apples', quantity: '3', category: 'Produce', checked: false, recipeId: 'r1' }],
      },
      selectedRecipes: ['r1', 'r2'],
      isLoading: false,
      error: null,
    });
  });

  it('clears the grocery list', () => {
    useGroceryStore.getState().clearAll();
    expect(useGroceryStore.getState().list).toBeNull();
  });

  it('clears selectedRecipes', () => {
    useGroceryStore.getState().clearAll();
    expect(useGroceryStore.getState().selectedRecipes).toHaveLength(0);
  });

  it('does nothing if already cleared', () => {
    useGroceryStore.setState({ list: null, selectedRecipes: [] });
    expect(() => useGroceryStore.getState().clearAll()).not.toThrow();
    expect(useGroceryStore.getState().list).toBeNull();
  });
});

// ─── Sign-out isolation contract ─────────────────────────────────────────────

describe('sign-out data isolation', () => {
  it('both stores expose a clear action callable on sign-out', () => {
    // Verify the exact actions that ProfileSheet.handleSignOut now calls exist
    expect(typeof useLeftoversStore.getState().reset).toBe('function');
    expect(typeof useGroceryStore.getState().clearAll).toBe('function');
  });

  it('second user sees empty leftovers after reset', () => {
    // Simulate user-1 data
    useLeftoversStore.setState({
      leftovers: [
        {
          id: 'left-1', user_id: 'user-1', ingredient_id: null,
          ingredient_name: 'salmon', added_at: new Date().toISOString(),
          storage_method: 'fridge', spoils_at: new Date(Date.now() + 86_400_000).toISOString(),
          dismissed_at: null, extended_count: 0,
        },
      ],
      loading: false, error: null,
    });

    // Sign-out sequence
    useLeftoversStore.getState().reset();

    // User-2 logs in — store is clean
    expect(useLeftoversStore.getState().leftovers).toHaveLength(0);
  });

  it('second user sees empty grocery list after clearAll', () => {
    useGroceryStore.setState({
      list: {
        id: 'gl-1', name: 'My list', createdAt: new Date().toISOString(),
        items: [{ id: 'i1', name: 'eggs', quantity: '12', category: 'Dairy', checked: false, recipeId: 'r1' }],
      },
      selectedRecipes: ['r1'],
      isLoading: false, error: null,
    });

    useGroceryStore.getState().clearAll();

    expect(useGroceryStore.getState().list).toBeNull();
    expect(useGroceryStore.getState().selectedRecipes).toHaveLength(0);
  });
});
