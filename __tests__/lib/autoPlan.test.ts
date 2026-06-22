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
    tunings: over.tunings,
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

describe('autoPlanWeek — swap alternates', () => {
  it('populates alternates per filled slot, capped at 8 and excluding the chosen recipe', () => {
    const catalog = Array.from({ length: 20 }, (_, i) => mr({ id: `r${i}` }));
    const res = run(catalog);
    for (const s of filled(res)) {
      expect(Array.isArray(s.alternates)).toBe(true);
      expect(s.alternates!.length).toBeGreaterThan(0);
      expect(s.alternates!.length).toBeLessThanOrEqual(8);
      // the slot's own pick is never offered as its own alternate
      expect(s.alternates!.some((a) => a.id === s.recipe!.id)).toBe(false);
    }
  });

  it('alternates only contain recipes that fit the slot meal type', () => {
    const dinners = Array.from({ length: 10 }, () => mr({ mealTypes: ['dinner'] }));
    const lunches = Array.from({ length: 10 }, () => mr({ mealTypes: ['lunch'] }));
    const res = run([...lunches, ...dinners]);
    for (const s of filled(res)) {
      expect(s.alternates!.every((a) => (a.meal_types ?? []).includes('dinner'))).toBe(true);
    }
  });

  it('thin catalog yields few/zero alternates without crashing', () => {
    const res = run(Array.from({ length: 8 }, () => mr())); // 7 slots, 1 spare
    const last = filled(res)[filled(res).length - 1];
    expect(last.alternates!.length).toBeLessThanOrEqual(1);
  });
});

describe('autoPlanWeek — whole-week tuning bias', () => {
  // Local builder so we can set macros/time/cost precisely without touching `mr`.
  function tr(over: Record<string, any> & { id: string }): Recipe {
    return {
      supabase_id: over.id, external_id: over.id, title: over.id,
      cuisine: null, meal_types: ['dinner'], cost_per_serving: 5, macros: null,
      prep_time_mins: 30, cook_time_mins: 0, ingredients: [], dietary_tags: [], ...over,
    } as any;
  }
  const flat = () => 0.1; // constant jitter → bias is the only differentiator
  function pick(catalog: Recipe[], tunings?: any) {
    return autoPlanWeek({
      catalog, savedExternalIds: new Set(), scoreFn: () => 0,
      mealTypes: ['dinner'], days: 1, tunings, random: flat,
    }).slots[0].recipe?.id;
  }

  it('moreProtein surfaces the higher-protein dinner', () => {
    const lowP = tr({ id: 'low', macros: { protein: 10, calories: 500 } });
    const highP = tr({ id: 'high', macros: { protein: 45, calories: 500 } });
    expect(pick([lowP, highP], { moreProtein: true })).toBe('high');
  });

  it('fewerCalories surfaces the lower-calorie dinner', () => {
    const lite = tr({ id: 'lite', macros: { protein: 20, calories: 400 } });
    const heavy = tr({ id: 'heavy', macros: { protein: 20, calories: 900 } });
    expect(pick([heavy, lite], { fewerCalories: true })).toBe('lite');
  });

  it('quicker surfaces the faster dinner', () => {
    const fast = tr({ id: 'fast', prep_time_mins: 10, cook_time_mins: 5 });
    const slow = tr({ id: 'slow', prep_time_mins: 40, cook_time_mins: 30 });
    expect(pick([slow, fast], { quicker: true })).toBe('fast');
  });

  it('cheaper surfaces the cheaper dinner', () => {
    const cheap = tr({ id: 'cheap', cost_per_serving: 3 });
    const pricey = tr({ id: 'pricey', cost_per_serving: 12 });
    expect(pick([pricey, cheap], { cheaper: true })).toBe('cheap');
  });

  it('lowerCarb surfaces the lower-carb dinner', () => {
    const lowC = tr({ id: 'lowc', macros: { carbohydrates: 15, calories: 500 } });
    const highC = tr({ id: 'highc', macros: { carbohydrates: 80, calories: 500 } });
    expect(pick([highC, lowC], { lowerCarb: true })).toBe('lowc');
  });

  it('moreFibre surfaces the higher-fibre dinner', () => {
    const lowF = tr({ id: 'lowf', macros: { fibre: 2, calories: 500 } });
    const highF = tr({ id: 'highf', macros: { fibre: 15, calories: 500 } });
    expect(pick([lowF, highF], { moreFibre: true })).toBe('highf');
  });

  it('mealPrep surfaces the meal-prep-friendly dinner', () => {
    const yes = tr({ id: 'prep', meal_prep_friendly: true });
    const no = tr({ id: 'noprep', meal_prep_friendly: false });
    expect(pick([no, yes], { mealPrep: true })).toBe('prep');
  });

  it('easier surfaces the beginner-friendly dinner over a confident-chef one', () => {
    const easy = tr({ id: 'easy', skill_level: 'beginner' });
    const hard = tr({ id: 'hard', skill_level: 'confident_chef' });
    expect(pick([hard, easy], { easier: true })).toBe('easy');
  });

  it('no tunings (undefined) === empty tunings — both neutral', () => {
    const a = tr({ id: 'a', macros: { protein: 50, calories: 500 } });
    const b = tr({ id: 'b', macros: { protein: 5, calories: 500 } });
    expect(pick([a, b], undefined)).toBe(pick([a, b], {}));
  });

  it('bias is bounded — a strong taste lead still beats a mega-protein recipe', () => {
    const tasty = tr({ id: 'tasty', macros: { protein: 5, calories: 500 } });
    const mega = tr({ id: 'mega', macros: { protein: 1000, calories: 500 } });
    const res = autoPlanWeek({
      catalog: [tasty, mega], savedExternalIds: new Set(),
      scoreFn: (r) => (r.id === 'tasty' ? 10 : 0), // taste lead of +10
      mealTypes: ['dinner'], days: 1, tunings: { moreProtein: true }, random: flat,
    });
    expect(res.slots[0].recipe!.id).toBe('tasty'); // +4 cap can't override +10 taste
  });

  it('does not crash when recipes lack macros/cost/time/skill under all toggles', () => {
    const bare = tr({ id: 'bare', macros: null, cost_per_serving: null, prep_time_mins: null, cook_time_mins: null, meal_prep_friendly: null, skill_level: null });
    const allOn = { moreProtein: true, fewerCalories: true, lowerCarb: true, moreFibre: true, quicker: true, cheaper: true, mealPrep: true, easier: true };
    expect(() => pick([bare], allOn)).not.toThrow();
  });

  it('treats NaN / string macros as neutral (Number.isFinite contract, not poisoned sort)', () => {
    const good = tr({ id: 'good', macros: { carbohydrates: 15, fibre: 12 } });
    const junk = tr({ id: 'junk', macros: { carbohydrates: NaN, fibre: '9' as any } });
    // junk gets 0 bias on both toggles (never NaN) → good's positive bias wins, sort stays well-defined
    expect(pick([junk, good], { lowerCarb: true, moreFibre: true })).toBe('good');
  });
});

