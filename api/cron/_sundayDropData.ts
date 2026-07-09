// api/cron/_sundayDropData.ts
// Service-role re-implementations of the per-user signals that lib/api.ts fetches on the
// CLIENT for Auto Plan (it can't run server-side — it imports AsyncStorage). Each query
// mirrors its lib/api.ts counterpart EXACTLY so Sunday Drop ranks identically to the manual
// "Build my week". The catalog dietary filter + row→Recipe map is shared via lib/deckFilter.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '../../types';
import { filterAndMapDeckRecipes, fetchAllCatalogRows } from '../../lib/deckFilter';
import {
  buildRecentPlanHistory,
  addDaysUtc,
  HISTORY_WEEKS,
  type RecentPlanHistory,
} from '../../lib/planHistory';

export interface InteractionCount {
  grocery_add: number; cooked: number; unsave: number; view: number; lastCookedAt: string | null;
}

export interface UserSignals {
  swipeMap: Map<string, { direction: 'left' | 'right'; swiped_at: string }>;
  affinityMap: Map<string, number>;
  interactionMap: Map<string, InteractionCount>;
  pantrySet: Set<string>;
  leftoversSet: Set<string>;
  ratingMap: Map<string, number>;
  savedAtMap: Map<string, string>;
  savedRecipeIds: string[]; // saved_recipes.recipe_id (supabase UUIDs); cron maps → external ids
}

/**
 * Raw `recipes` rows for the catalog — fetched ONCE per cron run (the query is identical for
 * everyone; only the dietary filter is per-user). Shares the paginated full-catalog query with
 * fetchDiscoverRecipes (lib/deckFilter.ts) — the old single `.limit(2000)` with no ORDER BY
 * silently excluded ~600 recipes from every drop, always the same ones.
 */
export async function fetchCatalogRows(sb: SupabaseClient): Promise<any[]> {
  return fetchAllCatalogRows(sb);
}

/**
 * Cross-week plan memory for one user (lib/planHistory.ts): the last HISTORY_WEEKS of
 * meal_plans (weeks the user actually held) + sunday_drops recipe_ids (proposals — dismissed
 * or ignored alike; the drop window reaches 1 day further back because week_start is the
 * SUNDAY before the Monday it populates). Runs after the idempotency claim, in parallel with
 * fetchUserSignals, so it adds no round-trip latency and only fires for users actually
 * generating. The caller degrades a failure to an empty map — a missing signal must not
 * kill the drop.
 */
export async function fetchRecentPlanHistory(
  sb: SupabaseClient,
  userId: string,
  targetWeekStart: string,
): Promise<RecentPlanHistory> {
  const mealFrom = addDaysUtc(targetWeekStart, -7 * HISTORY_WEEKS);
  const dropFrom = addDaysUtc(targetWeekStart, -(7 * HISTORY_WEEKS + 1));
  const [mealPlanRows, dropRows] = await Promise.all([
    sb.from('meal_plans').select('week_start_date, slots')
      .eq('user_id', userId).gte('week_start_date', mealFrom).lt('week_start_date', targetWeekStart)
      .then((r) => (r.data ?? []) as { week_start_date: string; slots: any }[]),
    sb.from('sunday_drops').select('week_start, recipe_ids')
      .eq('user_id', userId).gte('week_start', dropFrom).lt('week_start', targetWeekStart)
      .then((r) => (r.data ?? []) as { week_start: string; recipe_ids: string[] | null }[]),
  ]);
  return buildRecentPlanHistory({ targetWeekStart, mealPlanRows, dropRows });
}

/** Apply the per-user dietary hard-filter + map to the shared raw rows (lib/deckFilter.ts). */
export function buildCatalog(rawRows: any[], dietaryGoals: string[]): Recipe[] {
  return filterAndMapDeckRecipes(rawRows, dietaryGoals);
}

/**
 * All per-user scoring signals, mirroring lib/api.ts (getRecentSwipes, getUserCohortKey +
 * getCohortAffinities, getInteractionCounts, getPantryItems, fetchLeftoverNames, getUserRatings,
 * getSavedAtMap, saved_recipes). Failures degrade to empty (a missing signal must not crash the
 * whole drop) — but the catalog/profile failures upstream are fatal in the cron.
 */
