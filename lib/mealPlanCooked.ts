import type { MealSlot, MealType } from '@/types';

// Finds the other slots in a week that hold the same recipe but haven't been
// marked cooked yet — used to drive the batch-cook "mark the other N too?"
// prompt. Excludes the slot that was just cooked (by day + meal_type) and any
// slot already cooked.
export function otherUncookedSlotsWithRecipe(
  slots: MealSlot[],
  recipeId: string,
  excluding: { day: number; meal_type: MealType },
): MealSlot[] {
  return slots.filter(
    (s) =>
      s.recipe_id === recipeId &&
      !s.cooked_at &&
      !(s.day === excluding.day && s.meal_type === excluding.meal_type),
  );
}

// Days (0..totalDays-1) whose same-meal-type slot is currently EMPTY, excluding the source day —
// the non-destructive targets for "Repeat across the week". Never returns a day that already has
// a meal of that type planned.
export function openDaysForRepeat(
  slots: MealSlot[],
  sourceDay: number,
  mealType: MealType,
  totalDays: number,
): number[] {
  const taken = new Set(
    slots.filter((s) => s.meal_type === mealType).map((s) => s.day),
  );
  const out: number[] = [];
  for (let day = 0; day < totalDays; day++) {
    if (day === sourceDay) continue;
    if (!taken.has(day)) out.push(day);
  }
  return out;
}
