// Dietary + allergen rules — the SINGLE source of truth for "may this recipe reach this user".
//
// Every surface that shows a recipe to a user with a declared restriction MUST go through
// `violatesDietary()` / `matchesDislike()` here: the Discover deck, Auto Plan, Sunday Drop
// (generation AND hydration re-validation), the Plan picker, pantry match, and the AI endpoints.
// Duplicated keyword lists are how a vegan gets served chicken — don't inline new ones.
//
// ── Design rules, each one paid for by a real bug ────────────────────────────
// 1. EXEMPTIONS ARE PER-CATEGORY, NEVER GLOBAL. A phrase whitelisted to stop "almond milk"
//    tripping DAIRY must NOT hide the word "almond" from NUTS. A global strip list shipped
//    peanut butter to nut-allergic users across 12 live recipes — the worst class of bug here.
// 2. ALLERGENS FAIL SAFE. For NUTS/DAIRY/EGG/GLUTEN/SHELLFISH, over-blocking is an annoyance;
//    under-blocking is a hospital visit. When unsure, block.
// 3. NO BARE AMBIGUOUS KEYWORDS. 'heart' matched artichoke hearts, 'steak' matched cauliflower
//    steak, 'meat' matched meat-free. Ambiguous words are listed only in specific phrases.
// 4. Text is diacritic-folded before matching, so 'pâté'/'jamón' match and \b works on them
//    (JS \b is ASCII-only; an accented tail silently disables it).
// 5. Plurals are generated, not hand-listed — hand-listing missed 16 of 20 anchovy recipes.

// ── Text normalization ───────────────────────────────────────────────────────

