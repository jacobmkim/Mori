/**
 * clean-phantom-cooks.mjs
 *
 * One-shot cleanup for the 108 phantom 'cooked' interactions on user account
 * 7a3b9113-e442-45e0-a02d-4f35b107ead1 (jkim2002's dev account), all
 * timestamped 2026-04-27T20:00:17.760259+00:00. Source unknown — likely a
 * one-off manual bulk insert via Supabase Studio during early dev. Symptom:
 * the Explore tab's "Cooked Again" section showed recipes the user never
 * cooked.
 *
 * Scoped tightly: deletes ONLY rows matching the exact bulk-insert timestamp,
 * so any genuine cooks the user logs by tapping "Mark as Cooked" survive.
 * Idempotent — safe to re-run; the second pass is a no-op.
 *
 * Usage:
 *   node scripts/clean-phantom-cooks.mjs --dry-run    # preview, no writes
 *   node scripts/clean-phantom-cooks.mjs              # delete + reset counters
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Args ──────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');

// ── Constants ─────────────────────────────────────────────────────────────────
const USER_ID = '7a3b9113-e442-45e0-a02d-4f35b107ead1';
const PHANTOM_TS = '2026-04-27T20:00:17.760259+00:00';

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`User: ${USER_ID}`);
  console.log(`Target timestamp: ${PHANTOM_TS}`);
  console.log('');

  // 1. Read pre-state.
  const { count: phantomCount } = await sb
    .from('recipe_interactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('interaction_type', 'cooked')
    .eq('interacted_at', PHANTOM_TS);

  const { count: totalCookedBefore } = await sb
    .from('recipe_interactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('interaction_type', 'cooked');

  const { data: profileBefore } = await sb
    .from('profiles')
    .select('meals_cooked_count, last_cooked_date, current_streak, longest_streak, last_cooks_earned_milestone_notified')
    .eq('id', USER_ID)
    .single();

  console.log('Before:');
  console.log(`  phantom rows matching timestamp: ${phantomCount}`);
  console.log(`  total 'cooked' rows for this user: ${totalCookedBefore}`);
  console.log(`  profile.meals_cooked_count: ${profileBefore?.meals_cooked_count}`);
  console.log(`  profile.current_streak: ${profileBefore?.current_streak}`);
  console.log(`  profile.longest_streak: ${profileBefore?.longest_streak}`);
  console.log(`  profile.last_cooked_date: ${profileBefore?.last_cooked_date}`);
  console.log(`  profile.last_cooks_earned_milestone_notified: ${profileBefore?.last_cooks_earned_milestone_notified}`);
  console.log('');

  if (DRY_RUN) {
    console.log(`Would delete ${phantomCount} phantom 'cooked' rows.`);
    console.log(`Would leave ${totalCookedBefore - phantomCount} real 'cooked' rows untouched.`);
    console.log(`Would reset profile counters (meals_cooked, streaks, milestone notif) to reflect the survivors.`);
    return;
  }

  // 2. Delete the phantom rows.
  const { error: delErr } = await sb
    .from('recipe_interactions')
    .delete()
    .eq('user_id', USER_ID)
    .eq('interaction_type', 'cooked')
    .eq('interacted_at', PHANTOM_TS);
  if (delErr) { console.error('Delete failed:', delErr.message); process.exit(1); }

  // 3. Recompute meals_cooked_count from what survived (in case there are real cooks).
  const { count: survivors } = await sb
    .from('recipe_interactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('interaction_type', 'cooked');

  // 4. Reset profile counters. last_cooked_date null because we don't know
  //    the most recent real cook (if any). Streaks reset — the user starts
  //    fresh once they cook again.
  const { error: updErr } = await sb
    .from('profiles')
    .update({
      meals_cooked_count: survivors ?? 0,
      last_cooked_date: null,
      current_streak: 0,
      longest_streak: 0,
      last_cooks_earned_milestone_notified: 0,
    })
    .eq('id', USER_ID);
  if (updErr) { console.error('Profile update failed:', updErr.message); process.exit(1); }

  // 5. Read back to verify.
  const { data: profileAfter } = await sb
    .from('profiles')
    .select('meals_cooked_count, last_cooked_date, current_streak, longest_streak, last_cooks_earned_milestone_notified')
    .eq('id', USER_ID)
    .single();

  console.log('After:');
  console.log(`  total 'cooked' rows for this user: ${survivors}`);
  console.log(`  profile.meals_cooked_count: ${profileAfter?.meals_cooked_count}`);
  console.log(`  profile.current_streak: ${profileAfter?.current_streak}`);
  console.log(`  profile.longest_streak: ${profileAfter?.longest_streak}`);
  console.log(`  profile.last_cooked_date: ${profileAfter?.last_cooked_date}`);
  console.log(`  profile.last_cooks_earned_milestone_notified: ${profileAfter?.last_cooks_earned_milestone_notified}`);
  console.log('');
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
