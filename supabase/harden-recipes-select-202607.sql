-- harden-recipes-select-202607.sql
-- Defense-in-depth for PRIVATE recipe rows (is_public = false: community drafts +
-- saved pantry-generated recipes from M8 stage 3).
--
-- Today the recipes SELECT policy is USING (true) — privacy is enforced ONLY by
-- client-side query filters (fetchDiscoverRecipes + explore.tsx both filter
-- community rows to is_public = true as of 2026-07-05). Any client with the anon
-- key can still read other users' private rows via direct PostgREST. This policy
-- closes that at the database.
--
-- ✅ APPLIED TO PROD 2026-07-05 (migration harden_recipes_select_202607) and
-- folded into schema.sql. Pre-apply check: all 2,618 rows were is_public=true.
-- Behaviorally verified via rolled-back probes: anon sees the full public
-- catalog (2,618); anon CANNOT read a private row; the owner CAN.
--
-- Original pre-apply checklist (for reference):
--   1. No NULL is_public on rows that must stay visible:
--        SELECT source_type, is_public, COUNT(*) FROM recipes GROUP BY 1, 2;
--      (COALESCE below defends against NULLs regardless, treating them as public —
--      matching today's effective behavior.)
--   2. api/recipe-page.ts (public share pages) uses the SERVICE ROLE — unaffected.
--   3. The Recipes tab "Mine" (owner reading own private rows) passes via the
--      submitted_by arm.
-- Apply in Studio, smoke-test Discover/Explore/Mine/share-page, then fold into
-- schema.sql per the migration convention.

DROP POLICY IF EXISTS "Anyone can view recipes" ON recipes;
CREATE POLICY "Public recipes, or own private ones" ON recipes
  FOR SELECT USING (
    COALESCE(is_public, true) = true
    OR auth.uid() = submitted_by
  );
