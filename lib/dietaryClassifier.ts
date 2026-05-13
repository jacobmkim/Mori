// ─── Dietary tag inference ────────────────────────────────────────────────────
// Heuristic classifier — runs client-side after a community recipe is submitted
// so the recipe lands in the right Discover bucket without an LLM call.
//
// Output tags align with what the curated DB uses:
//   vegetarian, vegan, pescatarian, gluten_free, dairy_free, high_protein,
//   low_carb, keto
//
// False negatives are acceptable (recipe just sits in fewer buckets); false
// positives are not (would mis-bucket meat as vegan, etc.). When in doubt, drop
// the tag.

import type { Ingredient } from '@/types';

const LAND_MEAT = [
  'chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham', 'turkey', 'duck',
  'veal', 'mutton', 'meatball', 'sausage', 'ribs', 'brisket', 'chorizo', 'mince',
  'steak', 'kebab', 'shawarma', 'keema', 'katsu', 'salami', 'pepperoni',
  'venison', 'goat', 'rabbit', 'offal', 'liver', 'kidney', 'tripe', 'pancetta',
  'prosciutto',
];

const SEAFOOD = [
  'salmon', 'tuna', 'fish', 'prawn', 'shrimp', 'crab', 'lobster', 'mussel',
  'anchovy', 'cod', 'haddock', 'sardine', 'mackerel', 'halibut', 'tilapia',
  'bass', 'trout', 'catfish', 'clam', 'oyster', 'squid', 'calamari', 'seafood',
  'scallop',
];

const DAIRY = [
  'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'parmesan',
  'mozzarella', 'cheddar', 'feta', 'ricotta', 'mascarpone', 'ghee',
  'buttermilk', 'sour cream', 'creme fraiche', 'half and half',
];

const EGG = ['egg', 'eggs', 'mayonnaise', 'mayo'];

const HONEY = ['honey'];

const GLUTEN = [
  'flour', 'wheat', 'bread', 'pasta', 'noodle', 'noodles', 'couscous',
  'bulgur', 'barley', 'rye', 'spelt', 'farro', 'panko', 'breadcrumb',
  'breadcrumbs', 'tortilla', 'pita', 'cracker', 'soy sauce',
];

const HIGH_CARB = [
  'rice', 'pasta', 'noodle', 'bread', 'tortilla', 'potato', 'sweet potato',
  'flour', 'sugar', 'honey', 'syrup', 'corn', 'oats', 'oat', 'quinoa',
  'beans', 'lentil', 'lentils', 'chickpea', 'chickpeas',
];

function tokens(title: string, ingredients: Ingredient[]): string {
  const ing = ingredients.map((i) => i.name).filter(Boolean).join(' ');
  return `${title} ${ing}`.toLowerCase();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

export function inferDietaryTags(
  title: string,
  ingredients: Ingredient[]
): string[] {
  const text = tokens(title, ingredients);
  const tags = new Set<string>();

  const hasLandMeat = hasAny(text, LAND_MEAT);
  const hasSeafood = hasAny(text, SEAFOOD);
  const hasDairy = hasAny(text, DAIRY);
  const hasEgg = hasAny(text, EGG);
  const hasHoney = hasAny(text, HONEY);
  const hasGluten = hasAny(text, GLUTEN);

  if (!hasLandMeat && !hasSeafood) tags.add('vegetarian');
  if (!hasLandMeat && hasSeafood) tags.add('pescatarian');
  if (!hasLandMeat && !hasSeafood && !hasDairy && !hasEgg && !hasHoney) {
    tags.add('vegan');
  }
  if (!hasGluten) tags.add('gluten_free');
  if (!hasDairy) tags.add('dairy_free');

  // Protein-forward: meat or seafood is the headline ingredient.
  if (hasLandMeat || hasSeafood) tags.add('high_protein');

  // Low-carb / keto: no high-carb staples present AND has protein source.
  const hasHighCarb = hasAny(text, HIGH_CARB);
  if (!hasHighCarb && (hasLandMeat || hasSeafood || hasEgg || hasDairy)) {
    tags.add('low_carb');
    if (!hasHoney) tags.add('keto');
  }

  return Array.from(tags);
}

// Canonical vocabulary so the wizard checkbox UI and the classifier stay in
// sync. Anything outside this list shouldn't make it into recipes.dietary_tags.
export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten_free',
  'dairy_free',
  'high_protein',
  'low_carb',
  'keto',
] as const;
export type DietaryTag = typeof DIETARY_TAGS[number];

// Strictly-restrictive tags — these claim "this recipe is safe for X". When
// the user picks one and the classifier disagrees (sees an offending
// ingredient), we want to know. The other four tags (high_protein, low_carb,
// keto, dairy_free) are softer and we don't flag those as "conflicts".
const STRICT_TAGS = new Set<string>(['vegetarian', 'vegan', 'pescatarian', 'gluten_free']);

/**
 * Compares a submitter's claimed dietary tags against the heuristic
 * classifier output to surface honest mistakes (vegan dish with chicken in
 * the ingredients, etc.).
 *
 * - `conflicts`: user picked a STRICT_TAG the classifier dropped because it
 *   detected an offending ingredient. Likely wrong.
 * - `missing`: classifier inferred a STRICT_TAG the user didn't check.
 *   Probably fine (user may simply not have wanted to advertise it), but
 *   worth a low-noise breadcrumb for analytics.
 *
 * Both lists are tags from the canonical vocabulary; never throws.
 */
export function diffDietaryTags(
  userPicked: string[],
  inferred: string[],
): { conflicts: string[]; missing: string[] } {
  const userSet = new Set(userPicked);
  const inferredSet = new Set(inferred);
  const conflicts: string[] = [];
  const missing: string[] = [];
  for (const tag of STRICT_TAGS) {
    const userClaims = userSet.has(tag);
    const classifierAgrees = inferredSet.has(tag);
    if (userClaims && !classifierAgrees) conflicts.push(tag);
    if (!userClaims && classifierAgrees) missing.push(tag);
  }
  return { conflicts, missing };
}
