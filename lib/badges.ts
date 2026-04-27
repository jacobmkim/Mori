export type BadgeCategory = 'cooking' | 'streak' | 'exploration' | 'community';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  earned: boolean;
}

export interface BadgeStats {
  totalCooked: number;
  longestStreak: number;
  distinctCuisines: number;
  cookedMealPrep: boolean;
  recipesSubmitted: number;
}

const BADGE_DEFS: Array<{
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  check: (s: BadgeStats) => boolean;
}> = [
  // Cooking milestones
  { id: 'cook_1',   name: 'First Cook',       description: 'Cook your first meal',  icon: 'restaurant-outline', category: 'cooking', check: (s) => s.totalCooked >= 1   },
  { id: 'cook_5',   name: 'Home Chef',         description: 'Cook 5 meals',          icon: 'restaurant',         category: 'cooking', check: (s) => s.totalCooked >= 5   },
  { id: 'cook_10',  name: 'Kitchen Regular',   description: 'Cook 10 meals',         icon: 'restaurant',         category: 'cooking', check: (s) => s.totalCooked >= 10  },
  { id: 'cook_25',  name: 'Seasoned Cook',     description: 'Cook 25 meals',         icon: 'flame-outline',      category: 'cooking', check: (s) => s.totalCooked >= 25  },
  { id: 'cook_50',  name: 'Line Cook',         description: 'Cook 50 meals',         icon: 'flame',              category: 'cooking', check: (s) => s.totalCooked >= 50  },
  { id: 'cook_100', name: 'Head Chef',         description: 'Cook 100 meals',        icon: 'trophy',             category: 'cooking', check: (s) => s.totalCooked >= 100 },
  // Streak milestones
  { id: 'streak_3',  name: '3-Day Streak',     description: 'Cook 3 days in a row',  icon: 'flame-outline', category: 'streak', check: (s) => s.longestStreak >= 3  },
  { id: 'streak_7',  name: 'Week Warrior',     description: 'Cook 7 days in a row',  icon: 'flame',         category: 'streak', check: (s) => s.longestStreak >= 7  },
  { id: 'streak_14', name: 'Two Weeks Strong', description: 'Cook 14 days in a row', icon: 'flame',         category: 'streak', check: (s) => s.longestStreak >= 14 },
  { id: 'streak_30', name: 'Monthly Master',   description: 'Cook 30 days in a row', icon: 'trophy',        category: 'streak', check: (s) => s.longestStreak >= 30 },
  // Exploration
  { id: 'cuisines_5', name: 'World Traveler', description: 'Cook 5 different cuisines', icon: 'earth',           category: 'exploration', check: (s) => s.distinctCuisines >= 5 },
  { id: 'meal_prep',  name: 'Prep Master',    description: 'Cook a meal-prep recipe',   icon: 'calendar-outline', category: 'exploration', check: (s) => s.cookedMealPrep        },
  // Community
  { id: 'submit_1', name: 'Recipe Creator', description: 'Submit your first recipe', icon: 'create-outline', category: 'community', check: (s) => s.recipesSubmitted >= 1 },
  { id: 'submit_5', name: 'Community Chef', description: 'Submit 5 recipes',         icon: 'people',         category: 'community', check: (s) => s.recipesSubmitted >= 5 },
];

export function computeBadges(stats: BadgeStats): Badge[] {
  const all = BADGE_DEFS.map((def) => ({ ...def, earned: def.check(stats) }));
  // Earned first, then locked
  return [...all.filter((b) => b.earned), ...all.filter((b) => !b.earned)];
}
