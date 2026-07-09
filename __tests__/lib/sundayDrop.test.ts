import {
  isSundayDropTime,
  mondayAfter,
  existingManualDinnerSlots,
  retagSundayDropProvenance,
  filledCount,
  summarizeDrop,
  MIN_FILL,
} from '@/lib/sundayDrop';
import type { AutoPlanResult, AutoPlanSlot, MealSlot, Recipe } from '@/types';

// Anchor: 2026-06-21 is a Sunday (same anchor as timezone.test.ts), 06-22 the Monday after.

describe('isSundayDropTime', () => {
  it('true on Sunday within [09:00, 11:00) local (PDT)', () => {
    expect(isSundayDropTime('America/Los_Angeles', new Date('2026-06-21T16:00:00Z'))).toBe(true); // 09:00
    expect(isSundayDropTime('America/Los_Angeles', new Date('2026-06-21T17:59:00Z'))).toBe(true); // 10:59
  });
  it('false before 09:00 and at/after 11:00 local', () => {
    expect(isSundayDropTime('America/Los_Angeles', new Date('2026-06-21T15:00:00Z'))).toBe(false); // 08:00
    expect(isSundayDropTime('America/Los_Angeles', new Date('2026-06-21T18:00:00Z'))).toBe(false); // 11:00 (exclusive)
  });
  it('false on a non-Sunday even at 09:00 local', () => {
    expect(isSundayDropTime('America/Los_Angeles', new Date('2026-06-22T16:00:00Z'))).toBe(false); // Mon 09:00
  });
  it('true for east-of-UTC zones where UTC is still Saturday (Kiritimati +14)', () => {
    expect(isSundayDropTime('Pacific/Kiritimati', new Date('2026-06-20T19:00:00Z'))).toBe(true); // Sun 09:00 local
  });
  it('true for fractional-offset zones (Asia/Kolkata +5:30)', () => {
    expect(isSundayDropTime('Asia/Kolkata', new Date('2026-06-21T03:30:00Z'))).toBe(true); // Sun 09:00 IST
  });
  it('null/invalid tz falls back to UTC', () => {
    expect(isSundayDropTime(null, new Date('2026-06-21T09:30:00Z'))).toBe(true);  // Sun 09:30 UTC
    expect(isSundayDropTime(undefined, new Date('2026-06-21T12:00:00Z'))).toBe(false); // Sun 12:00 UTC
  });
});

describe('mondayAfter', () => {
  it('returns the Monday after a given Sunday', () => {
    expect(mondayAfter('2026-06-21')).toBe('2026-06-22');
  });
  it('rolls over month boundaries', () => {
    expect(mondayAfter('2026-05-31')).toBe('2026-06-01'); // 2026-05-31 is a Sunday
  });
  it('rolls over year boundaries', () => {
    expect(mondayAfter('2027-12-26')).toBe('2027-12-27'); // 2027-12-26 is a Sunday
  });
});

const recipe = (id: string): Recipe => ({ id, supabase_id: id, title: id } as any);
const slot = (over: Partial<MealSlot>): MealSlot => ({
  day: 0, meal_type: 'dinner', recipe_id: 'x', servings_multiplier: 1, ...over,
});

describe('existingManualDinnerSlots', () => {
  const catalog = new Map<string, Recipe>([['a', recipe('a')], ['b', recipe('b')]]);

  it('keeps manual/legacy dinners that resolve to a catalog recipe', () => {
    const slots = [
      slot({ day: 1, recipe_id: 'a', provenance: 'manual' }),
      slot({ day: 2, recipe_id: 'b' }), // legacy (undefined provenance) counts as manual
    ];
    const res = existingManualDinnerSlots(slots, catalog);
    expect(res.map((r) => r.day).sort()).toEqual([1, 2]);
  });
  it('skips Mori picks (auto_plan + sunday_drop) and non-dinner slots', () => {
    const slots = [
      slot({ day: 1, recipe_id: 'a', provenance: 'auto_plan' }),
      slot({ day: 0, recipe_id: 'b', provenance: 'sunday_drop' }),
      slot({ day: 2, recipe_id: 'b', meal_type: 'lunch', provenance: 'manual' }),
    ];
    expect(existingManualDinnerSlots(slots, catalog)).toEqual([]);
  });
  it('skips slots whose recipe is not in the catalog (unresolvable)', () => {
    const slots = [slot({ day: 3, recipe_id: 'missing', provenance: 'manual' })];
    expect(existingManualDinnerSlots(slots, catalog)).toEqual([]);
  });
  it('handles null/empty', () => {
    expect(existingManualDinnerSlots(null, catalog)).toEqual([]);
    expect(existingManualDinnerSlots([], catalog)).toEqual([]);
  });
});

describe('retagSundayDropProvenance', () => {
  const aslot = (provenance: AutoPlanSlot['provenance']): AutoPlanSlot => ({
    day: 0, mealType: 'dinner', recipe: recipe('a'), provenance, explanation: '',
  });
  it('auto_plan → sunday_drop, manual stays manual', () => {
    const out = retagSundayDropProvenance([aslot('auto_plan'), aslot('manual')]);
    expect(out[0].provenance).toBe('sunday_drop');
    expect(out[1].provenance).toBe('manual');
  });
  it('does not mutate the input', () => {
    const input = [aslot('auto_plan')];
    retagSundayDropProvenance(input);
    expect(input[0].provenance).toBe('auto_plan');
  });
});

describe('filledCount + summarizeDrop', () => {
  const aslot = (recipe: Recipe | null): AutoPlanSlot => ({
    day: 0, mealType: 'dinner', recipe, provenance: 'sunday_drop', explanation: '',
  });
  const result = (over: Partial<AutoPlanResult>): AutoPlanResult => ({
    slots: [], generateNeeded: 0, totalCost: 0, overBudget: false, explanation: '', ...over,
  });

  it('counts only filled slots', () => {
    expect(filledCount([aslot(recipe('a')), aslot(null), aslot(recipe('b'))])).toBe(2);
  });
  it('summarizeDrop prefers the optimizer explanation', () => {
    expect(summarizeDrop(result({ explanation: 'Varied across 3 cuisines, fits your $80 week.' })))
      .toBe('Varied across 3 cuisines, fits your $80 week.');
  });
  it('summarizeDrop truncates a long explanation', () => {
    const long = 'x'.repeat(200);
    const out = summarizeDrop(result({ explanation: long }));
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith('…')).toBe(true);
  });
  it('summarizeDrop falls back when explanation is empty', () => {
    const out = summarizeDrop(result({ explanation: '', slots: [aslot(recipe('a')), aslot(recipe('b'))] }));
    expect(out).toContain('2 dinners');
  });
});

describe('MIN_FILL', () => {
  it('is a sensible cold-start threshold', () => {
    expect(MIN_FILL).toBeGreaterThanOrEqual(1);
    expect(MIN_FILL).toBeLessThanOrEqual(7);
  });
});
