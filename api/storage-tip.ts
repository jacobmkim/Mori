import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimitUser, getClientIP } from './rateLimit';
import { validate, StorageTipRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './apiAuth';

// POST /api/storage-tip
// Given a leftover ingredient, returns storage and usage tips from Claude Haiku.
//
// Auth: Required (JWT bearer token)
// Rate limit: 50 requests per user per day
//
// Body: { ingredient: string, storageMethod?: 'room_temp' | 'fridge' | 'freezer' }
// Returns: { tips: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Authentication ────────────────────────────────────────────────────
    const userId = await requireAuth(req);

    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(StorageTipRequestSchema, req.body);
    const { ingredient } = body;

    // ── Rate Limiting (50 calls per user per day) ─────────────────────────
    const rateLimitResult = await rateLimitUser(userId, 'storage-tip', 50, 86400);
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

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Give me brief, practical storage and usage tips for this leftover ingredient: ${ingredient}.

Format as 2-3 short tips. Be concise and specific. Focus on: how long it keeps, best storage method, and one quick way to use it up. No intro sentence, just the tips.`,
        },
      ],
    });

    const tips = (message.content[0] as { text: string }).text.trim();
    return res.status(200).json({ tips });
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
      const message = err instanceof Error ? err.message : 'Storage tip generation failed';
      console.error('[storage-tip]', message);
    }

    return res.status(500).json({ error: 'Failed to generate tips' });
  }
}
