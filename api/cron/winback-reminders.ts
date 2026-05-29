/**
 * Vercel Cron: /api/cron/winback-reminders
 * Runs daily at 17:00 UTC (≈ midday ET).
 *
 * Re-engages dormant users. A user inactive for ≥7 days gets a first nudge
 * (stage 1); if still gone at ≥14 days, a second (stage 2); then we go silent
 * until they return (the app resets winback_stage to 0 on foreground via
 * touchLastActive). The nudge surfaces a saved-but-uncooked recipe (or a
 * cuisine-matched pick) and deep-links into it.
 *
 * Trigger manually: GET /api/cron/winback-reminders
 * with Authorization: Bearer <CRON_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_pushUtils';
import { verifyCronAuth } from './_auth';
import { nextWinbackStage, pickWinbackRecipe, type SavedCandidate, type RecipePick } from '../../lib/winback';

const DAY_MS = 86_400_000;

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

function daysBetween(from: string, now: number): number {
  return (now - new Date(from).getTime()) / DAY_MS;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const sb = getSupabase();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString();

  // Eligible = opted-in, has a push token, not yet capped, inactive ≥7d.
  // `last_active_at < cutoff` also excludes NULLs (never-active users).
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, push_token, last_active_at, last_winback_reminder_at, winback_stage, cuisine_preferences')
    .eq('notify_winback', true)
    .not('push_token', 'is', null)
    .lt('winback_stage', 2)
    .lt('last_active_at', sevenDaysAgo);

  if (profErr) return res.status(500).json({ error: 'Failed to fetch profiles' });
  if (!profiles?.length) return res.status(200).json({ sent: 0, checked: 0 });

  const userIds = profiles.map((p: any) => p.id);

  // Personalization sources, all fetched up front (not per-user).
  const [savedRes, cookedRes, topRes] = await Promise.all([
    sb.from('saved_recipes')
      .select('user_id, recipe_id, saved_at, recipes(id, title, cuisine)')
      .in('user_id', userIds),
    sb.from('recipe_interactions')
      .select('user_id, recipe_id')
      .in('user_id', userIds)
      .eq('interaction_type', 'cooked'),
    sb.from('recipes')
      .select('id, title, cuisine, save_count')
      .is('deleted_at', null)
      .order('save_count', { ascending: false })
      .limit(60),
  ]);

  const cookedKey = new Set<string>();
  for (const r of cookedRes.data ?? []) cookedKey.add(`${(r as any).user_id}:${(r as any).recipe_id}`);

  const savedByUser = new Map<string, SavedCandidate[]>();
  for (const row of (savedRes.data ?? []) as any[]) {
    const recipe = row.recipes;
    if (!recipe) continue;
    const list = savedByUser.get(row.user_id) ?? [];
    list.push({
      recipe_id: recipe.id,
      title: recipe.title,
      cuisine: recipe.cuisine ?? null,
      saved_at: row.saved_at,
      cooked: cookedKey.has(`${row.user_id}:${recipe.id}`),
    });
    savedByUser.set(row.user_id, list);
  }

  const topRecipes = (topRes.data ?? []) as { id: string; title: string; cuisine: string | null }[];
  function cuisineFallback(prefs: string[] | null): RecipePick[] {
    if (!prefs?.length) return [];
    const wanted = prefs.map((c) => c.toLowerCase());
    return topRecipes
      .filter((r) => r.cuisine && wanted.some((w) => r.cuisine!.toLowerCase().includes(w)))
      .slice(0, 5)
      .map((r) => ({ recipe_id: r.id, title: r.title, cuisine: r.cuisine }));
  }

  let sent = 0;
  let checked = 0;

  for (const p of profiles as any[]) {
    checked++;
    if (!p.push_token || !p.last_active_at) continue;

    const daysInactive = daysBetween(p.last_active_at, now);
    const daysSinceReminder = p.last_winback_reminder_at ? daysBetween(p.last_winback_reminder_at, now) : null;
    const stage = nextWinbackStage(p.winback_stage ?? 0, daysInactive, daysSinceReminder);
    if (!stage) continue;

    const pick = pickWinbackRecipe(savedByUser.get(p.id) ?? [], cuisineFallback(p.cuisine_preferences));

    let title: string;
    let body: string;
    const data: Record<string, unknown> = { type: 'winback', stage };
    if (pick) {
      data.url = `mori://r/${pick.recipe_id}`;
      if (stage === 1) {
        title = `🍳 ${pick.title} is still waiting`;
        body = 'You saved it but never cooked it — tap to start.';
      } else {
        title = pick.cuisine ? `A ${pick.cuisine} dish picked for you` : 'Something new to cook';
        body = `${pick.title} — tap to take a look.`;
      }
    } else {
      title = stage === 1 ? "Haven't cooked in a while?" : 'Your next dinner is one tap away';
      body = 'Come find something to make tonight.';
      data.url = 'mori://';
    }

    await sendExpoPush({ to: p.push_token, title, body, data });
    await sb
      .from('profiles')
      .update({ last_winback_reminder_at: new Date().toISOString(), winback_stage: stage })
      .eq('id', p.id);

    sent++;
    await new Promise((r) => setTimeout(r, 50));
  }

  return res.status(200).json({ sent, checked });
}
