import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// POST /api/generate-recipe
// Generates a complete original recipe using Claude Haiku (~$0.004 per recipe).
// Used by scripts/generate-recipes.mjs for bulk seeding and on-demand gap filling.
// Generated recipes are owned by Mise — no copyright issues.
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
  dietaryGoals?: string[];
  skillLevel?: string;
  maxMins?: number;
  avoidIngredients?: string[];
  avoidDishes?: string[];
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

  return `Generate an original ${req.cuisine} recipe. ${constraints.length ? 'Requirements: ' + constraints.join('; ') + '.' : ''}

Respond with valid JSON only — no markdown, no explanation. Use this exact structure:
{
  "title": "Recipe Name",
  "description": "One appetising sentence describing the dish.",
  "cuisine": "${req.cuisine}",
  "ingredients": [
    { "name": "ingredient", "quantity": "200", "unit": "g" }
  ],
  "steps": [
    { "order": 1, "instruction": "Step instruction here." }
  ],
  "prep_time_mins": 15,
  "cook_time_mins": 25,
  "servings": 4,
  "dietary_tags": ["tag1", "tag2"],
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
- macros are per serving estimates
- make it a real, cookable recipe a home cook would actually want to make
- TITLE RULE: Always use the common English name. If the dish has a well-known foreign name, put the English name first and the foreign name in parentheses. Examples: "Braised Veal Shanks (Osso Buco)", "Hunter's Chicken (Pollo alla Cacciatora)", "Creamy Rice Pudding (Arroz con Leche)". Never use a foreign-language title alone.
- CULTURE RULE: 90% of recipes should be iconic, everyday dishes — the classics that home cooks in that country make weekly and that anyone from that culture would immediately recognise. Only 10% can be slightly more ambitious dishes for confident home chefs (but still culturally authentic, not restaurant-only). All recipes must use authentic flavour profiles, spice combinations, and techniques native to that culture. Do NOT generate fusion, westernised, or obscure regional dishes. The MUST-HAVE classics per cuisine — Italian: cacio e pepe, spaghetti bolognese, chicken cacciatore, risotto, amatriciana, carbonara, minestrone, frittata, osso buco; Mexican: chicken tacos, enchiladas, chiles rellenos, arroz con pollo, frijoles de olla, pozole, tamales, quesadillas; Japanese: chicken teriyaki, gyudon, katsu curry, miso soup, ramen, yakisoba, oyakodon, onigiri fillings; Indian: dal tadka, chana masala, palak paneer, butter chicken, aloo gobi, biryani, rajma, chicken tikka masala; Chinese: kung pao chicken, mapo tofu, egg fried rice, dumplings, beef and broccoli, sweet and sour pork, char siu; Thai: pad thai, green curry, massaman curry, tom kha gai, pad see ew, laab, khao pad; Korean: kimchi jjigae (kimchi stew), bibimbap, bulgogi, doenjang jjigae, kimchi fried rice, dakgalbi, tteokbokki; Greek: moussaka, spanakopita, souvlaki, horiatiki salad, fasolada, pastitsio, dolmades; French: quiche lorraine, French onion soup, beef bourguignon, ratatouille, croque monsieur, coq au vin; American: mac and cheese, beef chilli, pot roast, BBQ pulled pork, clam chowder, meatloaf, chicken pot pie; Mediterranean: stuffed peppers, baked fish with herbs, falafel, lentil soup, tabbouleh, shakshuka; Middle Eastern: shakshuka, chicken shawarma, falafel, lentil soup, lamb kebabs, hummus bowls, kofta. Generate the iconic dish itself, not a variation or spin-off.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body as GenerateRequest;
  if (!body.cuisine) return res.status(400).json({ error: 'cuisine required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPrompt(body) }],
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

    // Server-side similarity guard — reject if too close to an existing dish
    if (body.avoidDishes?.length) {
      const normalize = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const words = (s: string) => new Set(normalize(s).split(' ').filter(Boolean));
      const jaccard = (a: Set<string>, b: Set<string>) => {
        const inter = [...a].filter(w => b.has(w)).length;
        const union = new Set([...a, ...b]).size;
        return union === 0 ? 0 : inter / union;
      };
      const newWords = words(recipe.title);
      const tooSimilar = body.avoidDishes.some(existing => jaccard(newWords, words(existing)) >= 0.6);
      if (tooSimilar) {
        return res.status(409).json({ error: 'Generated recipe too similar to existing dish', title: recipe.title });
      }
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
    const message = err instanceof Error ? err.message : 'Generation failed';
    return res.status(500).json({ error: message });
  }
}
