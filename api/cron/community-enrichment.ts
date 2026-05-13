/**
 * Vercel Cron: /api/cron/community-enrichment
 * Runs daily at 03:00 UTC (low-traffic window).
 *
 * Safety net for community recipes that landed with `macros = NULL` — usually
 * because the user submitted before the wizard's review-step calculator
 * finished or because /api/macros returned null for an implausible/sparse
 * recipe. Limited to recipes submitted in the last 14 days so we don't keep
 * re-trying older failures forever.
 *
 * Trigger manually: GET /api/cron/community-enrichment
 * with Authorization: Bearer <CRON_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyCronAuth } from './_auth';
import { estimateWithClaude, isTooSparseForMacros } from '../macros';

const MAX_PER_RUN = 50; // Stay under the 30s function budget; Haiku ≈ 0.4s/call.

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const sb = getSupabase();
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const { data: rows, error } = await sb
    .from('recipes')
    .select('id, title, ingredients, servings')
    .eq('source_type', 'community')
    .is('macros', null)
    .not('submitted_by', 'is', null)
    .gte('created_at', cutoff)
    .limit(MAX_PER_RUN);

  if (error) return res.status(500).json({ error: 'Failed to fetch recipes' });
  if (!rows?.length) return res.status(200).json({ checked: 0, enriched: 0, failed: 0 });

  let enriched = 0;
  let failed = 0;

  for (const row of rows) {
    const ingredients = Array.isArray(row.ingredients) ? row.ingredients : [];
    // Skip recipes that the original sparse-recipe gate would have rejected —
    // no point burning Claude tokens on submissions that can't produce honest
    // numbers regardless of how many times we retry.
    if (isTooSparseForMacros(ingredients as any)) {
      failed++;
      continue;
    }
    const servings = typeof row.servings === 'number' && row.servings > 0 ? row.servings : 4;

    try {
      const macros = await estimateWithClaude(row.title as string, ingredients as any, servings);
      if (!macros) {
        failed++;
        continue;
      }
      const { error: updateErr } = await sb
        .from('recipes')
        .update({ macros })
        .eq('id', row.id)
        .is('macros', null); // guard against races with the wizard committing user-edited macros
      if (updateErr) {
        failed++;
        continue;
      }
      enriched++;
    } catch {
      failed++;
    }
  }

  return res.status(200).json({ checked: rows.length, enriched, failed });
}