/** Lowercase + strip diacritics so ASCII \b works and 'pate' matches 'pâté'. */
export function foldText(text: string): string {
  // U+0300-U+036F = combining diacritical marks. Escaped, not literal, so the source stays
  // ASCII-safe through tooling that would otherwise mangle bare combining characters.
  return (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Regex-escape. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Plural/inflected forms for a term, so 'anchovy' also catches 'anchovies'. */
function variants(term: string): string[] {
  const t = term.trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  const parts = t.split(/\s+/);
  const last = parts[parts.length - 1];
  const pluralize = (w: string): string | null => {
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
    if (/o$/.test(w)) return w + 'es';
    if (/f$/.test(w)) return w.slice(0, -1) + 'ves';
    return w + 's';
  };
  const p = pluralize(last);
  if (p) out.add([...parts.slice(0, -1), p].join(' '));
  if (/o$/.test(last)) out.add([...parts.slice(0, -1), last + 's'].join(' ')); // tomatoes|tomatos
  return [...out];
}

/** Build ONE word-boundary regex covering every term + its plural forms. */
function buildRe(terms: string[]): RegExp {
  const alts = terms.flatMap(variants).map(esc).sort((a, b) => b.length - a.length);
  if (!alts.length) return /(?!)/; // never matches
  return new RegExp(`\\b(?:${alts.join('|')})\\b`, 'i');
}

// ── Category keywords ────────────────────────────────────────────────────────
// Plurals are generated; do NOT hand-add them. Ambiguous bare words are forbidden (rule 3).

export const LAND_MEAT = [
  'chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham', 'turkey', 'duck', 'goose',
  'veal', 'mutton', 'meatball', 'meatloaf', 'sausage', 'chorizo', 'salami', 'pepperoni',
  'prosciutto', 'pancetta', 'guanciale', 'mortadella', 'jamon', 'speck', 'bresaola',
  'coppa', 'capicola', 'soppressata', 'nduja', 'lardon', 'lard', 'tallow', 'suet',
  'venison', 'rabbit', 'hare', 'boar', 'bison', 'elk', 'quail', 'pheasant', 'partridge',
  'squab', 'poultry', 'brisket', 'ribeye', 'sirloin', 'tenderloin', 'pastrami',
  // Named cuts. Dropping bare 'steak' (design rule 3) silently un-blocked these — live catalog
  // check found flank/skirt steak reaching vegans. Enumerate rather than reinstate the bare word.
  'flank steak', 'skirt steak', 'flat iron steak', 'hanger steak', 'chuck steak', 'chuck roast',
  'round steak', 'strip steak', 'rump steak', 'porterhouse', 't-bone', 'filet mignon',
  'fillet of steak', 'steak fajita', 'minute steak', 'cube steak', 'beef steak', 'steak strips',
  'spam', 'doner', 'doner meat', 'gammon', 'pate de campagne',
  'corned beef', 'hot dog', 'frankfurter', 'wiener', 'bratwurst', 'kielbasa', 'andouille',
  'linguica', 'bologna', 'carnitas', 'barbacoa', 'al pastor', 'gyro', 'shawarma', 'kebab',
  'keema', 'katsu', 'schnitzel', 'meatza', 'goat meat', 'goat curry', 'goat shoulder',
  'chicken stock', 'chicken broth', 'beef stock', 'beef broth', 'bone broth', 'meat stock',
  'gelatin', 'gelatine', 'ground beef', 'ground pork', 'ground lamb', 'ground turkey',
  'ground chicken', 'minced beef', 'minced pork', 'minced lamb', 'minced chicken',
  'pork belly', 'pork rind', 'spare rib', 'baby back rib', 'short rib', 'rib eye',
];

export const OFFAL = [
  'offal', 'liver', 'liverwurst', 'tripe', 'gizzard', 'sweetbread', 'chitterling',
  'haggis', 'foie gras', 'oxtail', 'trotter', 'blood sausage', 'black pudding',
  'pate', 'bone marrow', 'chicken heart', 'beef heart', 'duck heart', 'lamb heart',
  'pork heart', 'beef tongue', 'ox tongue', 'lamb tongue', 'pork tongue',
  'lamb kidney', 'beef kidney', 'veal kidney', 'pork kidney', 'kidney pie',
  'chicken liver', 'calf liver', 'lamb brain',
];

export const SHELLFISH = [
  'shellfish', 'shrimp', 'prawn', 'crab', 'crabmeat', 'lobster', 'crayfish', 'crawfish',
  'langoustine', 'scallop', 'clam', 'mussel', 'oyster', 'squid', 'calamari', 'octopus',
  'cuttlefish', 'escargot', 'krill', 'scampi', 'oyster sauce', 'shrimp paste', 'belacan',
];

export const FIN_FISH = [
  'fish', 'salmon', 'tuna', 'anchovy', 'cod', 'haddock', 'sardine', 'mackerel', 'halibut',
  'tilapia', 'trout', 'catfish', 'snapper', 'grouper', 'mahi', 'swordfish',
  // 'seabass' as one word never matched the catalog's "sea bass"; bare 'bass' was dropped with
  // the old list. Spell both, and cover the names the catalog actually uses.
  'sea bass', 'seabass', 'sea bream', 'seabream', 'branzino', 'dorada', 'barramundi',
  'monkfish', 'hake', 'pilchard', 'turbot', 'plaice', 'whitebait', 'kipper', 'lox', 'gravlax',
  'herring', 'pollock', 'flounder', 'caviar', 'bonito', 'katsuobushi', 'dashi', 'bottarga',
  'fish sauce', 'nam pla', 'colatura', 'worcestershire', 'seafood', 'surimi', 'anchovy paste',
];

export const SEAFOOD = [...FIN_FISH, ...SHELLFISH];

export const DAIRY = [
  'milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'parmesan', 'parmigiano',
  'mozzarella', 'feta', 'ghee', 'cheddar', 'gouda', 'brie', 'camembert', 'ricotta',
  'mascarpone', 'creme fraiche', 'buttermilk', 'half-and-half', 'custard', 'paneer',
  'halloumi', 'gruyere', 'provolone', 'pecorino', 'asiago', 'manchego', 'stilton',
  'roquefort', 'gorgonzola', 'quark', 'kefir', 'clotted cream', 'sour cream', 'whey',
  'casein', 'condensed milk', 'evaporated milk', 'ice cream', 'queso', 'labneh', 'skyr',
  'burrata', 'creme anglaise', 'milk powder', 'milk solids', 'butterfat', 'curd',
];

export const EGG = ['egg', 'egg white', 'egg yolk', 'mayonnaise', 'mayo', 'meringue', 'albumen', 'aioli', 'hollandaise'];

export const HONEY = ['honey', 'bee pollen', 'royal jelly', 'beeswax'];

export const TREE_NUTS = [
  'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'filbert', 'macadamia',
  'brazil nut', 'pine nut', 'pignoli', 'praline', 'marzipan', 'nutella', 'frangipane',
  'amaretto', 'amaretti', 'gianduja', 'nougat', 'pesto', 'nut butter', 'nut milk',
  'nut flour', 'almond flour', 'almond meal', 'macaroon', 'baklava', 'marcona',
];

/** Peanut is a legume but is what users mean by "nut free". */
export const PEANUTS = ['peanut', 'groundnut', 'satay'];

export const NUTS = [...TREE_NUTS, ...PEANUTS];

export const GLUTEN = [
  'flour', 'bread', 'breadcrumb', 'panko', 'pasta', 'noodle', 'spaghetti', 'macaroni',
  'penne', 'linguine', 'fettuccine', 'lasagna', 'lasagne', 'rigatoni', 'farfalle', 'ziti',
  'vermicelli', 'gnocchi', 'ravioli', 'tortellini', 'tortelloni', 'orzo', 'udon', 'ramen',
  'wheat', 'barley', 'rye', 'semolina', 'couscous', 'bulgur', 'farro', 'spelt', 'farina',
  'tortilla', 'pita', 'naan', 'baguette', 'croissant', 'cracker', 'pastry', 'phyllo',
  'filo', 'puff pastry', 'soy sauce', 'seitan', 'malt', 'beer', 'brioche', 'wonton',
  'dumpling', 'gyoza', 'crouton', 'matzo', 'matzah', 'graham', 'pretzel', 'oats', 'oat',
  'miso', 'hoisin', 'teriyaki', 'bun', 'biscuit', 'muffin', 'pancake', 'waffle',
];

// ── Per-category exemptions (rule 1) ─────────────────────────────────────────
// A phrase here is ignored ONLY when testing its own category. 'peanut butter' exempts DAIRY
// (it is not dairy) but is NEVER exempt from NUTS. 'goat cheese' exempts LAND_MEAT but is
// still DAIRY. Getting this wrong is how an allergen reaches someone.

type Cat =
  | 'LAND_MEAT' | 'OFFAL' | 'SHELLFISH' | 'FIN_FISH'
  | 'DAIRY' | 'EGG' | 'HONEY' | 'NUTS' | 'GLUTEN';

const EXEMPT: Record<Cat, string[]> = {
  LAND_MEAT: [
    'goat cheese', 'goats cheese', "goat's cheese", 'goat milk', 'goats milk', "goat's milk",
    'meat-free', 'meatless', 'mock meat', 'beyond meat', 'coconut meat', 'nutmeat',
    'mincemeat', 'cauliflower steak', 'mushroom steak', 'eggplant steak', 'pigeon pea',
    'minced garlic', 'minced onion', 'minced ginger', 'minced shallot', 'minced herb',
    'minced parsley', 'minced cilantro', 'minced chive', 'minced celery', 'minced carrot',
    'hamburger bun', 'chicken of the woods', 'duck sauce', 'lamb\'s lettuce',
  ],
  OFFAL: ['kidney bean', 'artichoke heart', 'hearts of palm', 'heart of palm', 'heart of romaine', 'liverwort'],
  SHELLFISH: ['oyster mushroom', 'clam shell', 'crab apple', 'crabapple'],
  FIN_FISH: ['fish-free', 'fishless', 'fish pepper', 'swordfish plant'],
  DAIRY: [
    'coconut milk', 'coconut cream', 'coconut butter', 'coconut yogurt', 'almond milk',
    'almond butter', 'almond yogurt', 'soy milk', 'soya milk', 'soy yogurt', 'oat milk',
    'rice milk', 'cashew milk', 'cashew butter', 'hemp milk', 'flax milk', 'pea milk',
    'macadamia milk', 'peanut butter', 'sunflower butter', 'seed butter', 'cocoa butter',
    'apple butter', 'shea butter', 'cream of tartar', 'butter lettuce', 'butter bean',
    'butterhead', 'butternut', 'bean curd', 'butterfly', 'buttermilk substitute',
    'vegan butter', 'vegan cheese', 'vegan cream', 'dairy-free milk', 'non-dairy milk',
    'plant-based milk', 'nut milk', 'creamer alternative',
  ],
  EGG: ['eggplant', 'egg plant', 'vegan mayo', 'vegan mayonnaise', 'eggless'],
  HONEY: ['honeydew', 'honeycomb toffee', 'honey mushroom'],
  // Rule 2: allergen — exemptions must be provably-not-a-nut items only.
  NUTS: ['water chestnut', 'nutmeg', 'butternut', 'nutritional yeast', 'coconut', 'nut-free', 'peanut-free'],
  GLUTEN: [
    'rice noodle', 'glass noodle', 'bean thread noodle', 'shirataki', 'zucchini noodle',
    'rice flour', 'corn flour', 'masa harina', 'almond flour', 'coconut flour',
    'chickpea flour', 'tapioca flour', 'buckwheat flour', 'cassava flour', 'oat flour',
    'corn tortilla', 'rice paper', 'gluten-free', 'gluten free', 'certified gf',
    'cornbread', 'corn starch', 'rice cracker', 'almond cracker',
  ],
};

const KEYWORDS: Record<Cat, string[]> = {
  LAND_MEAT, OFFAL, SHELLFISH, FIN_FISH, DAIRY, EGG, HONEY, NUTS, GLUTEN,
};

// Precompiled once at module load — these lists are fixed, so there is no cache to manage.
const CAT_RE: Record<Cat, RegExp> = Object.create(null);
const EXEMPT_RE: Partial<Record<Cat, RegExp>> = Object.create(null);
for (const c of Object.keys(KEYWORDS) as Cat[]) {
  CAT_RE[c] = buildRe(KEYWORDS[c]);
  const ex = EXEMPT[c];
  if (ex?.length) {
    // Exempt phrases match literally (no pluralization) and are removed before the category test.
    EXEMPT_RE[c] = new RegExp(ex.map(esc).sort((a, b) => b.length - a.length).join('|'), 'gi');
  }
}

/** Does `text` contain this category, after removing only THIS category's exemptions? */
export function hasCategory(text: string, cat: Cat): boolean {
  let t = foldText(text);
  const ex = EXEMPT_RE[cat];
  if (ex) t = t.replace(ex, ' ');
  return CAT_RE[cat].test(t);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Normalize a goal id so UI labels ('Nut Free') and ids ('nut_free') both work. */
function normGoal(g: unknown): string {
  return String(g ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * The hard dietary gate: true when this recipe VIOLATES one of the user's restrictions and
 * must never be shown. Preference goals (balanced/high_protein/low_carb/keto/paleo) are
 * ranking signals, not filters, and are ignored here.
 */
export function violatesDietary(text: string, goals: unknown[] = []): boolean {
  const g = new Set((goals ?? []).map(normGoal));
  if (g.size === 0) return false;
  const has = (c: Cat) => hasCategory(text, c);

  const vegan = g.has('vegan');
  const vegetarian = vegan || g.has('vegetarian');
  const pescatarian = g.has('pescatarian');

  if (vegetarian || pescatarian) {
    if (has('LAND_MEAT') || has('OFFAL')) return true;
  }
  // Vegetarian excludes seafood; pescatarian allows it (and vegan wins if both are set).
  if (vegetarian && (has('SHELLFISH') || has('FIN_FISH'))) return true;
  if (vegan && (has('DAIRY') || has('EGG') || has('HONEY'))) return true;

  // Allergen/intolerance goals stack independently.
  if (g.has('dairy_free') && has('DAIRY')) return true;
  if (g.has('gluten_free') && has('GLUTEN')) return true;
  if (g.has('nut_free') && has('NUTS')) return true;
  if (g.has('shellfish_free') && has('SHELLFISH')) return true;
  if (g.has('egg_free') && has('EGG')) return true;

  return false;
}

/** Goals that actually FILTER. The rest (balanced/high_protein/keto/paleo…) only rank. */
const RESTRICTION_GOALS = new Set([
  'vegan', 'vegetarian', 'pescatarian',
  'dairy_free', 'gluten_free', 'nut_free', 'shellfish_free', 'egg_free',
]);

/** True when any goal imposes a hard filter — lets callers skip the work (and fail closed). */
export function hasRestriction(goals: unknown[] = []): boolean {
  return (goals ?? []).some((g) => RESTRICTION_GOALS.has(normGoal(g)));
}

/**
 * Category expansion for dislike terms. The preset chips are CATEGORIES or plurals — matching
 * them literally found nothing ("Shellfish" matched 0 of 187 shellfish recipes; the "Anchovies"
 * chip missed 16 of 20 anchovy recipes). Null-prototype so a user typing "constructor" can't
 * collide with Object.prototype.
 */
const DISLIKE_CATEGORIES: Record<string, string[]> = Object.assign(Object.create(null), {
  shellfish: SHELLFISH,
  offal: OFFAL,
  'organ meat': OFFAL,
  seafood: SEAFOOD,
  fish: FIN_FISH,
  anchovies: ['anchovy', 'anchovy paste', 'colatura', 'garum'],
  anchovy: ['anchovy', 'anchovy paste', 'colatura', 'garum'],
  mushrooms: ['mushroom', 'cremini', 'shiitake', 'portobello', 'porcini', 'chanterelle', 'enoki', 'oyster mushroom', 'button mushroom'],
  mushroom: ['mushroom', 'cremini', 'shiitake', 'portobello', 'porcini', 'chanterelle', 'enoki', 'oyster mushroom', 'button mushroom'],
  olives: ['olive', 'kalamata', 'tapenade'],
  olive: ['olive', 'kalamata', 'tapenade'],
  'blue cheese': ['blue cheese', 'roquefort', 'gorgonzola', 'stilton', 'danish blue'],
  cilantro: ['cilantro', 'coriander leaf', 'fresh coriander'],
  tofu: ['tofu', 'bean curd', 'soybean curd'],
  beetroot: ['beetroot', 'beet'],
  fennel: ['fennel', 'anise seed'],
  liver: ['liver', 'liverwurst', 'foie gras', 'pate'],
  lamb: ['lamb', 'mutton'],
  nuts: NUTS,
  'tree nuts': TREE_NUTS,
  peanuts: PEANUTS,
  peanut: PEANUTS,
  dairy: DAIRY,
  gluten: GLUTEN,
  meat: [...LAND_MEAT, ...OFFAL],
  pork: ['pork', 'bacon', 'ham', 'prosciutto', 'pancetta', 'guanciale', 'chorizo', 'salami', 'pepperoni', 'lard', 'speck', 'mortadella'],
  egg: EGG,
  eggs: EGG,
});

const MAX_DISLIKE_LEN = 80; // free text; bounds regex size

/**
 * Per-term exemptions for DISLIKES — the same idea as EXEMPT for categories. Without this the
 * "Olives" chip matched \bolive\b inside "olive oil" and removed ~840 recipes (36% of the
 * catalog) from 13 live users' decks and plans, silently. Someone who dislikes olives still
 * cooks with olive oil.
 */
const DISLIKE_EXEMPT: Record<string, string[]> = Object.assign(Object.create(null), {
  olive: ['olive oil', 'olive-oil'],
  olives: ['olive oil', 'olive-oil'],
  coconut: ['coconut oil'],
  fennel: ['fennel seed', 'fennel pollen'],
  mushroom: ['mushroom soy sauce'],
  mushrooms: ['mushroom soy sauce'],
});

/** The keyword list a dislike term should match — expanded when it names a category. */
export function expandDislike(term: unknown): string[] {
  const t = String(term ?? '').trim().slice(0, MAX_DISLIKE_LEN).toLowerCase();
  if (!t) return [];
  // Reject punctuation-only input — an empty/degenerate regex would block the whole catalog.
  if (!/[a-z0-9]/i.test(t)) return [];
  const hit = Object.prototype.hasOwnProperty.call(DISLIKE_CATEGORIES, t) ? DISLIKE_CATEGORIES[t] : null;
  return Array.isArray(hit) && hit.length ? hit : [t];
}

// Bounded cache for free-text dislike regexes (category lists are precompiled above).
const dislikeCache = new Map<string, RegExp>();
const DISLIKE_CACHE_MAX = 500;

function dislikeRe(terms: string[]): RegExp {
  const key = terms.join(''); // NUL-joined: a user term containing '|' can't merge keys
  let re = dislikeCache.get(key);
  if (!re) {
    re = buildRe(terms);
    if (dislikeCache.size >= DISLIKE_CACHE_MAX) dislikeCache.clear();
    dislikeCache.set(key, re);
  }
  return re;
}

/**
 * True when the recipe contains any disliked ingredient. Dislikes are a HARD filter (project
 * commandment) and are where users enter allergies, so chips expand to categories and matching
 * is word-boundary + plural aware.
 */
export function matchesDislike(text: string, dislikes: unknown[] = []): boolean {
  if (!dislikes?.length) return false;
  const base = foldText(text);
  for (const d of dislikes) {
    const key = String(d ?? '').trim().toLowerCase();
    const list = expandDislike(d);
    if (!list.length) continue;
    // Strip this term's exemptions only — same per-term discipline as hasCategory, so an
    // exemption for one dislike can never soften a different one.
    const ex = Object.prototype.hasOwnProperty.call(DISLIKE_EXEMPT, key) ? DISLIKE_EXEMPT[key] : null;
    let t = base;
    if (Array.isArray(ex)) for (const phrase of ex) if (t.includes(phrase)) t = t.split(phrase).join(' ');
    if (dislikeRe(list).test(t)) return true;
  }
  return false;
}

/** Title + ingredient names — the text every check above expects. */
export function recipeMatchText(recipe: { title?: string | null; ingredients?: any[] | null }): string {
  const ing = (recipe?.ingredients ?? [])
    .map((i: any) => (typeof i === 'string' ? i : i?.name ?? ''))
    .filter(Boolean)
    .join(' ');
  return `${recipe?.title ?? ''} ${ing}`;
}

/**
 * True when a recipe carries no ingredient data at all. Callers enforcing a restriction should
 * treat this as UNSAFE (fail closed) rather than trusting a title-only scan: `violatesDietary`
 * can only judge the text it is given.
 */
export function hasNoIngredientData(recipe: { ingredients?: any[] | null }): boolean {
  const ing = recipe?.ingredients;
  return !Array.isArray(ing) || ing.length === 0;
}
