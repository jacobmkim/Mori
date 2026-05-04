import { isStaple, STAPLES } from '@/lib/staples';

describe('isStaple — exact matches', () => {
  it('returns true for core spices', () => {
    expect(isStaple('salt')).toBe(true);
    expect(isStaple('black pepper')).toBe(true);
    expect(isStaple('cumin')).toBe(true);
    expect(isStaple('paprika')).toBe(true);
    expect(isStaple('oregano')).toBe(true);
  });

  it('returns true for oils', () => {
    expect(isStaple('olive oil')).toBe(true);
    expect(isStaple('vegetable oil')).toBe(true);
    expect(isStaple('sesame oil')).toBe(true);
  });

  it('returns true for baking dry goods', () => {
    expect(isStaple('flour')).toBe(true);
    expect(isStaple('baking soda')).toBe(true);
    expect(isStaple('baking powder')).toBe(true);
    expect(isStaple('cornstarch')).toBe(true);
  });

  it('returns true for sugar variants', () => {
    expect(isStaple('sugar')).toBe(true);
    expect(isStaple('brown sugar')).toBe(true);
    expect(isStaple('caster sugar')).toBe(true);
  });

  it('trims and lowercases before matching', () => {
    expect(isStaple('  Salt  ')).toBe(true);
    expect(isStaple('GARLIC POWDER')).toBe(true);
    expect(isStaple('Olive Oil')).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isStaple('')).toBe(true);
    expect(isStaple('   ')).toBe(true);
  });
});

describe('isStaple — non-staples (must be tracked as leftovers)', () => {
  it('returns false for stock and broth (product decision — real 3-5d spoilage, powers scorer)', () => {
    expect(isStaple('chicken stock')).toBe(false);
    expect(isStaple('beef broth')).toBe(false);
    expect(isStaple('vegetable stock')).toBe(false);
  });

  it('returns false for balsamic vinegar (180-day fridge life, worth tracking)', () => {
    expect(isStaple('balsamic vinegar')).toBe(false);
  });

  it('returns false for proteins', () => {
    expect(isStaple('chicken')).toBe(false);
    expect(isStaple('salmon')).toBe(false);
    expect(isStaple('ground beef')).toBe(false);
    expect(isStaple('tofu')).toBe(false);
  });

  it('returns false for vegetables', () => {
    expect(isStaple('onion')).toBe(false);
    expect(isStaple('carrot')).toBe(false);
    expect(isStaple('spinach')).toBe(false);
    expect(isStaple('bell pepper')).toBe(false);
  });

  it('returns false for dairy (non-staple variants)', () => {
    expect(isStaple('heavy cream')).toBe(false);
    expect(isStaple('milk')).toBe(false);
    expect(isStaple('cheddar cheese')).toBe(false);
    expect(isStaple('butter')).toBe(false);
    expect(isStaple('unsalted butter')).toBe(false);
  });

  it('returns false for fresh garlic (only garlic powder is a staple)', () => {
    expect(isStaple('garlic')).toBe(false);
    expect(isStaple('garlic clove')).toBe(false);
    expect(isStaple('garlic cloves')).toBe(false);
    expect(isStaple('minced garlic')).toBe(false);
    expect(isStaple('garlic powder')).toBe(true);
  });
});

describe('isStaple — false-positive guards (no accidental substring matching)', () => {
  it('does not match "butter" inside "butternut squash"', () => {
    expect(isStaple('butternut squash')).toBe(false);
  });

  it('does not match "pepper" inside "bell pepper"', () => {
    expect(isStaple('bell pepper')).toBe(false);
  });

  it('does not match "water" inside "watercress"', () => {
    expect(isStaple('watercress')).toBe(false);
  });

  it('does not match "oil" inside non-staple oils', () => {
    // Sunflower/olive/coconut oil are staples (USDA 1-2yr shelf life); verify
    // single-word "oil" doesn't false-match things that merely end in "oil".
    expect(isStaple('lamp oil')).toBe(false);
    expect(isStaple('essential oil')).toBe(false);
  });

  it('does not match "salt" inside "salted caramel"', () => {
    expect(isStaple('salted caramel')).toBe(false);
  });

  it('does not match "thyme" inside "thyme-infused broth"', () => {
    // "thyme" exact is a staple; "thyme-infused broth" is not
    expect(isStaple('thyme-infused broth')).toBe(false);
  });
});

describe('isStaple — multi-word phrase substring (valid use case)', () => {
  it('matches "olive oil" phrase inside a measurement string', () => {
    // "3 tbsp olive oil, extra virgin" → contains the multi-word staple "olive oil"
    expect(isStaple('extra virgin olive oil')).toBe(true);
  });

  it('matches "brown sugar" inside "packed brown sugar"', () => {
    expect(isStaple('packed brown sugar')).toBe(true);
  });
});

describe('STAPLES set — completeness sanity check', () => {
  it('has at least 40 entries', () => {
    expect(STAPLES.size).toBeGreaterThanOrEqual(40);
  });

  it('every entry is lowercase and trimmed', () => {
    for (const s of STAPLES) {
      expect(s).toBe(s.toLowerCase().trim());
    }
  });
});
