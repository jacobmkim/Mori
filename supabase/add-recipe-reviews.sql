-- Recipe Reviews
-- Used by RecipeDetailModal "Reviews" tab + ReviewComposer.
-- Anyone can read reviews; only the author can write/edit/delete their own.
-- Reviews require the user to have actually cooked the recipe (a recipe_interactions
-- row with interaction_type = 'cooked'); enforced in the INSERT policy below.

CREATE TABLE IF NOT EXISTS recipe_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rating      integer CHECK (rating BETWEEN 1 AND 5) NOT NULL,
  review_text text,
  photo_url   text,                          -- optional user "cook photo"; see add-cook-photos-202605.sql
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now(),
  UNIQUE (recipe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_reviews_recipe_id ON recipe_reviews(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_reviews_user_id   ON recipe_reviews(user_id);

ALTER TABLE recipe_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reviews"       ON recipe_reviews;
DROP POLICY IF EXISTS "Users can insert own reviews"  ON recipe_reviews;
DROP POLICY IF EXISTS "Users can update own reviews"  ON recipe_reviews;
DROP POLICY IF EXISTS "Users can delete own reviews"  ON recipe_reviews;

-- Public read (reviews are surfaced on every recipe detail page)
CREATE POLICY "Anyone can view reviews" ON recipe_reviews
  FOR SELECT USING (true);

-- Only the authenticated user can write a review under their own user_id,
-- and only if they have a 'cooked' interaction logged for that recipe.
CREATE POLICY "Users can insert own reviews" ON recipe_reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM recipe_interactions ri
      WHERE ri.user_id = auth.uid()
        AND ri.recipe_id = recipe_reviews.recipe_id
        AND ri.interaction_type = 'cooked'
    )
  );

-- Only the author can edit / delete their own review.
CREATE POLICY "Users can update own reviews" ON recipe_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews" ON recipe_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- ─── Rating aggregation (avg_rating / rating_count on recipes) ────────────────
-- Captured in the repo as of 2026-06-09 — previously this function + trigger
-- existed ONLY in prod (created via Studio), and the function was NOT
-- SECURITY DEFINER, so its inner `UPDATE recipes ...` ran as the reviewing user
-- and was filtered by the recipes RLS policy (auth.uid() = submitted_by) — i.e.
-- it updated 0 rows for any recipe the reviewer didn't submit. Result: every
-- recipe sat at rating_count = 0 and the `rating_count >= 3` star gate could
-- never pass. SECURITY DEFINER makes the aggregate write bypass RLS.

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS avg_rating   numeric(3,2) NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS rating_count integer      NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION recompute_recipe_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rid UUID;
BEGIN
  rid := COALESCE(NEW.recipe_id, OLD.recipe_id);
  UPDATE recipes SET
    avg_rating   = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM recipe_reviews WHERE recipe_id = rid), 0),
    rating_count = (SELECT COUNT(*) FROM recipe_reviews WHERE recipe_id = rid)
  WHERE id = rid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_review_change ON recipe_reviews;
CREATE TRIGGER after_review_change
  AFTER INSERT OR UPDATE OR DELETE ON recipe_reviews
  FOR EACH ROW EXECUTE FUNCTION recompute_recipe_rating();

-- SECURITY DEFINER trigger fns fire in the table-owner context regardless of
-- EXECUTE grants — revoke the default PUBLIC grant so the function can't be
-- invoked directly (matches the add-storage-trigger-hardening-202606 policy).
REVOKE EXECUTE ON FUNCTION recompute_recipe_rating() FROM PUBLIC, anon, authenticated;

-- One-time backfill (idempotent — recomputes from current reviews).
UPDATE recipes r SET
  avg_rating   = COALESCE(sub.avg_r, 0),
  rating_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT recipe_id, ROUND(AVG(rating)::numeric, 2) AS avg_r, COUNT(*) AS cnt
  FROM recipe_reviews
  GROUP BY recipe_id
) sub
WHERE r.id = sub.recipe_id;
