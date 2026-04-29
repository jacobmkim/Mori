import { scaleMacros, aggregateWeeklyMacros } from '@/lib/macroUtils';
import type { Macros, MealSlot, Recipe } from '@/types';

const baseMacros: Macros = {
  calories: 500,
  protein: 30,
  carbohydrates: 50,
  fat: 20,
  fibre: 8,
  isEstimated: true,
};

function makeRecipe(id: string, macros: Macros | null): Recipe {
  return {
    id,
    title: `Recipe ${id}`,
    description: null,
    cuisine: null,
    source_type: 'curated',
    ingredients: [],
    steps: [],
    prep_time_mins: null,
    cook_time_mins: null,
    servings: null,
    cost_per_serving: null,
    dietary_tags: [],
    macros,
    badge: 'none',
    avg_rating: 0,
    save_count: 0,
    image_url: null,
  };
}

function makeSlot(day: number, recipe_id: string, mult: number = 1): MealSlot {
  return { day, meal_type: 'lunch', recipe_id, servings_multiplier: mult };
}

describe('scaleMacros', () => {
  it('passes through with ratio = 1', () => {
    expect(scaleMacros(baseMacros, 1)).toEqual(baseMacros);
  });

  it('doubles every value at ratio = 2', () => {
    expect(scaleMacros(baseMacros, 2)).toEqual({
      calories: 1000,
      protein: 60,
      carbohydrates: 100,
      fat: 40,
      fibre: 16,
      netCarbs: undefined,
      isEstimated: true,
    });
  });

  it('halves every value at ratio = 0.5', () => {
    expect(scaleMacros(baseMacros, 0.5)).toEqual({
      calories: 250,
      protein: 15,
      carbohydrates: 25,
      fat: 10,
      fibre: 4,
      netCarbs: undefined,
      isEstimated: true,
    });
  });

  it('scales netCarbs when present', () => {
    const m = { ...baseMacros, netCarbs: 42 };
    expect(scaleMacros(m, 2).netCarbs).toBe(84);
  });

  it('leaves netCarbs undefined when absent', () => {
    expect(scaleMacros(baseMacros, 2).netCarbs).toBeUndefined();
  });

  it('preserves the isEstimated flag', () => {
    expect(scaleMacros({ ...baseMacros, isEstimated: false }, 2).isEstimated).toBe(false);
  });

  it('rounds calories to integer and grams to one decimal', () => {
    const odd: Macros = {
      calories: 333.333,
      protein: 11.11,
      carbohydrates: 22.22,
      fat: 7.77,
      fibre: 3.33,
      isEstimated: true,
    };
    const out = scaleMacros(odd, 1);
    expect(out.calories).toBe(333);
    expect(out.protein).toBe(11.1);
    expect(out.carbohydrates).toBe(22.2);
    expect(out.fat).toBe(7.8);
    expect(out.fibre).toBe(3.3);
  });
});

describe('aggregateWeeklyMacros', () => {
  it('returns zeros + slotsWithMacros: 0 for empty slots', () => {
    const result = aggregateWeeklyMacros([], {});
    expect(result.weekly).toEqual({
      calories: 0, protein: 0, carbohydrates: 0, fat: 0, fibre: 0, isEstimated: true,
    });
    expect(result.perDay).toEqual({});
    expect(result.slotsWithMacros).toBe(0);
    expect(result.slotsTotal).toBe(0);
  });

  it('skips slots whose recipe is missing from the map', () => {
    const slots = [makeSlot(0, 'missing-id')];
    const result = aggregateWeeklyMacros(slots, {});
    expect(result.weekly.calories).toBe(0);
    expect(result.slotsWithMacros).toBe(0);
    expect(result.slotsTotal).toBe(1);
  });

  it('skips slots whose recipe has null macros', () => {
    const slots = [makeSlot(0, 'a'), makeSlot(1, 'b')];
    const recipes = {
      a: makeRecipe('a', baseMacros),
      b: makeRecipe('b', null),
    };
    const result = aggregateWeeklyMacros(slots, recipes);
    expect(result.weekly).toEqual({
      calories: 500, protein: 30, carbohydrates: 50, fat: 20, fibre: 8, isEstimated: true,
    });
    expect(result.slotsWithMacros).toBe(1);
    expect(result.slotsTotal).toBe(2);
  });

  it('honors servings_multiplier (2x slot doubles its contribution)', () => {
    const slots = [makeSlot(0, 'a', 2)];
    const recipes = { a: makeRecipe('a', baseMacros) };
    const result = aggregateWeeklyMacros(slots, recipes);
    expect(result.weekly).toEqual({
      calories: 1000, protein: 60, carbohydrates: 100, fat: 40, fibre: 16, isEstimated: true,
    });
  });

  it('groups per day and sums multiple slots within the same day', () => {
    const slots = [
      makeSlot(2, 'a'), makeSlot(2, 'b'),
      makeSlot(5, 'a'),
    ];
    const recipes = {
      a: makeRecipe('a', baseMacros),
      b: makeRecipe('b', { ...baseMacros, calories: 200, protein: 10 }),
    };
    const result = aggregateWeeklyMacros(slots, recipes);
    expect(result.perDay[2]).toEqual({
      calories: 700, protein: 40, carbohydrates: 100, fat: 40, fibre: 16, isEstimated: true,
    });
    expect(result.perDay[5]).toEqual({
      calories: 500, protein: 30, carbohydrates: 50, fat: 20, fibre: 8, isEstimated: true,
    });
    expect(result.weekly.calories).toBe(1200);
    expect(result.slotsWithMacros).toBe(3);
  });

  it('applies rounding only at the end (no per-slot drift)', () => {
    // Three slots of 333.333 cal each → 1000 if rounded at end, 999 if rounded per-slot.
    const drifty: Macros = {
      calories: 333.333,
      protein: 0, carbohydrates: 0, fat: 0, fibre: 0,
      isEstimated: true,
    };
    const slots = [makeSlot(0, 'd'), makeSlot(1, 'd'), makeSlot(2, 'd')];
    const recipes = { d: makeRecipe('d', drifty) };
    const result = aggregateWeeklyMacros(slots, recipes);
    expect(result.weekly.calories).toBe(1000);
  });

  it('forces isEstimated: true on the aggregate even if all sources are non-estimated', () => {
    const slots = [makeSlot(0, 'a')];
    const recipes = { a: makeRecipe('a', { ...baseMacros, isEstimated: false }) };
    const result = aggregateWeeklyMacros(slots, recipes);
    expect(result.weekly.isEstimated).toBe(true);
  });
});
