/**
 * GET /api/admin-recipes
 *
 * Lists all recipes with their id, title, cuisine, and current meal_prep_friendly status.
 * Use this to browse recipes and build a backfill list for /api/backfill-meal-prep.
 *
 * Auth: x-seed-secret header required.
 *
 * Query params:
 *   ?flagged=true   — only return recipes already marked meal_prep_friendly
 *   ?unflagged=true — only return recipes with meal_prep_friendly null or false
 *   ?q=chicken      — filter by title substring (case-insensitive)
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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = req.headers['x-seed-secret'];
  const expectedSecret = process.env.SEED_SECRET;
  if (!expectedSecret) return res.status(500).json({ error: 'Server misconfigured' });
  if (!secret || secret !== expectedSecret) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sb = getSupabase();
    const { flagged, unflagged, q } = req.query;

    let query = sb
      .from('recipes')
      .select('id, external_id, title, cuisine, meal_prep_friendly, prep_time_mins, cook_time_mins')
      .order('title', { ascending: true });

    if (flagged === 'true') {
      query = query.eq('meal_prep_friendly', true);
    } else if (unflagged === 'true') {
      query = query.or('meal_prep_friendly.is.null,meal_prep_friendly.eq.false');
    }

    if (q && typeof q === 'string') {
      query = query.ilike('title', `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      total: data.length,
      recipes: data,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}
