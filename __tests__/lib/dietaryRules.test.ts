/**
 * lib/dietaryRules.ts — the single source of truth for allergen/dietary filtering.
 *
 * Every case in the first block is a REAL leak proven against the live catalog by the
 * 2026-07-28 adversarial sweep of the first draft of this module (which used a GLOBAL
 * false-positive strip list). The headline defect: phrases whitelisted to stop "almond milk"
 * tripping DAIRY also deleted the word "almond", so nut-allergic users were served peanut
 * butter across 12 live recipes — including a user who typed "peanut butter" into the
 * dislikes box. These tests exist so that can never regress.
 */

import {
  violatesDietary, matchesDislike, expandDislike, recipeMatchText, hasNoIngredientData,
} from '@/lib/dietaryRules';

describe('allergens must never leak (the bugs that shipped in the first draft)', () => {
  it.each([
    ['peanut butter', '1/2 cup peanut butter'],
    ['almond milk', '1 cup unsweetened almond milk'],
    ['almond butter', '2 tbsp almond butter'],
    ['cashew milk', 'cashew milk latte'],
    ['cashew butter', 'cashew butter toast'],
    ['macadamia milk', 'macadamia milk smoothie'],
    ['pesto (pine nuts)', 'Pesto Chicken Pasta Bake basil pesto'],
  ])('nut_free blocks %s', (_label, text) => {
    expect(violatesDietary(text, ['nut_free'])).toBe(true);
  });

  it('the real "Nutty Chicken Curry" recipe is blocked for nut_free', () => {
    const recipe = {
      title: 'Nutty Chicken Curry',
      ingredients: [{ name: 'sunflower oil' }, { name: 'chicken breast' },
        { name: 'peanut butter' }, { name: 'chicken stock' }, { name: 'green beans' }],
    };
    expect(violatesDietary(recipeMatchText(recipe), ['nut_free'])).toBe(true);
  });

  it('a user who types their allergen as free text is protected', () => {
    expect(matchesDislike('peanut butter toast', ['peanut butter'])).toBe(true);
  });

  it.each([['Peanuts', 'Thai peanut butter noodles'], ['Nuts', 'almond milk latte']])(
    'the %s dislike chip catches it', (chip, text) => {
      expect(matchesDislike(text, [chip])).toBe(true);
    });

  it.each([['dairy_free'], ['vegan']])('%s blocks goat cheese', (goal) => {
    expect(violatesDietary('warm goat cheese salad with goat cheese log', [goal])).toBe(true);
  });
});

describe('category dislike chips expand (they matched nothing before)', () => {
  it.each([
    ['Shellfish', 'garlic butter shrimp scampi'],
    ['Shellfish', 'seared scallops'],
    ['Offal', 'chicken liver pate crostini'],
    ['Anchovies', 'Pasta Puttanesca with anchovy fillets in oil'],
    ['Mushrooms', 'shiitake mushroom stir fry'],
    ['Liver', 'calf liver and onions'],
  ])('%s chip matches "%s"', (chip, text) => {
    expect(matchesDislike(text, [chip])).toBe(true);
  });

  it('Shellfish expands to a category, not a literal', () => {
    expect(expandDislike('Shellfish').length).toBeGreaterThan(5);
  });
});

describe('missing keywords found by the sweep', () => {
  it.each([
    ['gluten_free', 'Chicken Gnocchi Soup with gnocchi'],
    ['gluten_free', 'Cheese Tortellini Soup'],
    ['gluten_free', 'spinach ravioli'],
    ['vegetarian', 'Hot Dog Macaroni and Cheese Casserole with hot dogs'],
    ['vegetarian', 'miso soup with dashi'],
    ['vegetarian', 'jamon serrano plate'],
    ['vegetarian', 'crispy lardons'],
    ['vegan', 'pad thai with fish sauce'],
  ])('%s blocks "%s"', (goal, text) => {
    expect(violatesDietary(text, [goal])).toBe(true);
  });
});

describe('false positives must NOT block legitimate food', () => {
  it.each([
    ['vegetarian', 'canned artichoke hearts'],
    ['vegan', 'hearts of palm salad'],
    ['vegetarian', 'kidney beans and rice'],
    ['vegan', 'minced garlic and olive oil'],
    ['vegan', 'sauteed oyster mushrooms'],
    ['dairy_free', 'butter lettuce or iceberg lettuce'],
    ['vegan', 'bean curd stir fry'],
    ['dairy_free', '1 can coconut milk'],
    ['vegan', 'cauliflower steak with herbs'],
    ['vegetarian', 'meat-free monday bowl'],
    ['gluten_free', 'rice noodles pad thai'],
    ['gluten_free', 'corn tortilla tacos'],
    ['nut_free', 'sliced water chestnuts'],
    ['nut_free', 'a pinch of nutmeg'],
    ['nut_free', 'shredded coconut'],
    ['vegetarian', 'graham cracker crust'],
    ['gluten_free', 'kale caesar salad'],
    ['vegan', 'pigeon peas and rice'],
  ])('%s allows "%s"', (goal, text) => {
    expect(violatesDietary(text, [goal])).toBe(false);
  });

  it('the Shellfish chip does not block crabapple jelly', () => {
    expect(matchesDislike('crabapple jelly', ['Shellfish'])).toBe(false);
  });
});

