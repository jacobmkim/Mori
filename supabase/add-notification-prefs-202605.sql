-- Migration: notification preferences + idempotency timestamps for the two
-- new daily reminder crons (leftover-reminders + cook-reminders).
--
-- Reviews-received pushes intentionally reuse the existing
-- `notify_creator_events` column rather than adding a third creator toggle.
--
-- Run once via Supabase Studio SQL editor or `supabase db push`.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_leftovers BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_meal_plan BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_leftover_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_meal_plan_reminder_at TIMESTAMPTZ;
