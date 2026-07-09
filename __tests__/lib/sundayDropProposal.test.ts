/**
 * hydrateSundayDropProposal — reconstructs a stored Sunday Drop proposal (lean: recipe ids +
 * alternate ids) into a full AutoPlanResult for the Build-my-week review sheet. Recipes are
 * fetched fresh (getRecipesBySupabaseIds) so the proposal never goes stale.
 */

// getRecipesBySupabaseIds hits supabase.from('recipes').select(...).in('id', ids) — mock it to
// echo back a Recipe row per requested id (supabase_id = id since external_id is null).
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn((_col: string, ids: string[]) => Promise.resolve({
          // Echo a row for every requested id EXCEPT 'gone' (simulates a soft-deleted recipe).
          // Each row carries one ingredient named `ing-<id>` so dislike matching is testable,
          // and the title embeds the id so dietary keyword matching is too (id 'beef-x' →
          // title "Recipe beef-x" contains 'beef').
          data: ids.filter((id) => id !== 'gone').map((id) => ({ id, external_id: null, title: `Recipe ${id}`, ingredients: [{ name: `ing-${id}` }], steps: [] })),
          error: null,
        })),
      })),
    })),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

import { hydrateSundayDropProposal } from '@/lib/api';
import { violatesCurrentPrefs } from '@/lib/sundayDrop';
import type { ProposedPlan, Recipe } from '@/types';

const proposal: ProposedPlan = {
  slots: [
    { day: 0, mealType: 'dinner', recipeId: 'p0', servingsMultiplier: 1, explanation: 'Uses your leftover spinach', provenance: 'sunday_drop', alternateIds: ['a0', 'a1'] },
    { day: 1, mealType: 'dinner', recipeId: 'p1', servingsMultiplier: 2, explanation: null, provenance: 'manual', alternateIds: [] },
  ],
  explanation: 'A varied week of dinners.',
  totalCost: 42,
  overBudget: false,
  generateNeeded: 5,
};

describe('hydrateSundayDropProposal', () => {
  it('hydrates recipe ids + alternates into a full AutoPlanResult', async () => {
    const result = await hydrateSundayDropProposal(proposal);

    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].recipe?.supabase_id).toBe('p0');
    expect(result.slots[0].mealType).toBe('dinner');
    expect(result.slots[0].provenance).toBe('sunday_drop');
    expect(result.slots[0].explanation).toBe('Uses your leftover spinach');
    expect(result.slots[0].alternates?.map((r) => r.supabase_id)).toEqual(['a0', 'a1']);
    expect(result.slots[1].servingsMultiplier).toBe(2);
    expect(result.slots[1].explanation).toBe('');          // null → '' (AutoPlanSlot.explanation is string)
    expect(result.slots[1].alternates).toEqual([]);
  });

  it('passes the plan-level meta through', async () => {
    const result = await hydrateSundayDropProposal(proposal);
    expect(result.explanation).toBe('A varied week of dinners.');
    expect(result.totalCost).toBe(42);
    expect(result.overBudget).toBe(false);
    expect(result.generateNeeded).toBe(5);
  });

  it('leaves recipe null when an id is missing from the catalog (soft-deleted)', async () => {
    const withMissing: ProposedPlan = {
      ...proposal,
      slots: [{ day: 0, mealType: 'dinner', recipeId: 'gone', servingsMultiplier: 1, explanation: null, provenance: 'sunday_drop', alternateIds: [] }],
    };
    const result = await hydrateSundayDropProposal(withMissing);
    expect(result.slots[0].recipe).toBeNull(); // 'gone' not returned → unhydratable → null
  });

  // Prefs can change between the Sunday generation and the review (went vegetarian, added an
  // allergy dislike). Hydration must re-validate — a now-violating pick is never shown/written.
  describe('current-prefs re-validation (stale proposal guard)', () => {
    it('nulls a slot whose recipe now violates a dietary goal and prunes violating alternates', async () => {
      const p: ProposedPlan = {
        ...proposal,
        slots: [{ day: 0, mealType: 'dinner', recipeId: 'beef-stew', servingsMultiplier: 1, explanation: null, provenance: 'sunday_drop', alternateIds: ['chicken-curry', 'veg-chili'] }],
      };
      const result = await hydrateSundayDropProposal(p, { dietaryGoals: ['vegetarian'] });
      expect(result.slots[0].recipe).toBeNull();                       // "Recipe beef-stew" hard-filtered
      expect(result.slots[0].alternates?.map((r) => r.supabase_id)).toEqual(['veg-chili']); // chicken pruned
    });

    it('nulls a slot whose recipe now hits an ingredient dislike', async () => {
      const p: ProposedPlan = {
        ...proposal,
        slots: [{ day: 0, mealType: 'dinner', recipeId: 'p0', servingsMultiplier: 1, explanation: null, provenance: 'sunday_drop', alternateIds: ['a0'] }],
      };
      const result = await hydrateSundayDropProposal(p, { ingredientDislikes: ['ing-p0'] });
      expect(result.slots[0].recipe).toBeNull();                       // ingredient "ing-p0" disliked
      expect(result.slots[0].alternates?.map((r) => r.supabase_id)).toEqual(['a0']); // alternate unaffected
    });

    it('filters nothing when prefs are passed but nothing violates', async () => {
      const result = await hydrateSundayDropProposal(proposal, { dietaryGoals: ['vegetarian'], ingredientDislikes: ['durian'] });
      expect(result.slots[0].recipe?.supabase_id).toBe('p0');
      expect(result.slots[0].alternates?.map((r) => r.supabase_id)).toEqual(['a0', 'a1']);
    });
  });
});

describe('violatesCurrentPrefs', () => {
  const recipe = (title: string, ingredients: string[]): Recipe =>
    ({ id: 'x', supabase_id: 'x', title, ingredients: ingredients.map((name) => ({ name })), steps: [] } as unknown as Recipe);

  it('vegetarian/vegan: meat in title or ingredients violates', () => {
    expect(violatesCurrentPrefs(recipe('Beef Stew', ['onion']), ['vegetarian'], [])).toBe(true);
    expect(violatesCurrentPrefs(recipe('Hearty Stew', ['ground beef']), ['vegan'], [])).toBe(true);
    expect(violatesCurrentPrefs(recipe('Salmon Bowl', ['salmon']), ['vegetarian'], [])).toBe(true); // seafood counts
    expect(violatesCurrentPrefs(recipe('Veg Chili', ['beans', 'tomato']), ['vegetarian'], [])).toBe(false);
  });

  it('pescatarian: land meat violates, seafood does not', () => {
    expect(violatesCurrentPrefs(recipe('Chicken Curry', ['chicken']), ['pescatarian'], [])).toBe(true);
    expect(violatesCurrentPrefs(recipe('Salmon Bowl', ['salmon']), ['pescatarian'], [])).toBe(false);
  });

  it('ingredient dislikes: substring match on ingredient names, case-insensitive', () => {
    expect(violatesCurrentPrefs(recipe('Pasta', ['Button Mushrooms']), [], ['mushroom'])).toBe(true);
    expect(violatesCurrentPrefs(recipe('Pasta', ['tomato']), [], ['mushroom'])).toBe(false);
  });

  it('no goals + no dislikes → never violates', () => {
    expect(violatesCurrentPrefs(recipe('Beef Stew', ['beef']), [], [])).toBe(false);
    expect(violatesCurrentPrefs(recipe('Beef Stew', ['beef']), null, null)).toBe(false);
  });
});
