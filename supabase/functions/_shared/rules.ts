import { MealCard, UserProfile } from "./types.ts";

export function normalize(v: string): string {
  return v.trim().toLowerCase();
}

export function hasAllergyConflict(meal: MealCard, profile: UserProfile): boolean {
  const allergenSet = new Set(profile.allergens.map(normalize));
  const mealAllergens = meal.allergen_flags.map(normalize);
  return mealAllergens.some((a) => allergenSet.has(a));
}

export function violatesDiet(meal: MealCard, profile: UserProfile): boolean {
  if (profile.diet_type === "omnivore") return false;
  return !meal.diet_tags.map(normalize).includes(normalize(profile.diet_type));
}

export function violatesCookTime(meal: MealCard, profile: UserProfile): boolean {
  if (!meal.cook_minutes) return false;
  return meal.cook_minutes > profile.max_cook_minutes;
}

export function applyRuleFlags(meals: MealCard[], profile: UserProfile): MealCard[] {
  return meals.map((meal) => {
    const warnings: string[] = [];
    if (hasAllergyConflict(meal, profile)) warnings.push("allergy_conflict");
    if (violatesDiet(meal, profile)) warnings.push("diet_mismatch");
    if (violatesCookTime(meal, profile)) warnings.push("cook_time_exceeded");
    return { ...meal, warning_flags: warnings };
  });
}
