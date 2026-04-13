/**
 * groceryStore bug tests
 *
 * test.failing() = documents a KNOWN BUG — these pass while the bug exists
 * and will flip to a failure once the bug is fixed (prompting removal of .failing).
 */
import { useGroceryStore } from '@/stores/groceryStore';

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
  useGroceryStore.setState({ list: null, selectedRecipes: [], isLoading: false, error: null });
});

// ─── addFromDetail ────────────────────────────────────────────────────────────

describe('groceryStore.addFromDetail', () => {
  it('adds ingredients from a single recipe', () => {
    const recipe = makeRecipe('r1');
    useGroceryStore.getState().addFromDetail(recipe, [
      { name: 'flour', measure: '1 cup' },
      { name: 'sugar', measure: '2 tbsp' },
    ]);

    const items = useGroceryStore.getState().list?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items[0].quantity).toBe('1 cup');
  });

  it('does not add a recipe twice', () => {
    const recipe = makeRecipe('r1');
    useGroceryStore.getState().addFromDetail(recipe, [{ name: 'flour', measure: '1 cup' }]);
    useGroceryStore.getState().addFromDetail(recipe, [{ name: 'flour', measure: '1 cup' }]);

    const items = useGroceryStore.getState().list?.items ?? [];
    expect(items).toHaveLength(1);
  });

  it('combines quantities when same ingredient comes from two recipes', () => {
    const r1 = makeRecipe('r1');
    const r2 = makeRecipe('r2');

    useGroceryStore.getState().addFromDetail(r1, [{ name: 'flour', measure: '1 cup' }]);
    useGroceryStore.getState().addFromDetail(r2, [{ name: 'flour', measure: '2 cups' }]);

    const items = useGroceryStore.getState().list?.items ?? [];
    const flour = items.find((i) => i.ingredient_name.toLowerCase() === 'flour');

    expect(flour?.quantity).toBe('1 cup + 2 cups');
    expect(flour?.recipe_ids).toHaveLength(2);
  });

  it('tracks recipe_ids correctly for duplicate ingredients', () => {
    const r1 = makeRecipe('r1');
    const r2 = makeRecipe('r2');

    useGroceryStore.getState().addFromDetail(r1, [{ name: 'flour', measure: '1 cup' }]);
    useGroceryStore.getState().addFromDetail(r2, [{ name: 'flour', measure: '2 cups' }]);

    const flour = useGroceryStore.getState().list?.items.find(
      (i) => i.ingredient_name.toLowerCase() === 'flour'
    );
    // recipe_ids is updated correctly even though quantity isn't
    expect(flour?.recipe_ids).toContain('r1');
    expect(flour?.recipe_ids).toContain('r2');
  });
});

// ─── addRecipeIngredients ─────────────────────────────────────────────────────

describe('groceryStore.addRecipeIngredients', () => {
  const makeRecipeWithIngredients = (id: string, ingredients: { name: string; quantity: string; unit: string }[]) => ({
    ...makeRecipe(id),
    ingredients: ingredients.map((i) => ({ ...i, notes: '' })),
  });

  it('adds ingredients from a recipe with full Ingredient objects', () => {
    const recipe = makeRecipeWithIngredients('r1', [
      { name: 'eggs', quantity: '2', unit: 'large' },
    ]);
    useGroceryStore.getState().addRecipeIngredients(recipe as any);

    const items = useGroceryStore.getState().list?.items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].ingredient_name).toBe('eggs');
  });

  it('combines quantities when same ingredient comes from two recipes', () => {
    const r1 = makeRecipeWithIngredients('r1', [{ name: 'eggs', quantity: '2', unit: 'large' }]);
    const r2 = makeRecipeWithIngredients('r2', [{ name: 'eggs', quantity: '4', unit: 'large' }]);

    useGroceryStore.getState().addRecipeIngredients(r1 as any);
    useGroceryStore.getState().addRecipeIngredients(r2 as any);

    const eggs = useGroceryStore.getState().list?.items.find(
      (i) => i.ingredient_name.toLowerCase() === 'eggs'
    );
    expect(eggs?.quantity).toBe('2 + 4');
    expect(eggs?.recipe_ids).toHaveLength(2);
  });
});
