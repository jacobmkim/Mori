// lib/weekPlanCore.ts — the PURE, RN-free planning core (server-safe).
//
// Extracted from lib/api.ts so the Sunday Drop Vercel cron can run the SAME scorer +
// week optimizer as the client. lib/api.ts imports AsyncStorage + the RN Supabase client
// at module top, so it can never be imported into a Vercel function; this module imports
// only types + the pure optimizer (lib/autoPlan.ts), so it is safe on Node.
//
// IMPORTANT — ONE scorer: lib/api.ts re-exports `scoreRecipe` from here, and the deck +
// manual Auto Plan call sites are unchanged. The three session containers below live HERE
// (not in api.ts) so `scoreRecipe` always has them to read. On the client the swipe-loggers
// in lib/api.ts mutate these exact Set/Map instances (live bindings — imported by reference);
// on the server they are NEVER mutated, so they stay empty and every session read is a clean
// no-op (emptySet.has → false, emptyMap.get → undefined). DO NOT mutate them server-side —
// Vercel reuses module state across warm invocations, so a write would leak between users.

import type { Recipe, Profile, MealType, PlanTunings, AutoPlanResult } from '@/types';
import { autoPlanWeek, mergeLockedSlots, WEEKLY_SHUFFLE_POOL } from './autoPlan';
import { recentPlanPenalty, type RecentPlanHistory } from './planHistory';
import {
  violatesDietary, matchesDislike, recipeMatchText, hasNoIngredientData, hasRestriction,
} from './dietaryRules';

// ─── Session-level swipe tracking (shared with lib/api.ts swipe-loggers) ─────────
export const sessionLeftSwipes = new Set<string>(); // supabase_ids left-swiped this session
export const sessionShownIds = new Set<string>();   // supabase_ids already seen this session
// Per-cuisine swipe counts within the current session — boost/penalise recipes sharing a
// cuisine the user is clearly into or avoiding (fusion-aware).
export const sessionCuisineSwipes = new Map<string, { right: number; left: number }>();

// Bug 5 — common staples are worth 0.2 instead of 1.0 in pantry match calculations
// so matching "salt" doesn't inflate the score the same as matching "chicken thighs".
export const COMMON_STAPLES = new Set([
  'salt', 'pepper', 'olive oil', 'oil', 'water', 'butter',
  'garlic', 'onion', 'flour', 'sugar', 'eggs',
]);

