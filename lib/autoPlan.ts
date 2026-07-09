// lib/autoPlan.ts — the Mori+ week optimizer (the flagship engine).
//
// PURE + synchronous + seedable: no network, no Math.random / Date.now (entropy is
// injected via input.random), so it is fully unit-testable in isolation. The API endpoint
// (api/auto-plan-week.ts, I4) does the I/O, binds scoreRecipe into `scoreFn`, and decides
// whether to spend <=1 AI generation for any slot this function leaves empty.
//
// Objective: maximise summed taste score across the week, subject to HARD constraints
// (meal-type fit, no-repeat, soft +5% budget) plus SOFT shaping (cuisine variety + protein cohesion,
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

// Coarse primary-protein keywords for protein cohesion (reuse bonus) + the batch anti-monotony
// guard. First match wins; order matters (specific before generic). 'other' = no protein detected
// → neutral (a recipe with no clear protein neither earns the reuse bonus nor anchors the week).
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

// Protein COHESION (always on, every planning mode): a soft per-recipe bonus for reusing a protein
// already chosen this week, so the user buys one protein in bulk and cooks it across several days
// (cheaper, less food waste — a deliberate edge over variety-maxxing planners). Capped + tapered so
// the week clusters around a couple of proteins instead of collapsing to seven identical dinners.
// Soft by spec — a nudge, NOT a hard filter; a strong taste lead still wins.
const PROTEIN_COHESION = 1.5;       // bonus once a protein has appeared at least once this week
const PROTEIN_MONOTONY_TAPER = 2;   // penalty per extra dinner once one protein dominates (past ~4)

// Meal-prep picks only ~3 recipes, so taking the strict best each time made every Shuffle identical
// for a real (distinctly-scored) catalog. Sampling each pick from the top-N keeps quality high while
// making Shuffle actually produce a different batch.
const BATCH_SHUFFLE_POOL = 5;

// The normal weekly fill had the SAME identical-output failure (strict argmax per slot, jitter far
// smaller than the stable score gaps) — every Sunday Drop / Build-my-week converged on the same
// recipes. planWeekFromInputs passes this as shufflePool so each slot samples from the top-3
// (7 sequential picks vs batch's 3, so a tighter pool keeps quality high). Callers that need the
// legacy strict argmax (shaping tests) pass shufflePool: 1.
export const WEEKLY_SHUFFLE_POOL = 3;

const recipeId = (r: Recipe): string => r.supabase_id ?? r.external_id ?? r.id ?? '';
const savedKey = (r: Recipe): string => r.external_id ?? r.supabase_id ?? r.id ?? '';
const recipeMealTypes = (r: Recipe): string[] => (Array.isArray(r.meal_types) ? r.meal_types : []);
const primaryCuisine = (r: Recipe): string => ((r.cuisine ?? '').split(',')[0] ?? '').trim().toLowerCase();

function recipeText(r: Recipe): string {
  const ings = (r.ingredients ?? []) as { name?: string }[];
  const ingText = ings.map((i) => i?.name ?? '').join(' ');
  return `${r.title ?? ''} ${ingText}`.toLowerCase();
}

// Phrases that trip the coarse substring match but are NOT the dish's protein — stripped before
// detection so cohesion clusters the RIGHT protein. ('chicken stock' in a beef braise, 'fish sauce'
// in a Thai chicken stir-fry, 'eggplant' (a veg) matching 'egg', 'green bean' matching 'bean'.)
const PROTEIN_FALSE_POSITIVES = /\b(chicken|beef|vegetable) (stock|broth|bouillon)\b|\bfish sauce\b|\beggplant\b|\bgreen beans?\b/g;

