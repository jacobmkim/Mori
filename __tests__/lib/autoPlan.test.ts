import { autoPlanWeek } from '@/lib/autoPlan';
import type { AutoPlanInput, Recipe } from '@/types';

// Deterministic seeded RNG so jitter-driven tie-breaks are reproducible.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idc = 0;
beforeEach(() => { idc = 0; });

type Opt = {
  id?: string; score?: number; cuisine?: string; protein?: string;
  cost?: number; kcal?: number; mealTypes?: string[]; ingredients?: string[];
};
function mr(opt: Opt = {}): Recipe {
  const id = opt.id ?? `r${idc++}`;
  const ings = (opt.ingredients ?? (opt.protein ? [opt.protein] : [])).map((n) => ({ name: n }));
  return {
    id, supabase_id: id, external_id: id,
    title: opt.protein ? `${opt.protein} dish ${id}` : `dish ${id}`,
    cuisine: opt.cuisine ?? null,
    meal_types: opt.mealTypes ?? ['dinner'],
    cost_per_serving: opt.cost ?? 5,
    macros: opt.kcal != null ? ({ calories: opt.kcal } as any) : null,
    ingredients: ings,
    dietary_tags: [],
    _score: opt.score ?? 0,
  } as any;
}

const scoreFn = (r: Recipe) => (r as any)._score ?? 0;

function run(catalog: Recipe[], over: Partial<AutoPlanInput> = {}) {
  return autoPlanWeek({
    catalog,
    savedExternalIds: over.savedExternalIds ?? new Set(),
    scoreFn: over.scoreFn ?? scoreFn,
    mealTypes: over.mealTypes ?? ['dinner'],
    days: over.days ?? 7,
    weeklyBudgetUsd: over.weeklyBudgetUsd,
    leftoversSet: over.leftoversSet,
    random: over.random ?? mulberry32(42),
  });
}

const filled = (res: ReturnType<typeof autoPlanWeek>) => res.slots.filter((s) => s.recipe !== null);

describe('autoPlanWeek — slot filling', () => {
  it('fills 7 dinner slots with no repeats from an ample catalog', () => {
    const catalog = Array.from({ length: 12 }, () => mr());
    const res = run(catalog);
    expect(res.slots).toHaveLength(7);
    expect(filled(res)).toHaveLength(7);
    const ids = filled(res).map((s) => s.recipe!.id);
    expect(new Set(ids).size).toBe(7); // no repeats
    expect(res.generateNeeded).toBe(0);
    expect(res.slots.every((s) => s.provenance === 'auto_plan')).toBe(true);
  });

  it('leaves slots empty (generateNeeded) when the catalog is too thin', () => {
    const res = run(Array.from({ length: 5 }, () => mr()));
    expect(filled(res)).toHaveLength(5);
    expect(res.generateNeeded).toBe(2);
    expect(res.slots.filter((s) => s.recipe === null)).toHaveLength(2);
  });

  it('only fills slots with a matching meal_type (lunch-only recipes never fill a dinner slot)', () => {
    const dinners = Array.from({ length: 7 }, () => mr({ mealTypes: ['dinner'] }));
    const lunches = Array.from({ length: 5 }, () => mr({ mealTypes: ['lunch'] }));
    const res = run([...lunches, ...dinners]);
    expect(filled(res)).toHaveLength(7);
    expect(filled(res).every((s) => (s.recipe!.meal_types ?? []).includes('dinner'))).toBe(true);
  });
});

