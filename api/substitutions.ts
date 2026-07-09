import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { rateLimitUser } from './_rateLimit';
import { validate, SubstitutionsRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './_apiAuth';
import { isPremiumUserId } from './_requirePremium';
import { checkAiBudget, incrementAiUsage } from './_aiUsage';
import { captureException, flushSentry } from './_sentry';

// POST /api/substitutions
// Given a recipe title and ingredient, returns practical ingredient swaps.
//
// Auth: Required (JWT bearer token)
// Rate limit: 20 requests per user per day
//
// Body:    { ingredient: string, reason?: 'allergy' | 'dietary' | 'preference' | 'unavailable', limit?: 5 }
// Returns: { swaps: { ingredient: string; substitute: string; reason: string }[] }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Authentication ────────────────────────────────────────────────────
    const userId = await requireAuth(req);

    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(SubstitutionsRequestSchema, req.body);
    const { ingredient, limit = 5 } = body;

    // ── Rate Limiting (20 calls per user per day) ─────────────────────────
    const rateLimitResult = await rateLimitUser(userId, 'substitutions', 20, 86400);
    if (!rateLimitResult.success) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter || 3600);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    // ── AI budget (free: 5/month; premium unlimited). Checked before the Claude
    // call. The client degrades gracefully on 402 — the static substitutions table
    // (lib/substitutions.ts, ~125 entries) and cached AI results stay available free.
    // premium === null (lookup failed) skips the gate — never 402 a possible payer
    // on a transient read; rate limits still bound it.
    const premium = await isPremiumUserId(userId);
    if (premium !== null) {
      const budget = await checkAiBudget(userId, 'substitutions', premium);
      if (!budget.allowed) {
        return res.status(402).json({
          error: 'Monthly free AI limit reached',
          code: 'ai_budget_exhausted',
          limit: budget.limit,
        });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Service misconfigured' });

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Suggest practical ingredient substitutions for: ${ingredient}

Return ONLY a JSON array (no markdown, no extra text) of up to ${limit} substitution objects:
[{"substitute":"alternative ingredient","reason":"short reason"},...]

Rules:
- Focus on: alcohol-free swaps, vegan alternatives, common allergen substitutes, availability swaps
- Keep "reason" under 10 words
- Make each substitute genuinely useful and mainstream
- If no meaningful swaps exist, return []`,
        },
      ],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    // Extract JSON array even if model adds surrounding text
    const match = raw.match(/\[[\s\S]*\]/);
    const swaps = match ? JSON.parse(match[0]) : [];

    // Count the successful gen (an empty swaps array is still a delivered answer —
    // the client caches it, so re-taps don't re-bill). Premium usage goes into a
    // separate ':premium' bucket so a mid-month downgrader's free bucket stays clean;
    // unknown premium isn't counted. A failed count never blocks the response.
    if (premium !== null) {
      try {
        await incrementAiUsage(userId, premium ? 'substitutions:premium' : 'substitutions');
      } catch (e) {
        captureException(e);
        await flushSentry();
      }
    }

    return res.status(200).json({ swaps: swaps.slice(0, limit) });
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
      const message = err instanceof Error ? err.message : 'Substitution generation failed';
      console.error('[substitutions]', message);
    }

    return res.status(500).json({ error: 'Failed to generate substitutions' });
  }
}
