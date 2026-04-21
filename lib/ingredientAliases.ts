// Canonical ingredient name map — alias → canonical grocery name.
// Applied at DB backfill time (scripts/normalize-ingredients.mjs) and
// at grocery-add time (stores/groceryStore.ts) so future community
// recipes with any alias still dedup correctly on the grocery list.
//
// Rules for inclusion:
//   - Same physical product at the grocery store (not just "related")
//   - Plural/singular of the same item
//   - Regional spelling variants (UK chilli / US chili)
//   - Prep-word-in-name variants (e.g. "minced garlic" → "garlic cloves")
//
// NOT included:
//   - oil ≠ olive oil ≠ vegetable oil ≠ sesame oil
//   - onion ≠ onion powder
//   - garlic cloves ≠ garlic powder
//   - cumin seeds ≠ ground cumin
//   - coriander (ambiguous: herb vs spice in Indian recipes)
//   - lemon ≠ lemon juice, lime ≠ lime juice
//   - tomatoes ≠ cherry tomatoes ≠ tomato paste ≠ tomato sauce
//   - Any "X or Y" alternative phrasing — left as-is

export const CANONICAL_MAP: Record<string, string> = {
  // ── Onion family ────────────────────────────────────────────────────────
  'onions':                    'onion',
  'onion, medium':             'onion',
  'onion, cubed':              'onion',
  'chopped onion':             'onion',
  'red onions':                'red onion',
  'shallot':                   'shallots',

  // Green onion / spring onion / scallion — same vegetable, different regions
  'green onion':               'green onions',
  'spring onions':             'green onions',
  'spring onion':              'green onions',
  'scallions':                 'green onions',
  'scallion':                  'green onions',
  'green onion (scallions)':   'green onions',

  // ── Garlic family ───────────────────────────────────────────────────────
  'garlic':                            'garlic cloves', // MealDB "Garlic" = fresh cloves
  'garlic clove':                      'garlic cloves',
  'garlic cloves, smashed':            'garlic cloves',
  'garlic cloves, thinly sliced':      'garlic cloves',
  'garlic cloves, sliced thin':        'garlic cloves',
  'minced garlic':                     'garlic cloves',
  // garlic powder, garlic bulb, garlic sauce intentionally NOT mapped

  // ── Eggs ────────────────────────────────────────────────────────────────
  'egg':        'eggs',
  'large eggs': 'eggs',
  'egg white':  'egg whites',
  'egg yolk':   'egg yolks',
  'egg plants': 'eggplant',       // misspelling / alternate form

  // ── Vegetables ──────────────────────────────────────────────────────────
  'carrot':           'carrots',
  'carrot, cubed':    'carrots',
  'tomato':           'tomatoes',
  'tomato, medium':   'tomatoes',
  'ripe tomatoes':    'tomatoes',
  'lemons':           'lemon',
  'bay leaf':         'bay leaves',
  'bell peppers':     'bell pepper',
  'red bell peppers': 'red bell pepper',
  // cherry tomatoes, tomato paste, tomato sauce, etc. intentionally NOT merged

  // ── Chicken cuts ────────────────────────────────────────────────────────
  'chicken breasts': 'chicken breast',

  // ── UK tomato conventions ───────────────────────────────────────────────
  'tinned tomatos':    'canned tomatoes', // misspelling
  'chopped tomatoes':  'canned tomatoes', // UK "chopped tomatoes" = tin

  // ── Oils ────────────────────────────────────────────────────────────────
  'sesame seed oil':        'sesame oil',
  'vegetable oil for frying': 'vegetable oil',
  'ground nut oil':         'peanut oil',
  // oil / olive oil / vegetable oil intentionally NOT merged with each other

  // ── Flour ───────────────────────────────────────────────────────────────
  'all purpose flour': 'all-purpose flour',  // missing hyphen
  'plain flour':       'all-purpose flour',  // UK name
  // self-raising flour, bread flour, cake flour — different products, kept separate

  // ── Pepper / spices ─────────────────────────────────────────────────────
  'ground black pepper':      'black pepper',
  'chilli powder':            'chili powder',       // UK → US spelling
  'red chilli flakes':        'red pepper flakes',
  'dried red chilli flakes':  'red pepper flakes',
  'cumin':                    'ground cumin',       // bare "cumin" = ground in recipe context
  'cumin powder':             'ground cumin',
  // cumin seeds intentionally NOT merged with ground cumin

  // ── Stock / broth ───────────────────────────────────────────────────────
  'chicken broth':   'chicken stock',
  'beef broth':      'beef stock',
  'vegetable broth': 'vegetable stock',

  // ── Fresh herbs ─────────────────────────────────────────────────────────
  'parsley':                  'fresh parsley',
  'fresh flat-leaf parsley':  'fresh parsley',
  'cilantro':                 'fresh cilantro',
  'coriander leaves':         'fresh cilantro',
  'fresh coriander':          'fresh cilantro',
  'fresh coriander leaves':   'fresh cilantro',
  'fresh cilantro leaves':    'fresh cilantro',
  // "coriander" alone is ambiguous (herb vs spice) — intentionally NOT mapped
  'fresh ginger':  'ginger',
  'ginger, fresh': 'ginger',

  // ── UK ↔ US meat terminology ────────────────────────────────────────────
  'minced beef': 'ground beef',
  'lamb mince':  'ground lamb',
  'minced pork': 'ground pork',

  // ── Meat plurals ─────────────────────────────────────────────────────────
  // Only plurals — prep descriptors (bone-in, skinless, cubed) are meaningful
  // specs that affect what to buy; those are intentionally NOT merged
  'chicken thigh': 'chicken thighs',
  'salmon fillet':  'salmon fillets',

  // ── Other format variants ────────────────────────────────────────────────
  'double cream':           'heavy cream',   // UK → US
  'mirin (sweet rice wine)': 'mirin',
};

export function normalizeIngredientName(name: string): string {
  const n = name.trim().toLowerCase();
  return CANONICAL_MAP[n] ?? n;
}
