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
