import { useCollectionsStore, FAVORITES_ID } from '@/stores/collectionsStore';

beforeEach(() => {
  useCollectionsStore.setState({
    collections: [{ id: FAVORITES_ID, name: 'Favorites', recipeIds: [], isSystem: true }],
  });
});

// ─── initialization ───────────────────────────────────────────────────────────

describe('collectionsStore — initialization', () => {
  it('starts with a single Favorites system collection', () => {
    const { collections } = useCollectionsStore.getState();
    expect(collections).toHaveLength(1);
    expect(collections[0].id).toBe(FAVORITES_ID);
    expect(collections[0].isSystem).toBe(true);
  });
});

// ─── addToCollection ──────────────────────────────────────────────────────────

describe('collectionsStore — addToCollection', () => {
  it('adds a recipe to a collection', () => {
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    const favs = useCollectionsStore.getState().collections.find((c) => c.id === FAVORITES_ID);
    expect(favs?.recipeIds).toContain('r1');
  });

  it('does not add a duplicate recipe', () => {
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    const favs = useCollectionsStore.getState().collections.find((c) => c.id === FAVORITES_ID);
    expect(favs?.recipeIds).toHaveLength(1);
  });

  it('does not affect other collections', () => {
    const id = useCollectionsStore.getState().createCollection('Weeknight');
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    const weeknight = useCollectionsStore.getState().collections.find((c) => c.id === id);
    expect(weeknight?.recipeIds).toHaveLength(0);
  });
});

// ─── removeFromCollection ─────────────────────────────────────────────────────

describe('collectionsStore — removeFromCollection', () => {
  it('removes a recipe from a collection', () => {
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    useCollectionsStore.getState().removeFromCollection(FAVORITES_ID, 'r1');
    const favs = useCollectionsStore.getState().collections.find((c) => c.id === FAVORITES_ID);
    expect(favs?.recipeIds).not.toContain('r1');
  });

  it('does not affect other recipes in the same collection', () => {
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r2');
    useCollectionsStore.getState().removeFromCollection(FAVORITES_ID, 'r1');
    const favs = useCollectionsStore.getState().collections.find((c) => c.id === FAVORITES_ID);
    expect(favs?.recipeIds).toContain('r2');
  });
});

// ─── createCollection ─────────────────────────────────────────────────────────

describe('collectionsStore — createCollection', () => {
  it('creates a new collection and returns its id', () => {
    const id = useCollectionsStore.getState().createCollection('Weeknight Dinners');
    expect(id).toBeTruthy();
    const col = useCollectionsStore.getState().collections.find((c) => c.id === id);
    expect(col).toBeDefined();
    expect(col?.name).toBe('Weeknight Dinners');
    expect(col?.recipeIds).toEqual([]);
  });

  it('does not mark new collections as system', () => {
    const id = useCollectionsStore.getState().createCollection('Test');
    const col = useCollectionsStore.getState().collections.find((c) => c.id === id);
    expect(col?.isSystem).toBeFalsy();
  });

  it('each new collection gets a unique id', () => {
    // createCollection uses Date.now() — mock to guarantee different timestamps
    let tick = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => tick++);
    const id1 = useCollectionsStore.getState().createCollection('A');
    const id2 = useCollectionsStore.getState().createCollection('B');
    jest.restoreAllMocks();
    expect(id1).not.toBe(id2);
  });
});

// ─── renameCollection ─────────────────────────────────────────────────────────

describe('collectionsStore — renameCollection', () => {
  it('renames a user-created collection', () => {
    const id = useCollectionsStore.getState().createCollection('Old Name');
    useCollectionsStore.getState().renameCollection(id, 'New Name');
    const col = useCollectionsStore.getState().collections.find((c) => c.id === id);
    expect(col?.name).toBe('New Name');
  });

  it('can rename the Favorites collection', () => {
    useCollectionsStore.getState().renameCollection(FAVORITES_ID, 'My Faves');
    const favs = useCollectionsStore.getState().collections.find((c) => c.id === FAVORITES_ID);
    expect(favs?.name).toBe('My Faves');
  });
});

// ─── deleteCollection ─────────────────────────────────────────────────────────

describe('collectionsStore — deleteCollection', () => {
  it('deletes a user-created collection', () => {
    const id = useCollectionsStore.getState().createCollection('To Delete');
    useCollectionsStore.getState().deleteCollection(id);
    const col = useCollectionsStore.getState().collections.find((c) => c.id === id);
    expect(col).toBeUndefined();
  });

  it('cannot delete the Favorites system collection', () => {
    useCollectionsStore.getState().deleteCollection(FAVORITES_ID);
    const favs = useCollectionsStore.getState().collections.find((c) => c.id === FAVORITES_ID);
    expect(favs).toBeDefined();
  });

  it('does not affect other collections when deleting one', () => {
    // Use monotonically increasing timestamps so IDs don't collide
    let tick = 2000;
    jest.spyOn(Date, 'now').mockImplementation(() => tick++);
    const keepId = useCollectionsStore.getState().createCollection('Keep Me');
    const delId = useCollectionsStore.getState().createCollection('Delete Me');
    jest.restoreAllMocks();

    useCollectionsStore.getState().deleteCollection(delId);
    const kept = useCollectionsStore.getState().collections.find((c) => c.id === keepId);
    expect(kept).toBeDefined();
  });
});

// ─── isInCollection ───────────────────────────────────────────────────────────

describe('collectionsStore — isInCollection', () => {
  it('returns true when recipe is in collection', () => {
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    expect(useCollectionsStore.getState().isInCollection(FAVORITES_ID, 'r1')).toBe(true);
  });

  it('returns false when recipe is not in collection', () => {
    expect(useCollectionsStore.getState().isInCollection(FAVORITES_ID, 'r99')).toBe(false);
  });

  it('returns false for an unknown collection id', () => {
    expect(useCollectionsStore.getState().isInCollection('nonexistent-col', 'r1')).toBe(false);
  });

  it('returns false after recipe is removed', () => {
    useCollectionsStore.getState().addToCollection(FAVORITES_ID, 'r1');
    useCollectionsStore.getState().removeFromCollection(FAVORITES_ID, 'r1');
    expect(useCollectionsStore.getState().isInCollection(FAVORITES_ID, 'r1')).toBe(false);
  });
});
