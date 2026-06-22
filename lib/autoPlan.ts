// lib/autoPlan.ts — the Mori+ week optimizer (the flagship engine).
//
// PURE + synchronous + seedable: no network, no Math.random / Date.now (entropy is
// injected via input.random), so it is fully unit-testable in isolation. The API endpoint
// (api/auto-plan-week.ts, I4) does the I/O, binds scoreRecipe into `scoreFn`, and decides
// whether to spend <=1 AI generation for any slot this function leaves empty.
//
// Objective: maximise summed taste score across the week, subject to HARD constraints
// (meal-type fit, no-repeat, soft +5% budget) plus SOFT shaping (cuisine + protein variety,
// macro balance, leftover chaining, saved-library preference). Greedy fill, slot by slot,
// re-scoring the remaining catalog against the week built so far — near-optimal on a 7-slot
// problem and trivially deterministic. Dietary filtering is the CALLER's job; this optimizer
// never re-adds an excluded recipe.

import type { Recipe, AutoPlanInput, AutoPlanResult, AutoPlanSlot, MealType, MealSlot, PlanTunings } from '@/types';

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Bounded per-recipe score bias from the whole-week tuning toggles. Each active toggle
 *  nudges toward recipes with that property (≈ ±4 max) so it shapes the plan without
 *  dominating taste. Missing data (no macros/cost/time) = neutral 0 for that toggle. */
function tuningBias(r: Recipe, t?: PlanTunings): number {
  if (!t) return 0;
  let b = 0;
  const m = r.macros;
  // Number.isFinite (not `!= null`) so a NaN/string from a malformed JSONB macro can't
  // poison the candidate's score → NaN → an undefined sort order. Mirrors the macro-balance
  // term's `kcal > 0` guard. Missing/garbage data = neutral 0 for that toggle.
  if (t.moreProtein && Number.isFinite(m?.protein)) b += clamp(((m!.protein as number) - 25) / 8, 0, 4);
  if (t.fewerCalories && Number.isFinite(m?.calories)) b += clamp((650 - (m!.calories as number)) / 120, -2, 4);
  if (t.lowerCarb && Number.isFinite(m?.carbohydrates)) b += clamp((45 - (m!.carbohydrates as number)) / 15, -2, 4);
  if (t.moreFibre && Number.isFinite(m?.fibre)) b += clamp(((m!.fibre as number) - 6) / 3, 0, 4);
  if (t.quicker) {
    const tt = (r.prep_time_mins ?? 0) + (r.cook_time_mins ?? 0);
    if (tt > 0) b += clamp((35 - tt) / 12, -2, 4);
  }
  if (t.cheaper && Number.isFinite(r.cost_per_serving)) b += clamp((7 - (r.cost_per_serving as number)) / 2, -2, 4);
  if (t.mealPrep && r.meal_prep_friendly === true) b += 2.5;
  if (t.easier) {
    if (r.skill_level === 'beginner') b += 2.5;
    else if (r.skill_level === 'confident_chef') b -= 2.5;
  }
  return b;
}

