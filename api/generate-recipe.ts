import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser } from './_rateLimit';
import { validate, GenerateRecipeRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './_apiAuth';

// POST /api/generate-recipe
// Generates a complete original recipe using Claude Haiku (~$0.004 per recipe).
// Used by scripts/generate-recipes.mjs for bulk seeding and on-demand gap filling.
// Generated recipes are owned by Mori — no copyright issues.
//
// Body: {
//   cuisine: string,
//   dietaryGoals?: string[],     e.g. ['high_protein', 'gluten_free']
//   skillLevel?: string,         'beginner' | 'home_cook' | 'confident_chef'
//   maxMins?: number,            target total cook time
//   avoidIngredients?: string[], hard exclusions
//   save?: boolean               if true, upsert to Supabase recipes table
// }
// Returns: { recipe: GeneratedRecipe }

export interface GeneratedRecipe {
  title: string;
  description: string;
  cuisine: string;
  ingredients: { name: string; quantity: string; unit: string }[];
  steps: { order: number; instruction: string }[];
  prep_time_mins: number;
  cook_time_mins: number;
  servings: number;
  dietary_tags: string[];
  meal_prep_friendly: boolean;
  estimated_macros: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
    fibre: number;
  };
}

interface GenerateRequest {
  cuisine: string;
  dishName?: string;            // if set, generate this specific dish rather than inventing one
  dietaryGoals?: string[];
  skillLevel?: string;
  maxMins?: number;
  avoidIngredients?: string[];
  avoidDishes?: string[];
  meal_prep_friendly?: boolean; // if set, overrides Haiku's determination
  save?: boolean;
}

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function buildPrompt(req: GenerateRequest): string {
  const constraints: string[] = [];
  if (req.skillLevel === 'beginner') constraints.push('simple techniques, common ingredients, under 45 minutes total');
  if (req.skillLevel === 'home_cook') constraints.push('moderate skill, can use fresh herbs and basic knife work');
  if (req.skillLevel === 'confident_chef') constraints.push('can include advanced techniques like reduction, marinating, tempering');
  if (req.maxMins) constraints.push(`total time under ${req.maxMins} minutes`);
  if (req.dietaryGoals?.includes('vegan')) constraints.push('fully vegan — no meat, fish, dairy, or eggs');
  if (req.dietaryGoals?.includes('vegetarian')) constraints.push('vegetarian — no meat or fish');
  if (req.dietaryGoals?.includes('gluten_free')) constraints.push('gluten-free — no wheat, barley, or rye');
  if (req.dietaryGoals?.includes('dairy_free')) constraints.push('dairy-free');
  if (req.dietaryGoals?.includes('keto')) constraints.push('keto-friendly — under 10g net carbs per serving');
  if (req.dietaryGoals?.includes('high_protein')) constraints.push('high protein — at least 30g protein per serving');
  if (req.dietaryGoals?.includes('meal_prep')) constraints.push('meal prep friendly — simple protein + grain + vegetable structure (e.g. soy garlic chicken with rice and steamed broccoli, grilled chicken wrap with yogurt sauce, teriyaki salmon bowl), scales well for batch cooking, reheats well');
  if (req.avoidIngredients?.length) constraints.push(`must not contain: ${req.avoidIngredients.join(', ')}`);
  if (req.avoidDishes?.length) {
    // Group into lines of 10 to prevent prompt truncation on very long lists
    const chunks: string[] = [];
    for (let i = 0; i < req.avoidDishes.length; i += 10) chunks.push(req.avoidDishes.slice(i, i + 10).join(' | '));
    constraints.push(
      `CRITICAL — do NOT generate any of these dishes or close variants of them. Generate a genuinely different dish:\n${chunks.join('\n')}`
    );
  }

  const dishLine = req.dishName
    ? `Generate a recipe for "${req.dishName}"${req.cuisine ? ` (${req.cuisine} cuisine)` : ''}. Make it the classic, authentic home-cook version — the way it is actually made in home kitchens, not restaurants.`
    : `Generate an original ${req.cuisine} recipe.`;

  return `${dishLine} ${constraints.length ? 'Requirements: ' + constraints.join('; ') + '.' : ''}

Respond with valid JSON only — no markdown, no explanation. Use this exact structure:
{
  "title": "Recipe Name",
  "description": "One appetising sentence describing the dish.",
  "cuisine": "${req.cuisine}",
  "ingredients": [
    { "name": "ingredient", "quantity": "200", "unit": "g" }
  ],
  "steps": [
    { "order": 1, "title": "Prepare ingredients", "instruction": "Step instruction here." }
  ],
  "prep_time_mins": 15,
  "cook_time_mins": 25,
  "servings": 4,
  "dietary_tags": ["tag1", "tag2"],
  "meal_prep_friendly": true,
  "estimated_macros": {
    "calories": 420,
    "protein": 32,
    "carbohydrates": 38,
    "fat": 14,
    "fibre": 4
  }
}

Rules:
- 6-12 ingredients
- 4-8 steps
- dietary_tags from: vegan, vegetarian, pescatarian, gluten_free, dairy_free, keto, high_protein, low_carb, paleo, halal
- INGREDIENT FORMAT: quantity is a number, unit is a measurement ONLY (g, ml, kg, l, tsp, tbsp, cup, oz, lb, whole, slices, cloves, sprigs, leaves, cans, jars) — never put prep instructions (chopped, minced, diced, beaten) in the unit field. Put prep instructions in the step instructions instead. Examples: { "name": "onion", "quantity": "1", "unit": "medium" } NOT { "name": "onion", "quantity": "1", "unit": "medium, finely chopped" }
- meal_prep_friendly: true if the dish can be batch-cooked, stored 3-5 days in the fridge, and reheated without significant quality loss (curries, stews, grain bowls, roasted proteins, pasta bakes = true; delicate fish, dressed salads, fried foods, poached eggs, fresh pasta = false)
- macros are per serving estimates
- make it a real, cookable recipe a home cook would actually want to make
- TITLE RULE: Always use the common English name. If the dish has a well-known foreign name, put the English name first and the foreign name in parentheses. Examples: "Braised Veal Shanks (Osso Buco)", "Hunter's Chicken (Pollo alla Cacciatora)", "Creamy Rice Pudding (Arroz con Leche)". Never use a foreign-language title alone.
- INGREDIENT RULE: Every ingredient must be available at a mainstream grocery store (Walmart, Kroger, Safeway). Use store-cupboard shortcuts where needed — Thai curry paste (jar) instead of fresh lemongrass + galangal; fish sauce and coconut milk are fine; chicken or vegetable stock instead of dashi; canned chipotle in adobo instead of dried whole chipotles; garam masala + cumin + turmeric instead of hard-to-find whole spices. If a traditional ingredient isn't on a standard grocery shelf, use the closest accessible substitute that preserves the dish's flavour. The test: a home cook should be able to buy every ingredient in a single trip to their local supermarket.
- STEP TITLE RULE: Each step must have a 3-5 word title that starts with an action verb and captures the key action. Examples: "Prepare egg mixture", "Simmer until thickened", "Cook and stir vegetables", "Rest before serving". Do NOT just copy the first few words of the instruction.
- SIMPLE WEEKNIGHT RULE: If the cuisine is "Simple Weeknight", generate meals that a 25-year-old cooking for the first time would search for on Google. Think: "easy chicken and rice", "quick pasta dinner", "simple beef tacos". ALLOWED proteins: chicken breast, chicken thighs, ground beef, ground turkey, canned tuna, shrimp, salmon fillet, pork chops, eggs, bacon, sausage. ALLOWED starches: pasta, spaghetti, rice, potatoes, bread, tortillas, egg noodles. ALLOWED vegetables: broccoli, green beans, carrots, peas, corn, spinach, bell pepper, zucchini, tomatoes, onions, mushrooms, garlic. BANNED ingredients: duck, halloumi, polenta, farro, barley, quinoa, orzo, miso, bok choy, fennel, celery root, harissa, tahini, za'atar, any specialty cheese. BANNED title words: "seared", "pan-seared", "sautéed", "braised", "port", "reduction", "jus", "crème", "confit". Good title examples: "Honey Garlic Chicken and Rice", "Spaghetti with Meat Sauce", "Sheet Pan Chicken and Broccoli", "Beef Tacos with Salsa", "Creamy Tomato Pasta", "One-Pan Lemon Chicken", "Cheesy Baked Pasta", "Egg Fried Rice", "Chicken Quesadillas", "Simple Beef Chili". If in doubt, ask: would this appear in a BuzzFeed "easy weeknight dinners" listicle? If not, choose something simpler.
- CULTURE RULE: 90% of recipes should be iconic, everyday dishes — the classics that home cooks in that country make weekly and that anyone from that culture would immediately recognise. Only 10% can be slightly more ambitious dishes for confident home chefs (but still culturally authentic, not restaurant-only). All recipes must use authentic flavour profiles, spice combinations, and techniques native to that culture. Do NOT generate fusion, westernised, or obscure regional dishes. The MUST-HAVE classics per cuisine — Italian: cacio e pepe, spaghetti bolognese, chicken cacciatore, risotto, amatriciana, carbonara, minestrone, frittata, osso buco; Mexican: chicken tacos, enchiladas, chiles rellenos, arroz con pollo, frijoles de olla, pozole, tamales, quesadillas; Japanese: chicken teriyaki, gyudon, katsu curry, miso soup, ramen, yakisoba, oyakodon, onigiri fillings; Indian: dal tadka, chana masala, palak paneer, butter chicken, aloo gobi, biryani, rajma, chicken tikka masala; Chinese: kung pao chicken, mapo tofu, egg fried rice, dumplings, beef and broccoli, sweet and sour pork, char siu; Thai: pad thai, green curry, massaman curry, tom kha gai, pad see ew, laab, khao pad; Korean: kimchi jjigae (kimchi stew), bibimbap, bulgogi, doenjang jjigae, kimchi fried rice, dakgalbi, tteokbokki; Greek: moussaka, spanakopita, souvlaki, horiatiki salad, fasolada, pastitsio, dolmades; French: quiche lorraine, French onion soup, beef bourguignon, ratatouille, croque monsieur, coq au vin; American: mac and cheese, beef chilli, pot roast, BBQ pulled pork, clam chowder, meatloaf, chicken pot pie; Mediterranean: stuffed peppers, baked fish with herbs, falafel, lentil soup, tabbouleh, shakshuka; Middle Eastern: shakshuka, chicken shawarma, falafel, lentil soup, lamb kebabs, hummus bowls, kofta; Spanish: paella valenciana, tortilla española, gazpacho, patatas bravas, croquetas, gambas al ajillo, fabada asturiana, pollo al ajillo, albondigas, pulpo a la gallega. Generate the iconic dish itself, not a variation or spin-off.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Authentication (required for user-initiated generation) ───────────
    // Allow unauthenticated calls for seed scripts (they'll use x-seed-secret)
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        userId = await requireAuth(req);
      } catch {
        // Fall through — seed endpoint doesn't require auth
      }
    }

    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(GenerateRecipeRequestSchema, req.body);
    const { cuisine, dishName, avoidDishes, avoidIngredients } = body;

    // ── Rate Limiting (5 user-initiated calls per day) ───────────────────
    if (userId) {
      const rateLimitResult = await rateLimitUser(userId, 'generate-recipe', 5, 86400);
      if (!rateLimitResult.success) {
        res.setHeader('Retry-After', rateLimitResult.retryAfter || 3600);
        return res.status(429).json({
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
        });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service misconfigured' });

    const client = new Anthropic({ apiKey });

    // Build the request object with validated data
    const generateRequest = {
      cuisine,
      dishName,
      avoidDishes,
      avoidIngredients,
      ...body,
    } as GenerateRequest;
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: buildPrompt(generateRequest) }],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    let recipe: GeneratedRecipe;
    try {
      recipe = JSON.parse(raw);
    } catch {
      // Strip markdown fences — handle both complete (``` ```) and incomplete (``` only) fences
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
      const cleaned = fenced ? fenced[1].trim() : raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/,'').trim();
      recipe = JSON.parse(cleaned);
    }

    // Sanitize dietary tags — strip unknown tags and fix ingredient-based contradictions
    const VALID_TAGS = new Set([
      'vegan', 'vegetarian', 'pescatarian', 'gluten_free', 'dairy_free',
      'keto', 'high_protein', 'low_carb', 'paleo', 'halal',
    ]);
    recipe.dietary_tags = (recipe.dietary_tags ?? []).filter(t => VALID_TAGS.has(t));

    const ingredientText = recipe.ingredients.map(i => i.name.toLowerCase()).join(' ');
    const hasMeat = /\b(chicken|beef|pork|lamb|turkey|duck|bacon|sausage|prosciutto|pancetta|chorizo|salami|ham|veal|venison|bison|ground beef|ground pork|ground turkey|short rib|oxtail|lard|guanciale)\b/.test(ingredientText);
    const hasSeafood = /\b(fish|salmon|tuna|shrimp|prawn|crab|lobster|clam|mussel|oyster|squid|octopus|anchov|sardine|cod|bass|tilapia|halibut|mahi|scallop|mackerel|trout|snapper)\b/.test(ingredientText);
    const hasDairy = /\b(milk|cream|butter|cheese|yogurt|yoghurt|parmesan|mozzarella|ricotta|feta|cheddar|ghee|crème fraîche|sour cream|half.and.half|mascarpone|brie|gruyère|gruyere)\b/.test(ingredientText);
    const hasGluten = /\b(flour|bread|pasta|noodle|wheat|barley|rye|breadcrumb|panko|soy sauce|tortilla|pita|couscous)\b/.test(ingredientText);

    if (hasMeat || hasSeafood) recipe.dietary_tags = recipe.dietary_tags.filter(t => t !== 'vegan' && t !== 'vegetarian');
    if (hasMeat)   recipe.dietary_tags = recipe.dietary_tags.filter(t => t !== 'pescatarian');
    if (hasDairy)  recipe.dietary_tags = recipe.dietary_tags.filter(t => t !== 'vegan' && t !== 'dairy_free');
    if (hasGluten) recipe.dietary_tags = recipe.dietary_tags.filter(t => t !== 'gluten_free');

    // Server-side similarity guard — reject if too close to an existing dish
    if (avoidDishes?.length) {
      const normalize = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const words = (s: string) => new Set(normalize(s).split(' ').filter(Boolean));
      const jaccard = (a: Set<string>, b: Set<string>) => {
        const inter = [...a].filter(w => b.has(w)).length;
        const union = new Set([...a, ...b]).size;
        return union === 0 ? 0 : inter / union;
      };
      const newWords = words(recipe.title);
      const tooSimilar = avoidDishes.some(existing => jaccard(newWords, words(existing)) >= 0.6);
      if (tooSimilar) {
        return res.status(409).json({ error: 'Generated recipe too similar to existing dish', title: recipe.title });
      }
    }

    // Caller can override meal_prep_friendly (e.g. seed script reads it from CSV)
    if (body.meal_prep_friendly !== undefined) {
      recipe.meal_prep_friendly = body.meal_prep_friendly;
    }

    // Persist to Supabase if requested (used by seed script)
    if (body.save) {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase not configured — missing SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_URL');
      const { error: insertError } = await sb.from('recipes').insert({
        title: recipe.title,
        description: recipe.description,
        cuisine: body.cuisine.toLowerCase(),
        source_type: 'curated',
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        prep_time_mins: recipe.prep_time_mins,
        cook_time_mins: recipe.cook_time_mins,
        servings: recipe.servings,
        dietary_tags: recipe.dietary_tags,
        skill_level: body.skillLevel ?? 'home_cook',
        meal_prep_friendly: recipe.meal_prep_friendly ?? false,
        macros: { ...recipe.estimated_macros, isEstimated: true },
        badge: 'none',
        avg_rating: 4.0 + Math.random() * 0.9,
        cost_per_serving: parseFloat((3.5 + Math.random() * 6).toFixed(2)),
        image_url: null,
      });
      if (insertError) throw new Error(`Supabase insert failed: ${insertError.message}`);
    }

    return res.status(200).json({ recipe });
  } catch (err: unknown) {
    // Handle validation errors
    if (err instanceof ValidationError) {
      return res.status(400).json(formatValidationError(err));
    }

    // Handle auth errors
    if (err instanceof Error && err.name === 'AuthError') {
      const statusCode = (err as any).statusCode || 401;
      return res.status(statusCode).json({ error: err.message });
    }

    // Log to external service in production (not console)
    if (process.env.NODE_ENV === 'development') {
      const message = err instanceof Error ? err.message : 'Recipe generation failed';
      console.error('[generate-recipe]', message);
    }

    return res.status(500).json({ error: 'Failed to generate recipe' });
  }
}
