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
    { substitute: 'coconut oil', reason: 'vegan, same fat ratio — use 1:1' },
    { substitute: 'olive oil', reason: 'healthier fat, mild flavour — use ¾ the amount' },
  ],
  milk: [
    { substitute: 'oat milk', reason: 'vegan, neutral flavour — use 1:1' },
    { substitute: 'almond milk', reason: 'vegan, lower calorie — use 1:1' },
  ],
  'heavy cream': [
    { substitute: 'coconut cream', reason: 'vegan, rich texture — use 1:1, shake can first' },
    { substitute: 'cashew cream', reason: 'vegan, similar richness — use 1:1' },
  ],
  cream: [
    { substitute: 'coconut cream', reason: 'vegan, rich texture — use 1:1, shake can first' },
  ],
  'sour cream': [
    { substitute: 'Greek yogurt', reason: 'lower fat, similar tang — use 1:1' },
    { substitute: 'coconut yogurt', reason: 'vegan alternative — use 1:1' },
  ],
  'cream cheese': [
    { substitute: 'cashew cream cheese', reason: 'vegan alternative — use 1:1' },
    { substitute: 'Greek yogurt', reason: 'lower fat, tangier — use 1:1 in dips/spreads only, not baking' },
  ],
  parmesan: [
    { substitute: 'nutritional yeast', reason: 'vegan, cheesy flavour — use ¼ cup per ¼ cup parmesan' },
    { substitute: 'pecorino romano', reason: 'similar sharp taste — use 1:1' },
  ],
  mozzarella: [
    { substitute: 'vegan mozzarella', reason: 'dairy-free option — use 1:1' },
  ],
  cheddar: [
    { substitute: 'vegan cheddar', reason: 'dairy-free option — use 1:1' },
    { substitute: 'gruyère', reason: 'melts similarly — use 1:1' },
  ],
  buttermilk: [
    { substitute: 'milk + 1 tbsp lemon juice', reason: 'DIY buttermilk — let sit 5 min before using' },
    { substitute: 'plant milk + 1 tbsp vinegar', reason: 'vegan buttermilk — let sit 5 min before using' },
  ],
  ricotta: [
    { substitute: 'cottage cheese', reason: 'lower fat — blend smooth first, use 1:1' },
    { substitute: 'silken tofu blended', reason: 'vegan — blend until smooth, use 1:1' },
  ],
  feta: [
    { substitute: 'goat cheese', reason: 'similar tang — use 1:1 by weight, crumble to match' },
    { substitute: 'firm tofu + 1 tsp lemon juice per oz', reason: 'vegan — crumble and add lemon for tang' },
  ],
  'goat cheese': [
    { substitute: 'feta', reason: 'stronger salt — use 1:1, crumble similarly' },
    { substitute: 'cream cheese', reason: 'milder, creamier — use 1:1' },
  ],
  'gruyère': [
    { substitute: 'Swiss cheese', reason: 'milder melt — use 1:1' },
    { substitute: 'emmental', reason: 'nearly identical — use 1:1' },
  ],
  // ── Eggs ───────────────────────────────────────────────────────────────────
  egg: [
    { substitute: 'flax egg (1 tbsp ground flax + 3 tbsp water)', reason: 'vegan binder — let sit 5 min before using' },
    { substitute: 'chia egg (1 tbsp chia + 3 tbsp water)', reason: 'vegan, similar binding — let sit 5 min' },
    { substitute: '¼ cup applesauce', reason: 'adds moisture in baking — best in sweet recipes' },
  ],
  eggs: [
    { substitute: 'flax eggs (1 tbsp ground flax + 3 tbsp water each)', reason: 'vegan binder — let sit 5 min before using' },
    { substitute: 'aquafaba (3 tbsp each)', reason: 'vegan, works in baking — use liquid from canned chickpeas' },
  ],
  // ── Proteins ───────────────────────────────────────────────────────────────
  chicken: [
    { substitute: 'tofu', reason: 'vegan protein — use 1:1 by weight, press dry first' },
    { substitute: 'chickpeas', reason: 'vegan, hearty texture — use 1 can (15 oz) per 1 lb chicken' },
    { substitute: 'turkey', reason: 'leaner protein — use 1:1 by weight' },
  ],
  beef: [
    { substitute: 'lentils', reason: 'vegan, high protein — use 1 cup dried lentils per 1 lb beef, cook first' },
    { substitute: 'portobello mushrooms', reason: 'meaty texture, umami — use 1 large cap per 4 oz beef, slice thick' },
    { substitute: 'ground turkey', reason: 'leaner alternative — use 1:1' },
  ],
  pork: [
    { substitute: 'turkey', reason: 'leaner protein — use 1:1 by weight' },
    { substitute: 'chicken', reason: 'similar cooking method — use 1:1 by weight' },
    { substitute: 'jackfruit', reason: 'vegan, pulled texture — use 1 can (20 oz) young jackfruit per 1 lb pork' },
  ],
  bacon: [
    { substitute: 'tempeh bacon', reason: 'vegan, smoky flavour — use 1:1 by weight' },
    { substitute: 'turkey bacon', reason: 'lower fat option — use 1:1' },
    { substitute: 'smoked paprika + olive oil', reason: 'adds smoky depth — use 1 tsp paprika + ½ tsp oil per strip' },
  ],
  salmon: [
    { substitute: 'trout', reason: 'similar flavour and texture — use 1:1 by weight' },
    { substitute: 'tofu', reason: 'vegan protein — use 1:1 by weight, marinate 30 min first' },
  ],
  tuna: [
    { substitute: 'mashed chickpeas', reason: 'vegan, similar texture — use 1 can (15 oz) chickpeas per 1 can tuna' },
    { substitute: 'jackfruit', reason: 'vegan, flaky texture — use 1 can (20 oz) young jackfruit' },
  ],
  shrimp: [
    { substitute: 'scallops', reason: 'similar seafood flavour — use 1:1 by weight' },
    { substitute: 'hearts of palm', reason: 'vegan, similar texture — use 1:1 by weight, slice into rounds' },
  ],
  lamb: [
    { substitute: 'beef', reason: 'similar cooking method — use 1:1 by weight' },
    { substitute: 'lentils', reason: 'vegan alternative — use 1 cup dried per 1 lb lamb, cook first' },
  ],
  'ground beef': [
    { substitute: 'ground turkey', reason: 'leaner, drain less fat — use 1:1' },
    { substitute: 'lentils', reason: 'vegan — use 1 cup dried lentils per 1 lb beef, cook first' },
    { substitute: 'ground pork', reason: 'similar fat content — use 1:1' },
  ],
  'ground pork': [
    { substitute: 'ground turkey', reason: 'leaner — use 1:1' },
    { substitute: 'ground chicken', reason: 'similar texture — use 1:1' },
  ],
  'ground turkey': [
    { substitute: 'ground chicken', reason: 'nearly identical — use 1:1' },
    { substitute: 'lentils', reason: 'vegan — use 1 cup dried per 1 lb, cook first' },
  ],
  sausage: [
    { substitute: 'turkey sausage', reason: 'leaner — use 1:1' },
    { substitute: 'plant-based sausage', reason: 'vegan — use 1:1' },
    { substitute: 'ground pork + fennel seeds', reason: 'DIY — add 1 tsp fennel seeds per link of sausage' },
  ],
  prosciutto: [
    { substitute: 'serrano ham', reason: 'similar cure, slightly drier — use 1:1' },
    { substitute: 'smoked turkey', reason: 'milder, available anywhere — use 1:1' },
  ],
  pancetta: [
    { substitute: 'bacon', reason: 'smokier flavour — use 1:1' },
    { substitute: 'turkey bacon', reason: 'lower fat — use 1:1' },
  ],
  turkey: [
    { substitute: 'chicken thighs', reason: 'similar fat content, juicier — use 1:1 by weight' },
    { substitute: 'tofu', reason: 'vegan — use 1:1 by weight, press dry and marinate 30 min' },
  ],
  duck: [
    { substitute: 'chicken thighs', reason: 'similar fat content — use 1:1, score skin similarly' },
    { substitute: 'pork shoulder', reason: 'rich, similar fat — use 1:1 by weight' },
  ],
  tofu: [
    { substitute: 'tempeh', reason: 'firmer and nuttier — use 1:1 by weight' },
    { substitute: 'chickpeas', reason: 'softer texture — use 1 can (15 oz) per 14 oz block tofu' },
  ],
  tempeh: [
    { substitute: 'tofu', reason: 'softer texture — use 1:1 by weight, press dry first' },
    { substitute: 'seitan', reason: 'chewier, higher protein — use 1:1 by weight' },
  ],
  // ── Seafood ────────────────────────────────────────────────────────────────
  cod: [
    { substitute: 'tilapia', reason: 'mild, same texture — use 1:1 by weight' },
    { substitute: 'haddock', reason: 'similar flake and flavour — use 1:1 by weight' },
  ],
  tilapia: [
    { substitute: 'cod', reason: 'same texture and cook time — use 1:1 by weight' },
    { substitute: 'pollock', reason: 'similar mild flavour — use 1:1 by weight' },
  ],
  halibut: [
    { substitute: 'cod', reason: 'similar flake, slightly less sweet — use 1:1 by weight' },
    { substitute: 'sea bass', reason: 'richer flavour — use 1:1 by weight' },
  ],
  scallops: [
    { substitute: 'shrimp', reason: 'similar cook time — use 1:1 by weight' },
    { substitute: 'hearts of palm rounds', reason: 'vegan, similar texture — use 1:1 by volume' },
  ],
  crab: [
    { substitute: 'imitation crab', reason: 'budget-friendly — use 1:1 by weight' },
    { substitute: 'shrimp chopped', reason: 'similar sweetness — use 1:1 by weight' },
    { substitute: 'hearts of palm shredded', reason: 'vegan — use 1:1 by volume' },
  ],
  clams: [
    { substitute: 'mussels', reason: 'similar brininess — use 1:1 by count' },
    { substitute: 'canned white beans', reason: 'vegan, in chowders — use 1:1 by volume' },
  ],
  anchovies: [
    { substitute: 'capers', reason: 'umami, vegan — use ½ the amount, rinse first' },
    { substitute: 'miso paste', reason: 'deep umami, vegan — use ¼ tsp per fillet' },
  ],
  // ── Oils & Fats ────────────────────────────────────────────────────────────
  'vegetable oil': [
    { substitute: 'canola oil', reason: 'neutral flavour, same smoke point — use 1:1' },
    { substitute: 'avocado oil', reason: 'healthier fat, high smoke point — use 1:1' },
  ],
  'olive oil': [
    { substitute: 'avocado oil', reason: 'neutral flavour, high smoke point — use 1:1' },
    { substitute: 'vegetable oil', reason: 'neutral, widely available — use 1:1' },
  ],
  'coconut oil': [
    { substitute: 'butter', reason: 'similar fat content — use 1:1' },
    { substitute: 'avocado oil', reason: 'neutral flavour — use 1:1' },
  ],
  ghee: [
    { substitute: 'butter', reason: 'adds water content — use 1:1' },
    { substitute: 'clarified butter', reason: 'nearly identical — use 1:1' },
    { substitute: 'coconut oil', reason: 'vegan, high smoke point — use 1:1' },
  ],
  lard: [
    { substitute: 'coconut oil', reason: 'vegan, similar fat — use 1:1' },
    { substitute: 'vegetable shortening', reason: 'neutral flavour — use 1:1' },
  ],
  shortening: [
    { substitute: 'butter', reason: 'adds flavour — use 1:1' },
    { substitute: 'coconut oil', reason: 'vegan — use 1:1, solid at room temp' },
  ],
  // ── Flour & Grains ─────────────────────────────────────────────────────────
  'all-purpose flour': [
    { substitute: 'gluten-free flour blend', reason: 'gluten-free option — use 1:1' },
    { substitute: 'oat flour', reason: 'slightly denser, nutty flavour — use 1:1 but expect denser result' },
  ],
  flour: [
    { substitute: 'gluten-free flour blend', reason: 'gluten-free option — use 1:1' },
    { substitute: 'oat flour', reason: 'slightly denser, nutty flavour — use 1:1 but expect denser result' },
  ],
  'bread crumbs': [
    { substitute: 'panko', reason: 'lighter, crispier texture — use 1:1' },
    { substitute: 'crushed crackers', reason: 'similar crunch — use 1:1 by volume' },
    { substitute: 'rolled oats', reason: 'gluten-free if certified GF — use 1:1' },
  ],
  'white rice': [
    { substitute: 'cauliflower rice', reason: 'low-carb option — use 1:1 by volume, reduce cook liquid by half' },
    { substitute: 'brown rice', reason: 'more fibre and nutrients — use 1:1, add 15 min cook time' },
    { substitute: 'quinoa', reason: 'higher protein, nutty flavour — use 1:1 cooked volume' },
  ],
  pasta: [
    { substitute: 'zucchini noodles', reason: 'low-carb option — use 1:1 by volume, no cooking needed, toss in sauce' },
    { substitute: 'rice pasta', reason: 'gluten-free option — use 1:1' },
    { substitute: 'chickpea pasta', reason: 'higher protein — use 1:1' },
  ],
  quinoa: [
    { substitute: 'couscous', reason: 'cooks faster — use 1:1 cooked volume' },
    { substitute: 'millet', reason: 'similar nutty flavour — use 1:1 cooked volume' },
  ],
  couscous: [
    { substitute: 'quinoa', reason: 'higher protein — use 1:1 cooked volume' },
    { substitute: 'orzo', reason: 'pasta-like texture — use 1:1 cooked volume' },
  ],
  oats: [
    { substitute: 'quick oats', reason: 'finer texture — use 1:1' },
    { substitute: 'millet flakes', reason: 'gluten-free — use 1:1' },
  ],
  // ── Baking ─────────────────────────────────────────────────────────────────
  'baking powder': [
    { substitute: '¼ tsp baking soda + ½ tsp cream of tartar', reason: 'DIY — use this mix per 1 tsp baking powder' },
  ],
  'baking soda': [
    { substitute: 'baking powder', reason: 'use 3× the amount — less leavening power' },
    { substitute: 'potassium bicarbonate', reason: 'sodium-free — use 1:1' },
  ],
  'cocoa powder': [
    { substitute: 'carob powder', reason: 'sweeter, caffeine-free — use 1:1' },
    { substitute: 'dutch-process cocoa', reason: 'less acidic — use 1:1, skip adding extra acid' },
  ],
  'dark chocolate': [
    { substitute: '3 tbsp cocoa powder + 1 tbsp coconut oil', reason: 'DIY — use this per 1 oz dark chocolate' },
  ],
  yeast: [
    { substitute: 'instant yeast', reason: 'no proofing needed — use 25% less than active dry' },
    { substitute: 'baking powder', reason: 'in quick breads only — use 1 tsp per cup flour' },
  ],
  // ── Sweeteners ─────────────────────────────────────────────────────────────
  sugar: [
    { substitute: 'maple syrup', reason: 'natural sweetener — use ¾ the amount, reduce other liquids by 3 tbsp per cup' },
    { substitute: 'coconut sugar', reason: 'lower glycemic index — use 1:1' },
    { substitute: 'honey', reason: 'natural sweetener — use ¾ the amount, reduce other liquids slightly' },
  ],
  'brown sugar': [
    { substitute: 'white sugar + 1 tbsp molasses per cup', reason: 'DIY brown sugar — mix well' },
    { substitute: 'coconut sugar', reason: 'similar caramel note — use 1:1' },
  ],
  'powdered sugar': [
    { substitute: 'white sugar blended', reason: 'DIY — blend in blender until fine, use 1:1 by volume' },
    { substitute: 'coconut sugar blended', reason: 'less sweet, use 1:1 by volume after blending' },
  ],
  honey: [
    { substitute: 'maple syrup', reason: 'vegan, same sweetness — use 1:1' },
    { substitute: 'agave nectar', reason: 'vegan, similar consistency — use 1:1' },
  ],
  'maple syrup': [
    { substitute: 'honey', reason: 'same consistency, similar sweetness — use 1:1' },
    { substitute: 'agave nectar', reason: 'vegan, similar sweetness — use 1:1' },
  ],
  agave: [
    { substitute: 'maple syrup', reason: 'slightly thicker — use 1:1' },
    { substitute: 'honey', reason: 'not vegan — use 1:1' },
  ],
  molasses: [
    { substitute: 'dark brown sugar', reason: 'sweeter — use ¼ cup brown sugar per 1 tbsp molasses' },
    { substitute: 'maple syrup', reason: 'lighter flavour — use 1:1' },
  ],
  // ── Condiments & Sauces ────────────────────────────────────────────────────
  'soy sauce': [
    { substitute: 'tamari', reason: 'gluten-free, same flavour — use 1:1' },
    { substitute: 'coconut aminos', reason: 'soy-free, slightly sweeter — use 1:1' },
  ],
  'worcestershire sauce': [
    { substitute: 'soy sauce + white vinegar', reason: '1 tbsp soy sauce + ¼ tsp vinegar per tbsp worcestershire' },
    { substitute: 'coconut aminos', reason: 'soy-free — use same amount' },
  ],
  mayonnaise: [
    { substitute: 'Greek yogurt', reason: 'lower fat, similar texture — use 1:1, expect tangier flavour' },
    { substitute: 'vegan mayo', reason: 'egg-free option — use 1:1' },
    { substitute: 'mashed avocado', reason: 'healthier fat, creamy — use 1:1' },
  ],
  'fish sauce': [
    { substitute: 'soy sauce + lime juice', reason: '1 tbsp soy sauce + ½ tsp lime juice per tbsp fish sauce' },
    { substitute: 'coconut aminos + lime juice', reason: '1 tbsp aminos + ½ tsp lime juice per tbsp fish sauce' },
  ],
  tahini: [
    { substitute: 'sunflower seed butter', reason: 'nut-free, similar texture — use 1:1' },
    { substitute: 'almond butter', reason: 'slightly sweeter — use 1:1' },
  ],
  'miso paste': [
    { substitute: 'soy sauce', reason: 'use ½ tsp soy sauce per 1 tbsp miso — saltier, less umami depth' },
    { substitute: 'tahini + lemon juice', reason: 'different flavour profile — use 1:1 for texture' },
  ],
  'oyster sauce': [
    { substitute: 'hoisin sauce', reason: 'sweeter — use 1:1' },
    { substitute: 'soy sauce + ½ tsp sugar per tbsp', reason: 'simpler swap — use same amount' },
  ],
  'hoisin sauce': [
    { substitute: 'oyster sauce', reason: 'less sweet, more savory — use 1:1' },
    { substitute: 'plum sauce', reason: 'similar sweet-savory balance — use 1:1' },
  ],
  mustard: [
    { substitute: 'horseradish', reason: 'spicier — use ½ the amount' },
    { substitute: 'mayo + ½ tsp vinegar per tsp mustard', reason: 'milder, creamy substitute' },
  ],
  ketchup: [
    { substitute: 'tomato paste + ½ tsp sugar + ½ tsp vinegar per tbsp', reason: 'DIY ketchup — stir well' },
    { substitute: 'crushed tomatoes', reason: 'less sweet — use same amount in cooked dishes' },
  ],
  'hot sauce': [
    { substitute: '¼ tsp cayenne + 1 tsp vinegar per tsp hot sauce', reason: 'DIY — adjust heat to taste' },
    { substitute: 'chili paste', reason: 'thicker, more concentrated — use ½ the amount' },
  ],
  sriracha: [
    { substitute: 'sambal oelek', reason: 'less sweet, purer heat — use 1:1' },
    { substitute: 'hot sauce + pinch of garlic powder', reason: 'similar profile — use 1:1' },
  ],
  // ── Broths & Stocks ────────────────────────────────────────────────────────
  'chicken stock': [
    { substitute: 'vegetable broth', reason: 'vegan, similar savory depth — use 1:1' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan — use 1:1' },
  ],
  'chicken broth': [
    { substitute: 'vegetable broth', reason: 'vegan, similar savory depth — use 1:1' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan — use 1:1' },
  ],
  'vegetable stock': [
    { substitute: 'chicken broth', reason: 'richer flavour (not vegan) — use 1:1' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan — use 1:1' },
  ],
  'vegetable broth': [
    { substitute: 'chicken broth', reason: 'richer flavour (not vegan) — use 1:1' },
    { substitute: 'mushroom broth', reason: 'deep umami, vegan — use 1:1' },
  ],
  'beef stock': [
    { substitute: 'mushroom broth', reason: 'deep umami, vegan — use 1:1' },
    { substitute: 'vegetable broth', reason: 'vegan, lighter flavour — use 1:1' },
  ],
  'beef broth': [
    { substitute: 'mushroom broth', reason: 'deep umami, vegan — use 1:1' },
    { substitute: 'vegetable broth', reason: 'vegan, lighter flavour — use 1:1' },
  ],
  broth: [
    { substitute: 'vegetable broth', reason: 'vegan, widely available — use 1:1' },
    { substitute: 'water + bouillon cube', reason: 'easy pantry substitute — use 1 cube per cup water' },
  ],
  stock: [
    { substitute: 'broth', reason: 'slightly less concentrated, same use — use 1:1' },
    { substitute: 'water + bouillon cube', reason: 'easy pantry substitute — use 1 cube per cup water' },
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
    { substitute: 'grape juice + splash of vinegar', reason: 'alcohol-free — use same amount' },
    { substitute: 'vegetable broth', reason: 'alcohol-free, savory — use same amount' },
  ],
  beer: [
    { substitute: 'sparkling water', reason: 'alcohol-free, adds fizz — use same amount' },
    { substitute: 'broth', reason: 'alcohol-free, adds depth — use same amount' },
  ],
  // ── Extracts ───────────────────────────────────────────────────────────────
  'vanilla extract': [
    { substitute: 'vanilla bean paste', reason: 'stronger flavour — use 1:1' },
    { substitute: 'almond extract', reason: 'different but complementary — use half the amount' },
  ],
  // ── Dairy alternatives ─────────────────────────────────────────────────────
  'coconut milk': [
    { substitute: 'oat milk', reason: 'lighter, less tropical flavour — use 1:1' },
    { substitute: 'almond milk', reason: 'lighter, vegan — use 1:1' },
  ],
  // ── Nuts & Seeds ───────────────────────────────────────────────────────────
  'pine nuts': [
    { substitute: 'sunflower seeds', reason: 'cheaper, similar texture — use 1:1' },
    { substitute: 'cashews', reason: 'similar buttery flavour — use 1:1' },
  ],
  cashews: [
    { substitute: 'macadamia nuts', reason: 'similar creamy texture — use 1:1' },
    { substitute: 'sunflower seeds', reason: 'nut-free alternative — use 1:1' },
  ],
  almonds: [
    { substitute: 'sunflower seeds', reason: 'nut-free alternative — use 1:1' },
    { substitute: 'cashews', reason: 'similar mild flavour — use 1:1' },
  ],
  walnuts: [
    { substitute: 'pecans', reason: 'similar texture and richness — use 1:1' },
    { substitute: 'sunflower seeds', reason: 'nut-free alternative — use 1:1' },
  ],
  pecans: [
    { substitute: 'walnuts', reason: 'similar bitterness — use 1:1' },
    { substitute: 'hazelnuts', reason: 'richer flavour — use 1:1' },
  ],
  hazelnuts: [
    { substitute: 'macadamia nuts', reason: 'buttery — use 1:1' },
    { substitute: 'almonds', reason: 'drier, widely available — use 1:1' },
  ],
  peanuts: [
    { substitute: 'sunflower seeds', reason: 'nut-free — use 1:1' },
    { substitute: 'cashews', reason: 'milder flavour — use 1:1' },
  ],
  'peanut butter': [
    { substitute: 'almond butter', reason: 'similar protein, milder — use 1:1' },
    { substitute: 'sunflower seed butter', reason: 'nut-free — use 1:1' },
  ],
  // ── Acids ──────────────────────────────────────────────────────────────────
  'lemon juice': [
    { substitute: 'lime juice', reason: 'similar acidity and brightness — use 1:1' },
    { substitute: 'white wine vinegar', reason: 'similar acidity, more savory — use ½ the amount' },
  ],
  'lime juice': [
    { substitute: 'lemon juice', reason: 'similar acidity — use 1:1' },
    { substitute: 'white vinegar', reason: 'adds acidity — use ½ the amount' },
  ],
  'apple cider vinegar': [
    { substitute: 'white wine vinegar', reason: 'milder — use 1:1' },
    { substitute: 'rice vinegar', reason: 'milder, good in Asian dishes — use 1:1' },
  ],
  'balsamic vinegar': [
    { substitute: '1 tbsp red wine vinegar + 1 tsp honey', reason: 'DIY — stir together per 1 tbsp balsamic' },
  ],
  'rice vinegar': [
    { substitute: 'apple cider vinegar', reason: 'slightly fruitier — use 1:1' },
    { substitute: 'white wine vinegar', reason: 'clean acidity — use 1:1' },
  ],
  'white vinegar': [
    { substitute: 'apple cider vinegar', reason: 'slightly fruity — use 1:1' },
    { substitute: 'lemon juice + water', reason: '1 tsp lemon juice + 1 tsp water per 1 tsp white vinegar' },
  ],
  // ── Herbs ──────────────────────────────────────────────────────────────────
  basil: [
    { substitute: 'Thai basil', reason: 'more anise note — use 1:1' },
    { substitute: 'fresh spinach + pinch of mint', reason: 'mild substitute — use 1:1 by volume' },
  ],
  cilantro: [
    { substitute: 'flat-leaf parsley', reason: 'no citrus note, milder — use 1:1' },
    { substitute: 'Thai basil', reason: 'good in Asian dishes — use 1:1' },
  ],
  parsley: [
    { substitute: 'cilantro', reason: 'brighter, citrusy — use 1:1' },
    { substitute: 'chives', reason: 'milder, onion note — use 1:1' },
  ],
  thyme: [
    { substitute: 'oregano', reason: 'bolder flavour — use ¾ the amount' },
    { substitute: 'marjoram', reason: 'milder, similar — use 1:1' },
  ],
  rosemary: [
    { substitute: 'thyme', reason: 'less piney — use 1:1' },
    { substitute: 'sage', reason: 'earthier — use 1:1' },
  ],
  sage: [
    { substitute: 'thyme', reason: 'similar earthiness — use 1:1' },
    { substitute: 'rosemary', reason: 'more piney — use ½ the amount' },
  ],
  mint: [
    { substitute: 'basil', reason: 'milder, no cooling effect — use 1:1' },
    { substitute: 'lemon balm', reason: 'similar freshness — use 1:1' },
  ],
  chives: [
    { substitute: 'green onion tops', reason: 'same mild onion flavour — use 1:1' },
    { substitute: 'leeks thinly sliced', reason: 'milder — use 1:1' },
  ],
  dill: [
    { substitute: 'fennel fronds', reason: 'similar anise note — use 1:1' },
    { substitute: 'tarragon', reason: 'more anise — use ½ the amount' },
  ],
  tarragon: [
    { substitute: 'chervil', reason: 'very similar — use 1:1' },
    { substitute: 'fennel fronds', reason: 'anise note — use 1:1' },
  ],
  // ── Spices ─────────────────────────────────────────────────────────────────
  paprika: [
    { substitute: 'smoked paprika', reason: 'adds smoke — use 1:1' },
    { substitute: 'cayenne', reason: 'much hotter — use ¼ the amount' },
  ],
  cumin: [
    { substitute: 'caraway seeds', reason: 'similar earthiness — use 1:1' },
    { substitute: 'chili powder', reason: 'broader spice blend — use 2× the amount' },
  ],
  turmeric: [
    { substitute: 'saffron', reason: 'similar colour, more expensive — use a pinch per tsp turmeric' },
    { substitute: 'annatto powder', reason: 'colour only, no flavour — use 1:1' },
  ],
  cayenne: [
    { substitute: 'red pepper flakes', reason: 'similar heat — use ¾ tsp flakes per ½ tsp cayenne' },
    { substitute: 'chili powder', reason: 'milder, more complex — use 3× the amount' },
  ],
  'chili powder': [
    { substitute: '1 tsp cumin + ¼ tsp cayenne + ½ tsp paprika', reason: 'DIY blend — use this mix per 1 tbsp chili powder' },
  ],
  cinnamon: [
    { substitute: 'allspice', reason: 'includes cinnamon notes — use ½ the amount' },
    { substitute: 'nutmeg', reason: 'sweeter — use ¼ the amount' },
  ],
  nutmeg: [
    { substitute: 'mace', reason: 'same plant, more delicate — use 1:1' },
    { substitute: 'allspice', reason: 'broader spice — use ¼ tsp per ½ tsp nutmeg' },
  ],
  allspice: [
    { substitute: '¼ tsp cinnamon + ⅛ tsp cloves + ⅛ tsp nutmeg', reason: 'DIY — use this mix per ¼ tsp allspice' },
  ],
  cardamom: [
    { substitute: '½ tsp cinnamon + pinch of ginger', reason: 'approximate substitute — use per ½ tsp cardamom' },
  ],
  // ── Produce Staples ────────────────────────────────────────────────────────
  garlic: [
    { substitute: 'garlic powder', reason: 'convenient — use ⅛ tsp per clove' },
    { substitute: 'shallots', reason: 'milder, onion-garlic flavour — use 1 small shallot per 2 cloves' },
  ],
  onion: [
    { substitute: 'shallots', reason: 'milder, sweeter — use same amount' },
    { substitute: 'leeks', reason: 'milder — use same amount, white and light green parts only' },
    { substitute: 'onion powder', reason: 'convenient — use 1 tsp per medium onion' },
  ],
  shallots: [
    { substitute: 'red onion', reason: 'stronger — use same amount' },
    { substitute: 'leeks', reason: 'milder — use same amount' },
  ],
  'fresh ginger': [
    { substitute: 'ground ginger', reason: 'use ¼ tsp ground per 1 tbsp fresh' },
    { substitute: 'galangal', reason: 'similar but more piney — use 1:1' },
  ],
  ginger: [
    { substitute: 'ground ginger', reason: 'use ¼ tsp ground per 1 tbsp fresh' },
    { substitute: 'galangal', reason: 'similar but more piney — use 1:1' },
  ],
  lemon: [
    { substitute: 'lime', reason: 'similar acidity — use 1:1 juice' },
    { substitute: 'bottled lemon juice', reason: 'convenient — use 1 tbsp per lemon' },
  ],
  lime: [
    { substitute: 'lemon', reason: 'similar acidity — use 1:1 juice' },
    { substitute: 'bottled lime juice', reason: 'convenient — use 1 tbsp per lime' },
  ],
  tomatoes: [
    { substitute: 'canned diced tomatoes', reason: 'good in cooked dishes — use 1 can per 2 cups fresh, drain slightly' },
    { substitute: 'sun-dried tomatoes', reason: 'more intense — use ½ the amount' },
  ],
  'sweet potato': [
    { substitute: 'butternut squash', reason: 'similar sweetness — use 1:1 by weight' },
    { substitute: 'regular potato', reason: 'starchier, less sweet — use 1:1 by weight' },
  ],
  zucchini: [
    { substitute: 'yellow squash', reason: 'identical behaviour — use 1:1' },
    { substitute: 'eggplant', reason: 'denser — use 1:1, salt first to draw out moisture' },
  ],
  eggplant: [
    { substitute: 'zucchini', reason: 'lighter texture — use 1:1' },
    { substitute: 'portobello mushrooms', reason: 'meaty — use 1:1 by volume' },
  ],
  spinach: [
    { substitute: 'kale', reason: 'sturdier — use 1:1, massage leaves first to soften' },
    { substitute: 'Swiss chard', reason: 'similar mild flavour — use 1:1' },
  ],
  kale: [
    { substitute: 'Swiss chard', reason: 'milder — use 1:1' },
    { substitute: 'spinach', reason: 'more delicate, wilts more — use 1.5× the amount' },
  ],
  // ── Thickeners ─────────────────────────────────────────────────────────────
  cornstarch: [
    { substitute: 'arrowroot powder', reason: 'similar thickening, clearer sauce — use 1:1' },
    { substitute: 'tapioca starch', reason: 'good for pies and gravies — use 2 tsp tapioca per 1 tbsp cornstarch' },
  ],
  arrowroot: [
    { substitute: 'cornstarch', reason: 'widely available — use 1:1' },
    { substitute: 'tapioca starch', reason: 'similar thickening — use 1:1' },
  ],
  // ── Legumes ────────────────────────────────────────────────────────────────
  chickpeas: [
    { substitute: 'white beans', reason: 'milder, creamier — use 1:1' },
    { substitute: 'lentils', reason: 'softer texture — use 1:1 cooked' },
  ],
  'black beans': [
    { substitute: 'kidney beans', reason: 'similar texture — use 1:1' },
    { substitute: 'pinto beans', reason: 'creamier — use 1:1' },
  ],
  lentils: [
    { substitute: 'split peas', reason: 'similar cook time — use 1:1' },
    { substitute: 'chickpeas', reason: 'heartier — use 1:1 cooked' },
  ],
};

const CACHE_PREFIX = '@mori_sub_';

function normalise(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ── Unit conversion for substitution reasons ──────────────────────────────────
const VULGAR: Record<string, number> = {
  '¼': 0.25, '⅓': 0.333, '½': 0.5, '⅔': 0.667, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

function parseNum(raw: string): number {
  if (VULGAR[raw]) return VULGAR[raw];
  return parseFloat(raw);
}

/**
 * Convert US volume/weight measurements in a reason string to metric.
 * tsp and tbsp are left as-is (universally understood in cooking).
 */
export function applyUnitSystem(reason: string, system: 'us' | 'metric'): string {
  if (system === 'us') return reason;

  const fraction = Object.keys(VULGAR).join('|');
  const numPat = `(${fraction}|\\d+(?:\\.\\d+)?)`;

  // cups → ml (1 cup = 240ml)
  reason = reason.replace(
    new RegExp(`${numPat}\\s*cups?`, 'g'),
    (_, n) => `${Math.round(parseNum(n) * 240)}ml`,
  );
  // oz → g (1 oz = 28g)
  reason = reason.replace(
    new RegExp(`${numPat}\\s*oz`, 'g'),
    (_, n) => `${Math.round(parseNum(n) * 28)}g`,
  );
  // lb/lbs → g (1 lb = 450g)
  reason = reason.replace(
    new RegExp(`${numPat}\\s*lbs?`, 'g'),
    (_, n) => {
      const grams = Math.round(parseNum(n) * 450);
      return grams >= 1000 ? `${(grams / 1000).toFixed(1)}kg` : `${grams}g`;
    },
  );
  return reason;
}

/** Instant static lookup — returns subs or null if not in table. */
export function getStaticSubs(name: string, system: 'us' | 'metric' = 'us'): Swap[] | null {
  const n = normalise(name);
  let swaps: Swap[] | undefined;
  if (STATIC_SUBS[n]) {
    swaps = STATIC_SUBS[n];
  } else {
    // Partial match — sort longest keys first so "chicken stock" beats "chicken"
    const sortedKeys = Object.keys(STATIC_SUBS).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (n.includes(key) || key.includes(n)) { swaps = STATIC_SUBS[key]; break; }
    }
  }
  if (!swaps) return null;
  if (system === 'us') return swaps;
  return swaps.map((s) => ({ ...s, reason: applyUnitSystem(s.reason, system) }));
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
