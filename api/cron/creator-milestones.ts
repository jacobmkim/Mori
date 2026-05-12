/**
 * Vercel Cron: /api/cron/creator-milestones
 * Runs daily at 18:00 UTC.
 *
 * Pushes a celebratory notification to recipe submitters when their total
 * saves-earned or cooks-earned crosses a badge threshold (1 / 10 / 50 / 100).
 * Mirrors the badge tiers in components/badges/badgeData.ts. Each tier fires
 * at most once per user — last-notified threshold is persisted on the profile
 * so re-runs are idempotent.
 *
 * Trigger manually: GET /api/cron/creator-milestones
 * with Authorization: Bearer <CRON_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_pushUtils';
import { verifyCronAuth } from './_auth';

// Must mirror the thresholds in components/badges/badgeData.ts
// (saves_earned_* / cooks_earned_*). Updating the ladder there means
// updating it here too — kept in sync manually rather than imported so
// the Vercel function doesn't pull in the RN module graph.
const SAVES_TIERS = [1, 10, 50, 100] as const;
const COOKS_TIERS = [1, 10, 50, 100] as const;

function nextTierCrossed(current: number, lastNotified: number, tiers: readonly number[]): number | null {
  // Highest tier where current >= tier AND tier > lastNotified.
  let crossed: number | null = null;
  for (const t of tiers) {
    if (current >= t && t > lastNotified) crossed = t;
  }
  return crossed;
}

function savesMessage(tier: number): { title: string; body: string } {
  if (tier === 1)   return { title: '🎉 First Fan!',     body: 'Someone saved your recipe — congrats on your first save.' };
  if (tier === 10)  return { title: '❤️ 10 saves',      body: "You're being saved — 10 people have added your recipes." };
  if (tier === 50)  return { title: '🔥 Crowd Favorite', body: 'Your recipes have been saved 50 times!' };
  return                  { title: '🏆 Hall of Fame',    body: 'Your recipes have been saved 100 times. Legendary.' };
}

function cooksMessage(tier: number): { title: string; body: string } {
  if (tier === 1)   return { title: '🍳 Someone cooked it!', body: "Someone made one of your recipes — that's the dream." };
  if (tier === 10)  return { title: '👨‍🍳 Fed 10 cooks',     body: 'Your recipes have been cooked 10 times!' };
  if (tier === 50)  return { title: '📖 Cookbook Author',    body: '50 cooks of your recipes. You\'re feeding the community.' };
  return                  { title: '🌲 Mori Legend',         body: '100 people have cooked your recipes. Legendary.' };
}

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

  // Eligible users: at least one submitted recipe + push token + opted in.
  // notify_creator_events defaults to true on signup so most submitters qualify.
  const { data: users, error: usersErr } = await sb
    .from('profiles')
    .select('id, push_token, notify_creator_events, last_saves_earned_milestone_notified, last_cooks_earned_milestone_notified, recipes_submitted_count')
    .gt('recipes_submitted_count', 0)
    .not('push_token', 'is', null)
    .eq('notify_creator_events', true);

  if (usersErr) return res.status(500).json({ error: 'Failed to fetch users' });
  if (!users?.length) return res.status(200).json({ sent: 0, checked: 0 });

  let sent = 0;
  let checked = 0;

  for (const user of users) {
    checked++;
    if (!user.push_token) continue;

    // Sum save_count + cook_count across the user's submitted recipes. Auto-
    // maintained by triggers in supabase/add-recipe-counters.sql.
    const { data: rows, error: rowsErr } = await sb
      .from('recipes')
      .select('save_count, cook_count')
      .eq('submitted_by', user.id);

    if (rowsErr || !rows) continue;

    const totalSavesEarned = rows.reduce((sum, r) => sum + (r.save_count ?? 0), 0);
    const totalCooksEarned = rows.reduce((sum, r) => sum + (r.cook_count ?? 0), 0);

    const savesLast = user.last_saves_earned_milestone_notified ?? 0;
    const cooksLast = user.last_cooks_earned_milestone_notified ?? 0;

    const savesCrossed = nextTierCrossed(totalSavesEarned, savesLast, SAVES_TIERS);
    const cooksCrossed = nextTierCrossed(totalCooksEarned, cooksLast, COOKS_TIERS);

    if (savesCrossed) {
      const msg = savesMessage(savesCrossed);
      await sendExpoPush({
        to: user.push_token,
        title: msg.title,
        body: msg.body,
        data: { type: 'creator_milestone', metric: 'saves', tier: savesCrossed },
      });
      await sb.from('profiles').update({ last_saves_earned_milestone_notified: savesCrossed }).eq('id', user.id);
      sent++;
      // Pace sends to avoid Expo rate limits.
      await new Promise((r) => setTimeout(r, 50));
    }

    if (cooksCrossed) {
      const msg = cooksMessage(cooksCrossed);
      await sendExpoPush({
        to: user.push_token,
        title: msg.title,
        body: msg.body,
        data: { type: 'creator_milestone', metric: 'cooks', tier: cooksCrossed },
      });
      await sb.from('profiles').update({ last_cooks_earned_milestone_notified: cooksCrossed }).eq('id', user.id);
      sent++;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return res.status(200).json({ sent, checked });
}
