-- Sunday Drop — opt-in preference + column-write protection.
-- Companion to add-mori-plus.sql (which created the sunday_drops table + RLS) and
-- add-profiles-timezone-202606.sql (profiles.timezone). Idempotent.
-- APPLY TO PROD (Supabase Studio SQL editor) BEFORE shipping api/cron/sunday-drop.ts,
-- then fold both changes into schema.sql.

-- ─── 1. Opt-in flag ───────────────────────────────────────────────────────────
-- Default TRUE: the cron's is_premium gate is what actually limits sends, so a
-- non-premium user being "on" is harmless. Separate from notify_meal_plan (the daily
-- cook reminder) so a user can keep nightly reminders off but the weekly drop on.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_sunday_drop BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── 2. Column-write protection on sunday_drops ───────────────────────────────
-- The "sunday_drops owner update" RLS policy (add-mori-plus.sql) lets the owner UPDATE
-- the row, but RLS can't gate individual columns — a client could overwrite the
-- cron-written recipe_ids / generated_at / notified_at. Only opened_at is a legitimate
-- client write (mark-as-opened). Mirror the protect_premium_columns trigger pattern:
-- service_role (cron) + postgres/supabase_admin (Studio) write freely; client roles may
-- only change opened_at.
CREATE OR REPLACE FUNCTION protect_sunday_drop_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- service_role (cron) + postgres/supabase_admin (Studio) write freely.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Client roles: only opened_at may change. Any change to a cron-owned column is a forge attempt.
  IF NEW.recipe_ids   IS DISTINCT FROM OLD.recipe_ids
  OR NEW.week_start   IS DISTINCT FROM OLD.week_start
  OR NEW.user_id      IS DISTINCT FROM OLD.user_id
  OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
  OR NEW.notified_at  IS DISTINCT FROM OLD.notified_at THEN
    RAISE EXCEPTION 'sunday_drops: only opened_at is user-writable (recipe_ids/notified_at/etc. are cron-only)';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_sunday_drop_columns ON sunday_drops;
CREATE TRIGGER trg_protect_sunday_drop_columns
  BEFORE UPDATE ON sunday_drops
  FOR EACH ROW EXECUTE FUNCTION protect_sunday_drop_columns();

-- Trigger fns fire in table-owner context regardless of EXECUTE grants; revoke the
-- default PUBLIC grant anyway (prod-hardening convention).
REVOKE EXECUTE ON FUNCTION protect_sunday_drop_columns() FROM PUBLIC, anon, authenticated;
