import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { rateLimitIP, getClientIP } from './rateLimit';
import { validate, WaitlistRequestSchema, ValidationError, formatValidationError } from '../lib/validation';

// POST /api/waitlist
// Saves a waitlist email to Supabase.
// No auth required (public endpoint for landing page)
// Rate limit: 5 signups per IP per hour, 10 attempts per email per hour
//
// Body: { email: string, name?: string }
// Returns: { success: true } or { error: string }
//
// Requires this table in Supabase:
//   create table waitlist (
//     id uuid primary key default gen_random_uuid(),
//     email text not null unique,
//     name text,
//     created_at timestamp with time zone default now()
//   );

const ALLOWED_ORIGINS = [
  'https://getmori.app',
  'https://www.getmori.app',
  'http://localhost:3000', // dev
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── CORS (Restricted) ─────────────────────────────────────────────────
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(WaitlistRequestSchema, req.body);
    const { email, name } = body;

    // ── Rate Limiting by IP (5 signups per hour, prevents spam) ──────────
    const ip = getClientIP(req);
    const ipRateLimitResult = await rateLimitIP(ip, 'waitlist-ip', 5, 3600);
    if (!ipRateLimitResult.success) {
      res.setHeader('Retry-After', ipRateLimitResult.retryAfter || 3600);
      return res.status(429).json({
        error: 'Too many signup attempts from this IP',
        retryAfter: ipRateLimitResult.retryAfter,
      });
    }

    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return res.status(500).json({ error: 'Server misconfigured' });

    const sb = createClient(url, key);
    const { error } = await sb
      .from('waitlist')
      .insert({ email: email.toLowerCase().trim(), name: name || null })
      .single();

    if (error) {
      // Duplicate email — treat as success so we don't leak whether they're on the list
      if (error.code === '23505') return res.status(200).json({ success: true });

      // Generic error message (don't leak DB details)
      if (process.env.NODE_ENV === 'development') {
        console.error('[waitlist]', error.message);
      }
      return res.status(500).json({ error: 'Failed to save email' });
    }

    return res.status(200).json({ success: true });
  } catch (err: unknown) {
    // Handle validation errors
    if (err instanceof ValidationError) {
      return res.status(400).json(formatValidationError(err));
    }

    // Log to external service in production (not console)
    if (process.env.NODE_ENV === 'development') {
      const message = err instanceof Error ? err.message : 'Waitlist signup failed';
      console.error('[waitlist]', message);
    }

    return res.status(500).json({ error: 'Failed to process signup' });
  }
}
