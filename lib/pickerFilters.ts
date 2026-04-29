import type { Recipe, SkillLevel } from '@/types';

export type PickerChip = 'meal_prep' | 'quick' | 'high_protein' | 'vegetarian' | 'vegan';

export interface PickerFilterOpts {
  search: string;
  chips: Set<PickerChip>;
  cuisines: string[];
  timeBucket: number | null;
  skill: SkillLevel | null;
}

export function filterPickerRecipes(
  recipes: Recipe[],
  opts: PickerFilterOpts
): Recipe[] {
  const q = opts.search.toLowerCase().trim();
  const cuisinesLower = opts.cuisines.map((c) => c.toLowerCase());

  return recipes.filter((r) => {
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
      const total = (r.prep_time_mins ?? 99) + (r.cook_time_mins ?? 99);
      if (total > 30) return false;
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
      const total = (r.prep_time_mins ?? 99) + (r.cook_time_mins ?? 99);
      if (total > opts.timeBucket) return false;
    }

    if (opts.skill != null && r.skill_level !== opts.skill) return false;

    return true;
  });
}
