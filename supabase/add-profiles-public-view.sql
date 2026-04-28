-- profiles_public — column-restricted public view of the profiles table.
--
-- Problem
--   The `profiles` table has owner-only SELECT (auth.uid() = id), but discover
--   and review queries embed `submitter:profiles!recipes_submitted_by_fkey(...)`
--   to surface other users' display info. Two failure modes:
--     a) Joins silently return null (broken feature), OR
--     b) A permissive `USING (true)` SELECT policy was added directly in
--        production, exposing every column — including taste_profile,
--        weekly_budget, push_token, dietary_goals, ingredient_dislikes,
--        last_cooked_date.
--
-- Fix
--   Create a SECURITY DEFINER view that projects only the columns that are
--   safe to expose (id, display name, username, avatar, public counters).
--   The view bypasses RLS (it runs as the view owner / postgres) but only
--   ever returns the projected columns. The underlying `profiles` table keeps
--   its owner-only RLS so direct queries from anon/authenticated still only
--   see the caller's own row.
--
-- After applying
--   1. Update lib/api.ts to embed `submitter:profiles_public!...` instead of
--      `submitter:profiles!...`. Same FK column, just routed through the view.
--   2. Audit production policies on `profiles` — DROP any permissive SELECT
--      policy that allows non-owners to read the table (e.g. anything with
--      USING (true)). The schema.sql owner-only policy is the only one that
--      should remain.

CREATE OR REPLACE VIEW profiles_public
  WITH (security_invoker = false)  -- security definer: bypasses profiles RLS
AS
SELECT
  id,
  name,
  username,
  avatar_url,
  recipes_submitted_count,
  meals_cooked_count
FROM profiles;

GRANT SELECT ON profiles_public TO anon, authenticated;

-- Belt-and-suspenders: explicitly drop any permissive public SELECT policy on
-- profiles that may have been added manually in production. The owner-only
-- "Users can view own profile" policy from schema.sql is preserved.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
    JOIN pg_class ON pg_class.oid = pg_policy.polrelid
    WHERE pg_class.relname = 'profiles'
      AND pg_policy.polname <> 'Users can view own profile'
      AND pg_policy.polname <> 'Users can insert own profile'
      AND pg_policy.polname <> 'Users can update own profile'
      AND pg_policy.polcmd = 'r'  -- SELECT policies only
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.polname);
  END LOOP;
END $$;
