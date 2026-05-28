/**
 * Vercel Cron: /api/cron/leftover-reminders
 * Runs daily at 16:00 UTC (~12 PM EST / 9 AM PST) — gives users time to
 * decide tonight's dinner before they leave work.
 *
 * Sends one bundled push per user listing the ingredients in their fridge
 * that expire within the next 48 hours. Multiple expiring items collapse
 * into a single "Use these before they expire" notification so we never
 * fire more than once per user per day.
 *
 * Trigger manually: GET /api/cron/leftover-reminders
 * with Authorization: Bearer <CRON_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_pushUtils';
import { verifyCronAuth } from './_auth';

// Window of "expiring soon". 48h is wide enough to catch fresh proteins
// (chicken, fish) bought 2-3 days ago, narrow enough to feel timely.
const EXPIRY_WINDOW_HOURS = 48;
// Don't push the same user more than once per ~22h. Slightly under 24 so a
// daily cron run isn't off-by-one if the previous send was a few minutes late.
const REMINDER_COOLDOWN_HOURS = 22;

interface LeftoverRow {
  user_id: string;
  ingredient_name: string;
  spoils_at: string;
}

interface UserRow {
  id: string;
  push_token: string | null;
  notify_leftovers: boolean | null;
  last_leftover_reminder_at: string | null;
}

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

// Build a short, human "Chicken, spinach, and yogurt" string from a list of
// ingredients. Sentence-case (first item capitalized, rest lowercase) keeps
// the push body looking like prose, not a label. Caps at 3 items + a "+N
// more" suffix so it stays under iOS's ~140-char limit.
export function joinIngredients(names: string[]): string {
  if (names.length === 0) return '';
  const [first, ...rest] = names.map((n) => n.toLowerCase());
  const head = capitalize(first);
  if (rest.length === 0) return head;
  if (rest.length === 1) return `${head} and ${rest[0]}`;
  if (rest.length === 2) return `${head}, ${rest[0]}, and ${rest[1]}`;
  return `${head}, ${rest[0]}, and ${rest.length - 1} more`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const sb = getSupabase();

  const now = Date.now();
  const horizon = new Date(now + EXPIRY_WINDOW_HOURS * 3600_000).toISOString();
  const nowIso = new Date(now).toISOString();
  const cooldownCutoff = new Date(now - REMINDER_COOLDOWN_HOURS * 3600_000).toISOString();

  // All non-dismissed leftovers expiring within the next 48h.
  const { data: leftovers, error: leftErr } = await sb
    .from('user_leftovers')
    .select('user_id, ingredient_name, spoils_at')
    .is('dismissed_at', null)
    .gt('spoils_at', nowIso)
    .lt('spoils_at', horizon);

  if (leftErr) return res.status(500).json({ error: 'Failed to fetch leftovers' });
  if (!leftovers?.length) return res.status(200).json({ sent: 0, checked: 0 });

  // Group by user. Each user gets at most one bundled push.
  const byUser = new Map<string, LeftoverRow[]>();
  for (const row of leftovers as LeftoverRow[]) {
    const bucket = byUser.get(row.user_id) ?? [];
    bucket.push(row);
    byUser.set(row.user_id, bucket);
  }

  const userIds = Array.from(byUser.keys());

  // Fetch profile prefs + push tokens in one query. Filter out users who:
  //  - have no push token
  //  - have opted out
  //  - were already pinged in the last ~22h (idempotency on re-runs)
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, push_token, notify_leftovers, last_leftover_reminder_at')
    .in('id', userIds)
    .eq('notify_leftovers', true)
    .not('push_token', 'is', null);

  if (profErr) return res.status(500).json({ error: 'Failed to fetch profiles' });
  if (!profiles?.length) return res.status(200).json({ sent: 0, checked: userIds.length });

  let sent = 0;
  let checked = 0;

  for (const profile of profiles as UserRow[]) {
    checked++;
    if (!profile.push_token) continue;
    if (profile.last_leftover_reminder_at && profile.last_leftover_reminder_at > cooldownCutoff) continue;

    const items = byUser.get(profile.id) ?? [];
    if (items.length === 0) continue;

    // Sort by spoils_at so the most-urgent item is named first.
    items.sort((a, b) => a.spoils_at.localeCompare(b.spoils_at));
    const names = items.map((i) => i.ingredient_name);
    const joined = joinIngredients(names);

    const title = items.length === 1 ? '🥬 Expiring tomorrow' : '🥬 Expiring soon';
    const body = items.length === 1
      ? `${joined} expires soon. Tap for recipes that use it.`
      : `${joined} expire soon. Tap for recipes that use them.`;

    await sendExpoPush({
      to: profile.push_token,
      title,
      body,
      data: { type: 'leftover_reminder', ingredients: names },
    });
    await sb
      .from('profiles')
      .update({ last_leftover_reminder_at: new Date().toISOString() })
      .eq('id', profile.id);

    sent++;
    // Pace sends to avoid Expo rate limits on large user counts.
    await new Promise((r) => setTimeout(r, 50));
  }

  return res.status(200).json({ sent, checked });
}
