// badges/badgeData.ts
// Core badge types, definitions, and computation logic.
// Import this wherever you need to read or evaluate badges.

export type BadgeCategory = 'cooking' | 'streak' | 'exploration' | 'community';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;          // key into BADGE_ICONS map in BadgeIcons.tsx
  category: BadgeCategory;
  earned: boolean;
  legendary?: boolean;   // cook_100, streak_30 — gets special visual ring + size
}

export interface BadgeStats {
  totalCooked: number;
  longestStreak: number;
  distinctCuisines: number;
  cookedMealPrep: boolean;
  recipesSubmitted: number;
  // Sum of save_count and cook_count across recipes the user submitted.
  // Powers the "your recipe was saved/cooked by N people" creator badges.
  totalSavesEarned: number;
  totalCooksEarned: number;
}

interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  legendary?: boolean;
  check: (s: BadgeStats) => boolean;
}

const BADGE_DEFS: BadgeDef[] = [
  // — Cooking ——————————————————————————————————————————————————————————————
  { id: 'cook_1',   name: 'First Cook',       description: 'Cook your first meal',  icon: 'cook_1',   category: 'cooking',  check: (s) => s.totalCooked >= 1   },
  { id: 'cook_5',   name: 'Home Chef',         description: 'Cook 5 meals',          icon: 'cook_5',   category: 'cooking',  check: (s) => s.totalCooked >= 5   },
  { id: 'cook_10',  name: 'Kitchen Regular',   description: 'Cook 10 meals',         icon: 'cook_10',  category: 'cooking',  check: (s) => s.totalCooked >= 10  },
  { id: 'cook_25',  name: 'Seasoned Cook',     description: 'Cook 25 meals',         icon: 'cook_25',  category: 'cooking',  check: (s) => s.totalCooked >= 25  },
  { id: 'cook_50',  name: 'Line Cook',         description: 'Cook 50 meals',         icon: 'cook_50',  category: 'cooking',  check: (s) => s.totalCooked >= 50  },
  { id: 'cook_100', name: 'Head Chef',         description: 'Cook 100 meals',        icon: 'cook_100', category: 'cooking',  legendary: true, check: (s) => s.totalCooked >= 100 },
  // — Streak —————————————————————————————————————————————————————————————
  { id: 'streak_3',  name: '3-Day Streak',     description: 'Cook 3 days in a row',  icon: 'streak_3',  category: 'streak', check: (s) => s.longestStreak >= 3  },
  { id: 'streak_7',  name: 'Week Warrior',     description: 'Cook 7 days in a row',  icon: 'streak_7',  category: 'streak', check: (s) => s.longestStreak >= 7  },
  { id: 'streak_14', name: 'Two Weeks Strong', description: 'Cook 14 days in a row', icon: 'streak_14', category: 'streak', check: (s) => s.longestStreak >= 14 },
  { id: 'streak_30', name: 'Monthly Master',   description: 'Cook 30 days in a row', icon: 'streak_30', category: 'streak', legendary: true, check: (s) => s.longestStreak >= 30 },
  // — Exploration ————————————————————————————————————————————————————————
  { id: 'cuisines_5', name: 'World Traveler',  description: 'Cook 5 different cuisines', icon: 'cuisines_5', category: 'exploration', check: (s) => s.distinctCuisines >= 5 },
  { id: 'meal_prep',  name: 'Prep Master',     description: 'Cook a meal-prep recipe',   icon: 'meal_prep',  category: 'exploration', check: (s) => s.cookedMealPrep       },
  // — Community ——————————————————————————————————————————————————————————
  { id: 'submit_1', name: 'Recipe Creator',    description: 'Submit your first recipe',  icon: 'submit_1', category: 'community', check: (s) => s.recipesSubmitted >= 1 },
  { id: 'submit_5', name: 'Community Chef',    description: 'Submit 5 recipes',          icon: 'submit_5', category: 'community', check: (s) => s.recipesSubmitted >= 5 },
  // — Creator outcomes (saves + cooks earned on your submissions) ——————————
  { id: 'saves_earned_1',   name: 'First Fan',          description: 'Someone saved your recipe',            icon: 'saves_earned_1',   category: 'community', check: (s) => s.totalSavesEarned  >= 1   },
  { id: 'saves_earned_10',  name: 'Saved By Many',      description: 'Your recipes saved 10 times',          icon: 'saves_earned_10',  category: 'community', check: (s) => s.totalSavesEarned  >= 10  },
  { id: 'saves_earned_50',  name: 'Crowd Favorite',     description: 'Your recipes saved 50 times',          icon: 'saves_earned_50',  category: 'community', check: (s) => s.totalSavesEarned  >= 50  },
  { id: 'saves_earned_100', name: 'Hall of Fame',       description: 'Your recipes saved 100 times',         icon: 'saves_earned_100', category: 'community', legendary: true, check: (s) => s.totalSavesEarned >= 100 },
  { id: 'cooks_earned_1',   name: 'Someone Cooked It!', description: 'Someone cooked your recipe',           icon: 'cooks_earned_1',   category: 'community', check: (s) => s.totalCooksEarned  >= 1   },
  { id: 'cooks_earned_10',  name: 'Fed the Crowd',      description: 'Your recipes cooked 10 times',         icon: 'cooks_earned_10',  category: 'community', check: (s) => s.totalCooksEarned  >= 10  },
  { id: 'cooks_earned_50',  name: 'Cookbook Author',    description: 'Your recipes cooked 50 times',         icon: 'cooks_earned_50',  category: 'community', check: (s) => s.totalCooksEarned  >= 50  },
  { id: 'cooks_earned_100', name: 'Mori Legend',        description: 'Your recipes cooked 100 times',        icon: 'cooks_earned_100', category: 'community', legendary: true, check: (s) => s.totalCooksEarned >= 100 },
];

