/**
 * Vercel Cron: /api/cron/cook-reminders
 * Runs daily at 22:00 UTC (= 5 PM EST / 2 PM PST). The US-only / CA-only v1
 * accepts this fixed-UTC skew so we don't need a per-user timezone column;
 * follow-up will be a `profiles.timezone` migration + per-user dispatch.
 *
 * For each user whose *current-week* meal plan has a slot on today's
 * day-of-week, sends a push naming tonight's planned recipe — but only if they
 * haven't already cooked it today.
 *
 * NB: we MUST scope to the current week. Matching on day-of-week alone against a
 * user's most-recent plan re-fires a stale plan from a past week every time that
 * weekday comes around (the bug behind the "I keep getting reminders for last
 * week's meals" report). week_start_date is a Monday-anchored YYYY-MM-DD.
 *
 * Trigger manually: GET /api/cron/cook-reminders
 * with Authorization: Bearer <CRON_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendExpoPush } from '../_pushUtils';
import { verifyCronAuth } from './_auth';

const REMINDER_COOLDOWN_HOURS = 22;

interface Slot {
  day: number;          // 0 = Monday in our weekly model (see lib/utils.ts getWeekStart)
  meal_type: string;    // 'breakfast' | 'lunch' | 'dinner'
  recipe_id: string;
  servings_multiplier?: number;
}

interface PlanRow {
  user_id: string;
  slots: Slot[] | null;
}

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

// Map JS Date.getUTCDay (Sun=0..Sat=6) to our Monday-anchored day index used in
// MealSlot.day (Mon=0..Sun=6). getWeekStart in lib/utils.ts walks back to
// Monday and slots are emitted 0..6 relative to that Monday.
export function utcDayToSlotDay(utcDay: number): number {
  // 0 (Sun) -> 6, 1 (Mon) -> 0, ..., 6 (Sat) -> 5
  return (utcDay + 6) % 7;
}

// The Monday that starts the week containing `now`, as a YYYY-MM-DD string in
// UTC. Derived from the same UTC `now` as `today` (utcDayToSlotDay) so the
// week-start filter and the day-of-week slot match never drift relative to each
// other. The cron fires at 22:00 UTC, where every US/CA timezone shares the
// same calendar date as UTC, so this aligns with the client's locally-computed
// getWeekStart() for the supported markets.
export function getUtcWeekStart(now: Date): string {
  const slotDay = utcDayToSlotDay(now.getUTCDay()); // Mon=0..Sun=6
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - slotDay);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const d = String(monday.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "Pick tonight's slot" — prefer dinner, then lunch, then breakfast. The cron
// fires at the dinner-prep time of day so dinner is the natural primary.
export function pickFeaturedSlot(slots: Slot[], today: number): Slot | null {
  const todaySlots = slots.filter((s) => s.day === today);
  if (todaySlots.length === 0) return null;
  const order = ['dinner', 'lunch', 'breakfast'] as const;
  for (const meal of order) {
    const match = todaySlots.find((s) => s.meal_type === meal);
    if (match) return match;
  }
  return todaySlots[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const sb = getSupabase();

  const now = new Date();
  const today = utcDayToSlotDay(now.getUTCDay());
  const currentWeekStart = getUtcWeekStart(now);
  const cooldownCutoff = new Date(now.getTime() - REMINDER_COOLDOWN_HOURS * 3600_000).toISOString();

  // Only the CURRENT week's plan per user. Filtering on week_start_date is what
  // stops a stale plan from a past week re-firing every time its weekday comes
  // around. We still order desc + dedupe defensively in case a user somehow has
  // more than one row for the same week.
  const { data: plans, error: plansErr } = await sb
    .from('meal_plans')
    .select('user_id, slots, week_start_date')
    .eq('week_start_date', currentWeekStart)
    .order('week_start_date', { ascending: false });

  if (plansErr) return res.status(500).json({ error: 'Failed to fetch plans' });
  if (!plans?.length) return res.status(200).json({ sent: 0, checked: 0 });

  // Dedupe to one (latest) plan per user.
  const latestByUser = new Map<string, PlanRow>();
  for (const p of plans as PlanRow[]) {
    if (!latestByUser.has(p.user_id)) latestByUser.set(p.user_id, p);
  }

  // Build a per-user "what to remind about today" map.
  const featured = new Map<string, Slot>();
  for (const [userId, plan] of latestByUser) {
    const slots = Array.isArray(plan.slots) ? plan.slots : [];
    const slot = pickFeaturedSlot(slots, today);
    if (slot) featured.set(userId, slot);
  }

  if (featured.size === 0) return res.status(200).json({ sent: 0, checked: 0 });

  const userIds = Array.from(featured.keys());
  const recipeIds = Array.from(new Set(Array.from(featured.values()).map((s) => s.recipe_id)));

  const [profilesRes, recipesRes, cookedRes] = await Promise.all([
    sb
      .from('profiles')
      .select('id, push_token, notify_meal_plan, last_meal_plan_reminder_at')
      .in('id', userIds)
      .eq('notify_meal_plan', true)
      .not('push_token', 'is', null),
    sb.from('recipes').select('id, title, cook_time_mins, prep_time_mins').in('id', recipeIds),
    // Anyone who already cooked their featured recipe today — skip those.
    sb
      .from('recipe_interactions')
      .select('user_id, recipe_id, created_at')
      .in('user_id', userIds)
      .in('recipe_id', recipeIds)
      .eq('interaction_type', 'cooked')
      .gte('created_at', new Date(now.getTime() - 12 * 3600_000).toISOString()),
  ]);

  if (profilesRes.error || recipesRes.error) {
    return res.status(500).json({ error: 'Lookup failed' });
  }

  const recipesById = new Map<string, { title: string; cook_time_mins: number | null; prep_time_mins: number | null }>();
  for (const r of recipesRes.data ?? []) recipesById.set(r.id as string, r as any);

  const cookedToday = new Set<string>();
  for (const row of cookedRes.data ?? []) {
    cookedToday.add(`${row.user_id}:${row.recipe_id}`);
  }

  let sent = 0;
  let checked = 0;

  for (const profile of (profilesRes.data ?? []) as any[]) {
    checked++;
    const slot = featured.get(profile.id);
    if (!slot || !profile.push_token) continue;
    if (profile.last_meal_plan_reminder_at && profile.last_meal_plan_reminder_at > cooldownCutoff) continue;
    if (cookedToday.has(`${profile.id}:${slot.recipe_id}`)) continue;

    const recipe = recipesById.get(slot.recipe_id);
    if (!recipe) continue;

    const total = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0);
    const timeSuffix = total > 0 ? ` · ${total} min` : '';
    const mealLabel = slot.meal_type === 'breakfast' ? 'Breakfast' : slot.meal_type === 'lunch' ? 'Lunch' : 'Tonight';

    await sendExpoPush({
      to: profile.push_token,
      title: `🍳 ${mealLabel}: ${recipe.title}`,
      body: `From your meal plan${timeSuffix}. Tap to start cooking.`,
      data: { type: 'cook_reminder', recipe_id: slot.recipe_id, meal_type: slot.meal_type },
    });
    await sb
      .from('profiles')
      .update({ last_meal_plan_reminder_at: new Date().toISOString() })
      .eq('id', profile.id);

    sent++;
    await new Promise((r) => setTimeout(r, 50));
  }

  return res.status(200).json({ sent, checked });
}