export function scoreRecipe(
  recipe: Recipe,
  profile: Profile | null,
  swipeMap: Map<string, { direction: 'left' | 'right'; swiped_at: string }>,
  savedExternalIds: Set<string>,
  affinityMap: Map<string, number>,
  interactionMap: Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>,
  pantrySet: Set<string>,
  leftoversSet?: Set<string>,
  ratingMap?: Map<string, number>,
  savedAtMap?: Map<string, string>,
  flavourDna?: Record<string, { score: number; note: string }> | null,
  // Auto Plan reuses this scorer. When planning a week we must NOT treat "merely
  // shown in the Discover deck this session" as a reason to exclude a recipe —
  // that's a deck-dedup concern, not a taste signal, and it would silently empty
  // the plan for an engaged user who browsed before tapping "Build my week".
  // An ACTIVE left-swipe this session is still a real "no", so that stays excluded.
  forPlanning = false,
  // Injectable jitter source so planning + tests are seedable. Defaults to Math.random,
  // so every existing (deck) call site is byte-identical.
  rng: () => number = Math.random,
  // Cross-week plan memory (lib/planHistory.ts) — recipes the user was shown in recent
  // weeks' plans/drops get a graded, decaying penalty so weekly builds rotate instead of
  // converging on the same top scorers. Callers waive it per-recipe for anchor favourites.
  recentlyPlanned?: RecentPlanHistory | null,
): number {
  // Bug 7 — session penalty: instantly exclude anything swiped this session
  const sid = recipe.supabase_id;
  if (sid && sessionLeftSwipes.has(sid)) return -999;
  if (sid && !forPlanning && sessionShownIds.has(sid)) return -999;

  let score = rng() * 3; // jitter — shuffles similarly-scored recipes each session

  // Currently-saved check — used by both the favourites_rotation bonus and to
  // suppress double-counting the right-swipe boost on already-saved recipes.
  const savedKey = recipe.external_id ?? recipe.supabase_id ?? '';
  const isCurrentlySaved = !!savedKey && savedExternalIds.has(savedKey);

  // favourites_rotation: +3 for saved recipes so old favourites compete without
  // dominating. Combined with the saved-share cap in fetchScoredDeck, this
  // gives rotation users 1-in-4 saved slots instead of a flooded deck.
  if (profile?.eating_style === 'favourites_rotation' && isCurrentlySaved) {
    score += 3;

    // Save-recency cooldown — mirrors the cooked-recency penalty so users
    // don't see a recipe they just saved on the very next deck reload.
    if (sid && savedAtMap) {
      const savedAtIso = savedAtMap.get(sid);
      if (savedAtIso) {
        const daysSinceSaved = (Date.now() - new Date(savedAtIso).getTime()) / 86_400_000;
        if (daysSinceSaved < 3) score -= 15;
        else if (daysSinceSaved < 14) score -= 6;
      }
    }
  }

  // Cohort affinity base (0.0–1.0, scaled up) — cold-start signal for new users
  const affinity = affinityMap.get(recipe.supabase_id ?? '');
  if (affinity != null) score += affinity * 4;

  // Cuisine match — handles fusion cuisines stored as "cajun,italian"
  const recipeCuisines = (recipe.cuisine ?? '').split(',').map(c => c.trim()).filter(Boolean);
  if (recipeCuisines.some(c => profile?.cuisine_preferences?.includes(c))) score += 3;

  // Session cuisine affinity — boost/penalize based on cuisines swiped this session
  // Capped at 3 swipes per cuisine to avoid runaway feedback loops
  for (const cuisine of recipeCuisines) {
    const swipes = sessionCuisineSwipes.get(cuisine);
    if (swipes) {
      score += Math.min(swipes.right, 3) * 1.5;
      score -= Math.min(swipes.left, 3) * 2;
    }
  }

  // Dietary goal alignment — Bug 6: trust macro data over tags when available
  const goals = profile?.dietary_goals ?? [];
  let dietaryBonus = 0;
  for (const goal of goals) {
    const m = recipe.macros as any;
    if (m) {
      if (goal === 'high_protein' && m.protein >= 25) dietaryBonus += 10;
      else if (goal === 'keto' && (m.netCarbs ?? m.carbohydrates - (m.fibre ?? 0)) <= 10) dietaryBonus += 10;
      else if (goal === 'low_fat' && m.fat <= 10) dietaryBonus += 10;
      else if (goal === 'low_carb' && m.carbohydrates <= 30) dietaryBonus += 10;
      else if ((recipe.dietary_tags ?? []).includes(goal)) dietaryBonus += 5;
    } else {
      if ((recipe.dietary_tags ?? []).includes(goal)) dietaryBonus += 5;
    }
  }
  score += Math.min(dietaryBonus, 20);

  // Cook DNA (flavourDna) — the learned behavioural palette from the taste profile
  // (api/taste-profile.ts: explorer/committed/speed/planner/devoted, each 0–100).
  // Soft nudges only (≤ ~3.5 total), well under the +20 dietary cap, so they break ties
  // and personalise ranking without overriding declared preferences or swipe history.
  // Guarded: legacy profiles without a taste_profile are a clean no-op, and a missing
  // dimension defaults to 50 (neutral → no effect).
  if (flavourDna) {
    const dna = (k: string): number => flavourDna[k]?.score ?? 50;
    const cuisineInPrefs = recipeCuisines.some((c) => profile?.cuisine_preferences?.includes(c));
    const dnaMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);

    // explorer (cuisine breadth) — reward a cuisine they don't already prefer (novelty)
    if (dna('explorer') > 65 && recipeCuisines.length > 0 && !cuisineInPrefs) score += 1.5;
    // devoted (cuisine loyalty, true inverse of explorer) — a devoted cook is averse to
    // unfamiliar cuisines, so penalise a NON-preferred cuisine. Preferred-cuisine loyalty is
    // already rewarded by the +3 cuisine match above; rewarding it again here would double-count.
    if (dna('devoted') > 65 && recipeCuisines.length > 0 && !cuisineInPrefs) score -= 1.5;
    // speed (fast-cooking preference) — reward genuinely quick recipes, nudge away from slow ones
    if (dna('speed') > 65 && dnaMins > 0) {
      if (dnaMins <= 25) score += 1;
      else if (dnaMins > 50) score -= 1.5;
    }
    // planner (meal-prep / grocery signals) — reward meal-prep-friendly recipes
    if (dna('planner') > 65 && recipe.meal_prep_friendly === true) score += 1;
    // committed (follow-through) has no clean per-recipe signal that doesn't double-count
    // the rating/cooked logic, so it is intentionally left out of per-recipe scoring here
    // (it informs deck composition in a later increment).
  }

  // Eating style
  if (profile?.eating_style === 'quick_simple') {
    const totalMins = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);
    if (totalMins > 0 && totalMins <= 30) score += 2;
    if (totalMins > 45) score -= 2;
  }

  // Swipe history with temporal decay — older signals fade over ~30 days
  if (sid) {
    const ix = interactionMap.get(sid);
    const swipe = swipeMap.get(sid);
    if (swipe) {
      const daysSince = (Date.now() - new Date(swipe.swiped_at).getTime()) / 86_400_000;
      const decay = Math.exp(-daysSince / 30);
      if (swipe.direction === 'right') {
        // Skip when currently saved — the save bonus already represents this signal,
        // and stacking both was the dominant cause of saved recipes flooding the deck.
        if ((!ix || !ix.unsave) && !isCurrentlySaved) score += 5 * decay;
      }
      if (swipe.direction === 'left') score -= 15 * decay;
    }

    // Interaction signals — capped at 2 to prevent feedback loop dominating deck
    if (ix) {
      score += Math.min(ix.grocery_add, 2) * 3;
      // Cooked signal: penalise recently-cooked recipes so they don't resurface
      // immediately, then restore the favourite bonus once enough time has passed.
      // The positive side scales by eating style — favourites_rotation ×1,
      // variety ×0 (exploring users: fresh recipes win ties over the back-
      // catalog), everyone else ×0.5. Recency penalties stay style-blind:
      // nobody wants last night's dinner back on the deck.
      if (ix.cooked > 0) {
        const daysSinceCooked = ix.lastCookedAt
          ? (Date.now() - new Date(ix.lastCookedAt).getTime()) / 86_400_000
          : 365;
        const repeatAffinity =
          profile?.eating_style === 'favourites_rotation' ? 1
          : profile?.eating_style === 'variety' ? 0
          : 0.5;
        if (daysSinceCooked < 3)  score -= 20; // just cooked — keep off the deck
        else if (daysSinceCooked < 7)  score -= 10;
        else if (daysSinceCooked < 14) score -= 4;
        else if (daysSinceCooked < 30) score += 2 * repeatAffinity;
        else score += Math.min(ix.cooked, 2) * 4 * repeatAffinity; // familiar favourite
      }
      if (ix.unsave > 0) score -= 3;
      if (ix.view > 2 && !ix.grocery_add && !ix.cooked) score -= 2;
    }

    // Cross-week plan recency — planned/proposed in the last few weeks fades the recipe
    // out (−12/−8/−4; halved when it was only a proposal) and back in by week 4. Unlike
    // the cooked curve above, this fires even when the user never pressed "Mark Cooked" —
    // a planned-but-uncooked or proposed-but-ignored week previously left zero trace,
    // which is exactly why every drop looked the same.
    if (recentlyPlanned) {
      const planned = recentlyPlanned.get(sid);
      if (planned) score -= recentPlanPenalty(planned);
    }

    // Personal rating signal — user's own star rating on this recipe.
    // Range: 1★ → -4, 3★ → 0 (neutral), 5★ → +4.
    // Stronger than the community signal since it's a direct personal preference.
    if (ratingMap && sid) {
      const userRating = ratingMap.get(sid);
      if (userRating != null) score += (userRating - 3) * 2;
    }
  }

  // Saved recipes are hard-excluded in fetchScoredDeck before scoring reaches here.

  // Leftover ingredient match — +2 per match, cap +10.
  // Promotes recipes that use what the user already has before it spoils.
  if (leftoversSet?.size) {
    let matches = 0;
    for (const ing of (recipe.ingredients ?? []) as { name: string }[]) {
      if (!ing?.name) continue;
      const n = ing.name.toLowerCase().trim();
      for (const left of leftoversSet) {
        if (n === left || n.includes(left) || left.includes(n)) { matches++; break; }
      }
    }
    score += Math.min(matches * 2, 10);
  }

  // Bug 5 — pantry match with specificity weighting (common staples count less)
  if (pantrySet.size > 0) {
    const recipeIngs = (recipe.ingredients ?? []) as { name: string }[];
    if (recipeIngs.length > 0) {
      let weightedMatches = 0;
      let totalWeight = 0;
      for (const ing of recipeIngs) {
        if (!ing?.name) continue;
        const name = ing.name.toLowerCase();
        const weight = COMMON_STAPLES.has(name) ? 0.2 : 1.0;
        totalWeight += weight;
        const pantryMatch = [...pantrySet].some(p => name.includes(p) || p.includes(name));
        if (pantryMatch) weightedMatches += weight;
      }
      const pantryRatio = totalWeight > 0 ? weightedMatches / totalWeight : 0;
      score += pantryRatio * 20;
    }
  }

  // Recipe rating quality — only counts when there's enough signal (>=3 reviews)
  // to avoid noise from a single 5★ outlier. Centred on 3★ (neutral); 1★ → -3,
  // 5★ → +3. Modest cap so it competes with cuisine/dietary signals, not dominates.
  if (recipe.rating_count != null && recipe.rating_count >= 3 && recipe.avg_rating != null) {
    score += (recipe.avg_rating - 3) * 1.5;
  }

  return score;
}

