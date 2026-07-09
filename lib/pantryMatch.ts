/**
 * lib/pantryMatch.ts — PURE, RN-free core of "Cook with what I have" (M8).
 *
 * Ranks the audited catalog by how much of each recipe the user can cook from
 * what's already on hand (pantry + active leftovers). Zero AI cost — this is
 * the FREE tier of the feature; constrained generation (api/generate-from-pantry)
 * is the premium layer on top.
 *
 * Semantics (deliberately shared with the rest of the app — no forks):
 *  - Matching uses the scorer's bidirectional word-containment ("chicken breast"
 *    matches "chicken breasts"), lowercased + trimmed.
 *  - Coverage is computed over NON-staple ingredients only: anything isStaple()
 *    (lib/staples.ts — the same list the Instacart send auto-skips) is assumed
 *    on-hand and can never be "missing". Salt is not a shopping decision.
 *  - Hard filters first, never soft (commandments): dietary goals + ingredient
 *    dislikes via violatesCurrentPrefs (lib/sundayDrop.ts) and the skill cap
 *    mirroring lib/weekPlanCore.ts.
 *  - Leftovers count as on-hand AND carry an urgency signal: anything spoiling
 *    within 3 days ranks its recipes first (food-waste mode).
 *  - Taste tie-break via an injectable scoreFn (the caller binds scoreRecipe
 *    with its fetched signals) so equal-coverage recipes still rank personally.
 */

import type { Recipe } from '@/types';
import { isStaple } from './staples';
import { violatesCurrentPrefs } from './sundayDrop';

export interface PantryLeftover {
  name: string;
  /** ISO timestamp; undefined/null = no spoil pressure */
  spoilsAt?: string | null;
}

export interface PantryMatchInput {
  catalog: Recipe[];
  /** Pantry item names the user confirmed on-hand this session */
  pantry: string[];
  /** Active (non-dismissed) leftovers */
  leftovers?: PantryLeftover[];
  dietaryGoals?: string[];
  ingredientDislikes?: string[];
  skillLevel?: string | null;
  cookingFrequency?: string | null;
  /** Taste tie-break — higher is better. Callers bind scoreRecipe; tests inject stubs. */
  scoreFn?: (recipe: Recipe) => number;
  /** Recipes missing more than this many ingredients aren't "cook tonight" candidates. Default 3. */
  maxMissing?: number;
  now?: number;
}

export interface PantryMatch {
  recipe: Recipe;
  /** Matched fraction of the recipe's NON-staple ingredients, 0..1 */
  coverage: number;
  /** Unmatched non-staple ingredient names — the shopping gap (drives add-to-grocery) */
  missing: string[];
  /** On-hand leftover names this recipe would use */
  usesLeftovers: string[];
  /** The subset of usesLeftovers spoiling within 3 days — "use soon" */
  urgentLeftovers: string[];
}

const URGENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Scorer-compatible bidirectional containment match. */
function matches(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

function ingredientNames(recipe: Recipe): string[] {
  return ((recipe.ingredients ?? []) as any[])
    .map((i) => (typeof i === 'string' ? i : i?.name))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .map(norm);
}

/** The skill cap from lib/weekPlanCore.ts — a pantry match the user can't cook is no match. */
function withinSkill(recipe: Recipe, skillLevel: string | null | undefined, cookingFrequency: string | null | undefined): boolean {
  if (!skillLevel) return true;
  const recipeSkill = (recipe as any).skill_level as string | null | undefined;
  if (recipeSkill === 'confident_chef' && skillLevel !== 'confident_chef') return false;
  if (recipeSkill === 'home_cook' && skillLevel === 'beginner') return false;
  if (!recipeSkill) {
    const totalTime = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);
    const beginnerCap = cookingFrequency === 'just_starting' ? 45 : 60;
    if (skillLevel === 'beginner' && totalTime > 0 && totalTime > beginnerCap) return false;
    if (skillLevel === 'home_cook' && totalTime > 0 && totalTime > 120) return false;
  }
  return true;
}

