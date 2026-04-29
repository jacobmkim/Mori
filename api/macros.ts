import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser } from './_rateLimit';
import { validate, MacrosRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './_apiAuth';
import { captureException } from './_sentry';
import { canWriteMacros } from '../lib/macrosOwnership';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MacroRequest {
  externalId?: string;  // TheMealDB ID — used to cache result in Supabase recipes table
  supabaseId?: string;  // Supabase UUID — used for community recipes (no external_id)
  recipeTitle: string;
  servings?: number;
  ingredients: { name: string; quantity: string; unit: string }[];
}

interface Macros {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fibre: number;
  netCarbs?: number;
  isEstimated: boolean;
}

// Ingredients we treat as a meaningful protein source for the sanity check
// below. If a recipe has none of these and Claude returns confidence=low with
// >5g protein per serving, we assume hallucination.
const PROTEIN_SOURCE_PATTERNS = [
  // animal proteins
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'bacon', 'ham', 'sausage',
  'fish', 'salmon', 'tuna', 'cod', 'trout', 'shrimp', 'prawn', 'crab', 'lobster',
  'scallop', 'mussel', 'clam', 'oyster', 'anchovy', 'sardine',
  // dairy + eggs
  'egg', 'milk', 'yogurt', 'yoghurt', 'cheese', 'cream', 'butter', 'cottage', 'ricotta',
  'mozzarella', 'parmesan', 'feta', 'cheddar', 'paneer',
  // plant proteins
  'tofu', 'tempeh', 'seitan', 'edamame',
  'bean', 'lentil', 'chickpea', 'pea ', 'quinoa',
  // nuts/seeds with meaningful protein
  'almond', 'peanut', 'cashew', 'walnut', 'pistachio', 'pecan',
  'tahini', 'hummus',
  // protein powders / concentrates
  'protein powder', 'whey',
];

function hasProteinSource(ingredients: { name: string }[]): boolean {
  const blob = ingredients.map((i) => i.name.toLowerCase()).join(' | ');
  return PROTEIN_SOURCE_PATTERNS.some((p) => blob.includes(p));
}

// Parses a quantity string into a number. Returns NaN for empty / unparseable
// inputs (treated as "no quantity provided" by the gate below).
function parseQty(raw: string): number {
  const s = raw.trim();
  if (!s) return NaN;
  // mixed fractions ("1 1/2"), simple fractions ("1/2"), decimals ("0.5")
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  const num = parseFloat(s);
  return isNaN(num) ? NaN : num;
}

// Returns true when the ingredient list is too sparse for any honest macro
// estimate. This is the most important guard — without it Claude makes up
// numbers for "garlic" and similar single-ingredient submissions.
function isTooSparseForMacros(ingredients: { name: string; quantity: string }[]): boolean {
  if (ingredients.length < 3) return true;
  const withQty = ingredients.filter((i) => !isNaN(parseQty(i.quantity))).length;
  // Need at least half the rows to have a real quantity.
  return withQty < Math.ceil(ingredients.length / 2);
}

// Catches Claude hallucinations by checking biological plausibility of the
// returned macros. Returns true when the numbers are nonsense and should be
// rejected (caller writes null to DB, UI hides macro pills).
function isImplausibleMacros(
  m: { calories: number; protein: number; carbohydrates: number; fat: number },
  confidence: 'low' | 'medium' | 'high',
  ingredients: { name: string }[],
): boolean {
  // Protein-cal can never exceed total calories (each gram = 4 kcal).
  if (m.protein * 4 > m.calories * 1.1) return true;

  // Atwater check: macros * their kcal/g should roughly match calories.
  // Allow ±50% tolerance — Claude rounding + fibre/alcohol noise.
  const macroCals = m.protein * 4 + m.carbohydrates * 4 + m.fat * 9;
  if (macroCals > m.calories * 1.5 || (m.calories > 50 && macroCals < m.calories * 0.5)) {
    return true;
  }

  // Low confidence + no protein source + non-trivial protein = hallucination.
  if (confidence === 'low' && !hasProteinSource(ingredients) && m.protein > 5) {
    return true;
  }

  return false;
}

// ─── Supabase cache ───────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCachedMacrosFromDB(
  externalId?: string,
  supabaseId?: string,
): Promise<Macros | null> {
  const sb = getSupabase();
  if (!sb || (!externalId && !supabaseId)) return null;
  try {
    const query = sb.from('recipes').select('macros');
    const { data } = externalId
      ? await query.eq('external_id', externalId).single()
      : await query.eq('id', supabaseId).single();
    return (data?.macros as Macros) ?? null;
  } catch {
    return null;
  }
}

