/**
 * Deliberate Sentry verification endpoint.
 *
 * Throws a known error so you can confirm `SENTRY_DSN` on Vercel is wired up
 * correctly. Gated on the same SEED_SECRET as `admin-recipes` so a public
 * caller can't spam the Sentry quota.
 *
 * GET /api/sentry-test
 *   Header: `x-seed-secret: <SEED_SECRET>`
 *
 * Returns 500 with { error: 'Sentry test fired', captured: true|false }. The
 * `captured` flag is true when SENTRY_DSN is set (and therefore an event was
 * sent); false when DSN is missing (proves the misconfiguration to the caller
 * without spamming Sentry).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { captureException } from './_sentry';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const provided = req.headers['x-seed-secret'];
  const expected = process.env.SEED_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server misconfigured' });
  const providedStr = Array.isArray(provided) ? provided[0] : provided;
  const providedBuf = Buffer.from(providedStr ?? '');
  const expectedBuf = Buffer.from(expected);
  const ok = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
  if (!providedStr || !ok) return res.status(401).json({ error: 'Unauthorized' });

  const dsnPresent = !!process.env.SENTRY_DSN;
  const err = new Error(`sentry-test fired at ${new Date().toISOString()}`);
  captureException(err);

  return res.status(500).json({
    error: 'Sentry test fired',
    captured: dsnPresent,
    hint: dsnPresent
      ? 'Check the mori-2g/react-native dashboard — event should arrive within ~1 minute.'
      : 'SENTRY_DSN is not set on this deploy. captureException was a no-op.',
  });
}
