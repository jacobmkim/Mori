-- Win-back / dormancy re-engagement support.
--
-- Adds a `last_active_at` signal (written by the app on foreground) plus the
-- opt-out flag + idempotency columns for the daily winback-reminders cron.
-- `winback_stage`: 0 = none sent, 1 = day-7 nudge sent, 2 = day-14 nudge sent
-- (then silent until the user returns and the app resets the stage to 0).
--
-- Run once via Supabase Studio or `apply_migration`. Additive + idempotent.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notify_winback BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_winback_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winback_stage SMALLINT NOT NULL DEFAULT 0;

-- Backfill last_active_at from the most recent known activity so dormancy
-- detection works immediately. NULLIF leaves brand-new users (no activity)
-- with NULL, which the cron treats as "not eligible" rather than "dormant".
UPDATE profiles p
SET last_active_at = NULLIF(
  GREATEST(
    COALESCE(p.last_cooked_date::timestamptz, 'epoch'::timestamptz),
    COALESCE((SELECT max(interacted_at) FROM recipe_interactions WHERE user_id = p.id), 'epoch'::timestamptz),
    COALESCE((SELECT max(swiped_at)      FROM swipe_events       WHERE user_id = p.id), 'epoch'::timestamptz),
    COALESCE((SELECT max(saved_at)       FROM saved_recipes      WHERE user_id = p.id), 'epoch'::timestamptz)
  ),
  'epoch'::timestamptz
)
WHERE last_active_at IS NULL;