// Caches Claude's macros estimate against the recipe row so we don't re-spend
// on the next request. Two write paths are allowed:
//   1. Curated recipes (source_type = 'curated') with no macros yet — backfill.
//   2. Community recipes the caller submitted themselves.
// Anything else is a no-op. This blocks the IDOR where any signed-in user could
// pass an arbitrary `supabaseId` and overwrite another recipe's macros via the
// service-role write.
async function saveMacrosToDB(
  macros: Macros,
  userId: string,
  externalId?: string,
  supabaseId?: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || (!externalId && !supabaseId)) return;
  try {
    const lookup = sb.from('recipes').select('id, source_type, submitted_by, macros');
    const { data: recipe } = externalId
      ? await lookup.eq('external_id', externalId).single()
      : await lookup.eq('id', supabaseId!).single();
    if (!recipe) return;
    if (!canWriteMacros(recipe, userId)) return;

    await sb.from('recipes').update({ macros }).eq('id', recipe.id);
  } catch {
    // Non-critical — cache write failure is fine
  }
}

// ─── Claude estimate ──────────────────────────────────────────────────────────

async function estimateWithClaude(
  title: string,
  ingredients: MacroRequest['ingredients'],
  servings: number,
): Promise<Macros | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const client = new Anthropic({ apiKey: key });

  const ingredientList = ingredients
    .map((i) => `${i.quantity} ${i.unit} ${i.name}`.trim().replace(/\s+/g, ' '))
    .join(', ');

  // Force a per-ingredient breakdown step before the final per-serving total.
  // Confidence flag lets us reject hallucinations downstream when ingredients
  // are too vague to support specific numbers.
  const prompt = `You are a nutrition estimator. Estimate per-serving macros for this recipe.

Recipe: ${title}
Servings: ${servings}
Ingredients: ${ingredientList}

Steps:
1. Estimate macros per ingredient as listed (use the quantities given — do NOT invent extra ingredients).
2. Sum across ingredients to get whole-recipe macros.
3. Divide by ${servings} to get per-serving macros.
4. Set "confidence":
   - "high" if every ingredient has a specific quantity and is unambiguous
   - "medium" if most are quantified
   - "low" if quantities are missing, vague, or the ingredient list is sparse

Reply with ONLY a JSON object — no explanation, no markdown:
{"calories":0,"protein":0,"carbohydrates":0,"fat":0,"fibre":0,"confidence":"low"}`;

  let parsed: any;
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (message.content[0] as any)?.text ?? '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;

    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  const calories = Math.max(0, Math.round(parsed.calories ?? 0));
  const protein = Math.max(0, Math.round(parsed.protein ?? 0));
  const carbohydrates = Math.max(0, Math.round(parsed.carbohydrates ?? 0));
  const fat = Math.max(0, Math.round(parsed.fat ?? 0));
  const fibre = Math.max(0, Math.round(parsed.fibre ?? 0));
  const confidence: 'low' | 'medium' | 'high' =
    parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low';

  if (isImplausibleMacros({ calories, protein, carbohydrates, fat }, confidence, ingredients)) {
    return null;
  }

  return {
    calories,
    protein,
    carbohydrates,
    fat,
    fibre,
    netCarbs: Math.max(0, carbohydrates - fibre),
    isEstimated: true,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── Authentication ────────────────────────────────────────────────────
    const userId = await requireAuth(req);

    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(MacrosRequestSchema, req.body);
    const { externalId, supabaseId, recipeTitle, ingredients, servings } = body;
    const ings = (ingredients ?? []) as MacroRequest['ingredients'];

    // ── Rate Limiting (30 calls per user per day) ─────────────────────────
    const rateLimitResult = await rateLimitUser(userId, 'macros', 30, 86400);
    if (!rateLimitResult.success) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter || 3600);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    // 1. Check Supabase cache — avoids Claude call if already computed for this recipe
    if (externalId || supabaseId) {
      const cached = await getCachedMacrosFromDB(externalId, supabaseId);
      if (cached) return res.json({ macros: cached });
    }

    // 2. Pre-flight gate — refuse to estimate when the ingredient list is too
    //    sparse or unquantified. Without this, Claude hallucinates plausible
    //    macros for what it imagines the recipe to be (e.g. "garlic" → 18g
    //    protein because it mentally fills in a chicken dish).
    if (isTooSparseForMacros(ings)) {
      return res.json({ macros: null, reason: 'insufficient_ingredients' });
    }

    // 3. Estimate with Claude Haiku — always labelled isEstimated: true
    const effectiveServings = servings && servings > 0 ? servings : 4;
    const estimated = await estimateWithClaude(recipeTitle, ings, effectiveServings);
    if (estimated) {
      saveMacrosToDB(estimated, userId, externalId, supabaseId); // fire-and-forget
      return res.json({ macros: estimated });
    }

    // Claude returned null OR sanity bounds rejected the output — leave macros
    // unset rather than caching nonsense.
    return res.json({ macros: null, reason: 'estimate_unavailable' });
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

    captureException(err);
    if (process.env.NODE_ENV === 'development') {
      const message = err instanceof Error ? err.message : 'Macros estimation failed';
      console.error('[macros]', message);
    }

    return res.status(500).json({ error: 'Could not estimate macros' });
  }
}
