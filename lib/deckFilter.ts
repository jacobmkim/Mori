// lib/deckFilter.ts — PURE, RN-free catalog construction shared by the client Discover deck
// (lib/api.ts fetchDiscoverRecipes) and the Sunday Drop Vercel cron (api/cron/_sundayDropData.ts).
//
// Single source of truth for the dietary HARD filter (a vegan/vegetarian must never be served
// meat; pescatarian must never be served land meat) + dessert/baked-good exclusion + the raw
// recipes-row → Recipe mapping. Kept here (not in api.ts) so the cron can reuse it without the
// two copies drifting — a drift here would silently serve a vegan a meat dinner.

import type { Recipe } from '@/types';

// Builds a single lowercase string from all ingredient names for keyword scanning.
// Handles both string[] and {name:string}[] shapes that may exist in DB rows.
export function buildIngredientText(ingredients: any[]): string {
  return (ingredients ?? [])
    .map((i) => (typeof i === 'string' ? i : (i?.name ?? '')))
    .join(' ')
    .toLowerCase();
}

export const DECK_EXCLUDE = [
  'cake', 'pudding', 'tart', 'pie', 'biscuit', 'cookie', 'brownie', 'muffin',
  'pancake', 'waffle', 'ice cream', 'sorbet', 'custard', 'fudge', 'candy',
  'cheesecake', 'éclair', 'eclair', 'donut', 'doughnut', 'cobbler', 'crumble',
  'meringue', 'macaron', 'profiterole', 'tiramisu', 'panna cotta', 'creme brulee',
  'bread pudding', 'sticky toffee', 'sourdough', 'baguette', 'focaccia',
  'brioche', 'challah', 'pretzel', 'croissant', 'scone', 'loaf', 'flatbread',
  // desserts that slip through title-only filtering
  'mousse', 'churro', 'baklava', 'halva', 'parfait', 'gelato', 'sundae',
  'trifle', 'syllabub', 'compote', 'praline', 'nougat', 'brittle', 'torte',
  'gateau', 'madeleine', 'financier', 'clafoutis', 'beignet', 'churros',
  'honeycomb', 'roly poly', 'spotted dick', 'treacle', 'jam tart',
];

export const DECK_LAND_MEAT = [
  'chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham', 'turkey', 'duck',
  'veal', 'mutton', 'meatball', 'sausage', 'ribs', 'brisket', 'chorizo', 'mince',
  'steak', 'kebab', 'shawarma', 'keema', 'katsu', 'salami', 'pepperoni',
  'venison', 'goat', 'rabbit', 'offal', 'liver', 'kidney', 'tripe',
];

export const DECK_SEAFOOD = [
  'salmon', 'tuna', 'fish', 'prawn', 'shrimp', 'crab', 'lobster', 'mussel',
  'anchovy', 'cod', 'haddock', 'sardine', 'mackerel', 'halibut', 'tilapia',
  'bass', 'trout', 'catfish', 'clam', 'oyster', 'squid', 'calamari', 'seafood',
];

export const DECK_ALL_MEAT = [...DECK_LAND_MEAT, ...DECK_SEAFOOD];

/**
 * Filter + map raw `recipes` rows into the Discover/Auto-Plan catalog. Identical logic for the
 * client deck and the Sunday Drop cron. The CALLER runs the query (RN supabase client on device,
 * service-role client in the cron); this stays pure so the dietary safety filter can't drift.
 */