// ─── Cross-week anchors ("mostly fresh, 1–2 favourites may recur") ────────────────

// How many recent-history recipes may recur per weekly build. Anchors get the history
// penalty WAIVED (they compete on full merit); the same number is passed to autoPlanWeek
// as maxHistoryRepeats so non-anchor history recipes can't sneak a 3rd repeat in.
export const ANCHOR_BUDGET = 2;

/**
 * Pick up to ANCHOR_BUDGET "anchor" favourites from the recent-plan history: proven recipes
 * (cooked, highly rated, or saved) that are allowed to recur this week without the history
 * penalty. Deterministic and rng-free — merit-ranked, tie-broken by supabase_id — so seeded
 * plans stay reproducible. Only recipes still in the (post-hard-filter) pool qualify.
 */
export function pickAnchorIds(
  history: RecentPlanHistory,
  pool: Recipe[],
  ratingMap: Map<string, number>,
  interactionMap: Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>,
  savedExternalIds: Set<string>,
): Set<string> {
  const poolById = new Map<string, Recipe>();
  for (const r of pool) {
    if (r.supabase_id) poolById.set(r.supabase_id, r);
  }

  const scoredCandidates: { id: string; merit: number }[] = [];
  for (const id of history.keys()) {
    const recipe = poolById.get(id);
    if (!recipe) continue;
    const ix = interactionMap.get(id);
    const rating = ratingMap.get(id);
    const isSaved = savedExternalIds.has(recipe.external_id ?? recipe.supabase_id ?? '');
    // Eligibility: a PROVEN favourite only — merely having been proposed isn't enough.
    const isProven = (ix?.cooked ?? 0) >= 1 || (rating ?? 0) >= 4 || isSaved;
    if (!isProven) continue;
    const merit = (rating ?? 0) * 2 + Math.min(ix?.cooked ?? 0, 3) * 3 + (isSaved ? 2 : 0);
    scoredCandidates.push({ id, merit });
  }

  scoredCandidates.sort((a, b) => b.merit - a.merit || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(scoredCandidates.slice(0, ANCHOR_BUDGET).map((c) => c.id));
}

// ─── Week optimizer core (the pure body of generateWeekPlan) ─────────────────────
// Takes already-fetched per-user signals (the caller does the I/O) and returns the
// optimized week. Mirrors lib/api.ts generateWeekPlan exactly — same hard filters
// (ingredient dislikes + skill cap + supabase_id requirement + locked-id exclusion),
// same scoreFn binding, same autoPlanWeek + mergeLockedSlots. The Sunday Drop cron and
// the client manual flow both call this so they rank identically.

export interface WeekPlanInputs {
  catalog: Recipe[];
  profile: Profile | null;
  swipeMap: Map<string, { direction: 'left' | 'right'; swiped_at: string }>;
  savedExternalIds: Set<string>;
  affinityMap: Map<string, number>;
  interactionMap: Map<string, { grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null }>;
  pantrySet: Set<string>;
  leftoversSet: Set<string>;
  ratingMap: Map<string, number>;
  savedAtMap: Map<string, string>;
  weeklyBudgetUsd?: number | null;
  mealTypes?: MealType[];
  days?: number;
  startDay?: number;
  tunings?: PlanTunings;
  lockedSlots?: { day: number; recipe: Recipe }[]; // user-placed meals to keep on a rebuild
  random?: () => number; // injectable entropy (jitter + sampling); default Math.random
  // Cross-week plan memory (lib/planHistory.ts). When present: anchors are computed, the
  // penalty is bound into scoreRecipe (waived for anchors), and the ANCHOR_BUDGET repeat
  // cap is passed to the optimizer. Undefined/empty = memoryless (first-time user).
  recentHistory?: RecentPlanHistory | null;
  // Per-slot top-N sampling width; defaults to WEEKLY_SHUFFLE_POOL. Tests pin 1 for
  // strict-argmax shaping assertions.
  shufflePool?: number;
}

export function planWeekFromInputs(inp: WeekPlanInputs): AutoPlanResult {
  const {
    catalog, profile, swipeMap, savedExternalIds, affinityMap, interactionMap,
    pantrySet, leftoversSet, ratingMap, savedAtMap,
  } = inp;
  const random = inp.random ?? Math.random;

  const flavourDna = (profile?.taste_profile as any)?.flavourDna ?? null;

  // Hard filter: dietary goals + ingredient dislikes (commandment — never soft-deprioritise,
  // never relax). Both go through the shared rules module so the planner can't drift from the
  // deck: the catalog handed in here is already filtered, but Auto Plan is also fed saved
  // recipes and pantry results, so it re-applies the gate rather than trusting its input.
  const dislikes = (profile?.ingredient_dislikes ?? []) as string[];
  const goals = (profile?.dietary_goals ?? []) as string[];
  const gated = hasRestriction(goals) || dislikes.length > 0;
  let pool = !gated ? catalog : catalog.filter((r) => {
    if (hasNoIngredientData(r as any)) return false; // fail closed under a restriction
    const text = recipeMatchText(r as any);
    return !violatesDietary(text, goals) && !matchesDislike(text, dislikes);
  });

  // Hard filter: skill cap (mirrors fetchScoredDeck) — don't plan recipes above the user's level.
  const skillLevel = profile?.skill_level;
  if (skillLevel) {
    pool = pool.filter((r) => {
      const recipeSkill = (r as any).skill_level as string | null | undefined;
      if (recipeSkill === 'confident_chef' && skillLevel !== 'confident_chef') return false;
      if (recipeSkill === 'home_cook' && skillLevel === 'beginner') return false;
      if (!recipeSkill) {
        const totalTime = (r.prep_time_mins ?? 0) + (r.cook_time_mins ?? 0);
        const beginnerCap = profile?.cooking_frequency === 'just_starting' ? 45 : 60;
        if (skillLevel === 'beginner' && totalTime > 0 && totalTime > beginnerCap) return false;
        if (skillLevel === 'home_cook' && totalTime > 0 && totalTime > 120) return false;
      }
      return true;
    });
  }

  // Only plan recipes we can persist + hydrate. A slot's recipe_id must be a real
  // recipes.id (supabase_id); a recipe without one can't round-trip through meal_plans
  // and would be silently dropped on accept — so exclude it from the pool entirely,
  // keeping the displayed plan identical to the persistable plan (and the optimizer's
  // no-repeat key consistent with the swap/persist key).
  pool = pool.filter((r) => !!r.supabase_id);

  // Exclude user-locked recipes from the pool so the optimizer can't auto-pick them on a
  // DIFFERENT day (they're overlaid back onto their own day by mergeLockedSlots below).
  const lockedIds = new Set((inp.lockedSlots ?? []).map((ls) => ls.recipe.supabase_id).filter(Boolean));
  if (lockedIds.size > 0) pool = pool.filter((r) => !lockedIds.has(r.supabase_id));

  // Cross-week variety: waive the history penalty for up to ANCHOR_BUDGET proven favourites
  // (they compete on full merit and may legitimately recur), penalize everything else the
  // user saw in recent weeks, and cap total history repeats at the same budget in the
  // optimizer. rng-free anchor selection keeps seeded plans reproducible.
  const recentHistory = inp.recentHistory && inp.recentHistory.size > 0 ? inp.recentHistory : null;
  let effectiveHistory: RecentPlanHistory | null = recentHistory;
  if (recentHistory) {
    const anchorIds = pickAnchorIds(recentHistory, pool, ratingMap, interactionMap, savedExternalIds);
    if (anchorIds.size > 0) {
      effectiveHistory = new Map(recentHistory);
      for (const id of anchorIds) effectiveHistory.delete(id);
    }
  }

  const scoreFn = (recipe: Recipe): number =>
    scoreRecipe(recipe, profile, swipeMap, savedExternalIds, affinityMap, interactionMap, pantrySet, leftoversSet, ratingMap, savedAtMap, flavourDna, true, random, effectiveHistory);

  const result = autoPlanWeek({
    catalog: pool,
    savedExternalIds,
    scoreFn,
    mealTypes: inp.mealTypes ?? ['dinner'],
    days: inp.days ?? 7,
    startDay: inp.startDay ?? 0,
    weeklyBudgetUsd: inp.weeklyBudgetUsd ?? null,
    leftoversSet,
    tunings: inp.tunings,
    // Respect an explicit "Variety is everything" eating style — those users get proteins spread out
    // rather than the default similar-proteins clustering (bulk-buy). Everyone else clusters.
    proteinMode: profile?.eating_style === 'variety' ? 'variety' : 'cohesion',
    random,
    recentlyPlannedIds: recentHistory ? new Set(recentHistory.keys()) : undefined,
    maxHistoryRepeats: recentHistory ? ANCHOR_BUDGET : undefined,
    shufflePool: inp.shufflePool ?? WEEKLY_SHUFFLE_POOL,
  });
  // Keep the user's manually-placed meals on their own days ("You added this").
  return mergeLockedSlots(result, inp.lockedSlots ?? [], inp.weeklyBudgetUsd ?? null);
}
