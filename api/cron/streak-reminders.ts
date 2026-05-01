/**
 * Vercel Cron: /api/cron/streak-reminders
 * Runs daily at 19:00 UTC (7 PM UTC).
 *
 * Sends a push reminder to users who have an active streak but haven't
 * cooked today. Gives them a nudge before midnight.
 *
 * Trigger manually: GET /api/cron/streak-reminders
 * with Authorization: Bearer <CRON_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_pushUtils';
import { verifyCronAuth } from './_auth';

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
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');

  // Only users whose streak is still salvageable today — last cook = yesterday.
  // A `last_cooked_date` older than yesterday means the streak has already broken
  // (current_streak in the DB is stale until the next cook resets it), so a
  // "streak at risk" push would be a lie.
  const { data: users, error } = await sb
    .from('profiles')
    .select('id, push_token, current_streak')
    .gt('current_streak', 0)
    .not('push_token', 'is', null)
    .eq('last_cooked_date', yesterday);

  if (error) return res.status(500).json({ error: 'Failed to fetch users' });
  if (!users?.length) return res.status(200).json({ sent: 0 });

  let sent = 0;
  for (const user of users) {
    if (!user.push_token) continue;
    await sendExpoPush({
      to: user.push_token,
      title: `🔥 ${user.current_streak}-day streak at risk`,
      body: 'Cook something tonight to keep your streak alive.',
      data: { type: 'streak_reminder' },
    });
    sent++;
    // pace sends to avoid Expo rate limits
    await new Promise((r) => setTimeout(r, 50));
  }

  return res.status(200).json({ sent });
}
