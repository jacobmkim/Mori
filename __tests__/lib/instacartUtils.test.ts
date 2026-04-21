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

  it('maps "cloves" → each', () => {
    expect(parseGroceryMeasurement('3 cloves', '')).toEqual({ quantity: 3, unit: 'each' });
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
});
