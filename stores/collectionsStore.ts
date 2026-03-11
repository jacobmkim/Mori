import { create } from 'zustand';

export const FAVORITES_ID = 'favorites';

export interface RecipeCollection {
  id: string;
  name: string;
  recipeIds: string[];
  isSystem?: boolean; // system collections (Favorites) cannot be deleted
}

interface CollectionsStore {
  collections: RecipeCollection[];
  addToCollection: (collectionId: string, recipeId: string) => void;
  removeFromCollection: (collectionId: string, recipeId: string) => void;
  createCollection: (name: string) => string; // returns new id
  renameCollection: (id: string, newName: string) => void;
  deleteCollection: (id: string) => void;
  isInCollection: (collectionId: string, recipeId: string) => boolean;
}

export const useCollectionsStore = create<CollectionsStore>((set, get) => ({
  collections: [
    { id: FAVORITES_ID, name: 'Favorites', recipeIds: [], isSystem: true },
  ],

  addToCollection: (collectionId, recipeId) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId && !c.recipeIds.includes(recipeId)
          ? { ...c, recipeIds: [...c.recipeIds, recipeId] }
          : c
      ),
    })),

  removeFromCollection: (collectionId, recipeId) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? { ...c, recipeIds: c.recipeIds.filter((id) => id !== recipeId) }
          : c
      ),
    })),

  createCollection: (name) => {
    const id = `col_${Date.now()}`;
    set((state) => ({
      collections: [...state.collections, { id, name, recipeIds: [] }],
    }));
    return id;
  },

  renameCollection: (id, newName) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, name: newName } : c
      ),
    })),

  deleteCollection: (id) =>
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id || !!c.isSystem),
    })),

  isInCollection: (collectionId, recipeId) => {
    const col = get().collections.find((c) => c.id === collectionId);
    return col?.recipeIds.includes(recipeId) ?? false;
  },
}));
