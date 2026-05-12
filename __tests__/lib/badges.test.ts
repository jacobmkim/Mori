/**
 * Tests for the pure badge logic in components/badges/badgeData.ts
 * (re-exported via lib/badges.ts).
 *
 * No React Native imports — these are pure functions.
 */

import {
  computeBadges,
  getNewlyEarned,
  BADGE_CATEGORIES,
  BADGE_CATEGORY_LABELS,
  type BadgeStats,
} from '@/lib/badges';

const ZERO_STATS: BadgeStats = {
  totalCooked: 0,
  longestStreak: 0,
  distinctCuisines: 0,
  cookedMealPrep: false,
  recipesSubmitted: 0,
  totalSavesEarned: 0,
  totalCooksEarned: 0,
};

const ALL_STATS: BadgeStats = {
  totalCooked: 100,
  longestStreak: 30,
  distinctCuisines: 5,
  cookedMealPrep: true,
  recipesSubmitted: 5,
  totalSavesEarned: 100,
  totalCooksEarned: 100,
};

const TOTAL_BADGES = 22;

describe('computeBadges', () => {
  it('returns all badges with earned=false when stats are empty', () => {
    const badges = computeBadges(ZERO_STATS);
    expect(badges).toHaveLength(TOTAL_BADGES);
    expect(badges.every((b) => b.earned === false)).toBe(true);
  });

  it('earns only cook_1 in the cooking category when totalCooked is 1', () => {
    const badges = computeBadges({ ...ZERO_STATS, totalCooked: 1 });
    const earnedCookingIds = badges
      .filter((b) => b.earned && b.category === 'cooking')
      .map((b) => b.id);
    expect(earnedCookingIds).toEqual(['cook_1']);
  });

  it('earns all 6 cooking badges and marks cook_100 as legendary at totalCooked=100', () => {
    const badges = computeBadges({ ...ZERO_STATS, totalCooked: 100 });
    const cooking = badges.filter((b) => b.category === 'cooking');
    expect(cooking.every((b) => b.earned)).toBe(true);
    expect(cooking).toHaveLength(6);
    const cook100 = badges.find((b) => b.id === 'cook_100')!;
    expect(cook100.legendary).toBe(true);
  });

  it('earns all 4 streak badges and marks streak_30 as legendary at longestStreak=30', () => {
    const badges = computeBadges({ ...ZERO_STATS, longestStreak: 30 });
    const streak = badges.filter((b) => b.category === 'streak');
    expect(streak.every((b) => b.earned)).toBe(true);
    expect(streak).toHaveLength(4);
    const streak30 = badges.find((b) => b.id === 'streak_30')!;
    expect(streak30.legendary).toBe(true);
  });

  it('sorts earned badges before locked badges', () => {
    const badges = computeBadges({
      ...ZERO_STATS,
      totalCooked: 5,
      cookedMealPrep: true,
    });
    const firstLockedIdx = badges.findIndex((b) => !b.earned);
    const lastEarnedIdx = badges.map((b) => b.earned).lastIndexOf(true);
    expect(lastEarnedIdx).toBeLessThan(firstLockedIdx);
  });

  it('returns the expected earned set for mixed mid-tier stats', () => {
    const badges = computeBadges({
      totalCooked: 5,
      longestStreak: 7,
      distinctCuisines: 5,
      cookedMealPrep: true,
      recipesSubmitted: 1,
      totalSavesEarned: 0,
      totalCooksEarned: 0,
    });
    const earnedIds = badges.filter((b) => b.earned).map((b) => b.id).sort();
    expect(earnedIds).toEqual(
      [
        'cook_1',
        'cook_5',
        'streak_3',
        'streak_7',
        'cuisines_5',
        'meal_prep',
        'submit_1',
      ].sort()
    );
  });

  it('passes through id, name, description, icon, and category fields', () => {
    const badges = computeBadges(ALL_STATS);
    const cook1 = badges.find((b) => b.id === 'cook_1')!;
    expect(cook1.name).toBe('First Cook');
    expect(cook1.description).toBe('Cook your first meal');
    expect(cook1.icon).toBe('cook_1');
    expect(cook1.category).toBe('cooking');
  });

  it('marks all 14 badges as earned when stats hit every threshold', () => {
    const badges = computeBadges(ALL_STATS);
    expect(badges).toHaveLength(TOTAL_BADGES);
    expect(badges.every((b) => b.earned)).toBe(true);
  });
});

