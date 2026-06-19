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

import type { Recipe, AutoPlanInput, AutoPlanResult, AutoPlanSlot, MealType } from '@/types';

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
  const { catalog, savedExternalIds, scoreFn, mealTypes, days, weeklyBudgetUsd, leftoversSet, random } = input;

  // Slots to fill, day-major then meal type (dinners first within a day).
  const specs: { day: number; mealType: MealType }[] = [];
  for (let day = 0; day < days; day++) {
    for (const mt of mealTypes) specs.push({ day, mealType: mt });
  }

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

    let best: Recipe | null = null;
    let bestScore = -Infinity;
    let bestLeftover: string | null = null;

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

      // Seeded jitter for deterministic tie-breaks.
      s += random() * 0.5;

      if (s > bestScore) {
        bestScore = s;
        best = r;
        bestLeftover = lo;
      }
    }

    if (!best) {
      slots.push({ day: spec.day, mealType: spec.mealType, recipe: null, provenance: 'auto_plan', explanation: '' });
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