/** Returns all badges sorted earned-first, locked-last. */
export function computeBadges(stats: BadgeStats): Badge[] {
  const all = BADGE_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    category: def.category,
    legendary: def.legendary,
    earned: def.check(stats),
  }));
  return [...all.filter((b) => b.earned), ...all.filter((b) => !b.earned)];
}

/**
 * Compares two stat snapshots and returns only the badges that are
 * newly earned in `next` but were NOT earned in `prev`.
 */
export function getNewlyEarned(prev: BadgeStats, next: BadgeStats): Badge[] {
  const prevIds = new Set(BADGE_DEFS.filter((d) => d.check(prev)).map((d) => d.id));
  return BADGE_DEFS
    .filter((d) => !prevIds.has(d.id) && d.check(next))
    .map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      icon: d.icon,
      category: d.category,
      legendary: d.legendary,
      earned: true,
    }));
}

export const BADGE_CATEGORIES: BadgeCategory[] = [
  'cooking',
  'streak',
  'exploration',
  'community',
];

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  cooking:     'Cooking',
  streak:      'Streak',
  exploration: 'Exploration',
  community:   'Community',
};

/**
 * Returns exactly one badge per category for the profile showcase row.
 * Uses the highest-difficulty earned badge, or the easiest locked badge
 * as a placeholder if nothing in that category has been earned yet.
 */
export function getShowcaseBadges(stats: BadgeStats): Badge[] {
  return BADGE_CATEGORIES.map((cat) => {
    const catDefs = BADGE_DEFS.filter((d) => d.category === cat);
    for (let i = catDefs.length - 1; i >= 0; i--) {
      if (catDefs[i].check(stats)) {
        const d = catDefs[i];
        return { id: d.id, name: d.name, description: d.description, icon: d.icon, category: d.category, legendary: d.legendary, earned: true };
      }
    }
    const d = catDefs[0];
    return { id: d.id, name: d.name, description: d.description, icon: d.icon, category: d.category, legendary: d.legendary, earned: false };
  });
}
