/**
 * Wiring test: the dietary/allergen gate must be enforced by the SURFACES, not just by
 * lib/dietaryRules.ts in isolation. A correct module wired into nothing filters nothing.
 *
 * Each case below is a real leak the 2026-07-28 sweep confirmed against the live catalog,
 * asserted through the actual functions the app calls.
 */

import { filterAndMapDeckRecipes } from '@/lib/deckFilter';
import { violatesCurrentPrefs } from '@/lib/sundayDrop';
import { filterPickerRecipes } from '@/lib/pickerFilters';

const recipe = (title: string, ingredients: string[], over: Record<string, any> = {}) => ({
  id: 'r1', external_id: 'e1', title,
  ingredients: ingredients.map((name) => ({ name, quantity: '1', unit: 'cup' })),
  dietary_tags: [], steps: [], cuisine: 'Test', source_type: 'curated',
  is_public: true, ...over,
});

describe('deck catalog (Discover + Sunday Drop cron share this)', () => {
  it('blocks peanut butter for a nut_free user', () => {
    const rows = [recipe('Nutty Chicken Curry', ['chicken breast', 'peanut butter'])];
    expect(filterAndMapDeckRecipes(rows, ['nut_free'])).toHaveLength(0);
  });

  it('blocks goat cheese for a dairy_free user', () => {
    const rows = [recipe('Warm Goat Cheese Salad', ['goat cheese log', 'mixed greens'])];
    expect(filterAndMapDeckRecipes(rows, ['dairy_free'])).toHaveLength(0);
  });

  it('blocks dairy AND egg for a vegan (vegan is not an alias of vegetarian)', () => {
    const rows = [
      recipe('Cheese Omelette', ['eggs', 'cheddar cheese']),
      recipe('Lentil Soup', ['lentils', 'carrot', 'onion']),
    ];
    const out = filterAndMapDeckRecipes(rows, ['vegan']);
    expect(out.map((r) => r.title)).toEqual(['Lentil Soup']);
  });

  it('blocks gnocchi for a gluten_free user', () => {
    const rows = [recipe('Chicken Gnocchi Soup', ['gnocchi', 'cream'])];
    expect(filterAndMapDeckRecipes(rows, ['gluten_free'])).toHaveLength(0);
  });

  it('applies the dislike list, expanding category chips', () => {
    const rows = [recipe('Shrimp Scampi', ['shrimp', 'garlic', 'butter'])];
    expect(filterAndMapDeckRecipes(rows, [], ['Shellfish'])).toHaveLength(0);
  });

  it('fails CLOSED on a recipe with no ingredient data when restricted', () => {
    const rows = [recipe('Mystery Dish', [])];
    expect(filterAndMapDeckRecipes(rows, ['vegan'])).toHaveLength(0);
    expect(filterAndMapDeckRecipes(rows, [])).toHaveLength(1); // unrestricted user still sees it
  });

  it('does not over-block legitimate food', () => {
    const rows = [
      recipe('Artichoke Salad', ['canned artichoke hearts', 'lemon']),
      recipe('Rice Noodle Bowl', ['rice noodles', 'scallion']),
      recipe('Tofu Stir Fry', ['bean curd', 'soy-free tamari']),
    ];
    expect(filterAndMapDeckRecipes(rows, ['vegetarian'])).toHaveLength(3);
    expect(filterAndMapDeckRecipes([rows[1]], ['gluten_free'])).toHaveLength(1);
  });
});

describe('Sunday Drop hydration re-validation (also used by pantry match)', () => {
  it('rejects a proposal slot that violates a NEWLY declared allergy', () => {
    const r = recipe('Pesto Pasta', ['basil pesto', 'penne']) as any;
    expect(violatesCurrentPrefs(r, ['nut_free'], [])).toBe(true);
  });
  it('rejects a slot matching a category dislike chip', () => {
    const r = recipe('Puttanesca', ['anchovy fillets', 'olives']) as any;
    expect(violatesCurrentPrefs(r, [], ['Anchovies'])).toBe(true);
  });
  it('keeps a compliant slot', () => {
    const r = recipe('Chickpea Curry', ['chickpeas', 'coconut milk']) as any;
    expect(violatesCurrentPrefs(r, ['vegan', 'dairy_free'], ['Shellfish'])).toBe(false);
  });
});

describe('Plan picker (previously had NO dietary or dislike filter)', () => {
  const opts = {
    search: '', chips: new Set<never>(), cuisines: [], timeBucket: null, skill: null,
  } as any;

  it('blocks a disliked/allergen ingredient in the picker list', () => {
    const rows = [recipe('Shrimp Tacos', ['shrimp', 'tortilla'])] as any[];
    expect(filterPickerRecipes(rows, { ...opts, ingredientDislikes: ['Shellfish'] })).toHaveLength(0);
  });

  it('blocks meat for a vegetarian browsing the picker', () => {
    const rows = [recipe('Beef Chili', ['ground beef', 'beans'])] as any[];
    expect(filterPickerRecipes(rows, { ...opts, dietaryGoals: ['vegetarian'] })).toHaveLength(0);
  });

  it('is a no-op when the user declared nothing (unchanged behaviour)', () => {
    const rows = [recipe('Beef Chili', ['ground beef', 'beans'])] as any[];
    expect(filterPickerRecipes(rows, opts)).toHaveLength(1);
  });
});
