import { autoSlotsToStoreSlots } from '@/lib/autoPlan';
import type { AutoPlanSlot, Recipe, MealSlot } from '@/types';

// Minimal recipe factory — only the fields autoSlotsToStoreSlots reads.
function rec(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 'ext-1',          // external/TheMealDB id — must NOT become recipe_id
    supabase_id: 'uuid-1', // real UUID — THIS is what recipe_id must equal
    title: 'Dish',
    image_url: null,
    ...over,
  } as Recipe;
}

function slot(over: Partial<AutoPlanSlot> = {}): AutoPlanSlot {
  return {
    day: 0,
    mealType: 'dinner',
    recipe: rec(),
    provenance: 'auto_plan',
    explanation: 'Taste match · Italian',
    ...over,
  };
}

describe('autoSlotsToStoreSlots', () => {
  it('maps recipe.supabase_id → recipe_id (never the external id)', () => {
    const out = autoSlotsToStoreSlots([slot({ recipe: rec({ id: 'ext-99', supabase_id: 'uuid-99' }) })]);
    expect(out).toHaveLength(1);
    expect(out[0].recipe_id).toBe('uuid-99');
    expect(out[0].recipe_id).not.toBe('ext-99');
  });

  it('carries day, meal_type, provenance and explanation through', () => {
    const out = autoSlotsToStoreSlots([
      slot({ day: 3, mealType: 'dinner', provenance: 'sunday_drop', explanation: 'Uses your leftover spinach' }),
    ]);
    expect(out[0]).toMatchObject({
      day: 3,
      meal_type: 'dinner',
      provenance: 'sunday_drop',
      auto_explanation: 'Uses your leftover spinach',
    });
  });

  it('defaults servings_multiplier to 1', () => {
    const out = autoSlotsToStoreSlots([slot()]);
    expect(out[0].servings_multiplier).toBe(1);
  });

  it('drops null-recipe slots (generateNeeded — nothing to persist)', () => {
    const out = autoSlotsToStoreSlots([
      slot({ day: 0, recipe: rec({ supabase_id: 'uuid-a' }) }),
      slot({ day: 1, recipe: null }),
      slot({ day: 2, recipe: rec({ supabase_id: 'uuid-b' }) }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.recipe_id)).toEqual(['uuid-a', 'uuid-b']);
  });

  it('drops a recipe with no supabase_id rather than persist an unhydratable id', () => {
    const noUuid = { id: 'ext-only', title: 'X', image_url: null } as Recipe; // supabase_id missing
    const out = autoSlotsToStoreSlots([slot({ recipe: noUuid })]);
    expect(out).toHaveLength(0);
  });

  it('empty explanation becomes null (not an empty string)', () => {
    const out = autoSlotsToStoreSlots([slot({ explanation: '' })]);
    expect(out[0].auto_explanation).toBeNull();
  });

  it('returns an empty array for empty input', () => {
    expect(autoSlotsToStoreSlots([])).toEqual([]);
  });

  it('round-trips provenance + auto_explanation through JSONB serialization (meal_plans.slots)', () => {
    const out = autoSlotsToStoreSlots([slot({ provenance: 'auto_plan', explanation: 'Taste match · Thai' })]);
    // Simulate the Supabase JSONB write→read cycle.
    const round: MealSlot[] = JSON.parse(JSON.stringify(out));
    expect(round[0].provenance).toBe('auto_plan');
    expect(round[0].auto_explanation).toBe('Taste match · Thai');
    expect(round[0].recipe_id).toBe('uuid-1');
    expect(round[0].servings_multiplier).toBe(1);
  });
});
