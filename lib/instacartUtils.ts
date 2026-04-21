// Instacart-supported unit strings (from /developer_platform_api/api/units_of_measurement)
const UNIT_MAP: Record<string, string> = {
  // Volume
  cup: 'cup', cups: 'cup', c: 'cup',
  tablespoon: 'tablespoon', tablespoons: 'tablespoon', tbsp: 'tablespoon', tb: 'tablespoon', tbs: 'tablespoon',
  teaspoon: 'teaspoon', teaspoons: 'teaspoon', tsp: 'teaspoon', ts: 'teaspoon', tspn: 'teaspoon',
  'fl oz': 'fl oz',
  pint: 'pint', pints: 'pint', pt: 'pint', pts: 'pint',
  quart: 'quart', quarts: 'quart', qt: 'quart', qts: 'quart',
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon', gals: 'gallon',
  liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter', l: 'liter',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml', mls: 'ml',
  // Weight
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  'oz bag': 'oz bag', 'ounces bag': 'oz bag',
  'oz can': 'oz can', 'ounces can': 'oz can',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  gram: 'gram', grams: 'gram', g: 'gram', gs: 'gram',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg', kgs: 'kg',
  // Count
  each: 'each',
  bunch: 'bunch', bunches: 'bunch',
  can: 'can', cans: 'can',
  head: 'head', heads: 'head',
  ear: 'ears', ears: 'ears',
  large: 'large', lrg: 'large', lge: 'large', lg: 'large',
  medium: 'medium', med: 'medium', md: 'medium',
  small: 'small', sm: 'small',
  package: 'package', packages: 'package',
  packet: 'packet',
  // Map unsupported → nearest equivalent
  clove: 'each', cloves: 'each',
  sprig: 'each', sprigs: 'each',
  slice: 'each', slices: 'each',
  stalk: 'each', stalks: 'each',
  piece: 'each', pieces: 'each',
};

function parseFraction(s: string): number | null {
  const parts = s.split('/');
  if (parts.length !== 2) return null;
  const n = parseFloat(parts[0]);
  const d = parseFloat(parts[1]);
  return !isNaN(n) && !isNaN(d) && d !== 0 ? n / d : null;
}

function parseSingle(s: string): { quantity: number; unit: string } | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  // Leading number (int, decimal, or fraction) + optional unit
  const match = trimmed.match(/^([\d.]+(?:\/[\d.]+)?)\s*(.*)/);
  if (!match) return null;
  const numStr = match[1];
  const unitStr = match[2].trim().toLowerCase();
  const quantity = numStr.includes('/') ? (parseFraction(numStr) ?? NaN) : parseFloat(numStr);
  if (isNaN(quantity) || quantity <= 0) return null;
  // Empty unit string → "each" (bare count like "4 eggs" where name="eggs", quantity="4")
  const unit = unitStr ? (UNIT_MAP[unitStr] ?? null) : 'each';
  if (!unit) return null; // Unrecognised unit — caller falls back to no measurement
  return { quantity, unit };
}

/**
 * Parses a GroceryItem's quantity + unit into Instacart's structured measurement format.
 * Returns null if parsing fails — callers should omit the measurement field in that case
 * and let Instacart match by name only.
 *
 * Handles three formats:
 *  - Explicit unit (Supabase recipes): quantity="2", unit="cups"
 *  - Embedded unit (MealDB recipes):   quantity="2 cups", unit=""
 *  - Combined (multi-recipe dedup):     quantity="1 cup + 2 cups", unit=""
 */
export function parseGroceryMeasurement(
  quantityStr: string,
  unitStr: string,
): { quantity: number; unit: string } | null {
  const trimUnit = unitStr?.trim() ?? '';

  // Explicit unit field — Supabase recipes store quantity and unit separately
  if (trimUnit) {
    const mapped = UNIT_MAP[trimUnit.toLowerCase()];
    if (!mapped) return null;
    const qty = parseFloat(quantityStr);
    return !isNaN(qty) && qty > 0 ? { quantity: qty, unit: mapped } : null;
  }

  const trimQty = quantityStr?.trim() ?? '';
  if (!trimQty) return null;

  // Combined quantity from two recipes adding the same ingredient
  if (trimQty.includes(' + ')) {
    const parts = trimQty.split(' + ');
    const parsed = parts
      .map(parseSingle)
      .filter((p): p is { quantity: number; unit: string } => p !== null);
    if (parsed.length === 0) return null;
    const baseUnit = parsed[0].unit;
    // Sum when all parts share the same unit; otherwise send the first chunk
    return parsed.every((p) => p.unit === baseUnit)
      ? { quantity: parsed.reduce((s, p) => s + p.quantity, 0), unit: baseUnit }
      : parsed[0];
  }

  return parseSingle(trimQty);
}
