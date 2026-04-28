/**
 * Tests for the heuristic dietary tag classifier used post-submission to
 * bucket community recipes into the right Discover decks.
 *
 * Two contracts:
 * 1. False positives must not occur — chicken-containing recipe must never
 *    be tagged 'vegetarian' or 'vegan'.
 * 2. Common clean recipes get the obvious tags so dietary filters work.
 */

import { inferDietaryTags } from '@/lib/dietaryClassifier';

const ing = (name: string) => ({ name, quantity: '1', unit: 'cup' });

describe('inferDietaryTags — meat detection (false-positive guards)', () => {
  it('does NOT tag chicken recipe as vegetarian or vegan', () => {
    const tags = inferDietaryTags('Chicken Tikka Masala', [
      ing('chicken breast'),
      ing('yogurt'),
      ing('garam masala'),
    ]);
    expect(tags).not.toContain('vegetarian');
    expect(tags).not.toContain('vegan');
    expect(tags).not.toContain('pescatarian');
  });

  it('does NOT tag bacon recipe as vegetarian even when title is clean', () => {
    const tags = inferDietaryTags('Pasta Carbonara', [
      ing('bacon'),
      ing('eggs'),
      ing('parmesan'),
    ]);
    expect(tags).not.toContain('vegetarian');
    expect(tags).not.toContain('vegan');
  });

  it('tags seafood-only recipes as pescatarian, not vegetarian', () => {
    const tags = inferDietaryTags('Grilled Salmon', [
      ing('salmon fillet'),
      ing('lemon'),
      ing('olive oil'),
    ]);
    expect(tags).toContain('pescatarian');
    expect(tags).not.toContain('vegetarian');
    expect(tags).not.toContain('vegan');
  });
});

describe('inferDietaryTags — vegetarian + vegan', () => {
  it('tags clean plant + dairy recipe as vegetarian (not vegan)', () => {
    const tags = inferDietaryTags('Caprese Salad', [
      ing('tomato'),
      ing('mozzarella'),
      ing('basil'),
    ]);
    expect(tags).toContain('vegetarian');
    expect(tags).not.toContain('vegan');
  });

  it('tags fully plant-based recipe as both vegetarian and vegan', () => {
    const tags = inferDietaryTags('Lentil Soup', [
      ing('lentils'),
      ing('carrot'),
      ing('onion'),
    ]);
    expect(tags).toContain('vegetarian');
    expect(tags).toContain('vegan');
  });

  it('does NOT tag honey-containing recipe as vegan', () => {
    const tags = inferDietaryTags('Honey Glazed Carrots', [
      ing('carrot'),
      ing('honey'),
    ]);
    expect(tags).toContain('vegetarian');
    expect(tags).not.toContain('vegan');
  });
});

describe('inferDietaryTags — gluten / dairy', () => {
  it('omits gluten_free when flour or pasta is present', () => {
    const tags = inferDietaryTags('Pasta Marinara', [
      ing('pasta'),
      ing('tomato sauce'),
    ]);
    expect(tags).not.toContain('gluten_free');
  });

  it('tags rice-based recipe as gluten_free', () => {
    const tags = inferDietaryTags('Coconut Rice Bowl', [
      ing('rice'),
      ing('coconut milk'),
      ing('lime'),
    ]);
    expect(tags).toContain('gluten_free');
  });

  it('omits dairy_free when cheese is present', () => {
    const tags = inferDietaryTags('Mac and Cheese', [
      ing('macaroni'),
      ing('cheddar cheese'),
      ing('milk'),
    ]);
    expect(tags).not.toContain('dairy_free');
  });
});

describe('inferDietaryTags — high_protein / low_carb / keto', () => {
  it('tags meat-forward recipe as high_protein', () => {
    const tags = inferDietaryTags('Steak Au Poivre', [
      ing('beef steak'),
      ing('peppercorn'),
      ing('butter'),
    ]);
    expect(tags).toContain('high_protein');
  });

  it('does NOT tag rice + meat recipe as keto', () => {
    const tags = inferDietaryTags('Chicken Fried Rice', [
      ing('chicken'),
      ing('rice'),
      ing('soy sauce'),
    ]);
    expect(tags).not.toContain('low_carb');
    expect(tags).not.toContain('keto');
  });

  it('tags steak + butter as low_carb and keto', () => {
    const tags = inferDietaryTags('Butter Steak', [
      ing('beef steak'),
      ing('butter'),
      ing('garlic'),
    ]);
    expect(tags).toContain('low_carb');
    expect(tags).toContain('keto');
  });

  it('does NOT tag plant-only no-protein recipe as low_carb', () => {
    const tags = inferDietaryTags('Cucumber Salad', [
      ing('cucumber'),
      ing('vinegar'),
    ]);
    expect(tags).not.toContain('low_carb');
    expect(tags).not.toContain('keto');
  });
});

describe('inferDietaryTags — output shape', () => {
  it('returns an array of unique tags', () => {
    const tags = inferDietaryTags('Test', [ing('rice')]);
    expect(Array.isArray(tags)).toBe(true);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('handles empty ingredients without throwing', () => {
    expect(() => inferDietaryTags('Mystery Dish', [])).not.toThrow();
  });
});
