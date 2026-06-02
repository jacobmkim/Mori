-- Auto-maintained save_count + cook_count on every recipe row.
--
-- Before this migration:
--   * recipes.save_count existed but was never incremented (always 0 — the
--     Fan Fave badge that reads it has been a no-op).
--   * Cook tallies were only queryable via aggregating recipe_interactions.
--
-- After this migration:
--   * recipes.cook_count added (integer, NOT NULL, default 0).
--   * Both counters are auto-maintained by Postgres triggers:
--       saved_recipes INSERT → recipes.save_count += 1
--       saved_recipes DELETE → recipes.save_count  = GREATEST(0, save_count - 1)
--       recipe_interactions INSERT (type='cooked') → recipes.cook_count += 1
--   * One-time backfill seeds both counters from existing rows.
--
-- Per product call 2026-05-11 the cook counter is a raw event count (every
-- cook including same-day repeats), matching profiles.meals_cooked_count
-- semantics, NOT distinct cookers. If we ever want distinct-cooker proof we
-- can add a separate column later.
--
-- Run via `supabase db push` or paste into Supabase Studio. Idempotent — safe
-- to re-run (uses IF NOT EXISTS / OR REPLACE / DROP TRIGGER IF EXISTS).

-- ── 1. Schema ────────────────────────────────────────────────────────────────

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS cook_count integer NOT NULL DEFAULT 0;

-- ── 2. Trigger functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recipes_bump_save_count_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recipes
  SET save_count = COALESCE(save_count, 0) + 1
  WHERE id = NEW.recipe_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION recipes_drop_save_count_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- GREATEST guards against drift / double-deletes; never let the counter
  -- visibly go negative.
  UPDATE recipes
  SET save_count = GREATEST(0, COALESCE(save_count, 0) - 1)
  WHERE id = OLD.recipe_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION recipes_bump_cook_count_on_interaction()
RETURNS TRIGGER AS $$
BEGIN
  -- We only react to 'cooked' rows. Views and grocery_adds skip.
  IF NEW.interaction_type = 'cooked' THEN
    UPDATE recipes
    SET cook_count = COALESCE(cook_count, 0) + 1
    WHERE id = NEW.recipe_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Triggers ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS saved_recipes_bump_save_count ON saved_recipes;
CREATE TRIGGER saved_recipes_bump_save_count
  AFTER INSERT ON saved_recipes
  FOR EACH ROW
  EXECUTE FUNCTION recipes_bump_save_count_on_insert();

DROP TRIGGER IF EXISTS saved_recipes_drop_save_count ON saved_recipes;
CREATE TRIGGER saved_recipes_drop_save_count
  AFTER DELETE ON saved_recipes
  FOR EACH ROW
  EXECUTE FUNCTION recipes_drop_save_count_on_delete();

DROP TRIGGER IF EXISTS recipe_interactions_bump_cook_count ON recipe_interactions;
CREATE TRIGGER recipe_interactions_bump_cook_count
  AFTER INSERT ON recipe_interactions
  FOR EACH ROW
  EXECUTE FUNCTION recipes_bump_cook_count_on_interaction();

-- SECURITY DEFINER trigger fns fire in the table-owner context regardless of
-- EXECUTE grants, so clients never need to call them directly. Revoke the
-- default PUBLIC grant. (Folded from add-storage-trigger-hardening-202606.sql.)
REVOKE EXECUTE ON FUNCTION recipes_bump_save_count_on_insert()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION recipes_drop_save_count_on_delete()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION recipes_bump_cook_count_on_interaction() FROM PUBLIC, anon, authenticated;

-- ── 4. One-time backfill ─────────────────────────────────────────────────────
-- Seeds existing rows so the counters are accurate from day one. Subsequent
-- writes flow through the triggers above.

UPDATE recipes r
SET save_count = COALESCE(s.cnt, 0)
FROM (
  SELECT recipe_id, COUNT(*)::integer AS cnt
  FROM saved_recipes
  GROUP BY recipe_id
) s
WHERE s.recipe_id = r.id;

UPDATE recipes r
SET cook_count = COALESCE(i.cnt, 0)
FROM (
  SELECT recipe_id, COUNT(*)::integer AS cnt
  FROM recipe_interactions
  WHERE interaction_type = 'cooked'
  GROUP BY recipe_id
) i
WHERE i.recipe_id = r.id;

-- Sanity check (run manually after applying):
--   SELECT id, title, save_count, cook_count FROM recipes
--   ORDER BY (save_count + cook_count) DESC LIMIT 20;