export function filterAndMapDeckRecipes(rows: any[], dietaryGoals: string[] = []): Recipe[] {
  return (rows ?? [])
    .filter((r) => {
      const t = (r.title ?? '').toLowerCase();
      if (DECK_EXCLUDE.some((w) => t.includes(w))) return false;
      if ((r.dietary_tags ?? []).includes('dessert')) return false;
      if (dietaryGoals.includes('vegan') || dietaryGoals.includes('vegetarian')) {
        if (DECK_ALL_MEAT.some((w) => t.includes(w))) return false;
        const ingText = buildIngredientText(r.ingredients ?? []);
        if (DECK_ALL_MEAT.some((w) => ingText.includes(w))) return false;
        return true;
      }
      if (dietaryGoals.includes('pescatarian')) {
        if (DECK_LAND_MEAT.some((w) => t.includes(w))) return false;
        const ingText = buildIngredientText(r.ingredients ?? []);
        if (DECK_LAND_MEAT.some((w) => ingText.includes(w))) return false;
        return true;
      }
      return true;
    })
    .map(
      (r): Recipe => ({
        id: r.external_id ?? r.id,  // TheMealDB id for seeded recipes, UUID for generated
        supabase_id: r.id,          // real UUID — used for swipe history matching in scorer
        title: r.title,
        description: r.description,
        cuisine: r.cuisine,
        source_type: r.source_type ?? 'curated',
        ingredients: r.ingredients ?? [],
        steps: r.steps ?? [],
        prep_time_mins: r.prep_time_mins,
        cook_time_mins: r.cook_time_mins,
        servings: r.servings,
        cost_per_serving: r.cost_per_serving,
        dietary_tags: r.dietary_tags ?? [],
        meal_types: r.meal_types ?? null,
        macros: r.macros ?? null,
        badge: r.badge ?? 'none',
        avg_rating: r.avg_rating ?? 0,
        save_count: r.save_count ?? 0,
        image_url: r.image_url,
        external_id: r.external_id,
        meal_prep_friendly: r.meal_prep_friendly ?? null,
        skill_level: r.skill_level ?? null,
        is_public: r.is_public ?? true,
        moderation_status: r.moderation_status ?? null,
        submitted_by: r.submitted_by ?? null,
        submitter_name: r.submitter?.name ?? null,
        submitter_avatar: r.submitter?.avatar_url ?? null,
        submitter_username: r.submitter?.username ?? null,
      } as Recipe)
    );
}

// The column list both callers select from `recipes`. Kept here so the cron's catalog query
// hydrates exactly the fields the mapper + scorer expect.
export const DECK_RECIPE_COLUMNS =
  'id, title, description, cuisine, source_type, dietary_tags, meal_types, badge, avg_rating, save_count, image_url, external_id, prep_time_mins, cook_time_mins, servings, cost_per_serving, macros, ingredients, steps, meal_prep_friendly, skill_level, is_public, moderation_status, submitted_by, submitter:profiles_public!recipes_submitted_by_fkey(name, avatar_url, username)';

export const CATALOG_PAGE_SIZE = 1000;
// Runaway backstop, far above the ~2,600-recipe catalog. Bump when the catalog approaches 10k.
export const CATALOG_MAX_PAGES = 10;

// Minimal structural type so this module stays RN-free AND supabase-js-version-agnostic —
// both the RN client (lib/supabase.ts) and the cron's service-role client satisfy it.
type CatalogQueryClient = {
  from: (table: string) => {
    select: (cols: string) => {
      or: (filter: string) => {
        is: (col: string, val: null) => {
          order: (col: string, opts: { ascending: boolean }) => {
            range: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message?: string } | null }>;
          };
        };
      };
    };
  };
};

/**
 * The FULL deck/plan catalog, paginated. Shared by the client Discover deck and the Sunday
 * Drop cron. Replaces a single `.limit(2000)` with NO ORDER BY: against a 2,600+ catalog
 * that silently (and stably — Postgres scan order) excluded ~600 recipes from every deck
 * and every weekly plan, for every user, forever. Deterministic `id` ordering + ranges
 * cover the whole table; the short-page check terminates as soon as the catalog ends.
 */
export async function fetchAllCatalogRows(sb: CatalogQueryClient): Promise<any[]> {
  const all: any[] = [];
  for (let page = 0; page < CATALOG_MAX_PAGES; page++) {
    const from = page * CATALOG_PAGE_SIZE;
    const { data, error } = await sb
      .from('recipes')
      .select(DECK_RECIPE_COLUMNS)
      // Community submissions no longer go through an approval gate (audit cron deleted
      // 2026-05-11). Only the is_public flag still gates private drafts.
      .or('source_type.neq.community,and(source_type.eq.community,is_public.eq.true)')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + CATALOG_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < CATALOG_PAGE_SIZE) break;
  }
  return all;
}
