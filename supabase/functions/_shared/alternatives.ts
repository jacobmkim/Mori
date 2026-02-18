import { MealCard, UserProfile } from "./types.ts";
import { applyRuleFlags } from "./rules.ts";

export function suggestAlternativesDeterministic(baseMealId: number, candidates: MealCard[], profile: UserProfile): MealCard[] {
  const flagged = applyRuleFlags(candidates, profile);

  return flagged
    .filter((m) => m.meal_id !== baseMealId)
    .map((meal) => {
      const penalty = meal.warning_flags.length * 100;
      const cookDiff = Math.abs((meal.cook_minutes ?? 0) - (candidates.find((c) => c.meal_id === baseMealId)?.cook_minutes ?? 0));
      return { meal, rank: penalty + cookDiff };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map((x) => x.meal);
}

export const aiEnabled = false;