describe('getNewlyEarned', () => {
  it('returns [] when prev and next snapshots are identical', () => {
    expect(getNewlyEarned(ZERO_STATS, ZERO_STATS)).toEqual([]);
    expect(getNewlyEarned(ALL_STATS, ALL_STATS)).toEqual([]);
  });

  it('returns only [cook_1] when crossing from 0 to 1 cooked', () => {
    const newly = getNewlyEarned(
      { ...ZERO_STATS, totalCooked: 0 },
      { ...ZERO_STATS, totalCooked: 1 }
    );
    expect(newly.map((b) => b.id)).toEqual(['cook_1']);
  });

  it('returns only [cook_5], not [cook_1, cook_5], when cook_1 was already earned', () => {
    const newly = getNewlyEarned(
      { ...ZERO_STATS, totalCooked: 4 },
      { ...ZERO_STATS, totalCooked: 5 }
    );
    expect(newly.map((b) => b.id)).toEqual(['cook_5']);
  });

  it('returns multiple newly-earned badges when several thresholds cross at once', () => {
    const newly = getNewlyEarned(ZERO_STATS, {
      ...ZERO_STATS,
      totalCooked: 1,
      cookedMealPrep: true,
    });
    const ids = newly.map((b) => b.id).sort();
    expect(ids).toEqual(['cook_1', 'meal_prep'].sort());
  });

  it('returns [] when stats decrease (no negative-direction badges)', () => {
    const newly = getNewlyEarned(
      { ...ZERO_STATS, totalCooked: 5 },
      { ...ZERO_STATS, totalCooked: 4 }
    );
    expect(newly).toEqual([]);
  });

  it('returns both cook_5 and cook_10 when crossing two thresholds in one step', () => {
    const newly = getNewlyEarned(
      { ...ZERO_STATS, totalCooked: 4 },
      { ...ZERO_STATS, totalCooked: 10 }
    );
    const ids = newly.map((b) => b.id).sort();
    expect(ids).toEqual(['cook_10', 'cook_5'].sort());
  });

  it('marks every returned badge as earned', () => {
    const newly = getNewlyEarned(ZERO_STATS, ALL_STATS);
    expect(newly.length).toBeGreaterThan(0);
    expect(newly.every((b) => b.earned === true)).toBe(true);
  });

  it('passes through legendary=true for cook_100', () => {
    const newly = getNewlyEarned(
      { ...ZERO_STATS, totalCooked: 99 },
      { ...ZERO_STATS, totalCooked: 100 }
    );
    const cook100 = newly.find((b) => b.id === 'cook_100');
    expect(cook100).toBeDefined();
    expect(cook100!.legendary).toBe(true);
  });

  it('passes through legendary=true for streak_30', () => {
    const newly = getNewlyEarned(
      { ...ZERO_STATS, longestStreak: 29 },
      { ...ZERO_STATS, longestStreak: 30 }
    );
    const streak30 = newly.find((b) => b.id === 'streak_30');
    expect(streak30).toBeDefined();
    expect(streak30!.legendary).toBe(true);
  });
});

describe('BADGE_CATEGORIES / BADGE_CATEGORY_LABELS', () => {
  it('contains exactly the four expected categories', () => {
    expect(BADGE_CATEGORIES).toHaveLength(4);
    expect([...BADGE_CATEGORIES].sort()).toEqual(
      ['cooking', 'streak', 'exploration', 'community'].sort()
    );
  });

  it('has a non-empty label for every category', () => {
    for (const cat of BADGE_CATEGORIES) {
      expect(BADGE_CATEGORY_LABELS[cat]).toBeTruthy();
      expect(BADGE_CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
    }
  });

  it('has no badge with an orphaned category (every badge category is in BADGE_CATEGORIES)', () => {
    const badges = computeBadges(ALL_STATS);
    const validSet = new Set(BADGE_CATEGORIES);
    for (const b of badges) {
      expect(validSet.has(b.category)).toBe(true);
    }
  });
});
