import { MealCard, SwipeEvent, UserProfile } from "./types.ts";
import { hasAllergyConflict, violatesCookTime, violatesDiet } from "./rules.ts";

function ingredientSet(meal: MealCard): Set<string> {
  return new Set(meal.ingredients.map((i) => i.name.toLowerCase()));
}

export function scoreMeals(meals: MealCard[], profile: UserProfile, swipeHistory: SwipeEvent[]): MealCard[] {
  const yesIds = new Set(swipeHistory.filter((s) => s.decision === "yes").map((s) => s.meal_id));
  const noIds = new Set(swipeHistory.filter((s) => s.decision === "no").map((s) => s.meal_id));

  const likedIngredients = new Set<string>();
  const dislikedIngredients = new Set(profile.disliked_ingredients?.map((s) => s.toLowerCase()) ?? []);

  for (const meal of meals) {
    if (!yesIds.has(meal.meal_id)) continue;
    for (const ing of ingredientSet(meal)) likedIngredients.add(ing);
  }

  return [...meals]
    .map((meal) => {
      let score = 50;
      if (yesIds.has(meal.meal_id)) score += 30;
      if (noIds.has(meal.meal_id)) score -= 20;

      if (hasAllergyConflict(meal, profile)) score -= 35;
      if (violatesDiet(meal, profile)) score -= 20;
      if (violatesCookTime(meal, profile)) score -= 10;

      for (const ingredient of ingredientSet(meal)) {
        if (likedIngredients.has(ingredient)) score += 4;
        if (dislikedIngredients.has(ingredient)) score -= 8;
      }

      return { meal, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.meal);
}