describe('autoPlanWeek — budget (soft +5% with warning)', () => {
  it('hard-stops at +5% over budget and flags overBudget when over the base', () => {
    // 7 dinners @ $7, budget $20 → cap $21. Places 3 ($21), 4th would be $28 > cap.
    const catalog = Array.from({ length: 7 }, () => mr({ cost: 7 }));
    const res = run(catalog, { weeklyBudgetUsd: 20 });
    expect(res.totalCost).toBe(21);
    expect(res.totalCost).toBeLessThanOrEqual(20 * 1.05);
    expect(filled(res)).toHaveLength(3);
    expect(res.generateNeeded).toBe(4);
    expect(res.overBudget).toBe(true); // 21 > 20
    expect(res.explanation).toContain('Slightly over your $20 week');
  });

  it('ignores cost when no budget is set', () => {
    const catalog = Array.from({ length: 7 }, () => mr({ cost: 999 }));
    const res = run(catalog); // no weeklyBudgetUsd
    expect(filled(res)).toHaveLength(7);
    expect(res.overBudget).toBe(false);
  });
});

describe('autoPlanWeek — soft shaping', () => {
  it('prefers saved-library recipes (+2 bonus)', () => {
    const saved = mr({ id: 'saved', score: 0 });
    const other = mr({ id: 'other', score: 1 });
    const res = run([other, saved], { savedExternalIds: new Set(['saved']) });
    // saved 0+2=2 beats other 1 (+/-0.5 jitter) → saved is placed first
    expect(res.slots[0].recipe!.id).toBe('saved');
    expect(res.slots[0].explanation).toBe('One of your saved favourites');
    expect(res.explanation).toContain('saved favourite');
  });

  it('chains a leftover and explains it (uses it up only once)', () => {
    const usesLO = mr({ id: 'lo', score: 0, ingredients: ['fresh spinach', 'garlic'] });
    const plain = mr({ id: 'plain', score: 1 });
    const res = run([plain, usesLO], { leftoversSet: new Set(['spinach']) });
    expect(res.slots[0].recipe!.id).toBe('lo'); // 0+2 leftover bonus beats 1
    expect(res.slots[0].explanation).toBe('Uses your leftover spinach');
    expect(res.explanation).toContain('1 leftover');
  });

  it('breaks cuisine monotony — does not fill all 7 with one cuisine', () => {
    const italians = Array.from({ length: 10 }, () => mr({ cuisine: 'Italian', score: 5 }));
    const thais = Array.from({ length: 10 }, () => mr({ cuisine: 'Thai', score: 4 }));
    const res = run([...italians, ...thais]);
    const cuisines = new Set(filled(res).map((s) => (s.recipe!.cuisine ?? '').toLowerCase()));
    expect(cuisines.size).toBeGreaterThanOrEqual(2); // variety penalty pulls in Thai after 2 Italians
    const italianCount = filled(res).filter((s) => s.recipe!.cuisine === 'Italian').length;
    expect(italianCount).toBeLessThan(7);
  });

  it('breaks protein monotony — does not fill all 7 with one protein', () => {
    const chicken = Array.from({ length: 10 }, () => mr({ protein: 'chicken', score: 5 }));
    const beef = Array.from({ length: 10 }, () => mr({ protein: 'beef', score: 4 }));
    const res = run([...chicken, ...beef]);
    const chickenCount = filled(res).filter((s) => (s.recipe!.title ?? '').includes('chicken')).length;
    expect(chickenCount).toBeLessThan(7);
  });
});

describe('autoPlanWeek — determinism & robustness', () => {
  it('is byte-deterministic for the same input + seed', () => {
    const catalog = Array.from({ length: 12 }, (_, i) => mr({ id: `r${i}` }));
    const a = run(catalog, { random: mulberry32(7) });
    const b = run(catalog, { random: mulberry32(7) });
    expect(a.slots.map((s) => s.recipe?.id)).toEqual(b.slots.map((s) => s.recipe?.id));
    expect(a.explanation).toBe(b.explanation);
  });

  it('does not crash on recipes with null macros', () => {
    const catalog = Array.from({ length: 7 }, () => mr({ kcal: undefined }));
    expect(() => run(catalog)).not.toThrow();
    expect(filled(run(catalog))).toHaveLength(7);
  });

  it('handles an empty catalog (all slots need generation)', () => {
    const res = run([]);
    expect(filled(res)).toHaveLength(0);
    expect(res.generateNeeded).toBe(7);
    expect(res.totalCost).toBe(0);
  });
});
