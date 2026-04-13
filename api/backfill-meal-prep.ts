/**
 * POST /api/backfill-meal-prep
 *
 * Sets meal_prep_friendly = true for a list of recipes identified by title.
 * Titles are matched case-insensitively and exactly (no partial matching)
 * to avoid false positives. Use /api/admin-recipes to look up exact titles first.
 *
 * Auth: x-seed-secret header required.
 *
 * Body:
 *   { titles: string[] }   — exact titles to flag (case-insensitive)
 *
 * Response:
 *   { updated: number, matched: string[], notFound: string[] }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = req.headers['x-seed-secret'];
  const expectedSecret = process.env.SEED_SECRET;
  if (!expectedSecret) return res.status(500).json({ error: 'Server misconfigured' });
  if (!secret || secret !== expectedSecret) return res.status(401).json({ error: 'Unauthorized' });

  // ── Validate body ───────────────────────────────────────────────────────────
  const { titles } = req.body ?? {};
  if (!Array.isArray(titles) || titles.length === 0) {
    return res.status(400).json({ error: '`titles` must be a non-empty array of strings' });
  }

  try {
    const sb = getSupabase();

    // Fetch all recipes whose titles match (case-insensitive exact match)
    const { data: found, error: fetchErr } = await sb
      .from('recipes')
      .select('id, title')
      .in('title', titles);

    if (fetchErr) throw fetchErr;

    // Supabase .in() is case-sensitive — do our own case-insensitive reconciliation
    const titlesLower = titles.map((t: string) => t.toLowerCase());
    const matched = (found ?? []).filter((r) => titlesLower.includes(r.title.toLowerCase()));
    const matchedTitles = matched.map((r) => r.title);
    const notFound = titles.filter((t) => !matchedTitles.some((m) => m.toLowerCase() === t.toLowerCase()));

    if (matched.length === 0) {
      return res.status(200).json({ updated: 0, matched: [], notFound: titles });
    }

    const ids = matched.map((r) => r.id);
    const { error: updateErr } = await sb
      .from('recipes')
      .update({ meal_prep_friendly: true })
      .in('id', ids);

    if (updateErr) throw updateErr;

    return res.status(200).json({
      updated: matched.length,
      matched: matchedTitles,
      notFound,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}
