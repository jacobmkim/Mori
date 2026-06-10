import type { Macros, MealSlot, Recipe } from '@/types';

export function scaleMacros(macros: Macros, ratio: number): Macros {
  // Guard against bad upstream servings (0, NaN, Infinity, negative) which would
  // otherwise render negative or Infinity macros. Fall back to 1× (unscaled).
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    calories: Math.round(macros.calories * r),
    protein: Math.round(macros.protein * r * 10) / 10,
    carbohydrates: Math.round(macros.carbohydrates * r * 10) / 10,
    fat: Math.round(macros.fat * r * 10) / 10,
    fibre: Math.round(macros.fibre * r * 10) / 10,
    netCarbs:
      macros.netCarbs != null
        ? Math.round(macros.netCarbs * r * 10) / 10
        : undefined,
    isEstimated: macros.isEstimated,
  };
}

export interface WeeklyMacroSummary {
  weekly: Macros;
  perDay: Record<number, Macros>;
  slotsWithMacros: number;
  slotsTotal: number;
}

export function aggregateWeeklyMacros(
  slots: MealSlot[],
  recipesById: Record<string, Recipe>
): WeeklyMacroSummary {
  const empty = (): Macros => ({
    calories: 0,
    protein: 0,
    carbohydrates: 0,
    fat: 0,
    fibre: 0,
    isEstimated: true,
  });

  const weekly = empty();
  const perDay: Record<number, Macros> = {};
  let slotsWithMacros = 0;

  for (const slot of slots) {
    const recipe = recipesById[slot.recipe_id];
    if (!recipe?.macros) continue;
    const rawRatio = slot.servings_multiplier ?? 1;
    const ratio = Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 1;

    // Accumulate raw (unrounded) values; round once at the end to avoid drift.
    weekly.calories += recipe.macros.calories * ratio;
    weekly.protein += recipe.macros.protein * ratio;
    weekly.carbohydrates += recipe.macros.carbohydrates * ratio;
    weekly.fat += recipe.macros.fat * ratio;
    weekly.fibre += recipe.macros.fibre * ratio;

    const day = perDay[slot.day] ?? empty();
    day.calories += recipe.macros.calories * ratio;
    day.protein += recipe.macros.protein * ratio;
    day.carbohydrates += recipe.macros.carbohydrates * ratio;
    day.fat += recipe.macros.fat * ratio;
    day.fibre += recipe.macros.fibre * ratio;
    perDay[slot.day] = day;

    slotsWithMacros++;
  }

  const round = (m: Macros): Macros => ({
    calories: Math.round(m.calories),
    protein: Math.round(m.protein * 10) / 10,
    carbohydrates: Math.round(m.carbohydrates * 10) / 10,
    fat: Math.round(m.fat * 10) / 10,
    fibre: Math.round(m.fibre * 10) / 10,
    isEstimated: true,
  });

  const roundedPerDay: Record<number, Macros> = {};
  for (const [day, m] of Object.entries(perDay)) {
    roundedPerDay[Number(day)] = round(m);
  }

  return {
    weekly: round(weekly),
    perDay: roundedPerDay,
    slotsWithMacros,
    slotsTotal: slots.length,
  };
}
