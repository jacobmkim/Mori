/**
 * convertCitrusJuiceToFruit — recipe-sized lemon/lime juice converts to whole fresh
 * fruit at Instacart-send time (fresh-first default, decided 2026-07-01). Large
 * volumes stay bottled; explicit bottled/concentrate wording is never converted.
 */
import { convertCitrusJuiceToFruit } from '@/lib/citrusConversion';

describe('convertCitrusJuiceToFruit', () => {
  describe('volume → fruit count (1 lime ≈ 2 tbsp, 1 lemon ≈ 3 tbsp, round up)', () => {
    it('2 tbsp lime juice → 1 lime', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 2, unit: 'tablespoon' }))
        .toEqual({ name: 'lime', measurement: { quantity: 1, unit: 'each' } });
    });

    it('3 tbsp lime juice → 2 limes (rounds up, never short)', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 3, unit: 'tablespoon' }))
        .toEqual({ name: 'limes', measurement: { quantity: 2, unit: 'each' } });
    });

    it('1/4 cup lemon juice (4 tbsp) → 2 lemons', () => {
      expect(convertCitrusJuiceToFruit('lemon juice', { quantity: 0.25, unit: 'cup' }))
        .toEqual({ name: 'lemons', measurement: { quantity: 2, unit: 'each' } });
    });

    it('1 tsp lemon juice → 1 lemon (minimum one fruit)', () => {
      expect(convertCitrusJuiceToFruit('lemon juice', { quantity: 1, unit: 'teaspoon' }))
        .toEqual({ name: 'lemon', measurement: { quantity: 1, unit: 'each' } });
    });

    it('2 fl oz lime juice (4 tbsp) → 2 limes', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 2, unit: 'fl oz' }))
        .toEqual({ name: 'limes', measurement: { quantity: 2, unit: 'each' } });
    });

    it('treats weight oz as fluid for juice: 1 oz lemon juice → 1 lemon', () => {
      expect(convertCitrusJuiceToFruit('lemon juice', { quantity: 1, unit: 'oz' }))
        .toEqual({ name: 'lemon', measurement: { quantity: 1, unit: 'each' } });
    });

    it('60 ml lime juice (~4 tbsp) → 2 limes (metric unit system; epsilon absorbs float overshoot)', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 60, unit: 'ml' }))
        .toEqual({ name: 'limes', measurement: { quantity: 2, unit: 'each' } });
    });

    it('exactly 1/2 cup lemon juice (8 tbsp, the threshold) still converts → 3 lemons', () => {
      expect(convertCitrusJuiceToFruit('lemon juice', { quantity: 0.5, unit: 'cup' }))
        .toEqual({ name: 'lemons', measurement: { quantity: 3, unit: 'each' } });
    });
  });

  describe('large volumes stay bottled (return null → item sent unchanged)', () => {
    it('1 cup lemon juice → null', () => {
      expect(convertCitrusJuiceToFruit('lemon juice', { quantity: 1, unit: 'cup' })).toBeNull();
    });

    it('0.75 cup lime juice → null', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 0.75, unit: 'cup' })).toBeNull();
    });

    it('1 pint lime juice → null', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 1, unit: 'pint' })).toBeNull();
    });
  });

  describe('name matching', () => {
    it('is case-insensitive and tolerates descriptors ("Fresh Lime Juice")', () => {
      expect(convertCitrusJuiceToFruit('Fresh Lime Juice', { quantity: 2, unit: 'tablespoon' }))
        .toEqual({ name: 'lime', measurement: { quantity: 1, unit: 'each' } });
    });

    it('freshly squeezed lemon juice converts', () => {
      expect(convertCitrusJuiceToFruit('freshly squeezed lemon juice', { quantity: 3, unit: 'tablespoon' }))
        .toEqual({ name: 'lemon', measurement: { quantity: 1, unit: 'each' } });
    });

    it('non-citrus names pass through: orange juice, apple juice, plain limes', () => {
      expect(convertCitrusJuiceToFruit('orange juice', { quantity: 2, unit: 'tablespoon' })).toBeNull();
      expect(convertCitrusJuiceToFruit('apple juice', { quantity: 1, unit: 'cup' })).toBeNull();
      expect(convertCitrusJuiceToFruit('limes', { quantity: 2, unit: 'each' })).toBeNull();
      expect(convertCitrusJuiceToFruit('lemon zest', { quantity: 1, unit: 'tablespoon' })).toBeNull();
    });

    it('empty name → null', () => {
      expect(convertCitrusJuiceToFruit('', { quantity: 2, unit: 'tablespoon' })).toBeNull();
    });
  });

  describe('explicitly bottled / beverage / varietal names are never converted', () => {
    it.each([
      'bottled lime juice',
      'lime juice concentrate',
      'lemon-lime soda',
      'lemon-lime juice',
      'limeade',
      'lemonade',
      'margarita mix with lime juice',
      'key lime juice',      // key lime pie wants the bottled varietal, not generic limes
      'meyer lemon juice',   // varietal — generic lemons are the wrong fruit + yield
    ])('%s → null', (name) => {
      expect(convertCitrusJuiceToFruit(name, { quantity: 2, unit: 'tablespoon' })).toBeNull();
    });
  });

  describe('"juice of N fruit" phrasing honors the recipe\'s own count (no volume cap)', () => {
    it('juice of 2 limes → 2 limes', () => {
      expect(convertCitrusJuiceToFruit('juice of 2 limes', null))
        .toEqual({ name: 'limes', measurement: { quantity: 2, unit: 'each' } });
    });

    it('juice of a lemon → 1 lemon', () => {
      expect(convertCitrusJuiceToFruit('juice of a lemon', null))
        .toEqual({ name: 'lemon', measurement: { quantity: 1, unit: 'each' } });
    });

    it('juice of 1/2 lime → 1 lime (fraction rounds up to a whole fruit)', () => {
      expect(convertCitrusJuiceToFruit('juice of 1/2 lime', null))
        .toEqual({ name: 'lime', measurement: { quantity: 1, unit: 'each' } });
    });

    it('juice of 12 limes → 12 limes (explicit fresh intent beats the bottled threshold)', () => {
      expect(convertCitrusJuiceToFruit('juice of 12 limes', null))
        .toEqual({ name: 'limes', measurement: { quantity: 12, unit: 'each' } });
    });

    it('juice and zest of 1 lime → 1 lime (zest requires the fresh fruit anyway)', () => {
      expect(convertCitrusJuiceToFruit('juice and zest of 1 lime', null))
        .toEqual({ name: 'lime', measurement: { quantity: 1, unit: 'each' } });
    });

    it('zest and juice of 2 lemons → 2 lemons (mirror phrasing)', () => {
      expect(convertCitrusJuiceToFruit('zest and juice of 2 lemons', null))
        .toEqual({ name: 'lemons', measurement: { quantity: 2, unit: 'each' } });
    });
  });

  describe('degenerate measurements (real users have messy data)', () => {
    it('no measurement at all → fresh, name-only (Instacart picks the count)', () => {
      expect(convertCitrusJuiceToFruit('lime juice', null))
        .toEqual({ name: 'limes', measurement: null });
    });

    it('zero/negative quantity → fresh, name-only', () => {
      expect(convertCitrusJuiceToFruit('lemon juice', { quantity: 0, unit: 'tablespoon' }))
        .toEqual({ name: 'lemons', measurement: null });
    });

    it('bare count ("2 lime juice" parsed as each) reads as fruit count → 2 limes', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 2, unit: 'each' }))
        .toEqual({ name: 'limes', measurement: { quantity: 2, unit: 'each' } });
    });

    it('unreasonable unit (lb) → fresh, name-only (never guess a count)', () => {
      expect(convertCitrusJuiceToFruit('lime juice', { quantity: 1, unit: 'lb' }))
        .toEqual({ name: 'limes', measurement: null });
    });
  });
});
