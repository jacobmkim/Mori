-- Recipe Flags
-- Used by `flagRecipe()` in lib/api.ts — stores recipes flagged for Claude/manual review.
-- A user can flag any recipe and read/clear their own flags. They cannot read
-- or delete flags submitted by other users.

CREATE TABLE IF NOT EXISTS recipe_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id     uuid REFERENCES recipes(id) ON DELETE CASCADE,
  external_id   text,
  recipe_title  text NOT NULL,
  reason        text NOT NULL,
  flagged_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  flagged_at    timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_flags_flagged_by ON recipe_flags(flagged_by);
CREATE INDEX IF NOT EXISTS idx_recipe_flags_recipe_id  ON recipe_flags(recipe_id);

ALTER TABLE recipe_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own flags" ON recipe_flags;
DROP POLICY IF EXISTS "Users can view own flags"   ON recipe_flags;
DROP POLICY IF EXISTS "Users can delete own flags" ON recipe_flags;

-- Insert: only under the caller's own user_id.
CREATE POLICY "Users can insert own flags" ON recipe_flags
  FOR INSERT
  WITH CHECK (auth.uid() = flagged_by);

-- Read: only the user who flagged sees their own list.
-- (Admins read via the service-role key, which bypasses RLS.)
CREATE POLICY "Users can view own flags" ON recipe_flags
  FOR SELECT USING (auth.uid() = flagged_by);

-- Delete: only owner. clearFlaggedRecipes() in lib/api.ts uses the anon client,
-- so this policy scopes the delete to the caller's rows only — preventing the
-- previous risk where `.delete().not('id', 'is', null)` would wipe the global table.
CREATE POLICY "Users can delete own flags" ON recipe_flags
  FOR DELETE USING (auth.uid() = flagged_by);
