-- Sunday Drop — proposal model (review-then-accept).
-- The cron no longer auto-writes the week into meal_plans; it stores a PROPOSAL here and the user
-- reviews + accepts it in the Plan tab (which then writes meal_plans). Companion to
-- add-sunday-drop-prefs-202606.sql. Idempotent. APPLY TO PROD, then fold into schema.sql.

ALTER TABLE sunday_drops
  ADD COLUMN IF NOT EXISTS proposed_plan JSONB,        -- the proposed week (lean: recipe ids + alternates + meta)
  ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ,   -- user accepted → meal_plans written (client-writable)
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;   -- user declined this week's drop (client-writable)

-- Extend the column-write guard: proposed_plan is cron-only (like recipe_ids); accepted_at +
-- dismissed_at + opened_at remain the only client-writable columns.
CREATE OR REPLACE FUNCTION protect_sunday_drop_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- service_role (cron) + postgres/supabase_admin (Studio) write freely.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  -- Client roles: only opened_at / accepted_at / dismissed_at may change. Any change to a
  -- cron-owned column is a forge attempt.
  IF NEW.recipe_ids    IS DISTINCT FROM OLD.recipe_ids
  OR NEW.week_start    IS DISTINCT FROM OLD.week_start
  OR NEW.user_id       IS DISTINCT FROM OLD.user_id
  OR NEW.generated_at  IS DISTINCT FROM OLD.generated_at
  OR NEW.notified_at   IS DISTINCT FROM OLD.notified_at
  OR NEW.proposed_plan IS DISTINCT FROM OLD.proposed_plan THEN
    RAISE EXCEPTION 'sunday_drops: only opened_at/accepted_at/dismissed_at are user-writable (the plan is cron-only)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_sunday_drop_columns ON sunday_drops;
CREATE TRIGGER trg_protect_sunday_drop_columns
  BEFORE UPDATE ON sunday_drops
  FOR EACH ROW EXECUTE FUNCTION protect_sunday_drop_columns();

REVOKE EXECUTE ON FUNCTION protect_sunday_drop_columns() FROM PUBLIC, anon, authenticated;