export function primaryProtein(r: Recipe): string {
  const text = recipeText(r).replace(PROTEIN_FALSE_POSITIVES, ' ');
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
  const startDay = Math.max(0, input.startDay ?? 0);
  const proteinMode = input.proteinMode ?? 'cohesion';

  // Slots to fill, day-major then meal type (dinners first within a day). Starts at startDay so
  // past days (e.g. Monday when it's Tuesday) are never planned.
  const specs: { day: number; mealType: MealType }[] = [];
  for (let day = startDay; day < days; day++) {
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

  // Cross-week repeat cap ("mostly fresh, 1–2 anchors"). This is a whole-plan slot-fill
  // constraint of the same class as the within-week `used` set / locked-slot exclusion —
  // NOT a per-recipe taste signal (those stay graded penalties in scoreRecipe, per the
  // no-binary-scoring commandment). Once the budget is spent, later slots prefer fresh
  // candidates, falling back to the full list rather than leaving a slot empty.
  const historyIds = input.recentlyPlannedIds;
  const maxHistoryRepeats = input.maxHistoryRepeats ?? Infinity;
  let historyUsed = 0;

  const shufflePool = Math.max(1, Math.floor(input.shufflePool ?? 1));

  const slots: AutoPlanSlot[] = [];
  let totalCost = 0;
  let totalKcal = 0;
  let filledCount = 0;
  let savedUsed = 0;
  let leftoverUsed = 0;

  for (const spec of specs) {
    let candidates = catalog.filter((r) => {
      if (used.has(recipeId(r))) return false;                         // no-repeat
      if (!recipeMealTypes(r).includes(spec.mealType)) return false;   // meal-type fit
      if (totalCost + (r.cost_per_serving ?? 0) > budgetCap) return false; // hard +5% cap
      return true;
    });

    if (historyIds && historyUsed >= maxHistoryRepeats) {
      const fresh = candidates.filter((r) => !historyIds.has(recipeId(r)));
      if (fresh.length > 0) candidates = fresh; // thin-pool fallback: never empty a slot for freshness
    }

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

      // Protein cohesion (default) — gently reward reusing a protein already chosen this week
      // (bulk-buy, less waste), with a taper so it clusters around a couple of proteins rather than
      // going all-one-protein (when an alternative protein exists in the pool; a single-protein
      // catalog still fills the week). Cuisine variety (above) still spreads flavours, so "same
      // protein, different cuisines" is the natural result. 'variety'-eating-style users instead get
      // the original spread-them-out nudge so we honour their explicit preference.
      const pr = primaryProtein(r);
      if (pr !== 'other') {
        const c = proteinCount.get(pr) ?? 0;        // times this protein already placed this week
        if (proteinMode === 'variety') {
          if (c >= 2) s -= 3 * (c - 1);             // discourage a 3rd+ of the same protein
        } else {
          if (c >= 1) s += PROTEIN_COHESION;
          if (c >= 4) s -= (c - 3) * PROTEIN_MONOTONY_TAPER;
        }
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

    // Stable descending sort, then SAMPLE the pick from the top-shufflePool candidates
    // (the batch-mode fix, applied to the weekly fill) so equal-quality weeks differ run to
    // run. shufflePool 1 skips the rng draw entirely — byte-identical to the old argmax.
    // The unpicked head + tail become the swap alternates.
    scored.sort((a, b) => b.score - a.score);
    const poolN = Math.min(shufflePool, scored.length);
    // clamp guards a pathological injected rng returning exactly 1.0 (Math.random never does)
    // from indexing past the pool and nulling the slot.
    const pickIdx = poolN <= 1 ? 0 : Math.min(Math.floor(random() * poolN), poolN - 1);
    const top = scored[pickIdx] ?? null;
    const best: Recipe | null = top?.recipe ?? null;
    const bestLeftover: string | null = top?.leftover ?? null;
    const alternates = scored
      .filter((_, i) => i !== pickIdx)
      .slice(0, MAX_ALTERNATES)
      .map((x) => x.recipe);

    if (!best) {
      slots.push({ day: spec.day, mealType: spec.mealType, recipe: null, provenance: 'auto_plan', explanation: '', alternates: [] });
      continue;
    }

    // Commit the pick + update running state.
    used.add(recipeId(best));
    if (historyIds?.has(recipeId(best))) historyUsed++;
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

  // Select a few recipes, clustering protein (cohesion) + varying cuisine among them, but SAMPLED
  // from the top candidates so Shuffle changes the batch.
  const selected: Recipe[] = [];
  const usedIds = new Set<string>();
  const cuisineCount = new Map<string, number>();
  const proteinCount = new Map<string, number>();
  const remainingLeftovers = leftoversSet ? new Set(leftoversSet) : new Set<string>();

  for (let k = 0; k < distinctTarget; k++) {
    const scored: { r: Recipe; s: number; lo: string | null }[] = [];
    for (const r of catalog) {
      if (usedIds.has(recipeId(r))) continue;
      if (!recipeMealTypes(r).includes(mealType)) continue;
      let s = scoreFn(r);
      if (savedExternalIds.has(savedKey(r))) s += 2;
      const cz = primaryCuisine(r);
      if (cz && (cuisineCount.get(cz) ?? 0) >= 1) s -= 2 * (cuisineCount.get(cz) ?? 0); // varied across the few
      // Meal-prep protein cohesion: actively REUSE one protein across the few batch recipes — the
      // whole point of batch cooking is buying one protein in bulk. Soft (a strong taste lead can
      // still bring in a 2nd protein) and the cuisine spread above keeps them tasting different
      // ("chicken, 3 ways"). Meal prep always clusters, regardless of eating_style — toggling batch
      // IS the bulk-cook choice.
      const pr = primaryProtein(r);
      if (pr !== 'other' && (proteinCount.get(pr) ?? 0) >= 1) s += PROTEIN_COHESION;
      const lo = usesLeftover(r, remainingLeftovers);
      if (lo) s += 2;
      s += tuningBias(r, tunings);
      scored.push({ r, s, lo });
    }
    if (scored.length === 0) break;
    // Sample from the top-N (not the strict argmax) so each Shuffle yields a different batch.
    scored.sort((a, b) => b.s - a.s);
    const pick = scored[Math.floor(random() * Math.min(BATCH_SHUFFLE_POOL, scored.length))];
    const best = pick.r;
    const bestLeftover = pick.lo;
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
 * Overlay user-locked slots (recipes the user placed themselves) onto an optimizer result so a
 * rebuild KEEPS the user's own picks for those days, labelled 'You added this' (provenance 'manual').
 * The caller must also exclude the locked recipes from the optimizer's pool so they don't get
 * duplicated on other days. The locked slot keeps the auto slot's `alternates` so it's still
 * swappable. Recomputes totalCost + generateNeeded over the merged week. PURE.
 */
export function mergeLockedSlots(
  result: AutoPlanResult,
  lockedSlots: { day: number; recipe: Recipe }[],
  weeklyBudgetUsd?: number | null,
): AutoPlanResult {
  if (!lockedSlots.length) return result;
  const lockedByDay = new Map<number, Recipe>();
  for (const ls of lockedSlots) lockedByDay.set(ls.day, ls.recipe);
  let totalCost = 0;
  const slots = result.slots.map((s) => {
    const locked = lockedByDay.get(s.day);
    const out: AutoPlanSlot = locked
      ? { ...s, recipe: locked, provenance: 'manual', explanation: 'You added this' }
      : s;
    totalCost += out.recipe?.cost_per_serving ?? 0;
    return out;
  });
  const generateNeeded = slots.filter((s) => s.recipe === null).length;
  // Recompute overBudget against the MERGED cost (a pricey locked recipe can change it).
  const hasBudget = typeof weeklyBudgetUsd === 'number' && weeklyBudgetUsd > 0;
  const overBudget = hasBudget ? totalCost > (weeklyBudgetUsd as number) : result.overBudget;
  return { ...result, slots, totalCost: round2(totalCost), generateNeeded, overBudget };
}

/**
 * Apply a user's explicit recipe CHOICE to one proposal slot (the "Choose a different recipe" path
 * in the Build-my-week sheet). Returns a NEW slots array with the chosen recipe placed at `index`,
 * labelled 'You chose this' / provenance 'manual', or null when the choice is invalid:
 *   - bad index, or
 *   - the recipe is already planned on another day this week (no duplicates).
 * The slot's previous pick is pushed onto its alternates (de-duped) so the user can still Swap back.
 * PURE — the caller owns state + any user-facing "already in your week" message. The chosen recipe
 * MUST carry supabase_id (the caller resolves it first) so the slot round-trips through persistence.
 */
export function applySlotChoice(
  slots: AutoPlanSlot[],
  index: number,
  recipe: Recipe,
): AutoPlanSlot[] | null {
  const target = slots[index];
  if (!target) return null;
  const rid = recipe.supabase_id;
  if (rid && slots.some((s, i) => i !== index && s.recipe?.supabase_id === rid)) return null; // dupe
  const old = target.recipe;
  const alternates = (target.alternates ?? []).filter((a) => a.supabase_id !== rid);
  if (old?.supabase_id && old.supabase_id !== rid) alternates.push(old);
  const newSlot: AutoPlanSlot = {
    ...target,
    recipe,
    provenance: 'manual',
    explanation: 'You chose this',
    alternates,
  };
  return slots.map((s, i) => (i === index ? newSlot : s));
}

/**
 * Place `recipe` on the chosen `days` (same meal type) of a proposal — the engine behind the
 * "Repeat across the week" day picker. Intentional duplication: the no-duplicate rule that guards
 * single picks is deliberately bypassed here. Slots NOT in `days` are untouched; each kept slot
 * keeps its own alternates so any night can still be swapped. PURE.
 */
export function setRecipeOnDays(
  slots: AutoPlanSlot[],
  mealType: MealType,
  recipe: Recipe,
  days: Set<number>,
): AutoPlanSlot[] {
  return slots.map((s) =>
    s.mealType === mealType && days.has(s.day)
      ? { ...s, recipe, provenance: 'manual' as const, explanation: 'Repeated across your week' }
      : s,
  );
}

/**
 * The UNIQUE recipes to log a positive taste signal for on accept — one per swapped-in / chosen
 * recipe, even when "Repeat across the week" placed it on several days. Iterating the slots directly
 * would log N duplicate right-swipes for a repeated recipe, skewing the persisted swipe history and
 * the cross-user Trending deck (which thresholds on right-swipe count). PURE.
 */
export function swappedInRecipesToLearn(slots: AutoPlanSlot[], swappedInIds: Set<string>): Recipe[] {
  const seen = new Set<string>();
  const out: Recipe[] = [];
  for (const s of slots) {
    const sid = s.recipe?.supabase_id;
    if (sid && swappedInIds.has(sid) && !seen.has(sid)) { seen.add(sid); out.push(s.recipe!); }
  }
  return out;
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
