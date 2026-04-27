/**
 * Vercel Cron: /api/cron/streak-reminders
 * Runs daily at 19:00 UTC (7 PM UTC).
 *
 * Sends a push reminder to users who have an active streak but haven't
 * cooked today. Gives them a nudge before midnight.
 *
 * Trigger manually: GET /api/cron/streak-reminders
 * with Authorization: Bearer <SEED_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_pushUtils';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

function verifyCronAuth(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const seedSecret = process.env.SEED_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (seedSecret && auth === `Bearer ${seedSecret}`) return true;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const sb = getSupabase();
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD UTC

  // Users with an active streak who haven't cooked today yet
  const { data: users, error } = await sb
    .from('profiles')
    .select('id, push_token, current_streak')
    .gt('current_streak', 0)
    .not('push_token', 'is', null)
    .lt('last_cooked_date', today);

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
