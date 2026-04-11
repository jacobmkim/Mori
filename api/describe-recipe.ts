import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser } from './rateLimit';
import { validate, DescribeRecipeRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './apiAuth';

// POST /api/describe-recipe
// Generates a one-sentence recipe description using Claude Haiku.
// Called once per recipe — result is stored in recipes.description in Supabase.
// Replaces TheMealDB instruction-sentence blurbs (which are often cooking steps, not descriptions).
//
// Auth: Required (JWT bearer token)
// Rate limit: 20 requests per user per day
//
// Body: { externalId: string, title: string, cuisine?: string, category?: string, ingredients?: string[] }
// Returns: { description: string }

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Authentication ────────────────────────────────────────────────────
    const userId = await requireAuth(req);

    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(DescribeRecipeRequestSchema, req.body);
    const { externalId, title, cuisine, category, ingredients } = body;

    // ── Rate Limiting (20 calls per user per day) ─────────────────────────
    const rateLimitResult = await rateLimitUser(userId, 'describe-recipe', 20, 86400);
    if (!rateLimitResult.success) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter || 3600);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service misconfigured' });

    const client = new Anthropic({ apiKey });

    const origin = cuisine && cuisine !== 'Unknown' ? `${cuisine} ` : (category ? `${category} ` : '');
    const ingList = (ingredients as string[]).slice(0, 5).join(', ');

    const prompt = `Write a single appetising sentence describing this recipe. Be specific and make it sound delicious. Do not start with the recipe name. Do not use the word "delicious". Keep it under 20 words.

Recipe: ${title}
${origin ? `Origin: ${origin.trim()}` : ''}
Key ingredients: ${ingList}

One sentence only:`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    });

    const description = (message.content[0] as { text: string }).text.trim()
      .replace(/^["']|["']$/g, '');

    // Persist to Supabase so this never needs to be called again for this recipe
    const sb = getSupabase();
    if (sb && externalId) {
      void sb.from('recipes')
        .update({ description })
        .eq('external_id', externalId);
    }

    return res.status(200).json({ description });
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

    if (process.env.NODE_ENV === 'development') {
      const message = err instanceof Error ? err.message : 'Description generation failed';
      console.error('[describe-recipe]', message);
    }

    return res.status(500).json({ error: 'Failed to generate description' });
  }
}