// Coarse primary-protein keywords for the variety penalty. First match wins; order matters
// (specific before generic). 'other' = no protein detected → no variety penalty applied.
const PROTEIN_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['chicken', ['chicken']],
  ['beef', ['beef', 'steak', 'sirloin', 'brisket']],
  ['pork', ['pork', 'bacon', 'ham', 'sausage', 'chorizo', 'prosciutto']],
  ['lamb', ['lamb']],
  ['turkey', ['turkey']],
  ['seafood', ['salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'tilapia', 'fish', 'crab', 'scallop', 'mussel', 'clam', 'squid', 'octopus']],
  ['egg', ['egg']],
  ['tofu', ['tofu', 'tempeh', 'seitan']],
  ['beans', ['lentil', 'chickpea', 'black bean', 'kidney bean', 'cannellini', 'bean']],
];

// How many next-best candidates to keep per slot for one-tap swapping.
const MAX_ALTERNATES = 8;

const recipeId = (r: Recipe): string => r.supabase_id ?? r.external_id ?? r.id ?? '';
const savedKey = (r: Recipe): string => r.external_id ?? r.supabase_id ?? r.id ?? '';
const recipeMealTypes = (r: Recipe): string[] => (Array.isArray(r.meal_types) ? r.meal_types : []);
const primaryCuisine = (r: Recipe): string => ((r.cuisine ?? '').split(',')[0] ?? '').trim().toLowerCase();

function recipeText(r: Recipe): string {
  const ings = (r.ingredients ?? []) as { name?: string }[];
  const ingText = ings.map((i) => i?.name ?? '').join(' ');
  return `${r.title ?? ''} ${ingText}`.toLowerCase();
}

function primaryProtein(r: Recipe): string {
  const text = recipeText(r);
  for (const [label, kws] of PROTEIN_KEYWORDS) {
    if (kws.some((kw) => text.includes(kw))) return label;
  }
  return 'other';
}

/** The first still-available leftover ingredient this recipe uses, or null. Substring match
 *  in both directions (mirrors the scorer's leftover logic). */
function usesLeftover(r: Recipe, remaining: Set<string>): string | null {
  if (remaining.size === 0) return null;
  const ings = (r.ingredients ?? []) as { name?: string }[];
  for (const ing of ings) {
    const name = ing?.name?.toLowerCase();
    if (!name) continue;
    for (const lo of remaining) {
      if (lo && (name.includes(lo) || lo.includes(name))) return lo;
    }
  }
  return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function autoPlanWeek(input: AutoPlanInput): AutoPlanResult {
  const { catalog, savedExternalIds, scoreFn, mealTypes, days, weeklyBudgetUsd, leftoversSet, tunings, random } = input;

  // Slots to fill, day-major then meal type (dinners first within a day).
  const specs: { day: number; mealType: MealType }[] = [];
  for (let day = 0; day < days; day++) {
    for (const mt of mealTypes) specs.push({ day, mealType: mt });
  }

  // Meal-prep mode: plan a FEW recipes cooked in big batches, repeated across the week
  // (cook 3 things, eat all week, with leftover lunches) — the opposite of the default
  // variety-first fill. Triggered by the "Meal prep" toggle.
  if (tunings?.mealPrep) return batchPlanWeek(input, specs);

  const used = new Set<string>();
  const cuisineCount = new Map<string, number>();
  const proteinCount = new Map<string, number>();
  // Mutable copy: each leftover is "used up" once it's chained, so the +2 can't over-stack.
  const remainingLeftovers = leftoversSet ? new Set(leftoversSet) : new Set<string>();

  const hasBudget = typeof weeklyBudgetUsd === 'number' && weeklyBudgetUsd > 0;
  const budgetCap = hasBudget ? (weeklyBudgetUsd as number) * 1.05 : Infinity;

  const slots: AutoPlanSlot[] = [];
  let totalCost = 0;
  let totalKcal = 0;
  let filledCount = 0;
  let savedUsed = 0;
  let leftoverUsed = 0;

  for (const spec of specs) {
    const candidates = catalog.filter((r) => {
      if (used.has(recipeId(r))) return false;                         // no-repeat
      if (!recipeMealTypes(r).includes(spec.mealType)) return false;   // meal-type fit
      if (totalCost + (r.cost_per_serving ?? 0) > budgetCap) return false; // hard +5% cap
      return true;
    });

    if (candidates.length === 0) {
      slots.push({ day: spec.day, mealType: spec.mealType, recipe: null, provenance: 'auto_plan', explanation: '' });
      continue;
    }

    // Score every candidate, then sort so we can take the best AND keep the next-best
    // as swap alternates. Stable sort + seeded jitter keeps this deterministic.
    const scored: { recipe: Recipe; score: number; leftover: string | null }[] = [];
    for (const r of candidates) {
      let s = scoreFn(r);

      // Saved-library preference — the user already likes these.
      if (savedExternalIds.has(savedKey(r))) s += 2;

      // Cuisine variety — discourage a 3rd+ recipe of the same cuisine across the week.
      const cz = primaryCuisine(r);
      if (cz) {
        const c = cuisineCount.get(cz) ?? 0;
        if (c >= 2) s -= 2 * (c - 1);
      }

      // Protein variety — discourage a 3rd+ recipe of the same primary protein.
      const pr = primaryProtein(r);
      if (pr !== 'other') {
        const c = proteinCount.get(pr) ?? 0;
        if (c >= 2) s -= 3 * (c - 1);
      }

      // Macro balance — discourage a recipe much heavier than the week's running average,
      // so the plan doesn't skew all-heavy. No effect on the first placement (no average yet).
      const kcal = r.macros?.calories ?? 0;
      if (kcal > 0 && filledCount > 0) {
        const avg = totalKcal / filledCount;
        if (avg > 0 && kcal > avg * 1.3) s -= Math.min((kcal - avg * 1.3) / 100, 3);
      }

      // Leftover chaining — reward using up an active leftover (each used once; see remaining).
      const lo = usesLeftover(r, remainingLeftovers);
      if (lo) s += 2;

      // Whole-week tuning toggles (protein / calories / carbs / fibre / time / cost /
      // meal-prep / easy) — bounded biases applied per candidate.
      s += tuningBias(r, tunings);

      // Seeded jitter for deterministic tie-breaks.
      s += random() * 0.5;

      scored.push({ recipe: r, score: s, leftover: lo });
    }

    // Stable descending sort: scored[0] is the top pick and the tail becomes the swap
    // alternates. The per-candidate jitter (random()*0.5) is the real tie-breaker; for the
    // degenerate zero-jitter case the stable sort preserves first-occurrence-of-max order.
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0] ?? null;
    const best: Recipe | null = top?.recipe ?? null;
    const bestLeftover: string | null = top?.leftover ?? null;
    const alternates = scored.slice(1, 1 + MAX_ALTERNATES).map((x) => x.recipe);

    if (!best) {
      slots.push({ day: spec.day, mealType: spec.mealType, recipe: null, provenance: 'auto_plan', explanation: '', alternates: [] });
      continue;
    }

    // Commit the pick + update running state.
    used.add(recipeId(best));
    const cz = primaryCuisine(best);
    if (cz) cuisineCount.set(cz, (cuisineCount.get(cz) ?? 0) + 1);
    const pr = primaryProtein(best);
    if (pr !== 'other') proteinCount.set(pr, (proteinCount.get(pr) ?? 0) + 1);
    totalCost += best.cost_per_serving ?? 0;
    totalKcal += best.macros?.calories ?? 0;
    filledCount++;
    const isSaved = savedExternalIds.has(savedKey(best));
    if (isSaved) savedUsed++;
    if (bestLeftover) {
      leftoverUsed++;
      remainingLeftovers.delete(bestLeftover); // use it up — don't reward the same leftover twice
    }

    slots.push({
      day: spec.day,
      mealType: spec.mealType,
      recipe: best,
      provenance: 'auto_plan',
      explanation: explainSlot(best, isSaved, bestLeftover),
      alternates,
    });
  }

  const generateNeeded = slots.filter((s) => s.recipe === null).length;
  const overBudget = hasBudget && totalCost > (weeklyBudgetUsd as number);
  const explanation = buildExplanation({
    filledCount,
    cuisines: cuisineCount.size,
    savedUsed,
    leftoverUsed,
    weeklyBudgetUsd: hasBudget ? (weeklyBudgetUsd as number) : null,
    overBudget,
    generateNeeded,
  });

  return { slots, generateNeeded, totalCost: round2(totalCost), overBudget, explanation };
}

/**
 * Meal-prep ("batch") week: pick a FEW distinct recipes (varied among themselves) and repeat each
 * across a consecutive block of days — so the user cooks ~3 times and eats all week. Each block is
 * cooked in one session; the recipe's own serving size + the grocery scaling (per-slot count, see
 * handleAddAllToGrocery) provide the leftover coverage, so we do NOT additionally multiply servings
 * (that would over-buy). Reuses the same taste scorer + tuning bias for SELECTION; only the
 * ASSIGNMENT differs from the default no-repeat variety fill.
 */
function batchPlanWeek(input: AutoPlanInput, specs: { day: number; mealType: MealType }[]): AutoPlanResult {
  const { catalog, savedExternalIds, scoreFn, weeklyBudgetUsd, leftoversSet, tunings, random } = input;
  const mealType = specs[0]?.mealType ?? 'dinner';
  // Batch mode is single-meal-type (v1 = dinner). Only fill slots of that type; any other-type slots
  // stay empty so a dinner recipe can never leak into a lunch/breakfast slot (the selection only
  // vetted `mealType`). Normal mode re-checks meal-type per slot; batch must mirror that guarantee.
  const targetSpecs = specs.filter((sp) => sp.mealType === mealType);
  const otherSpecs = specs.filter((sp) => sp.mealType !== mealType);
  const totalSlots = targetSpecs.length;
  // ~one cook per 2–3 dinners → 3 recipes for a 7-day week. Bounded 2–4.
  const distinctTarget = Math.max(2, Math.min(4, Math.round(totalSlots / 2.5)));

  // Select distinct recipes greedily, with STRONG variety among the few we pick.
  const selected: Recipe[] = [];
  const usedIds = new Set<string>();
  const cuisineCount = new Map<string, number>();
  const proteinCount = new Map<string, number>();
  const remainingLeftovers = leftoversSet ? new Set(leftoversSet) : new Set<string>();

  for (let k = 0; k < distinctTarget; k++) {
    let best: Recipe | null = null;
    let bestScore = -Infinity;
    let bestLeftover: string | null = null;
    for (const r of catalog) {
      if (usedIds.has(recipeId(r))) continue;
      if (!recipeMealTypes(r).includes(mealType)) continue;
      let s = scoreFn(r);
      if (savedExternalIds.has(savedKey(r))) s += 2;
      const cz = primaryCuisine(r);
      if (cz && (cuisineCount.get(cz) ?? 0) >= 1) s -= 2 * (cuisineCount.get(cz) ?? 0); // varied across the few
      const pr = primaryProtein(r);
      if (pr !== 'other' && (proteinCount.get(pr) ?? 0) >= 1) s -= 3 * (proteinCount.get(pr) ?? 0);
      const lo = usesLeftover(r, remainingLeftovers);
      if (lo) s += 2;
      s += tuningBias(r, tunings);
      s += random() * 0.5;
      if (s > bestScore) { bestScore = s; best = r; bestLeftover = lo; }
    }
    if (!best) break;
    selected.push(best);
    usedIds.add(recipeId(best));
    const cz = primaryCuisine(best);
    if (cz) cuisineCount.set(cz, (cuisineCount.get(cz) ?? 0) + 1);
    const pr = primaryProtein(best);
    if (pr !== 'other') proteinCount.set(pr, (proteinCount.get(pr) ?? 0) + 1);
    if (bestLeftover) remainingLeftovers.delete(bestLeftover);
  }

  // Alternates for per-day swapping = top unselected candidates of the same meal type.
  const altPool = catalog
    .filter((r) => recipeMealTypes(r).includes(mealType) && !usedIds.has(recipeId(r)))
    .map((r) => ({ r, s: scoreFn(r) + random() * 0.5 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_ALTERNATES)
    .map((x) => x.r);

  const slots: AutoPlanSlot[] = [];
  let totalCost = 0;
  // Non-target meal-type slots (none in v1's dinner-only plan) are left empty for manual fill.
  for (const sp of otherSpecs) {
    slots.push({ day: sp.day, mealType: sp.mealType, recipe: null, provenance: 'auto_plan', explanation: '', alternates: [] });
  }

  if (selected.length === 0) {
    for (const sp of targetSpecs) {
      slots.push({ day: sp.day, mealType: sp.mealType, recipe: null, provenance: 'auto_plan', explanation: '', alternates: [] });
    }
    return {
      slots,
      generateNeeded: slots.length,
      totalCost: 0,
      overBudget: false,
      explanation: "We couldn't find meal-prep recipes that fit. Try saving a few more, then build again.",
    };
  }

  // Tile the selected recipes across the target slots in consecutive blocks (cook once, eat the block).
  const n = selected.length;
  const base = Math.floor(totalSlots / n);
  const rem = totalSlots % n;
  let slotIdx = 0;
  for (let i = 0; i < n; i++) {
    const blockSize = base + (i < rem ? 1 : 0);
    const recipe = selected[i];
    for (let d = 0; d < blockSize; d++) {
      const spec = targetSpecs[slotIdx++];
      totalCost += recipe.cost_per_serving ?? 0; // one portion per planned day; grocery scales by slot count
      slots.push({
        day: spec.day,
        mealType: spec.mealType,
        recipe,
        provenance: 'auto_plan',
        explanation: d === 0
          ? `Cook once · covers ${blockSize} day${blockSize > 1 ? 's' : ''}`
          : 'From your batch',
        alternates: altPool.slice(),
      });
    }
  }

  const filledCount = slots.filter((s) => s.recipe !== null).length;
  const generateNeeded = slots.filter((s) => s.recipe === null).length;
  const hasBudget = typeof weeklyBudgetUsd === 'number' && weeklyBudgetUsd > 0;
  const overBudget = hasBudget && totalCost > (weeklyBudgetUsd as number);
  let explanation = n === 1
    ? `Only one batch recipe fit your filters — save a few more for variety. We're repeating it across ${filledCount} dinner${filledCount !== 1 ? 's' : ''}.`
    : `Meal-prep week — ${n} recipes, each cooked once in a big batch and repeated across ${filledCount} dinner${filledCount !== 1 ? 's' : ''}.`;
  if (hasBudget) explanation += overBudget ? ` Slightly over your $${weeklyBudgetUsd} week.` : ` Fits your $${weeklyBudgetUsd} week.`;

  return { slots, generateNeeded, totalCost: round2(totalCost), overBudget, explanation };
}

/**
 * One-tap "swap to next best": return the first alternate whose recipe isn't already used
 * elsewhere in the week, or null when the slot has no free alternate left. PURE.
 */
export function nextSlotAlternate(
  alternates: Recipe[] | undefined,
  usedSupabaseIds: Set<string>,
): Recipe | null {
  for (const alt of alternates ?? []) {
    const id = alt?.supabase_id;
    if (id && !usedSupabaseIds.has(id)) return alt;
  }
  return null;
}

/**
 * Map optimizer output → persistable MealSlots (the bridge into mealPlanStore / meal_plans).
 * PURE. Three deliberate rules:
 *   1. Drop slots with no recipe (generateNeeded — nothing to persist).
 *   2. Map to the recipe's REAL Supabase UUID (`recipe.supabase_id`), NEVER `recipe.id` — id is
 *      the external/TheMealDB id for seeded recipes, and `meal_plans.slots.recipe_id` must match
 *      `recipes.id` so getRecipesBySupabaseIds() can hydrate it. A recipe lacking supabase_id is
 *      dropped rather than persisted with an unhydratable id (a dropped slot beats a "ghost" slot).
 *   3. Default servings_multiplier to 1; carry provenance + the per-slot explanation through.
 */
export function autoSlotsToStoreSlots(slots: AutoPlanSlot[]): MealSlot[] {
  const out: MealSlot[] = [];
  for (const s of slots) {
    const supabaseId = s.recipe?.supabase_id;
    if (!supabaseId) continue;
    out.push({
      day: s.day,
      meal_type: s.mealType,
      recipe_id: supabaseId,
      servings_multiplier: s.servingsMultiplier && s.servingsMultiplier > 0 ? s.servingsMultiplier : 1,
      provenance: s.provenance,
      auto_explanation: s.explanation || null,
    });
  }
  return out;
}

function explainSlot(r: Recipe, isSaved: boolean, leftover: string | null): string {
  if (leftover) return `Uses your leftover ${leftover}`;
  if (isSaved) return 'One of your saved favourites';
  const cz = ((r.cuisine ?? '').split(',')[0] ?? '').trim();
  return cz ? `Taste match · ${cz}` : 'Taste match';
}

function buildExplanation(x: {
  filledCount: number;
  cuisines: number;
  savedUsed: number;
  leftoverUsed: number;
  weeklyBudgetUsd: number | null;
  overBudget: boolean;
  generateNeeded: number;
}): string {
  const parts: string[] = [];
  if (x.savedUsed > 0) parts.push(`built around ${x.savedUsed} of your saved favourite${x.savedUsed > 1 ? 's' : ''}`);
  if (x.cuisines >= 2) parts.push(`kept dinners varied across ${x.cuisines} cuisines`);
  if (x.leftoverUsed > 0) parts.push(`used ${x.leftoverUsed} leftover${x.leftoverUsed > 1 ? 's' : ''} you already have`);

  let head = parts.length
    ? `We ${parts.join(', ')}.`
    : `We picked ${x.filledCount} dinner${x.filledCount === 1 ? '' : 's'} we think you'll love.`;

  if (x.weeklyBudgetUsd != null) {
    head += x.overBudget ? ` Slightly over your $${x.weeklyBudgetUsd} week.` : ` Fits your $${x.weeklyBudgetUsd} week.`;
  }
  if (x.generateNeeded > 0) {
    head += ` ${x.generateNeeded} slot${x.generateNeeded > 1 ? 's' : ''} need a fresh recipe.`;
  }
  return head;
}
