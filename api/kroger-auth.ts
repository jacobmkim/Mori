/**
 * Exchanges a Kroger OAuth authorization code for access + refresh tokens.
 * Stores tokens server-side in Supabase — never returns them to the client.
 *
 * Security:
 * - client_secret never leaves this function
 * - Tokens stored in Supabase under the authenticated user's ID
 * - kroger_tokens table has RLS enabled (no client access)
 * - Only accepts requests with a valid Supabase JWT
 *
 * POST /api/kroger-auth
 * Body: { code, codeVerifier, redirectUri }
 * Response: { connected: true }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireAuth, AuthError } from './_apiAuth';
import { rateLimitUser } from './_rateLimit';
import { captureException } from './_sentry';
import { validate, ValidationError, formatValidationError } from '../lib/validation';

// ─── Schema ───────────────────────────────────────────────────────────────────

const KrogerAuthSchema = z.object({
  code:         z.string().min(1).max(512),
  codeVerifier: z.string().min(43).max(128),
  redirectUri:  z.string().min(1).max(200),
});

// ─── Supabase (service role — bypasses RLS intentionally) ────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

// ─── Kroger token exchange ────────────────────────────────────────────────────

const KROGER_BASE = process.env.KROGER_ENVIRONMENT === 'production'
  ? 'https://api.kroger.com/v1'
  : 'https://api-ce.kroger.com/v1';

async function exchangeCode(code: string, codeVerifier: string, redirectUri: string) {
  const id     = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Kroger credentials not configured');

  const credentials = Buffer.from(`${id}:${secret}`).toString('base64');

  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!res.ok) {
    // Do NOT forward the Kroger error body — it may contain diagnostic info
    throw new Error(`Kroger token exchange failed: ${res.status}`);
  }

  const data = await res.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = await requireAuth(req);

    // 10 connect attempts per hour — prevents brute-force code stuffing
    const rl = await rateLimitUser(userId, 'kroger-auth', 10, 3600);
    if (!rl.success) {
      res.setHeader('Retry-After', rl.retryAfter ?? 3600);
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const body = await validate(KrogerAuthSchema, req.body);

    // Exchange code → tokens (client_secret used here, never on client)
    const tokens = await exchangeCode(body.code, body.codeVerifier, body.redirectUri);

    // Persist tokens under this user — upsert in case they reconnect
    const sb = getSupabase();
    const { error } = await sb.from('kroger_tokens').upsert(
      {
        user_id:       userId,
        access_token:  tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at:    tokens.expiresAt,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) throw new Error('Failed to store tokens');

    // Return only a success flag — tokens never leave the server
    return res.status(200).json({ connected: true });

  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json(formatValidationError(err));
    if (err instanceof AuthError)       return res.status(err.statusCode).json({ error: err.message });
    captureException(err);
    if (process.env.NODE_ENV === 'development') {
      console.error('[kroger-auth]', err instanceof Error ? err.message : err);
    }
    return res.status(500).json({ error: 'Failed to connect Kroger account' });
  }
}
