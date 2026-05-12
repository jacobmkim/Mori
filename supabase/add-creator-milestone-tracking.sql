-- Tracks the last creator-milestone threshold a user was pushed for, so the
-- daily creator-milestones cron doesn't re-notify on every run. Two integer
-- columns mirror the badge tier ladder [1, 10, 50, 100] for saves earned
-- and cooks earned. Both default to 0; the cron only fires when current >=
-- next-tier AND last_notified < that tier.
--
-- Paired with api/cron/creator-milestones.ts. Idempotent; safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_saves_earned_milestone_notified integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_cooks_earned_milestone_notified integer NOT NULL DEFAULT 0;
