/**
 * Citrus juice → fresh fruit conversion for the Instacart send.
 *
 * Problem: a recipe calls for "lime juice 2 tbsp". Sending "lime juice" to Instacart's
 * matcher is a coin flip between bottled juice and fresh limes — and for small recipe
 * volumes fresh fruit is the better product (decided 2026-07-01: fresh-first default).
 *
 * Rules:
 *  - Only lemon + lime (the ambiguous pair). Orange/grapefruit juice is usually a
 *    drink ingredient where bottled is correct — out of scope on purpose.
 *  - Small volumes (≤ 1/2 cup) convert to whole fruit: 1 lime ≈ 2 tbsp, 1 lemon ≈ 3 tbsp,
 *    rounded up so the cook never comes up short.
 *  - Larger volumes stay bottled (squeezing 6+ fruits is a chore and bottled is fine
 *    at that scale) — return null, caller sends the item unchanged.
 *  - Explicit bottled/concentrate wording stays bottled; "juice of 2 limes" phrasing
 *    respects the recipe's own fruit count (no volume threshold — the recipe already
 *    committed to fresh).
 *  - Unknown volume (unparseable measurement) still converts, name-only, so Instacart
 *    matches fresh produce and picks its default count.
 *
 * Applied ONLY at Instacart-send time (grocery-list.tsx submitToInstacart) — the
 * user's grocery list keeps displaying what the recipe said ("lime juice 2 tbsp").
 */

type Measurement = { quantity: number; unit: string };

export interface CitrusFruitConversion {
  /** Instacart search name, already pluralized: 'lime' | 'limes' | 'lemon' | 'lemons' */
  name: string;
  /** Whole-fruit count; null when the juice volume is unknown (send name-only) */
  measurement: { quantity: number; unit: 'each' } | null;
}

/** Approximate juice yield per fruit, in tablespoons. */
const TBSP_PER_FRUIT: Record<'lemon' | 'lime', number> = { lemon: 3, lime: 2 };

/** Above this the conversion backs off to bottled (strictly more than 1/2 cup). */
const MAX_FRESH_TBSP = 8;

/** Volume units → tablespoons. 'oz'/'gram' are treated as fluid for juice (density ≈ 1). */
const UNIT_TO_TBSP: Record<string, number> = {
  teaspoon: 1 / 3,
  tablespoon: 1,
  'fl oz': 2,
  oz: 2,
  cup: 16,
  pint: 32,
  quart: 64,
  gallon: 256,
  ml: 1 / 14.787,
  gram: 1 / 14.787,
  liter: 67.628,
};

// Names where converting would swap in the wrong product: explicitly bottled/concentrate,
// lemon-lime beverages that merely contain the word "juice", or varietal citrus (key lime /
// Meyer lemon) where the bottled juice IS the intended product and the generic fruit would be
// the wrong fruit at the wrong yield.
const EXCLUDE = /bottle|concentrate|soda|soft drink|cordial|lemonade|limeade|lemon-lime|margarita|cocktail|key\s+lime|meyer\s+lemon/i;

// "juice of 2 limes", "juice of a lemon", "juice of 1/2 lime", "juice and zest of 1 lime" —
// the recipe already counted fruit, so keep its count (fractions round up to a whole fruit).
// "zest and juice of N" matches too via the "juice of N" substring.
const JUICE_OF = /\bjuice\s+(?:and\s+zest\s+)?of\s+(?:(\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|half(?:\s+a)?|a|an|one|two|three|four)\s+)?(lemon|lime)s?\b/i;

// "lime juice", "fresh lemon juice", "freshly squeezed lime juice"
const FRUIT_JUICE = /\b(lemon|lime)\s+juice\b/i;

const WORD_COUNTS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, half: 1, 'half a': 1 };

function parseNameCount(raw: string | undefined): number | null {
  if (!raw) return 1; // "juice of a lime" with the article group unmatched → 1 fruit
  const w = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (w in WORD_COUNTS) return WORD_COUNTS[w];
  if (w.includes('/')) {
    const [n, d] = w.split('/').map((p) => parseFloat(p));
    return n > 0 && d > 0 ? Math.max(1, Math.ceil(n / d)) : null;
  }
  const n = parseFloat(w);
  return n > 0 ? Math.ceil(n) : null;
}

/**
 * Decides whether an Instacart line item for citrus juice should be sent as fresh
 * fruit instead. Returns null when the item should be sent unchanged (not citrus
 * juice, explicitly bottled, or too large a volume to squeeze).
 */
export function convertCitrusJuiceToFruit(
  name: string,
  measurement: Measurement | null,
): CitrusFruitConversion | null {
  if (!name || EXCLUDE.test(name)) return null;

  // Recipe counted the fruit itself ("juice of 2 limes") — honor that count as-is.
  const juiceOf = name.match(JUICE_OF);
  if (juiceOf) {
    const fruit = juiceOf[2].toLowerCase() as 'lemon' | 'lime';
    const count = parseNameCount(juiceOf[1]);
    if (count === null) return { name: `${fruit}s`, measurement: null };
    return { name: count === 1 ? fruit : `${fruit}s`, measurement: { quantity: count, unit: 'each' } };
  }

  const match = name.match(FRUIT_JUICE);
  if (!match) return null;
  const fruit = match[1].toLowerCase() as 'lemon' | 'lime';

  if (!measurement || measurement.quantity <= 0) {
    // Unknown volume — still prefer fresh; let Instacart's produce match pick the count.
    return { name: `${fruit}s`, measurement: null };
  }

  // A bare count ("2 lime juice" parsed as quantity=2, unit=each) reads as fruit count.
  if (measurement.unit === 'each') {
    const count = Math.max(1, Math.ceil(measurement.quantity));
    return { name: count === 1 ? fruit : `${fruit}s`, measurement: { quantity: count, unit: 'each' } };
  }

  const tbspPerUnit = UNIT_TO_TBSP[measurement.unit];
  if (tbspPerUnit === undefined) {
    // Unit we can't reason about (lb, bunch, …) — don't guess a count, but still go fresh.
    return { name: `${fruit}s`, measurement: null };
  }

  const tbsp = measurement.quantity * tbspPerUnit;
  if (tbsp > MAX_FRESH_TBSP) return null; // large volume — bottled is the right product

  // Small epsilon (0.05 of a fruit, ~0.1–0.15 tbsp) so near-exact metric volumes
  // (60 ml ≈ 4.06 tbsp) don't round up to a whole extra fruit — real fruit yields
  // vary far more than that anyway.
  const count = Math.max(1, Math.ceil(tbsp / TBSP_PER_FRUIT[fruit] - 0.05));
  return { name: count === 1 ? fruit : `${fruit}s`, measurement: { quantity: count, unit: 'each' } };
}
