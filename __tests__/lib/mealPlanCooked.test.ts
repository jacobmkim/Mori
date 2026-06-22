import { otherUncookedSlotsWithRecipe, openDaysForRepeat } from '@/lib/mealPlanCooked';
import type { MealSlot } from '@/types';

const mk = (day: number, meal_type: MealSlot['meal_type'], recipe_id: string, cooked_at?: string | null): MealSlot =>
  ({ day, meal_type, recipe_id, servings_multiplier: 1, cooked_at });

describe('otherUncookedSlotsWithRecipe', () => {
  it('finds other uncooked slots with the same recipe', () => {
    const slots = [
      mk(0, 'lunch', 'r1'),
      mk(1, 'lunch', 'r1'),
      mk(2, 'lunch', 'r1'),
    ];
    const others = otherUncookedSlotsWithRecipe(slots, 'r1', { day: 0, meal_type: 'lunch' });
    expect(others).toHaveLength(2);
    expect(others.map((s) => s.day).sort()).toEqual([1, 2]);
  });

  it('excludes the just-cooked slot itself', () => {
    const slots = [mk(0, 'lunch', 'r1'), mk(1, 'lunch', 'r1')];
    const others = otherUncookedSlotsWithRecipe(slots, 'r1', { day: 0, meal_type: 'lunch' });
    expect(others.every((s) => !(s.day === 0 && s.meal_type === 'lunch'))).toBe(true);
  });

  it('excludes slots already cooked', () => {
    const slots = [
      mk(0, 'lunch', 'r1'),
      mk(1, 'lunch', 'r1', '2026-05-28T12:00:00Z'),
      mk(2, 'lunch', 'r1'),
    ];
    const others = otherUncookedSlotsWithRecipe(slots, 'r1', { day: 0, meal_type: 'lunch' });
    expect(others.map((s) => s.day)).toEqual([2]);
  });

  it('excludes slots with a different recipe', () => {
    const slots = [mk(0, 'lunch', 'r1'), mk(1, 'lunch', 'r2'), mk(2, 'dinner', 'r1')];
    const others = otherUncookedSlotsWithRecipe(slots, 'r1', { day: 0, meal_type: 'lunch' });
    expect(others.map((s) => `${s.day}-${s.meal_type}`)).toEqual(['2-dinner']);
  });

  it('returns empty when no other slots match', () => {
    const slots = [mk(0, 'lunch', 'r1')];
    expect(otherUncookedSlotsWithRecipe(slots, 'r1', { day: 0, meal_type: 'lunch' })).toEqual([]);
  });
});

describe('openDaysForRepeat', () => {
  it('returns every other day when only the source day is filled', () => {
    const slots = [mk(2, 'dinner', 'r1')];
    expect(openDaysForRepeat(slots, 2, 'dinner', 7)).toEqual([0, 1, 3, 4, 5, 6]);
  });

  it('excludes the source day and any day already holding that meal type (non-destructive)', () => {
    const slots = [mk(0, 'dinner', 'r1'), mk(1, 'dinner', 'r2'), mk(3, 'dinner', 'r3')];
    // source = day 0; days 1 and 3 already have a dinner → only 2,4,5,6 are open
    expect(openDaysForRepeat(slots, 0, 'dinner', 7)).toEqual([2, 4, 5, 6]);
  });

  it('ignores slots of a different meal type', () => {
    const slots = [mk(0, 'dinner', 'r1'), mk(1, 'lunch', 'rX'), mk(2, 'breakfast', 'rY')];
    // only day 0 has a DINNER → all other days are open for a dinner repeat
    expect(openDaysForRepeat(slots, 0, 'dinner', 7)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('returns empty when every other day already has that meal', () => {
    const slots = [0, 1, 2, 3, 4, 5, 6].map((d) => mk(d, 'dinner', `r${d}`));
    expect(openDaysForRepeat(slots, 0, 'dinner', 7)).toEqual([]);
  });
});
