// Instacart-supported unit strings (from /developer_platform_api/api/units_of_measurement)
// Metric units that can be converted to US equivalents
const METRIC_UNITS = new Set(['gram', 'kg', 'ml', 'liter']);
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
  whole: 'each', wholes: 'each',
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
    // Normalize metric → US so e.g. "100g + 200g" sums as oz rather than silently dropping
    const normalized = parsed.map((p) => METRIC_UNITS.has(p.unit) ? convertMeasurementToUs(p) : p);
    const baseUnit = normalized[0].unit;
    if (normalized.every((p) => p.unit === baseUnit)) {
      return { quantity: normalized.reduce((s, p) => s + p.quantity, 0), unit: baseUnit };
    }
    // Incompatible units — determine if they span different categories (weight vs volume)
    const VOLUME_TBSP: Record<string, number> = {
      teaspoon: 1 / 3, tablespoon: 1, 'fl oz': 2, cup: 16, pint: 32, quart: 64, gallon: 256, ml: 0.0676, liter: 67.628,
    };
    const WEIGHT_OZ: Record<string, number> = { gram: 0.0353, oz: 1, lb: 16, kg: 35.27 };
    const category = (u: string) => u in VOLUME_TBSP ? 'volume' : u in WEIGHT_OZ ? 'weight' : 'other';
    const categories = new Set(normalized.map((p) => category(p.unit)));
    if (categories.size > 1) {
      // Cross-category (e.g. lb + cup) — magnitudes are not comparable; return first part
      return normalized[0];
    }
    const magnitude = (p: { quantity: number; unit: string }) =>
      p.quantity * (VOLUME_TBSP[p.unit] ?? WEIGHT_OZ[p.unit] ?? 1);
    return normalized.reduce((best, p) => magnitude(p) > magnitude(best) ? p : best);
  }

  return parseSingle(trimQty);
}

/** Converts a metric measurement to US units (gram→oz/lb, kg→lb, ml→fl oz, liter→cup). */
export function convertMeasurementToUs(m: { quantity: number; unit: string }): { quantity: number; unit: string } {
  switch (m.unit) {
    case 'gram': {
      const oz = m.quantity / 28.35;
      if (oz >= 16) return { quantity: +((oz / 16).toFixed(1)), unit: 'lb' };
      return { quantity: +(oz.toFixed(1)), unit: 'oz' };
    }
    case 'kg':
      return { quantity: +((m.quantity * 2.205).toFixed(1)), unit: 'lb' };
    case 'ml': {
      const floz = m.quantity / 29.574;
      return { quantity: +(floz.toFixed(1)), unit: 'fl oz' };
    }
    case 'liter':
      return { quantity: +((m.quantity * 4.227).toFixed(1)), unit: 'cup' };
    default:
      return m;
  }
}

/**
 * Formats a grocery item's quantity+unit for display, converting metric → US when unitSystem is 'us'.
 * Handles combined quantities ("1 + 2"), fractions ("1/2"), and bare counts.
 */
export function formatGroceryQuantity(qty: string, unit: string, unitSystem: 'us' | 'metric'): string {
  if (!qty && !unit) return '';
  const parsed = parseGroceryMeasurement(qty, unit);
  if (!parsed) return unit ? `${qty} ${unit}`.trim() : qty;
  const m = (unitSystem === 'us' && METRIC_UNITS.has(parsed.unit)) ? convertMeasurementToUs(parsed) : parsed;
  const unitLabel = m.unit === 'each' ? '' : ` ${m.unit}`;
  return `${m.quantity}${unitLabel}`.trim();
}
