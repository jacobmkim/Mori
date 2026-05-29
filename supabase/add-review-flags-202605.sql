-- Review Flags — user reports of a recipe review (covers its cook photo, text,
-- and rating as one unit). Mirrors recipe_flags: a user can flag any review and
-- read/clear their own flags, but cannot see or delete other users' flags.
-- Admins read the full table via the service-role key (bypasses RLS).
--
-- Collect-only moderation: flags are stored for manual review; nothing is
-- auto-hidden. One flag per user per review (spam guard), matching the
-- uq_recipe_flags_user_recipe index in add-security-hardening-202604.sql.

CREATE TABLE IF NOT EXISTS review_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid REFERENCES recipe_reviews(id) ON DELETE CASCADE NOT NULL,
  recipe_id   uuid REFERENCES recipes(id) ON DELETE SET NULL,   -- context for the moderation queue
  reason      text NOT NULL,
  flagged_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  flagged_at  timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_flags_flagged_by ON review_flags(flagged_by);
CREATE INDEX IF NOT EXISTS idx_review_flags_review_id  ON review_flags(review_id);

-- One flag per user per review — prevents a single user flooding the queue.
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_flags_user_review
  ON review_flags(flagged_by, review_id);

ALTER TABLE review_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own review flags" ON review_flags;
DROP POLICY IF EXISTS "Users can view own review flags"   ON review_flags;
DROP POLICY IF EXISTS "Users can delete own review flags" ON review_flags;

-- Insert: only under the caller's own user_id.
CREATE POLICY "Users can insert own review flags" ON review_flags
  FOR INSERT WITH CHECK (auth.uid() = flagged_by);

-- Read: only the user who flagged sees their own rows. (Admins use service role.)
CREATE POLICY "Users can view own review flags" ON review_flags
  FOR SELECT USING (auth.uid() = flagged_by);

-- Delete: owner only. No UPDATE policy — no client path updates flag rows.
CREATE POLICY "Users can delete own review flags" ON review_flags
  FOR DELETE USING (auth.uid() = flagged_by);
