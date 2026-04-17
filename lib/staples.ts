// Staples that are NOT tracked as leftovers and NOT given ingredient_storage rows.
// Rationale: users keep these on hand long-term; they don't spoil on a cook-session
// timescale. Appearing as a "leftover" adds noise without scorer signal.
//
// Per product call (April 2026): vinegar, stock, and broth are NOT staples — they
// open and spoil, and power the scorer bonus for "reuse that leftover stock."
//
// Used by:
//   - scripts/backfill-ingredient-storage.mjs  → skip these during Haiku pass
//   - components/PostCookLeftoversModal.tsx    → hide from post-cook checklist
//   - lib/api.ts#fetchLeftoverNames            → defensive filter on read

export const STAPLES: ReadonlySet<string> = new Set([
  // Fats + acids that don't need tracking
  'salt', 'kosher salt', 'sea salt', 'table salt',
  'pepper', 'black pepper', 'white pepper', 'ground pepper',
  'oil', 'olive oil', 'extra virgin olive oil', 'vegetable oil',
  'canola oil', 'sunflower oil', 'grapeseed oil', 'neutral oil',
  'sesame oil', 'cooking oil',
  'water', 'ice', 'ice cubes',
  // Dry goods
  'flour', 'all-purpose flour', 'all purpose flour', 'plain flour',
  'bread flour', 'cake flour', 'whole wheat flour', 'self-raising flour',
  'sugar', 'white sugar', 'granulated sugar', 'caster sugar',
  'brown sugar', 'light brown sugar', 'dark brown sugar',
  'baking soda', 'bicarbonate of soda', 'baking powder', 'cornstarch', 'corn starch',
  'cornflour',
  // Common shelf-stable
  'butter', 'unsalted butter', 'salted butter',
  'garlic', 'garlic clove', 'garlic cloves', 'minced garlic', 'garlic powder',
  // Dried spices — almost never "leftover" in a meaningful way
  'cumin', 'ground cumin', 'cumin seeds',
  'paprika', 'smoked paprika', 'sweet paprika', 'hot paprika',
  'chilli flakes', 'chili flakes', 'red pepper flakes', 'crushed red pepper',
  'oregano', 'dried oregano',
  'thyme', 'dried thyme',
  'basil', 'dried basil',
  'bay leaf', 'bay leaves',
  'cinnamon', 'ground cinnamon', 'cinnamon stick',
  'nutmeg', 'ground nutmeg',
  'coriander', 'ground coriander', 'coriander seeds',
  'turmeric', 'ground turmeric',
  'ginger powder', 'ground ginger',
  'onion powder', 'cayenne', 'cayenne pepper',
  'italian seasoning', 'herbs de provence',
]);

// Careful matcher — plain substring matching misfires ("butter" vs "butternut",
// "pepper" vs "bell pepper"). Strategy:
//   1. Exact match on full trimmed lowercased name.
//   2. Multi-word staples match as a whole phrase anywhere in the name
//      (so "3 tbsp olive oil, extra virgin" still registers as a staple).
//   3. Single-word staples match only when they are the FULL name, not part
//      of a vegetable-style compound like "bell pepper" or "butternut squash".
export function isStaple(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (STAPLES.has(n)) return true;
  for (const s of STAPLES) {
    if (s.includes(' ') && n.includes(s)) return true;
  }
  return false;
}
