import { autoPlanWeek, mergeLockedSlots, applySlotChoice, setRecipeOnDays, swappedInRecipesToLearn, primaryProtein } from '@/lib/autoPlan';
import type { AutoPlanInput, AutoPlanResult, AutoPlanSlot, Recipe } from '@/types';

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
    startDay: over.startDay,
    proteinMode: over.proteinMode,
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

  it('startDay skips earlier days — only plans from startDay onward (plan from today)', () => {
    const catalog = Array.from({ length: 12 }, () => mr());
    const res = run(catalog, { startDay: 2, days: 7 });
    expect(res.slots).toHaveLength(5); // days 2,3,4,5,6
    expect(res.slots.every((s) => s.day >= 2)).toBe(true);
    expect(filled(res)).toHaveLength(5);
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

  it('does not collapse to a single protein — anti-monotony taper keeps it under 7', () => {
    const chicken = Array.from({ length: 10 }, () => mr({ protein: 'chicken', score: 5 }));
    const beef = Array.from({ length: 10 }, () => mr({ protein: 'beef', score: 4 }));
    const res = run([...chicken, ...beef]);
    const chickenCount = filled(res).filter((s) => (s.recipe!.title ?? '').includes('chicken')).length;
    expect(chickenCount).toBeLessThan(7); // taper pulls in a second protein before all 7 match
  });

  it('clusters proteins (cohesion) — reuses one protein in a consecutive block, given equal taste', () => {
    // The product spec: "use similar proteins throughout the week" (buy one protein in bulk). With
    // equal taste, the week should cluster into protein blocks (e.g. chicken×4 then beef×3), NOT
    // alternate protein every night the way the old variety penalty did.
    const chicken = Array.from({ length: 6 }, (_, i) => mr({ id: `c${i}`, protein: 'chicken', score: 0 }));
    const beef = Array.from({ length: 6 }, (_, i) => mr({ id: `b${i}`, protein: 'beef', score: 0 }));
    const res = run([...chicken, ...beef]);
    const seq = filled(res).map((s) => ((s.recipe!.title ?? '').includes('chicken') ? 'c' : 'b'));
    let runs = 1;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) runs++;
    expect(runs).toBeLessThanOrEqual(2);       // two blocks, not a CBCBCBC alternation (~7 runs)
    const top = Math.max(seq.filter((p) => p === 'c').length, seq.filter((p) => p === 'b').length);
    expect(top).toBeGreaterThanOrEqual(3);     // a real cluster
    expect(top).toBeLessThan(7);               // but never fully monotone
  });

  it('protein cohesion is SOFT — a strong taste lead still beats the reuse bonus', () => {
    // Chicken locks the week's protein, but a much-tastier beef must still appear: cohesion (+1.5)
    // is a nudge, not a filter.
    const chicken = Array.from({ length: 6 }, (_, i) => mr({ id: `c${i}`, protein: 'chicken', score: 5 }));
    const tastyBeef = mr({ id: 'beef', protein: 'beef', score: 20 });
    const res = run([...chicken, tastyBeef]);
    expect(filled(res).some((s) => s.recipe!.id === 'beef')).toBe(true);
  });

  it("proteinMode 'variety' spreads proteins (honours a 'Variety is everything' user) instead of clustering", () => {
    // Same catalog as the cohesion-cluster test, but variety mode restores the spread-them-out nudge:
    // the week should INTERLEAVE proteins (many runs) rather than form 2 clean blocks.
    const chicken = Array.from({ length: 6 }, (_, i) => mr({ id: `c${i}`, protein: 'chicken', score: 5 }));
    const beef = Array.from({ length: 6 }, (_, i) => mr({ id: `b${i}`, protein: 'beef', score: 4 }));
    const res = run([...chicken, ...beef], { proteinMode: 'variety' });
    const seq = filled(res).map((s) => ((s.recipe!.title ?? '').includes('chicken') ? 'c' : 'b'));
    let runs = 1;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) runs++;
    expect(runs).toBeGreaterThanOrEqual(3); // interleaved, not the cohesion mode's <=2 blocks
  });

  it('still fills all 7 when only ONE protein exists — the taper has no alternative to promote', () => {
    // The "never 7 identical" guarantee is conditional on an alternative protein in the pool. With a
    // single-protein catalog the week is filled rather than left short (a full week beats empty slots).
    const chicken = Array.from({ length: 10 }, (_, i) => mr({ id: `c${i}`, protein: 'chicken', score: 5 }));
    expect(filled(run(chicken))).toHaveLength(7);
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

  it('clusters protein across the few batch recipes (cohesion is the ONLY force, given equal taste)', () => {
    // EQUAL scores → the cohesion bonus is the only thing that can cluster proteins. With a penalty
    // (or zero) this spreads to ~1-of-each (top protein = 1); the bonus reuses one protein (bulk-cook).
    const chicken = Array.from({ length: 6 }, (_, i) => mr({ id: `c${i}`, protein: 'chicken', score: 0 }));
    const beef = Array.from({ length: 6 }, (_, i) => mr({ id: `b${i}`, protein: 'beef', score: 0 }));
    const pork = Array.from({ length: 6 }, (_, i) => mr({ id: `p${i}`, protein: 'pork', score: 0 }));
    const res = run([...chicken, ...beef, ...pork], { tunings: batch });
    const distinctIds = [...new Set(res.slots.filter((s) => s.recipe).map((s) => s.recipe!.id))];
    const byProtein: Record<string, number> = { c: 0, b: 0, p: 0 };
    for (const id of distinctIds) byProtein[id[0]]++;
    expect(Math.max(byProtein.c, byProtein.b, byProtein.p)).toBeGreaterThanOrEqual(2); // reused, not 1-of-each
  });

  it('batch Shuffle is safe on a thin catalog (pool smaller than BATCH_SHUFFLE_POOL)', () => {
    const res = run(Array.from({ length: 3 }, (_, i) => mr({ id: `t${i}` })), { tunings: batch });
    expect(res.slots).toHaveLength(7);
    expect(res.slots.every((s) => s.recipe !== null)).toBe(true);
    const distinct = new Set(res.slots.map((s) => s.recipe!.id));
    expect(distinct.size).toBeLessThanOrEqual(3); // ≤3 distinct, tiled across the 7 slots
    expect(distinct.size).toBeGreaterThanOrEqual(1);
  });

  it('Shuffle actually varies the batch — a distinctly-scored catalog yields different batches across seeds', () => {
    // Distinct scores (gaps > the old ±0.5 jitter) so a strict-argmax batch would be identical every
    // shuffle. Top-N sampling makes reshuffles differ.
    const catalog = Array.from({ length: 12 }, (_, i) => mr({ id: `r${i}`, score: 12 - i }));
    const sets = [1, 7, 13, 21, 30, 42].map((seed) => {
      const res = run(catalog, { tunings: batch, random: mulberry32(seed) });
      return res.slots.filter((s) => s.recipe).map((s) => s.recipe!.id).sort().join(',');
    });
    expect(new Set(sets).size).toBeGreaterThan(1);
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

describe('mergeLockedSlots — keep user-placed meals on a rebuild', () => {
  const rec = (id: string, cost: number): Recipe =>
    ({ id, supabase_id: id, external_id: id, title: id, cost_per_serving: cost, meal_types: ['dinner'] } as any);
  function mkResult(): AutoPlanResult {
    return {
      slots: [
        { day: 0, mealType: 'dinner', recipe: rec('a', 5), provenance: 'auto_plan', explanation: 'Taste match', alternates: [rec('x', 5)] },
        { day: 1, mealType: 'dinner', recipe: rec('b', 5), provenance: 'auto_plan', explanation: 'Taste match', alternates: [] },
      ],
      generateNeeded: 0, totalCost: 10, overBudget: false, explanation: 'auto',
    };
  }

  it('overlays the locked recipe on its own day, labelled "You added this" / manual', () => {
    const r = mergeLockedSlots(mkResult(), [{ day: 1, recipe: rec('mine', 8) }]);
    expect(r.slots[1].recipe!.id).toBe('mine');
    expect(r.slots[1].provenance).toBe('manual');
    expect(r.slots[1].explanation).toBe('You added this');
    expect(r.slots[0].recipe!.id).toBe('a'); // other days untouched
  });

  it('keeps the slot alternates so a locked slot is still swappable', () => {
    const r = mergeLockedSlots(mkResult(), [{ day: 0, recipe: rec('mine', 5) }]);
    expect(r.slots[0].alternates).toEqual([expect.objectContaining({ id: 'x' })]);
  });

  it('recomputes totalCost over the merged week', () => {
    const r = mergeLockedSlots(mkResult(), [{ day: 1, recipe: rec('mine', 8) }]);
    expect(r.totalCost).toBe(13); // a(5) + mine(8)
  });

  it('returns the result unchanged when there are no locks', () => {
    const res = mkResult();
    expect(mergeLockedSlots(res, [])).toBe(res);
  });
});

describe('applySlotChoice — pick a specific recipe for a Build-my-week proposal slot', () => {
  const rec = (id: string): Recipe =>
    ({ id, supabase_id: id, external_id: id, title: id, meal_types: ['dinner'] } as any);
  const slot = (day: number, recipe: Recipe | null, alts: Recipe[] = []): AutoPlanSlot =>
    ({ day, mealType: 'dinner', recipe, provenance: 'auto_plan', explanation: 'Taste match', alternates: alts });

  it('replaces the slot recipe and labels it manual / "You chose this"', () => {
    const slots = [slot(0, rec('a'), [rec('x')]), slot(1, rec('b'))];
    const out = applySlotChoice(slots, 0, rec('chosen'));
    expect(out).not.toBeNull();
    expect(out![0].recipe!.id).toBe('chosen');
    expect(out![0].provenance).toBe('manual');
    expect(out![0].explanation).toBe('You chose this');
    expect(out![1].recipe!.id).toBe('b'); // other slots untouched
  });

  it('keeps the displaced pick as a swappable alternate (alongside existing alternates)', () => {
    const out = applySlotChoice([slot(0, rec('a'), [rec('x')])], 0, rec('chosen'));
    const altIds = out![0].alternates!.map((r) => r.id);
    expect(altIds).toContain('x'); // original alternates preserved
    expect(altIds).toContain('a'); // the recipe we replaced is now swappable back
  });

  it('rejects (null) a recipe already planned on another day — no duplicates', () => {
    const slots = [slot(0, rec('a')), slot(1, rec('b'))];
    expect(applySlotChoice(slots, 0, rec('b'))).toBeNull();
  });

  it('allows re-choosing the SAME recipe already in that slot, without self-duplicating alternates', () => {
    const out = applySlotChoice([slot(0, rec('a'), [rec('x')])], 0, rec('a'));
    expect(out).not.toBeNull();
    expect(out![0].recipe!.id).toBe('a');
    expect(out![0].alternates!.map((r) => r.id)).not.toContain('a'); // not pushed onto itself
  });

  it('returns null for an out-of-range index', () => {
    expect(applySlotChoice([slot(0, rec('a'))], 5, rec('z'))).toBeNull();
  });
});

describe('setRecipeOnDays — repeat a recipe onto the chosen days (day picker)', () => {
  const rec = (id: string): Recipe =>
    ({ id, supabase_id: id, external_id: id, title: id, meal_types: ['dinner'] } as any);
  const slot = (day: number, recipe: Recipe | null, mealType: any = 'dinner'): AutoPlanSlot =>
    ({ day, mealType, recipe, provenance: 'auto_plan', explanation: 'Taste match', alternates: [] });

  it('places the recipe on ONLY the chosen days (others untouched), intentional duplicate', () => {
    const slots = [slot(0, rec('a')), slot(1, rec('b')), slot(2, rec('c'))];
    const out = setRecipeOnDays(slots, 'dinner', rec('a'), new Set([0, 2]));
    expect(out.map((s) => s.recipe!.id)).toEqual(['a', 'b', 'a']); // day 1 left as 'b'
    expect(out[0].provenance).toBe('manual');
    expect(out[2].explanation).toBe('Repeated across your week');
  });

  it('only touches slots of the SAME meal type', () => {
    const slots = [slot(0, rec('a'), 'dinner'), slot(0, rec('x'), 'lunch'), slot(1, rec('b'), 'dinner')];
    const out = setRecipeOnDays(slots, 'dinner', rec('a'), new Set([0, 1]));
    expect(out.map((s) => s.recipe!.id)).toEqual(['a', 'x', 'a']); // lunch untouched
  });

  it('an empty day set is a no-op', () => {
    const slots = [slot(0, rec('a')), slot(1, rec('b'))];
    const out = setRecipeOnDays(slots, 'dinner', rec('z'), new Set());
    expect(out.map((s) => s.recipe!.id)).toEqual(['a', 'b']);
  });
});

describe('swappedInRecipesToLearn — one learn signal per chosen recipe, not per slot', () => {
  const rec = (id: string): Recipe =>
    ({ id, supabase_id: id, external_id: id, title: id, meal_types: ['dinner'] } as any);
  const slot = (day: number, recipe: Recipe | null): AutoPlanSlot =>
    ({ day, mealType: 'dinner', recipe, provenance: 'manual', explanation: '', alternates: [] });

  it('returns a REPEATED recipe only once (the Trending-pollution guard)', () => {
    const a = rec('a');
    const slots = [slot(0, a), slot(1, a), slot(2, a), slot(3, rec('b'))]; // 'a' repeated across 3 nights
    const out = swappedInRecipesToLearn(slots, new Set(['a']));
    expect(out.map((r) => r.id)).toEqual(['a']); // once, not 3×
  });

  it('only includes recipes whose id is in swappedInIds', () => {
    const out = swappedInRecipesToLearn([slot(0, rec('a')), slot(1, rec('b'))], new Set(['b']));
    expect(out.map((r) => r.id)).toEqual(['b']);
  });

  it('skips empty slots and returns [] when nothing was swapped in', () => {
    expect(swappedInRecipesToLearn([slot(0, null), slot(1, rec('a'))], new Set())).toEqual([]);
  });
});

describe('primaryProtein — protein label that drives cohesion (false-positive guards)', () => {
  const pr = (title: string, ingredients: string[] = []): string =>
    primaryProtein({ title, ingredients: ingredients.map((name) => ({ name })) } as any);

  it('detects the real protein from title or ingredients', () => {
    expect(pr('Grilled chicken bowl')).toBe('chicken');
    expect(pr('Weeknight stew', ['beef chuck', 'carrots'])).toBe('beef');
    expect(pr('Pan-seared dinner', ['salmon fillet'])).toBe('seafood');
  });

  it('does NOT label a beef dish as chicken just because it uses chicken stock/broth', () => {
    expect(pr('Braised short ribs', ['beef short ribs', 'chicken stock'])).toBe('beef');
    expect(pr('Beef stew', ['beef', 'chicken broth'])).toBe('beef');
  });

  it('does NOT label a chicken stir-fry as seafood because of fish sauce', () => {
    expect(pr('Thai basil chicken', ['chicken thigh', 'fish sauce'])).toBe('chicken');
  });

  it("does NOT label eggplant parmesan as the 'egg' protein", () => {
    expect(pr('Eggplant parmesan', ['eggplant', 'tomato', 'mozzarella'])).toBe('other');
  });

  it("does NOT label a steak-and-green-beans plate as the 'beans' protein", () => {
    expect(pr('Steak dinner', ['sirloin steak', 'green beans'])).toBe('beef');
  });

  it('returns "other" when no protein is present', () => {
    expect(pr('Garden salad', ['lettuce', 'tomato', 'cucumber'])).toBe('other');
  });
});
