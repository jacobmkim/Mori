import { otherUncookedSlotsWithRecipe } from '@/lib/mealPlanCooked';
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
