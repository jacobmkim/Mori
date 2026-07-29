import {
  cookingMethods, usesMethod, filterByMethods, COOKING_METHOD_ORDER, COOKING_METHOD_LABELS,
} from '@/lib/cookingMethods';

const r = (title: string, steps: string[] = []) => ({ title, steps: steps.map((text) => ({ text })) });

describe('detects equipment methods from title or steps', () => {
  it.each([
    ['one_pot', r('One-Pot Creamy Tomato Pasta')],
    ['one_pot', r('Chicken Dinner', ['Roast everything on a sheet pan for 25 minutes'])],
    ['one_pot', r('Sausage Traybake')],
    ['slow_cooker', r('Slow Cooker Pulled Pork')],
    ['slow_cooker', r('Beef Chili', ['Add to the crockpot and cook on low for 8 hours'])],
    ['pressure_cooker', r('Instant Pot Risotto')],
    ['pressure_cooker', r('Beans', ['Pressure cook for 12 minutes'])],
    ['air_fryer', r('Air Fryer Crispy Chickpeas')],
    ['air_fryer', r('Wings', ['Air-fry at 200C for 18 minutes'])],
    ['grill', r('Grilled Halloumi Salad')],
    ['grill', r('Steak', ['Place under the broiler for 4 minutes'])],
    ['grill', r('Corn', ['Barbecue until charred'])],
  ] as const)('%s: %o', (method, recipe) => {
    expect(usesMethod(recipe, method as any)).toBe(true);
    expect(cookingMethods(recipe)).toContain(method);
  });
});

describe('does not tag technique-only recipes', () => {
  // Measured against the live catalog: 'skillet/stovetop' matches 46% of recipes and 'oven/bake'
  // 20% — including them would make the chips meaningless, so they are deliberately absent.
  it.each([
    r('Weeknight Bolognese', ['Brown the mince in a large skillet', 'Simmer for 30 minutes']),
    r('Roast Chicken', ['Preheat the oven to 200C', 'Bake for 45 minutes']),
    r('Stir Fry', ['Heat a wok over high heat']),
  ])('untagged: %o', (recipe) => {
    expect(cookingMethods(recipe)).toEqual([]);
  });
});

describe('a recipe can carry more than one method', () => {
  it('sheet-pan + grill finish', () => {
    const recipe = r('Sheet Pan Salmon', ['Roast on a sheet pan', 'Finish under the grill']);
    expect(cookingMethods(recipe).sort()).toEqual(['grill', 'one_pot'].sort());
  });
});

describe('filterByMethods', () => {
  const list = [
    r('One-Pot Pasta'), r('Air Fryer Wings'), r('Slow Cooker Stew'), r('Pan-Seared Steak'),
  ];
  it('no selection is a no-op', () => {
    expect(filterByMethods(list, [])).toHaveLength(4);
  });
  it('single method', () => {
    expect(filterByMethods(list, ['air_fryer']).map((x) => x.title)).toEqual(['Air Fryer Wings']);
  });
  it('multiple methods are OR-ed', () => {
    expect(filterByMethods(list, ['air_fryer', 'slow_cooker']).map((x) => x.title))
      .toEqual(['Air Fryer Wings', 'Slow Cooker Stew']);
  });
});

describe('robustness', () => {
  it('handles missing/degenerate input without throwing', () => {
    expect(cookingMethods({} as any)).toEqual([]);
    expect(cookingMethods({ title: null, steps: null })).toEqual([]);
    expect(cookingMethods({ title: '   ', steps: [] })).toEqual([]);
    expect(usesMethod({ title: null, steps: null }, 'grill')).toBe(false);
  });
  it('handles string[] steps as well as {text}[]', () => {
    expect(cookingMethods({ title: 'X', steps: ['Air fry for 10 min'] as any })).toContain('air_fryer');
  });
  it('every ordered method has a label', () => {
    for (const m of COOKING_METHOD_ORDER) expect(COOKING_METHOD_LABELS[m]).toBeTruthy();
  });
});
