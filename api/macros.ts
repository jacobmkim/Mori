import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser } from './_rateLimit';
import { validate, MacrosRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './_apiAuth';
import { captureException } from './_sentry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MacroRequest {
  externalId?: string;  // TheMealDB ID — used to cache result in Supabase recipes table
  supabaseId?: string;  // Supabase UUID — used for community recipes (no external_id)
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

async function saveMacrosToDB(
  macros: Macros,
  externalId?: string,
  supabaseId?: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || (!externalId && !supabaseId)) return;
  try {
    const query = sb.from('recipes').update({ macros });
    if (externalId) {
      await query.eq('external_id', externalId);
    } else {
      await query.eq('id', supabaseId);
    }
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

  try {
    // ── Authentication ────────────────────────────────────────────────────
    const userId = await requireAuth(req);

    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(MacrosRequestSchema, req.body);
    const { externalId, supabaseId, recipeTitle, ingredients } = body;

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

    // 2. Estimate with Claude Haiku — always labelled isEstimated: true
    const estimated = await estimateWithClaude(recipeTitle, (ingredients ?? []) as MacroRequest['ingredients']);
    if (estimated) {
      saveMacrosToDB(estimated, externalId, supabaseId); // fire-and-forget
      return res.json({ macros: estimated });
    }

    return res.status(500).json({ error: 'Could not estimate macros' });
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
