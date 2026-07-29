/**
 * Catalog-shaped regression fixtures. These are REAL rows the 2026-07-28 batch review found
 * leaking past the gate on the live 2,618-recipe catalog (vegan deck: 208 recipes, 5 containing
 * animal flesh). Kept as fixtures rather than a live query so the check runs in CI offline.
 */

import { filterAndMapDeckRecipes } from '@/lib/deckFilter';

const row = (title: string, ingredients: string[]) => ({
  id: title, external_id: title, title,
  ingredients: ingredients.map((name) => ({ name, quantity: '1', unit: 'x' })),
  dietary_tags: [], steps: [], cuisine: 'Test', source_type: 'curated', is_public: true,
});

// Verbatim from the live catalog — titles + the ingredient strings that defeated the gate.
const LEAKED = [
  row('Steak Fajita Rice Bowl with Charred Peppers', ['flank steak or skirt steak', 'bell pepper']),
  row('Sheet Pan Fajita Steak with Peppers and Onions', ['flank steak or skirt steak', 'onion']),
  row('Marinated Flank Steak with Peppers', ['flank steak', 'red pepper']),
  row('Steak & Vietnamese noodle salad', ['fillet of steak', 'rice noodles']),
  row('Hawaiian Spam Musubi', ['Spam', 'sushi rice', 'nori']),
  row('Kapsalon', ['doner meat', 'fries', 'gouda']),
  row('Sea bass with sizzled ginger, chilli & spring onions', ['sea bass fillets', 'ginger']),
  row('Grilled Whole Branzino', ['whole branzino (sea bass)', 'lemon']),
  row('Sea Bream Baked in Salt Crust (Dorada a la Sal)', ['sea bream', 'sea salt']),
  row('Pilchard puttanesca', ['pilchards', 'spaghetti', 'capers']),
];

describe('live-catalog leaks are blocked (regression: named cuts + catalog spellings)', () => {
  it('none reach a vegan', () => {
    expect(filterAndMapDeckRecipes(LEAKED, ['vegan']).map((r) => r.title)).toEqual([]);
  });
  it('none reach a vegetarian', () => {
    expect(filterAndMapDeckRecipes(LEAKED, ['vegetarian']).map((r) => r.title)).toEqual([]);
  });
  it('no LAND meat reaches a pescatarian (fish is fine)', () => {
    const out = filterAndMapDeckRecipes(LEAKED, ['pescatarian']).map((r) => r.title);
    // The four fish dishes are legitimate for a pescatarian; every meat dish must be gone.
    expect(out).not.toEqual(expect.arrayContaining([
      expect.stringContaining('Steak'), expect.stringContaining('Spam'), expect.stringContaining('Kapsalon'),
    ]));
    expect(out.length).toBe(4);
  });
});

describe('the gate does not collapse the pool (over-blocking is its own failure)', () => {
  const EVERYDAY = [
    row('Baked Garlic Parmesan Crusted Chicken', ['chicken breast', 'olive oil', 'parmesan']),
    row('Sheet Pan Sausage and Vegetables', ['sausage', 'olive oil', 'zucchini']),
    row('Hummus and Veggie Pita', ['hummus', 'olive oil', 'pita']),
    row('Lentil Soup', ['lentils', 'olive oil', 'carrot']),
    row('Chickpea Salad', ['chickpeas', 'extra virgin olive oil', 'cucumber']),
  ];

  it('an "Olives" dislike does not strip everything cooked in olive oil', () => {
    // Before the exemption this removed ~840 of 2,510 deck recipes for 13 live users.
    const out = filterAndMapDeckRecipes(EVERYDAY, [], ['Olives']);
    expect(out.length).toBe(EVERYDAY.length);
  });

  it('a vegan still gets the plant-based dishes', () => {
    const out = filterAndMapDeckRecipes(EVERYDAY, ['vegan']).map((r) => r.title);
    expect(out).toEqual(expect.arrayContaining(['Lentil Soup', 'Chickpea Salad']));
  });
});