describe('autoPlanWeek — meal-prep (batch) mode', () => {
  const batch = { mealPrep: true } as any;

  it('plans a few distinct recipes repeated across the week (cook ~3, eat 7)', () => {
    const res = run(Array.from({ length: 12 }, () => mr()), { tunings: batch });
    expect(res.slots).toHaveLength(7);
    expect(res.slots.every((s) => s.recipe !== null)).toBe(true);
    const distinct = new Set(res.slots.map((s) => s.recipe!.id));
    expect(distinct.size).toBeLessThanOrEqual(3); // ~one cook per 2-3 dinners
    expect(distinct.size).toBeGreaterThanOrEqual(1);
    expect(res.generateNeeded).toBe(0);
    expect(res.slots.every((s) => s.provenance === 'auto_plan')).toBe(true);
  });

  it('uses normal per-day servings (repetition + grocery scaling provides coverage, not a 2× multiplier)', () => {
    const res = run(Array.from({ length: 8 }, () => mr()), { tunings: batch });
    expect(res.slots.every((s) => s.servingsMultiplier === undefined)).toBe(true);
  });

  it('marks the first day of each batch block as a cook day; the rest are leftovers', () => {
    const res = run(Array.from({ length: 8 }, () => mr()), { tunings: batch });
    const cookDays = res.slots.filter((s) => s.explanation.startsWith('Cook once'));
    const fromBatch = res.slots.filter((s) => s.explanation === 'From your batch');
    expect(cookDays.length).toBeGreaterThanOrEqual(2);
    expect(cookDays.length).toBeLessThanOrEqual(3);
    expect(cookDays.length + fromBatch.length).toBe(7); // every filled slot is one or the other
  });

  it('only batches recipes that fit the slot meal type', () => {
    const dinners = Array.from({ length: 6 }, () => mr({ mealTypes: ['dinner'] }));
    const lunches = Array.from({ length: 6 }, () => mr({ mealTypes: ['lunch'] }));
    const res = run([...lunches, ...dinners], { tunings: batch });
    expect(res.slots.every((s) => (s.recipe!.meal_types ?? []).includes('dinner'))).toBe(true);
  });

  it('varies the few recipes across cuisines when possible', () => {
    const italians = Array.from({ length: 8 }, () => mr({ cuisine: 'Italian', score: 5 }));
    const thais = Array.from({ length: 8 }, () => mr({ cuisine: 'Thai', score: 4 }));
    const res = run([...italians, ...thais], { tunings: batch });
    const cuisines = new Set(res.slots.map((s) => (s.recipe!.cuisine ?? '').toLowerCase()));
    expect(cuisines.size).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic for the same seed', () => {
    const catalog = Array.from({ length: 12 }, (_, i) => mr({ id: `r${i}` }));
    const a = run(catalog, { tunings: batch, random: mulberry32(9) });
    const b = run(catalog, { tunings: batch, random: mulberry32(9) });
    expect(a.slots.map((s) => s.recipe?.id)).toEqual(b.slots.map((s) => s.recipe?.id));
  });

  it('empty catalog → all slots need generation', () => {
    const res = run([], { tunings: batch });
    expect(res.slots.every((s) => s.recipe === null)).toBe(true);
    expect(res.generateNeeded).toBe(7);
  });
});
