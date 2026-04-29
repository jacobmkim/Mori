-- Security hardening — 2026-04-28
--
-- Two fixes:
-- 1. recipes RLS regression: production policies still allow `submitted_by IS NULL`
--    on both INSERT and UPDATE, letting any signed-in user mutate the 1,506
--    curated rows. Tighten to `auth.uid() = submitted_by`. (Supersedes the
--    one-shot fix-recipes-rls.sql, which was never applied in prod.)
-- 2. recipe_flags spam guard: cap each user to one flag per recipe via a
--    unique index. Prevents a single user from flooding the moderation queue.
--
-- NOT included in this migration: the cook-funnel trigger (rejecting `cooked`
-- inserts without a prior `view`). Production data shows only ~3% of cook
-- interactions have a prior view row (test users + legacy data predating
-- view logging), so the trigger would block legitimate cooks. Deferred to
-- Phase 5 — see CLAUDE.md §9.

-- ─── 1. recipes RLS tightening ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own recipes" ON public.recipes;
CREATE POLICY "Users can insert own recipes" ON public.recipes
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);

DROP POLICY IF EXISTS "Users can update own recipes" ON public.recipes;
CREATE POLICY "Users can update own recipes" ON public.recipes
  FOR UPDATE USING (auth.uid() = submitted_by);

-- ─── 2. recipe_flags one-flag-per-user-per-recipe ────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_flags_user_recipe
  ON public.recipe_flags(flagged_by, recipe_id)
  WHERE flagged_by IS NOT NULL AND recipe_id IS NOT NULL;
