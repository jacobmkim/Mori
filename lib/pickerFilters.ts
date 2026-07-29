import type { Recipe, SkillLevel } from '@/types';
import {
  violatesDietary, matchesDislike, recipeMatchText, hasNoIngredientData, hasRestriction,
} from './dietaryRules';

export type PickerChip = 'meal_prep' | 'quick' | 'high_protein' | 'vegetarian' | 'vegan';

export interface PickerFilterOpts {
  search: string;
  chips: Set<PickerChip>;
  cuisines: string[];
  timeBucket: number | null;
  skill: SkillLevel | null;
  /** The user's own restrictions. Omitted = no gate (callers that show only saved recipes). */
  dietaryGoals?: string[];
  ingredientDislikes?: string[];
}

export function filterPickerRecipes(
  recipes: Recipe[],
  opts: PickerFilterOpts
): Recipe[] {
  const q = opts.search.toLowerCase().trim();
  const cuisinesLower = opts.cuisines.map((c) => c.toLowerCase());
  // The picker used to apply NO dietary/dislike filter at all — a vegan browsing "add a meal"
  // was offered meat, and disliked/allergen ingredients showed up freely.
  const goals = opts.dietaryGoals ?? [];
  const dislikes = opts.ingredientDislikes ?? [];
  const gated = hasRestriction(goals) || dislikes.length > 0;

  return recipes.filter((r) => {
    if (gated) {
      if (hasNoIngredientData(r as any)) return false; // fail closed under a restriction
      const text = recipeMatchText(r as any);
      if (violatesDietary(text, goals) || matchesDislike(text, dislikes)) return false;
    }
    if (q) {
      const hit =
        r.title.toLowerCase().includes(q) ||
        (r.cuisine ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }

    if (cuisinesLower.length > 0) {
      const recipeCuisines = (r.cuisine ?? '')
        .toLowerCase()
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (!recipeCuisines.some((rc) => cuisinesLower.includes(rc))) return false;
    }

    if (opts.chips.has('meal_prep') && r.meal_prep_friendly !== true) return false;

    if (opts.chips.has('quick')) {
      const prep = r.prep_time_mins ?? 0;
      const cook = r.cook_time_mins ?? 0;
      const total = prep + cook;
      if (total === 0 || total > 30) return false;
    }

    if (opts.chips.has('high_protein') && !(r.dietary_tags ?? []).includes('high_protein')) {
      return false;
    }

    if (opts.chips.has('vegetarian')) {
      const tags = r.dietary_tags ?? [];
      if (!tags.includes('vegetarian') && !tags.includes('vegan')) return false;
    }

    if (opts.chips.has('vegan') && !(r.dietary_tags ?? []).includes('vegan')) {
      return false;
    }

    if (opts.timeBucket != null) {
      const prep = r.prep_time_mins ?? 0;
      const cook = r.cook_time_mins ?? 0;
      const total = prep + cook;
      if (total === 0 || total > opts.timeBucket) return false;
    }

    if (opts.skill != null && r.skill_level !== opts.skill) return false;

    return true;
  });
}
