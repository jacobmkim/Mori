import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MacroRequest {
  externalId?: string; // TheMealDB ID — used to cache result in Supabase recipes table
  recipeTitle: string;
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

// ─── Supabase cache ───────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCachedMacrosFromDB(externalId: string): Promise<Macros | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from('recipes')
      .select('macros')
      .eq('external_id', externalId)
      .single();
    return (data?.macros as Macros) ?? null;
  } catch {
    return null;
  }
}

async function saveMacrosToDB(externalId: string, macros: Macros): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('recipes').update({ macros }).eq('external_id', externalId);
  } catch {
    // Non-critical — cache write failure is fine
  }
}

// ─── Claude estimate ──────────────────────────────────────────────────────────

async function estimateWithClaude(
  title: string,
  ingredients: MacroRequest['ingredients']
): Promise<Macros | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const client = new Anthropic({ apiKey: key });

  const ingredientList = ingredients
    .map((i) => `${i.quantity} ${i.unit} ${i.name}`.trim())
    .join(', ');

  const prompt = `Estimate the nutrition per serving for this recipe. Reply ONLY with a JSON object — no explanation, no markdown.

Recipe: ${title}
Ingredients: ${ingredientList || 'not specified'}
Assume 4 servings unless ingredients suggest otherwise.

JSON format:
{"calories":0,"protein":0,"carbohydrates":0,"fat":0,"fibre":0}`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (message.content[0] as any)?.text ?? '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const calories = Math.round(parsed.calories ?? 0);
    const protein = Math.round(parsed.protein ?? 0);
    const carbohydrates = Math.round(parsed.carbohydrates ?? 0);
    const fat = Math.round(parsed.fat ?? 0);
    const fibre = Math.round(parsed.fibre ?? 0);

    return {
      calories,
      protein,
      carbohydrates,
      fat,
      fibre,
      netCarbs: Math.max(0, carbohydrates - fibre),
      isEstimated: true,
    };
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { externalId, recipeTitle, ingredients = [] }: MacroRequest = req.body ?? {};

  if (!recipeTitle) {
    return res.status(400).json({ error: 'recipeTitle is required' });
  }

  // 1. Check Supabase cache — avoids Claude call if already computed for this recipe
  if (externalId) {
    const cached = await getCachedMacrosFromDB(externalId);
    if (cached) return res.json({ macros: cached });
  }

  // 2. Estimate with Claude Haiku — always labelled isEstimated: true
  const estimated = await estimateWithClaude(recipeTitle, ingredients);
  if (estimated) {
    if (externalId) saveMacrosToDB(externalId, estimated);
    return res.json({ macros: estimated });
  }

  return res.status(500).json({ error: 'Could not estimate macros' });
}
