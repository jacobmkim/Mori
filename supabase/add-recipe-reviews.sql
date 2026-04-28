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