export async function fetchUserSignals(sb: SupabaseClient, userId: string): Promise<UserSignals> {
  const [swipes, cohortKey, interactions, pantry, leftovers, savedRows] = await Promise.all([
    // getRecentSwipes (most recent first, limit 500)
    sb.from('swipe_events').select('recipe_id, direction, swiped_at')
      .eq('user_id', userId).order('swiped_at', { ascending: false }).limit(500)
      .then((r) => r.data ?? []),
    // getUserCohortKey
    sb.from('user_cohorts').select('cohort_key')
      .eq('user_id', userId).order('assigned_at', { ascending: false }).limit(1).maybeSingle()
      .then((r) => r.data?.cohort_key ?? null),
    // getInteractionCounts
    sb.from('recipe_interactions').select('recipe_id, interaction_type, interacted_at')
      .eq('user_id', userId).in('interaction_type', ['grocery_add', 'cooked', 'unsave', 'view'])
      .then((r) => r.data ?? []),
    // getPantryItems
    sb.from('pantry_items').select('ingredient_name').eq('user_id', userId)
      .then((r) => r.data ?? []),
    // fetchLeftoverNames (active, non-dismissed, not yet spoiled)
    sb.from('user_leftovers').select('ingredient_name')
      .eq('user_id', userId).is('dismissed_at', null).gt('spoils_at', new Date().toISOString())
      .then((r) => r.data ?? []),
    // getUserRatings + getSavedAtMap + saved ids all come from saved_recipes
    sb.from('saved_recipes').select('recipe_id, user_rating, saved_at').eq('user_id', userId)
      .then((r) => r.data ?? []),
  ]);

  // affinityMap (cohort) — second query, gated on cohortKey
  const affinityMap = new Map<string, number>();
  if (cohortKey) {
    const { data } = await sb.from('recipe_cohort_affinities')
      .select('recipe_id, affinity_score').eq('cohort_key', cohortKey);
    for (const row of data ?? []) affinityMap.set(row.recipe_id, row.affinity_score);
  }

  // swipeMap — first (most-recent) occurrence per recipe wins
  const swipeMap = new Map<string, { direction: 'left' | 'right'; swiped_at: string }>();
  for (const s of swipes as any[]) {
    if (!swipeMap.has(s.recipe_id)) {
      swipeMap.set(s.recipe_id, { direction: s.direction as 'left' | 'right', swiped_at: s.swiped_at });
    }
  }

  // interactionMap
  const interactionMap = new Map<string, InteractionCount>();
  for (const row of interactions as any[]) {
    const cur = interactionMap.get(row.recipe_id) ?? { grocery_add: 0, cooked: 0, unsave: 0, view: 0, lastCookedAt: null };
    if (row.interaction_type === 'grocery_add') cur.grocery_add++;
    if (row.interaction_type === 'cooked') {
      cur.cooked++;
      if (!cur.lastCookedAt || row.interacted_at > cur.lastCookedAt) cur.lastCookedAt = row.interacted_at;
    }
    if (row.interaction_type === 'unsave') cur.unsave++;
    if (row.interaction_type === 'view') cur.view++;
    interactionMap.set(row.recipe_id, cur);
  }

  const pantrySet = new Set(
    (pantry as any[]).filter((p) => p.ingredient_name).map((p) => p.ingredient_name.toLowerCase()),
  );
  const leftoversSet = new Set(
    (leftovers as any[]).filter((r) => r.ingredient_name).map((r) => r.ingredient_name.toLowerCase().trim()),
  );

  const ratingMap = new Map<string, number>();
  const savedAtMap = new Map<string, string>();
  const savedRecipeIds: string[] = [];
  for (const row of savedRows as any[]) {
    savedRecipeIds.push(row.recipe_id);
    if (row.user_rating != null) ratingMap.set(row.recipe_id, row.user_rating);
    if (row.saved_at) savedAtMap.set(row.recipe_id, row.saved_at);
  }

  return { swipeMap, affinityMap, interactionMap, pantrySet, leftoversSet, ratingMap, savedAtMap, savedRecipeIds };
}
