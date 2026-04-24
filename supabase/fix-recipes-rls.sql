-- Fix recipes UPDATE policy: remove submitted_by IS NULL condition
-- which allowed any authenticated user to modify curated recipes (submitted_by = null)

DROP POLICY IF EXISTS "Users can update own recipes" ON recipes;

CREATE POLICY "Users can update own recipes" ON recipes
  FOR UPDATE USING (auth.uid() = submitted_by);
