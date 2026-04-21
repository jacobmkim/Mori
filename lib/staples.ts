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
  // Ground forms (canonical targets after normalization)
  'ground cumin',
  // Compound staple safety net — catches community recipes that write these as one ingredient
  'salt and pepper', 'salt and black pepper', 'salt & pepper',
  'sea salt and black pepper', 'salt and white pepper',
  'salt and black pepper to taste',
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

// Splits a list of grocery items into what we should send to Instacart vs what to
// skip silently. Staples take precedence over pantry matches so a salt-in-pantry
// entry doesn't inflate the "pantry items" count — it reads as a staple either way.
export function partitionForInstacart<T extends { ingredient_name: string }>(
  items: T[],
  pantryNames: ReadonlySet<string>,
): { sendable: T[]; skippedStaples: number; skippedPantry: number; skippedItems: T[] } {
  const sendable: T[] = [];
  const skippedItems: T[] = [];
  let skippedStaples = 0;
  let skippedPantry = 0;
  for (const item of items) {
    if (isStaple(item.ingredient_name)) {
      skippedStaples++;
      skippedItems.push(item);
      continue;
    }
    if (pantryNames.has(item.ingredient_name.trim().toLowerCase())) {
      skippedPantry++;
      skippedItems.push(item);
      continue;
    }
    sendable.push(item);
  }
  return { sendable, skippedStaples, skippedPantry, skippedItems };
}
