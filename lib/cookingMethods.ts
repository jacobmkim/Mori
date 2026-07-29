// Cooking-method tags, derived from a recipe's title + steps. Pure and RN-free so the Explore
// chips, the Plan picker and (later) the Sunday Drop optimizer can all share one definition.
//
// Derived rather than stored: no migration, works on community + pantry-generated recipes the
// moment they're written, and can't drift out of sync with a backfill. The trade-off is recall —
// a genuinely one-pot recipe that never says so isn't tagged. If that becomes the limiting
// factor, add a `cooking_methods text[]` column + Haiku backfill the same way `meal_types` was
// done, and keep this as the fallback for untagged rows.
//
// Only EQUIPMENT methods are offered as filters. Technique words are useless as a filter:
// measured against the live catalog, 'skillet/stovetop' matches 46% of recipes and 'oven/bake'
// 20%, so neither narrows anything. Equipment lands at 0.6–6.4%, which is a real filter.

export type CookingMethod = 'one_pot' | 'slow_cooker' | 'pressure_cooker' | 'air_fryer' | 'grill';

export const COOKING_METHOD_LABELS: Record<CookingMethod, string> = {
  one_pot: 'One Pot',
  slow_cooker: 'Slow Cooker',
  pressure_cooker: 'Instant Pot',
  air_fryer: 'Air Fryer',
  grill: 'Grill',
};

/** Display order for chips — most-used first, measured against the live catalog. */
export const COOKING_METHOD_ORDER: CookingMethod[] = [
  'one_pot', 'air_fryer', 'slow_cooker', 'grill', 'pressure_cooker',
];

// Word-boundary patterns. Same discipline as lib/dietaryRules.ts: no bare ambiguous words, and
// every pattern is checked against the catalog before being added.
const PATTERNS: Record<CookingMethod, RegExp> = {
  // 'one pan' also covers sheet-pan and UK traybake. NOT 'skillet'/'wok' — those are technique
  // words present in ~46% of recipes, which would make the chip meaningless.
  one_pot: /\b(one[- ]pot|one[- ]pan|1[- ]pot|1[- ]pan|single pan|single pot|sheet[- ]?pan|tray[- ]?bake|dutch oven|casserole dish)\b/i,
  slow_cooker: /\b(slow[- ]cook(?:er|ed|ing)?|crock[- ]?pot)\b/i,
  pressure_cooker: /\b(instant pot|pressure[- ]cook(?:er|ed|ing)?|multi[- ]?cooker)\b/i,
  air_fryer: /\bair[- ]?fry(?:er|ing)?\b/i,
  // 'broil' is the US equivalent of the UK 'grill'; both mean the same appliance here.
  grill: /\b(grill(?:ed|ing|s)?|barbecue[d]?|bbq|broil(?:er|ed|ing)?|char[- ]?grill(?:ed)?)\b/i,
};

/** Title + step text — the surface these patterns are measured against. */
function methodText(recipe: { title?: string | null; steps?: any[] | null }): string {
  const steps = (recipe?.steps ?? [])
    .map((s: any) => (typeof s === 'string' ? s : s?.text ?? s?.instruction ?? ''))
    .join(' ');
  return `${recipe?.title ?? ''} ${steps}`;
}

/** Every equipment method this recipe matches. Empty when none apply. */
export function cookingMethods(
  recipe: { title?: string | null; steps?: any[] | null },
): CookingMethod[] {
  const text = methodText(recipe);
  if (!text.trim()) return [];
  return COOKING_METHOD_ORDER.filter((m) => PATTERNS[m].test(text));
}

/** True when the recipe matches the given method. */
export function usesMethod(
  recipe: { title?: string | null; steps?: any[] | null },
  method: CookingMethod,
): boolean {
  return PATTERNS[method].test(methodText(recipe));
}

/** Filter a list to recipes matching ANY of the selected methods (OR, like the cuisine chips). */
export function filterByMethods<T extends { title?: string | null; steps?: any[] | null }>(
  recipes: T[],
  methods: CookingMethod[],
): T[] {
  if (!methods?.length) return recipes;
  return (recipes ?? []).filter((r) => methods.some((m) => usesMethod(r, m)));
}
