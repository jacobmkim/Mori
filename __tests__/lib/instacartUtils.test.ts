import { parseGroceryMeasurement } from '@/lib/instacartUtils';

describe('parseGroceryMeasurement', () => {
  // ── Explicit unit (Supabase recipes) ────────────────────────────────────────
  it('parses explicit numeric quantity + unit', () => {
    expect(parseGroceryMeasurement('2', 'cups')).toEqual({ quantity: 2, unit: 'cup' });
  });

  it('maps plural unit to singular Instacart unit', () => {
    expect(parseGroceryMeasurement('3', 'tablespoons')).toEqual({ quantity: 3, unit: 'tablespoon' });
  });

  it('returns null for unrecognised explicit unit', () => {
    expect(parseGroceryMeasurement('2', 'sprinkles')).toBeNull();
  });

  it('returns null when explicit-unit qty is NaN', () => {
    expect(parseGroceryMeasurement('a lot', 'cups')).toBeNull();
  });

  // ── Embedded unit (MealDB "measure" strings) ─────────────────────────────
  it('parses embedded "2 cups"', () => {
    expect(parseGroceryMeasurement('2 cups', '')).toEqual({ quantity: 2, unit: 'cup' });
  });

  it('parses embedded "1/2 cup"', () => {
    expect(parseGroceryMeasurement('1/2 cup', '')).toEqual({ quantity: 0.5, unit: 'cup' });
  });

  it('parses embedded weight "250g"', () => {
    expect(parseGroceryMeasurement('250g', '')).toEqual({ quantity: 250, unit: 'gram' });
  });

  it('parses bare count "4" with no unit → each', () => {
    expect(parseGroceryMeasurement('4', '')).toEqual({ quantity: 4, unit: 'each' });
  });

  // Fragment units (clove, sprig, slice, stalk, piece) intentionally return null
  // so Instacart name-matches a single retail unit instead of treating the count
  // as N retail units (e.g. "2 sprigs parsley" → 2 bunches).
  it('returns null for "3 cloves" (fragment unit — drop measurement)', () => {
    expect(parseGroceryMeasurement('3 cloves', '')).toBeNull();
  });

  it('returns null for "2 sprigs" (fragment unit — drop measurement)', () => {
    expect(parseGroceryMeasurement('2 sprigs', '')).toBeNull();
  });

  it('returns null for "3 stalks" (fragment unit — drop measurement)', () => {
    expect(parseGroceryMeasurement('3 stalks', '')).toBeNull();
  });

  it('returns null for explicit "2" + "sprigs" (fragment unit — drop measurement)', () => {
    expect(parseGroceryMeasurement('2', 'sprigs')).toBeNull();
  });

  it('returns null for "2 slices" (fragment unit — drop measurement)', () => {
    expect(parseGroceryMeasurement('2 slices', '')).toBeNull();
  });

  it('returns null for "3 pieces" (fragment unit — drop measurement)', () => {
    expect(parseGroceryMeasurement('3 pieces', '')).toBeNull();
  });

  it('returns null for "to taste"', () => {
    expect(parseGroceryMeasurement('to taste', '')).toBeNull();
  });

  it('returns null for empty strings', () => {
    expect(parseGroceryMeasurement('', '')).toBeNull();
  });

  // ── Combined quantities (multi-recipe dedup) ─────────────────────────────
  it('sums same-unit combined quantities', () => {
    expect(parseGroceryMeasurement('1 cup + 2 cups', '')).toEqual({ quantity: 3, unit: 'cup' });
  });

  it('sums fractional combined quantities', () => {
    expect(parseGroceryMeasurement('1/2 cup + 1/2 cup', '')).toEqual({ quantity: 1, unit: 'cup' });
  });

  it('returns first part when units differ', () => {
    expect(parseGroceryMeasurement('1 lb + 2 cups', '')).toEqual({ quantity: 1, unit: 'lb' });
  });

  it('handles three-way combination', () => {
    expect(parseGroceryMeasurement('1 oz + 2 oz + 3 oz', '')).toEqual({ quantity: 6, unit: 'oz' });
  });

  // ── Compound count + per-piece weight ────────────────────────────────────
  it('parses "4 fillets, 7 oz each" as total weight in lb', () => {
    expect(parseGroceryMeasurement('4 fillets, 7 oz each', '')).toEqual({ quantity: 1.75, unit: 'lb' });
  });

  it('parses "8 chicken thighs, 4 oz each" as total weight in lb', () => {
    expect(parseGroceryMeasurement('8 chicken thighs, 4 oz each', '')).toEqual({ quantity: 2, unit: 'lb' });
  });

  it('parses "2 steaks (1 lb each)" as total weight', () => {
    expect(parseGroceryMeasurement('2 steaks (1 lb each)', '')).toEqual({ quantity: 2, unit: 'lb' });
  });

  it('parses split-field "4 fillets" + "7 oz each"', () => {
    expect(parseGroceryMeasurement('4 fillets', '7 oz each')).toEqual({ quantity: 1.75, unit: 'lb' });
  });

  it('parses "3 fillets, 5 oz each" → stays in oz when under 16', () => {
    expect(parseGroceryMeasurement('3 fillets, 5 oz each', '')).toEqual({ quantity: 15, unit: 'oz' });
  });

  it('parses range per-piece "4 fillets (5-6 oz each)" using average', () => {
    // (5+6)/2 = 5.5 per piece × 4 = 22 oz → 1.38 lb
    expect(parseGroceryMeasurement('4 fillets (5-6 oz each)', '')).toEqual({ quantity: 1.38, unit: 'lb' });
  });

  it('parses range per-piece "4 fillets, 5-6 oz each" without parens', () => {
    expect(parseGroceryMeasurement('4 fillets, 5-6 oz each', '')).toEqual({ quantity: 1.38, unit: 'lb' });
  });

  it('parses metric per-piece "4 fillets, 200g each" → converted to oz/lb', () => {
    const result = parseGroceryMeasurement('4 fillets, 200g each', '');
    expect(result?.unit).toBe('lb');
    expect(result?.quantity).toBeCloseTo(1.76, 1);
  });

  it('falls back to count for bare "4 fillets" (no per-piece weight)', () => {
    expect(parseGroceryMeasurement('4 fillets', '')).toEqual({ quantity: 4, unit: 'each' });
  });

  it('maps "fillet" unit to each', () => {
    expect(parseGroceryMeasurement('4', 'fillets')).toEqual({ quantity: 4, unit: 'each' });
  });
});