describe('goal semantics', () => {
  it('pescatarian allows fish but blocks land meat', () => {
    expect(violatesDietary('grilled salmon fillet', ['pescatarian'])).toBe(false);
    expect(violatesDietary('beef stew', ['pescatarian'])).toBe(true);
  });
  it('vegetarian blocks fish', () => {
    expect(violatesDietary('grilled salmon fillet', ['vegetarian'])).toBe(true);
  });
  it('vegan wins over a contradictory pescatarian goal', () => {
    expect(violatesDietary('grilled salmon', ['pescatarian', 'vegan'])).toBe(true);
  });
  it('vegan blocks dairy/egg/honey; vegetarian does not', () => {
    expect(violatesDietary('honey glazed carrots', ['vegan'])).toBe(true);
    expect(violatesDietary('honey glazed carrots', ['vegetarian'])).toBe(false);
  });
  it('accepts UI labels as well as ids (a label silently disabled every filter before)', () => {
    expect(violatesDietary('roasted peanuts', ['Nut Free'])).toBe(true);
    expect(violatesDietary('beef stew', ['Vegan'])).toBe(true);
  });
  it('no goals blocks nothing', () => {
    expect(violatesDietary('beef and cheese', [])).toBe(false);
  });
});

describe('robustness', () => {
  it('matches accented terms (JS \\b is ASCII-only)', () => {
    expect(matchesDislike('country pâté terrine', ['Offal'])).toBe(true);
    expect(violatesDietary('jamón serrano', ['vegetarian'])).toBe(true);
  });
  it('generated plurals match', () => {
    expect(violatesDietary('ribeye steaks', ['vegetarian'])).toBe(true);
    expect(violatesDietary('anchovies and capers', ['vegetarian'])).toBe(true);
    expect(violatesDietary('grilled scallops', ['vegetarian'])).toBe(true);
  });
  it('Object.prototype keys as dislikes do not throw or over-match', () => {
    for (const k of ['constructor', 'hasOwnProperty', '__proto__', 'toString']) {
      expect(() => matchesDislike('beef stew', [k])).not.toThrow();
      expect(matchesDislike('beef stew', [k])).toBe(false);
    }
  });
  it('punctuation-only dislikes block nothing (would have blocked the catalog)', () => {
    expect(matchesDislike('anything at all', ['!!!'])).toBe(false);
    expect(matchesDislike('anything at all', ['   '])).toBe(false);
  });
  it('a regex-metachar dislike is escaped, not injected', () => {
    expect(() => matchesDislike('beef stew', ['(', '[a-z]', '.*', 'a|b'])).not.toThrow();
    expect(matchesDislike('beef stew', ['.*'])).toBe(false);
  });
  it('an absurdly long dislike is bounded', () => {
    expect(() => matchesDislike('beef stew', ['a'.repeat(50_000)])).not.toThrow();
  });
  it('null/undefined inputs are safe', () => {
    expect(violatesDietary('', ['vegan'])).toBe(false);
    expect(matchesDislike('beef', [null as any, undefined as any])).toBe(false);
    expect(recipeMatchText({ title: null, ingredients: null })).toBe(' ');
  });
  it('flags recipes with no ingredient data so callers can fail closed', () => {
    expect(hasNoIngredientData({ ingredients: [] })).toBe(true);
    expect(hasNoIngredientData({ ingredients: null })).toBe(true);
    expect(hasNoIngredientData({ ingredients: [{ name: 'beef' }] })).toBe(false);
  });
  it('handles string[] and {name}[] ingredient shapes', () => {
    expect(recipeMatchText({ title: 'X', ingredients: ['beef', { name: 'cheese' }] as any }))
      .toContain('beef');
  });
});


describe('named cuts + catalog spellings (regression: dropping bare "steak"/"bass" un-blocked real meat)', () => {
  it.each([
    ['vegan', 'Steak Fajita Rice Bowl flank steak or skirt steak'],
    ['vegetarian', 'Sheet Pan Fajita Steak flank steak or skirt steak'],
    ['pescatarian', 'Marinated Flank Steak with Peppers flank steak'],
    ['pescatarian', 'Steak and Vietnamese noodle salad fillet of steak'],
    ['vegetarian', 'Hawaiian Spam Musubi Spam'],
    ['vegetarian', 'Kapsalon doner meat'],
    ['vegan', 'Sea bass with sizzled ginger sea bass fillets'],
    ['vegetarian', 'Grilled Whole Branzino whole branzino'],
    ['vegetarian', 'Sea Bream Baked in Salt Crust sea bream'],
    ['vegetarian', 'Pilchard puttanesca pilchards'],
  ])('%s blocks "%s"', (goal, text) => {
    expect(violatesDietary(text, [goal])).toBe(true);
  });

  it('still allows the vegetable impostors the exemptions exist for', () => {
    expect(violatesDietary('cauliflower steak with herbs', ['vegan'])).toBe(false);
    expect(violatesDietary('mushroom steak', ['vegan'])).toBe(false);
  });

  it('pescatarians keep fish steaks', () => {
    expect(violatesDietary('grilled salmon steak', ['pescatarian'])).toBe(false);
    expect(violatesDietary('swordfish steaks', ['pescatarian'])).toBe(false);
  });
});

describe('dislike exemptions (regression: "Olives" chip blocked 840 recipes via olive oil)', () => {
  it('Olives chip ignores olive oil', () => {
    expect(matchesDislike('Baked Garlic Parmesan Chicken with olive oil', ['Olives'])).toBe(false);
    expect(matchesDislike('sheet pan vegetables, extra virgin olive oil', ['Olives'])).toBe(false);
  });
  it('Olives chip still catches actual olives', () => {
    expect(matchesDislike('Greek salad with kalamata olives', ['Olives'])).toBe(true);
    expect(matchesDislike('olive tapenade crostini', ['Olives'])).toBe(true);
    expect(matchesDislike('pasta with black olives', ['Olives'])).toBe(true);
  });
  it('an exemption for one dislike never softens another', () => {
    // 'olive oil' is exempt for Olives, but must not hide anything from a different term.
    expect(matchesDislike('chicken thighs in olive oil', ['Chicken'])).toBe(true);
  });
});
