/**
 * lib/substitutions.ts
 * Ingredient substitution helpers.
 *
 * Resolution order for any ingredient:
 *   1. Static table  — instant, no network
 *   2. AsyncStorage  — cached from a previous API call
 *   3. /api/substitutions — Claude Haiku, rate-limited (20/day), result saved to cache
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Swap {
  substitute: string;
  reason: string;
}

// ── Static lookup table ───────────────────────────────────────────────────────
// Keys are lowercase. Partial matching is used so "unsalted butter" hits "butter".
const STATIC_SUBS: Record<string, Swap[]> = {
  // ── Dairy ──────────────────────────────────────────────────────────────────
  butter: [
    { substitute: 'coconut oil', reason: 'vegan, same fat ratio' },
    { substitute: 'olive oil', reason: 'healthier fat, mild flavour' },
  ],
  milk: [
    { substitute: 'oat milk', reason: 'vegan, neutral flavour' },
    { substitute: 'almond milk', reason: 'vegan, lower calorie' },
  ],
  'heavy cream': [
    { substitute: 'coconut cream', reason: 'vegan, rich texture' },
    { substitute: 'cashew cream', reason: 'vegan, similar richness' },
  ],
  cream: [
    { substitute: 'coconut cream', reason: 'vegan, rich texture' },
  ],
  'sour cream': [
    { substitute: 'Greek yogurt', reason: 'lower fat, similar tang' },
    { substitute: 'coconut yogurt', reason: 'vegan alternative' },
  ],
  'cream cheese': [
    { substitute: 'cashew cream cheese', reason: 'vegan alternative' },
    { substitute: 'Greek yogurt', reason: 'lower fat, tangier' },
  ],
  parmesan: [
    { substitute: 'nutritional yeast', reason: 'vegan, cheesy flavour' },
    { substitute: 'pecorino romano', reason: 'similar sharp taste' },
  ],
  mozzarella: [
    { substitute: 'vegan mozzarella', reason: 'dairy-free option' },
  ],
  cheddar: [
    { substitute: 'vegan cheddar', reason: 'dairy-free option' },
    { substitute: 'gruyère', reason: 'melts similarly' },
  ],
  buttermilk: [
    { substitute: 'milk + 1 tbsp lemon juice', reason: 'DIY buttermilk' },
    { substitute: 'plant milk + 1 tbsp vinegar', reason: 'vegan buttermilk' },
  ],
  // ── Eggs ───────────────────────────────────────────────────────────────────
  egg: [
    { substitute: 'flax egg (1 tbsp ground flax + 3 tbsp water)', reason: 'vegan binder' },
    { substitute: 'chia egg (1 tbsp chia + 3 tbsp water)', reason: 'vegan, similar binding' },
    { substitute: '¼ cup applesauce', reason: 'adds moisture in baking' },
  ],
  eggs: [
    { substitute: 'flax eggs (1 tbsp ground flax + 3 tbsp water each)', reason: 'vegan binder' },
    { substitute: 'aquafaba (3 tbsp each)', reason: 'vegan, works in baking' },
  ],
  // ── Proteins ───────────────────────────────────────────────────────────────
  chicken: [
    { substitute: 'tofu', reason: 'vegan protein source' },
    { substitute: 'chickpeas', reason: 'vegan, hearty texture' },
    { substitute: 'turkey', reason: 'leaner protein' },
  ],
  beef: [
    { substitute: 'lentils', reason: 'vegan, high protein' },
    { substitute: 'portobello mushrooms', reason: 'meaty texture, umami' },
    { substitute: 'ground turkey', reason: 'leaner alternative' },
  ],
  pork: [
    { substitute: 'turkey', reason: 'leaner protein' },
    { substitute: 'chicken', reason: 'similar cooking method' },
    { substitute: 'jackfruit', reason: 'vegan, pulled texture' },
  ],
  bacon: [
    { substitute: 'tempeh bacon', reason: 'vegan, smoky flavour' },
    { substitute: 'turkey bacon', reason: 'lower fat option' },
    { substitute: 'smoked paprika + olive oil', reason: 'adds smoky depth' },
  ],
  salmon: [
    { substitute: 'trout', reason: 'similar flavour and texture' },
    { substitute: 'tofu', reason: 'vegan protein source' },
  ],
  tuna: [
    { substitute: 'mashed chickpeas', reason: 'vegan, similar texture' },
    { substitute: 'jackfruit', reason: 'vegan, flaky texture' },
  ],
  shrimp: [
    { substitute: 'scallops', reason: 'similar seafood flavour' },
    { substitute: 'hearts of palm', reason: 'vegan, similar texture' },
  ],
  lamb: [
    { substitute: 'beef', reason: 'similar cooking method' },
    { substitute: 'lentils', reason: 'vegan alternative' },
  ],
  // ── Oils & Fats ────────────────────────────────────────────────────────────
  'vegetable oil': [
    { substitute: 'canola oil', reason: 'neutral flavour, same smoke point' },
    { substitute: 'avocado oil', reason: 'healthier fat, high smoke point' },
  ],
  'olive oil': [
    { substitute: 'avocado oil', reason: 'neutral flavour, high smoke point' },
    { substitute: 'vegetable oil', reason: 'neutral, widely available' },
  ],
  'coconut oil': [
    { substitute: 'butter', reason: 'similar fat content' },
    { substitute: 'avocado oil', reason: 'neutral flavour' },
  ],
  // ── Flour & Grains ─────────────────────────────────────────────────────────
  'all-purpose flour': [
    { substitute: 'gluten-free flour blend', reason: 'gluten-free option' },
    { substitute: 'oat flour', reason: 'slightly denser, nutty flavour' },
  ],
  flour: [
    { substitute: 'gluten-free flour blend', reason: 'gluten-free option' },
    { substitute: 'oat flour', reason: 'slightly denser, nutty flavour' },
  ],
  'bread crumbs': [
    { substitute: 'panko', reason: 'lighter, crispier texture' },
    { substitute: 'crushed crackers', reason: 'similar crunch' },
    { substitute: 'rolled oats', reason: 'gluten-free if certified GF' },
  ],
  'white rice': [
    { substitute: 'cauliflower rice', reason: 'low-carb option' },
    { substitute: 'brown rice', reason: 'more fibre and nutrients' },
    { substitute: 'quinoa', reason: 'higher protein, nutty flavour' },
  ],
  pasta: [
    { substitute: 'zucchini noodles', reason: 'low-carb option' },
    { substitute: 'rice pasta', reason: 'gluten-free option' },
    { substitute: 'chickpea pasta', reason: 'higher protein' },
  ],
  // ── Sweeteners ─────────────────────────────────────────────────────────────
  sugar: [
    { substitute: 'maple syrup', reason: 'natural sweetener (use ¾ amount)' },
    { substitute: 'coconut sugar', reason: 'lower glycemic index, 1:1 swap' },
    { substitute: 'honey', reason: 'natural sweetener (use ¾ amount)' },
  ],
  honey: [
    { substitute: 'maple syrup', reason: 'vegan, same sweetness' },
    { substitute: 'agave nectar', reason: 'vegan, similar consistency' },
  ],
  'maple syrup': [
    { substitute: 'honey', reason: 'same consistency, similar sweetness' },
    { substitute: 'agave nectar', reason: 'vegan, similar sweetness' },
  ],
  // ── Condiments & Sauces ────────────────────────────────────────────────────
  'soy sauce': [
    { substitute: 'tamari', reason: 'gluten-free, same flavour' },
    { substitute: 'coconut aminos', reason: 'soy-free, slightly sweeter' },
  ],
  'worcestershire sauce': [
    { substitute: 'soy sauce + white vinegar', reason: '1 tbsp soy sauce + ¼ tsp vinegar per tbsp worcestershire' },
    { substitute: 'coconut aminos', reason: 'soy-free — use same amount' },
  ],
  mayonnaise: [
    { substitute: 'Greek yogurt', reason: 'lower fat, similar texture' },
    { substitute: 'vegan mayo', reason: 'egg-free option' },
    { substitute: 'mashed avocado', reason: 'healthier fat, creamy' },
  ],
  'fish sauce': [
    { substitute: 'soy sauce + lime juice', reason: '1 tbsp soy sauce + ½ tsp lime juice per tbsp fish sauce' },
    { substitute: 'coconut aminos + lime juice', reason: '1 tbsp aminos + ½ tsp lime juice per tbsp fish sauce' },
  ],
  // ── Broths & Stocks ────────────────────────────────────────────────────────
  'chicken stock': [
    { substitute: 'vegetable broth', reason: 'vegan, similar savory depth' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan' },
  ],
  'chicken broth': [
    { substitute: 'vegetable broth', reason: 'vegan, similar savory depth' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan' },
  ],
  'vegetable stock': [
    { substitute: 'chicken broth', reason: 'richer flavour (not vegan)' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan' },
  ],
  'vegetable broth': [
    { substitute: 'chicken broth', reason: 'richer flavour (not vegan)' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan' },
  ],
  'beef stock': [
    { substitute: 'mushroom broth', reason: 'deep umami, vegan' },
    { substitute: 'vegetable broth', reason: 'vegan, lighter flavour' },
  ],
  'beef broth': [
    { substitute: 'mushroom broth', reason: 'deep umami, vegan' },
    { substitute: 'vegetable broth', reason: 'vegan, lighter flavour' },
  ],
  broth: [
    { substitute: 'vegetable broth', reason: 'vegan, widely available' },
    { substitute: 'water + bouillon cube', reason: 'easy pantry substitute' },
  ],
  stock: [
    { substitute: 'broth', reason: 'slightly less concentrated, same use' },
    { substitute: 'water + bouillon cube', reason: 'easy pantry substitute' },
  ],
  // ── Alcohol ────────────────────────────────────────────────────────────────
  'white wine': [
    { substitute: 'apple juice + white wine vinegar', reason: '¾ cup apple juice + 1 tbsp vinegar per cup wine' },
    { substitute: 'chicken or vegetable broth', reason: 'alcohol-free, savory — use same amount' },
  ],
  'red wine': [
    { substitute: 'grape juice + red wine vinegar', reason: '¾ cup grape juice + 1 tbsp vinegar per cup wine' },
    { substitute: 'beef broth', reason: 'alcohol-free, rich flavour — use same amount' },
  ],
  wine: [
    { substitute: 'grape juice + splash of vinegar', reason: 'alcohol-free' },
    { substitute: 'vegetable broth', reason: 'alcohol-free' },
  ],
  beer: [
    { substitute: 'sparkling water', reason: 'alcohol-free, adds fizz' },
    { substitute: 'broth', reason: 'alcohol-free, adds depth' },
  ],
  // ── Extracts ───────────────────────────────────────────────────────────────
  'vanilla extract': [
    { substitute: 'vanilla bean paste', reason: 'stronger flavour, 1:1' },
    { substitute: 'almond extract (half amount)', reason: 'different but complementary' },
  ],
  // ── Dairy alternatives ─────────────────────────────────────────────────────
  'coconut milk': [
    { substitute: 'oat milk', reason: 'lighter, less tropical flavour' },
    { substitute: 'almond milk', reason: 'lighter, vegan' },
  ],
  // ── Nuts & Seeds ───────────────────────────────────────────────────────────
  'pine nuts': [
    { substitute: 'sunflower seeds', reason: 'cheaper, similar texture' },
    { substitute: 'cashews', reason: 'similar buttery flavour' },
  ],
  cashews: [
    { substitute: 'macadamia nuts', reason: 'similar creamy texture' },
    { substitute: 'sunflower seeds', reason: 'nut-free alternative' },
  ],
  almonds: [
    { substitute: 'sunflower seeds', reason: 'nut-free alternative' },
    { substitute: 'cashews', reason: 'similar mild flavour' },
  ],
  walnuts: [
    { substitute: 'pecans', reason: 'similar texture and richness' },
    { substitute: 'sunflower seeds', reason: 'nut-free alternative' },
  ],
  // ── Acids ──────────────────────────────────────────────────────────────────
  'lemon juice': [
    { substitute: 'lime juice', reason: 'similar acidity and brightness' },
    { substitute: 'white wine vinegar', reason: 'similar acidity, more savory' },
  ],
  'lime juice': [
    { substitute: 'lemon juice', reason: 'similar acidity' },
    { substitute: 'white vinegar', reason: 'adds needed acidity' },
  ],
  // ── Thickeners ─────────────────────────────────────────────────────────────
  cornstarch: [
    { substitute: 'arrowroot powder', reason: 'similar thickening, clearer sauce' },
    { substitute: 'tapioca starch', reason: 'good for pies and gravies' },
  ],
  arrowroot: [
    { substitute: 'cornstarch', reason: 'widely available, same ratio' },
    { substitute: 'tapioca starch', reason: 'similar thickening' },
  ],
};

const CACHE_PREFIX = '@mori_sub_';

function normalise(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Instant static lookup — returns subs or null if not in table. */
export function getStaticSubs(name: string): Swap[] | null {
  const n = normalise(name);
  if (STATIC_SUBS[n]) return STATIC_SUBS[n];
  // Partial match — sort longest keys first so "chicken stock" beats "chicken"
  const sortedKeys = Object.keys(STATIC_SUBS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (n.includes(key) || key.includes(n)) return STATIC_SUBS[key];
  }
  return null;
}

/** AsyncStorage lookup — returns cached API result or null. */
export async function getCachedSubs(name: string): Promise<Swap[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + normalise(name));
    if (raw) return JSON.parse(raw) as Swap[];
  } catch {}
  return null;
}

/** Fetch from /api/substitutions, cache result. Returns rateLimited flag. */
export async function fetchAndCacheSubs(
  name: string,
  accessToken: string,
  baseUrl: string,
): Promise<{ swaps: Swap[]; rateLimited: boolean }> {
  try {
    const r = await fetch(`${baseUrl}/api/substitutions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ ingredient: name, limit: 3 }),
    });

    if (r.status === 429) return { swaps: [], rateLimited: true };
    if (!r.ok) return { swaps: [], rateLimited: false };

    const data = await r.json();
    const swaps: Swap[] = Array.isArray(data.swaps)
      ? data.swaps.map((s: any) => ({ substitute: s.substitute, reason: s.reason }))
      : [];

    // Save to cache so future calls are free
    if (swaps.length > 0) {
      await AsyncStorage.setItem(CACHE_PREFIX + normalise(name), JSON.stringify(swaps));
    }
    return { swaps, rateLimited: false };
  } catch {
    return { swaps: [], rateLimited: false };
  }
}