/**
 * Rank the catalog by pantry coverage. Returns only realistic "cook tonight /
 * almost there" candidates (missing ≤ maxMissing), best first. Empty pantry AND
 * empty leftovers → [] (the caller shows the pantry-setup state, never a fake list).
 */
export function rankByPantryCoverage(input: PantryMatchInput): PantryMatch[] {
  const now = input.now ?? Date.now();
  const maxMissing = input.maxMissing ?? 3;

  // Staple pantry TERMS ("salt", "pepper", "rice") never participate in matching:
  // staple ingredients are already assumed on-hand on the recipe side, and a raw
  // substring match would otherwise let pantry "pepper" cover "red bell pepper" or
  // "salt" cover "salted butter" — false "you can make tonight" claims (2026-07-04
  // audit). A staple-only pantry therefore matches nothing, by design.
  const pantryTerms = (input.pantry ?? []).map(norm).filter((t) => t && !isStaple(t));
  const leftovers = (input.leftovers ?? []).filter((l) => l?.name?.trim());
  const leftoverTerms = leftovers.map((l) => norm(l.name)).filter((t) => !isStaple(t));
  const urgentTerms = new Set(
    leftovers
      .filter((l) => {
        if (!l.spoilsAt) return false;
        const t = new Date(l.spoilsAt).getTime();
        // Already-past spoil dates are NOT "urgent" — never advertise "use it before
        // it spoils" for food that may already have. (Callers should exclude spoiled
        // leftovers from the on-hand list entirely; this is the safety net.)
        return !Number.isNaN(t) && t > now && t <= now + URGENT_WINDOW_MS;
      })
      .map((l) => norm(l.name)),
  );
  const onHand = [...pantryTerms, ...leftoverTerms];
  if (onHand.length === 0) return [];

  const results: PantryMatch[] = [];

  for (const recipe of input.catalog ?? []) {
    // Hard filters — dietary, dislikes, skill. Never surface a recipe the user
    // can't or won't eat just because it matches their fridge.
    if (violatesCurrentPrefs(recipe, input.dietaryGoals ?? [], input.ingredientDislikes ?? [])) continue;
    if (!withinSkill(recipe, input.skillLevel, input.cookingFrequency)) continue;

    const names = ingredientNames(recipe);
    if (names.length === 0) continue;

    const nonStaple = names.filter((n) => !isStaple(n));
    const missing: string[] = [];
    let matched = 0;
    const usedLeftovers = new Set<string>();
    const usedUrgent = new Set<string>();

    for (const n of nonStaple) {
      const hit = onHand.some((term) => matches(n, term));
      if (hit) {
        matched++;
        for (const lt of leftoverTerms) {
          if (matches(n, lt)) {
            usedLeftovers.add(lt);
            if (urgentTerms.has(lt)) usedUrgent.add(lt);
          }
        }
      } else {
        missing.push(n);
      }
    }

    if (missing.length > maxMissing) continue;
    // A recipe that uses NOTHING the user has isn't a pantry match, even if it's
    // only missing a couple of items (all-staple recipes pass: coverage 1).
    if (nonStaple.length > 0 && matched === 0) continue;

    results.push({
      recipe,
      coverage: nonStaple.length === 0 ? 1 : matched / nonStaple.length,
      missing,
      usesLeftovers: [...usedLeftovers],
      urgentLeftovers: [...usedUrgent],
    });
  }

  const score = input.scoreFn ?? (() => 0);
  results.sort((a, b) => {
    // Fewest shopping gaps first — "can cook tonight" beats "almost there".
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    // Then food-waste pressure: recipes using spoiling leftovers rank up.
    if (a.urgentLeftovers.length !== b.urgentLeftovers.length) return b.urgentLeftovers.length - a.urgentLeftovers.length;
    // Then how much of the dish is already on hand.
    if (a.coverage !== b.coverage) return b.coverage - a.coverage;
    // Then taste (personalized), then title for determinism.
    const s = score(b.recipe) - score(a.recipe);
    if (s !== 0) return s;
    return (a.recipe.title ?? '').localeCompare(b.recipe.title ?? '');
  });

  return results;
}
