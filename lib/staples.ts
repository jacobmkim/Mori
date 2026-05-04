// Staples that are NOT tracked as leftovers and NOT given ingredient_storage rows.
// Rationale: users keep these on hand long-term; they don't spoil on a cook-session
// timescale. Appearing as a "leftover" adds noise without scorer signal.
//
// Per product call (April 2026): stock and broth are NOT staples — they open and
// spoil within days and power the scorer "reuse that leftover stock" bonus.
// Distilled vinegars ARE staples — indefinite shelf life, no meaningful leftover signal.
//
// Used by:
//   - scripts/backfill-ingredient-storage.mjs  → skip these during Haiku pass
//   - components/PostCookLeftoversModal.tsx    → hide from post-cook checklist
//   - lib/api.ts#fetchLeftoverNames            → defensive filter on read

export const STAPLES: ReadonlySet<string> = new Set([
  // Distilled / wine vinegars — indefinite shelf life per USDA (balsamic intentionally
  // excluded: fridge-tracked 6mo after opening, specialty, worth real reminders).
  'vinegar', 'white vinegar', 'distilled vinegar', 'distilled white vinegar',
  'apple cider vinegar', 'cider vinegar',
  'white wine vinegar', 'red wine vinegar', 'black vinegar',
  'champagne vinegar', 'sherry vinegar', 'malt vinegar', 'cleaning vinegar',
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
  // Fresh / fridge-tracked items that previously slipped into STAPLES — REMOVED:
  //   - butter (1–2 month shelf life once opened, runs out routinely)
  //   - fresh garlic / garlic cloves / minced garlic (bulbs spoil in 1–2 weeks once peeled)
  // Only the dried/powdered/processed forms are shelf-stable enough to auto-skip.
  'garlic powder',
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
  // Extended dry spices / seasoning blends — USDA 2-3 year shelf life, no leftover signal
  'allspice', 'ground allspice', 'allspice berries',
  'cardamom', 'ground cardamom', 'green cardamom pods', 'black cardamom',
  'clove', 'cloves', 'ground clove', 'ground cloves',
  'fennel seeds', 'caraway seed', 'caraway seeds',
  'mustard powder', 'mustard seeds',
  'peppercorns', 'sichuan pepper', 'juniper berries',
  'saffron', 'saffron threads',
  'cumin powder', 'coriander powder',
  'curry powder', 'red chili powder', 'chili powder', 'chilli powder', 'red chilli powder',
  'garam masala', 'garam masala powder', 'biryani masala',
  'pav bhaji masala', 'pav bhaji masala spice blend', 'jamaican curry powder',
  'cajun seasoning', 'fajita seasoning', 'old bay seasoning', 'all-purpose seasoning',
  'five spice powder', 'five-spice powder', 'ras el hanout',
  'celery salt', 'onion salt', 'everything bagel seasoning',
  'dried chillies', 'dried red chilli', 'dried red chilies', 'dried red chillies',
  'dried red peppers', 'pul biber',
  'ground paprika', 'paprika smoked', 'paprika spanish smoked',
  'ground annatto', 'amchur powder', 'ground sumac',
  // Dried herbs — USDA 1-3 year shelf life
  'dried dill', 'dried parsley', 'dried rosemary', 'dried sage',
  'dried mint', 'dried mexican oregano', 'dried herbes de provence',
  // Sweeteners — USDA honey indefinite, syrups 1+ year
  'honey', 'raw honey', 'maple syrup', 'pure maple syrup', 'golden syrup',
  'black treacle', 'molasses', 'icing sugar', 'powdered sugar', 'confectioners sugar',
  'muscovado sugar', 'palm sugar', 'rock sugar',
  // Extracts & leavening — alcohol-based, indefinite
  'vanilla extract', 'pure vanilla extract', 'vanilla bean paste',
  'yeast', 'active dry yeast', 'instant yeast',
  // Extra oils — USDA 1-2 year shelf life
  'rapeseed oil', 'peanut oil', 'groundnut oil', 'ground nut oil', 'avocado oil',
  'coconut oil',
  // Dry grains / pasta — USDA 2+ years unopened
  'rice', 'white rice', 'long-grain rice', 'long-grain white rice', 'long grain rice',
  'jasmine rice', 'jasmine rice uncooked', 'basmati rice',
  'arborio rice', 'paella rice', 'sushi rice', 'short grain rice',
  'dried pasta', 'spaghetti', 'penne', 'penne rigate', 'rigatoni',
  'fusilli', 'farfalle', 'bowtie pasta', 'ditalini pasta', 'linguine pasta',
  'paccheri pasta', 'cannelloni tubes dried pasta', 'lasagna sheets, dried',
  'lasagna sheets dried', 'egg noodles dried', 'ramen noodles dried',
  'dried rice noodles', 'dried soba noodles', 'rice vermicelli', 'glass noodles',
  'fideo noodles', 'korean instant ramyeon noodles',
  'oats', 'rolled oats', 'steel cut oats', 'quick oats',
  'buckwheat', 'bulgur wheat', 'farro', 'freekeh', 'rye', 'pearl barley', 'barley',
  'quinoa', 'cornmeal', 'corn flour', 'masa harina', 'potato starch',
  'cornbread mix', 'custard powder',
  // Dried legumes — USDA indefinite
  'dried chickpeas', 'dried pinto beans', 'dried red kidney beans', 'dried white beans',
  'dried black beans', 'dried kidney beans', 'dried lentils', 'dried split peas',
  // Dry stock / bouillon — shelf-stable 2+ years (liquid stock/broth stays trackable)
  'chicken stock cube', 'beef stock cube', 'vegetable stock cube', 'stock cube',
  'chicken bouillon powder', 'bouillon powder', 'dashi powder', 'dashi stock powder',
  'dashi powder or chicken stock powder', 'chicken stock powder',
  // Alcohol — USDA spirits indefinite
  'brandy', 'dark rum', 'white rum', 'rum', 'whiskey', 'bourbon', 'vodka', 'gin',
  'grand marnier', 'cognac', 'coffee liqueur or dark rum',
  'chinese cooking wine', 'shaoxing wine', 'sake', 'mirin',
  // Dry seaweed & shelf-stable dry goods
  'dried seaweed', 'dried seaweed wakame', 'kombu', 'kombu seaweed', 'nori',
  'gelatin sheets', 'cocoa powder', 'cocoa', 'cacao',
  'green tea', 'ginseng root, dried',
  // Non-food items that crept into recipe ingredient lists
  'bamboo skewers', 'skewers', 'toothpicks', 'corn husks, dried', 'corn husks',
  'boiling water', 'cold water', 'hot water', 'ice water', 'warm water',
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

// Splits a list of grocery items into what we'll send by default vs what to
// auto-skip. Staples (USDA-shelf-stable, large containers — see STAPLES set above)
// auto-skip; pantry matches go through as a *hint* — sent by default, with the
// caller free to render an opt-out affordance per item. Staples take precedence
// over pantry membership: a salt-in-pantry entry reads as a staple, never both.
export function partitionForInstacart<T extends { ingredient_name: string }>(
  items: T[],
  pantryNames: ReadonlySet<string>,
): {
  sendable: T[];                     // includes pantry hints by default
  pantryHints: ReadonlySet<string>;  // normalized (trimmed + lowercased) names of sendable items in pantry
  skippedStaples: number;
  skippedItems: T[];                 // staples only — feeds the "Add back" modal
} {
  const sendable: T[] = [];
  const skippedItems: T[] = [];
  const pantryHints = new Set<string>();
  let skippedStaples = 0;
  for (const item of items) {
    if (isStaple(item.ingredient_name)) {
      skippedStaples++;
      skippedItems.push(item);
      continue;
    }
    sendable.push(item);
    const key = item.ingredient_name.trim().toLowerCase();
    if (pantryNames.has(key)) pantryHints.add(key);
  }
  return { sendable, pantryHints, skippedStaples, skippedItems };
}
