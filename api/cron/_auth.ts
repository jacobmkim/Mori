// Cron-only auth helper, shared by every /api/cron/* handler.
//
// SEED_SECRET (used by dev seed scripts) is intentionally NOT accepted here —
// collapsing both capabilities onto one secret meant a leaked SEED_SECRET
// could trigger push-notification floods. Cron jobs use CRON_SECRET only.
//
// Comparison is constant-time to avoid string-comparison timing leaks.

import type { VercelRequest } from '@vercel/node';
import { timingSafeEqual } from 'crypto';

export function verifyCronAuth(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || typeof auth !== 'string') return false;
  const expected = `Bearer ${cronSecret}`;
  if (auth.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  } catch {
    return false;
  }
}
