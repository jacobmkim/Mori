/**
 * JWT authentication & authorization for Vercel API functions.
 * Validates bearer tokens from Supabase auth.
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ─── JWT Verification ─────────────────────────────────────────────────────

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new AuthError(500, 'Supabase credentials not configured');
  }

  // Use ANON key (not service role) — verifyAuth uses this to validate tokens
  supabaseClient = createClient(url, key);
  return supabaseClient;
}

export async function verifyJWT(token: string | undefined): Promise<string> {
  if (!token) {
    throw new AuthError(401, 'Missing authorization token');
  }

  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.getUser(token);

    if (error || !data.user?.id) {
      throw new AuthError(401, 'Invalid or expired token');
    }

    return data.user.id;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(401, 'Token verification failed');
  }
}

// ─── Request Helper ───────────────────────────────────────────────────────

export function extractBearerToken(req: VercelRequest): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  return authHeader.slice(7); // Remove 'Bearer ' prefix
}

export async function requireAuth(req: VercelRequest): Promise<string> {
  const token = extractBearerToken(req);
  return verifyJWT(token);
}

// ─── Middleware-style Error Handler ───────────────────────────────────────

export function handleAuthError(err: unknown, res: VercelResponse) {
  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
}
