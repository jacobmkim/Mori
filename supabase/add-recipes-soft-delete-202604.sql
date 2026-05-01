-- Recipes soft delete — 2026-04-29
--
-- Problem: client called supabase.from('recipes').delete() from the Mine tab
-- but no DELETE RLS policy existed, so the call silently succeeded with 0 rows
-- affected. Even adding a DELETE policy would have failed at the FK boundary
-- (swipe_events, saved_recipes, recipe_interactions, recipe_cohort_affinities
-- all reference recipes(id) without ON DELETE CASCADE).
--
-- Solution: soft delete via deleted_at timestamptz. Browse surfaces filter it
-- out; recipe-by-id paths (Saved/Cooked tabs, meal plan slots) still resolve
-- so existing user history is preserved.
--
-- Required client-side: filter `deleted_at IS NULL` in fetchDiscoverRecipes,
-- fetchAdventureRecipe, explore.tsx browse queries, and loadMineData.

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index keeps the hot path (live recipes) cheap. Most reads filter
-- `deleted_at IS NULL`; this lets Postgres skip soft-deleted rows entirely.
CREATE INDEX IF NOT EXISTS idx_recipes_active
  ON public.recipes(created_at DESC)
  WHERE deleted_at IS NULL;

-- No DELETE policy added: hard deletes remain blocked by absent RLS, which is
-- intentional. Soft delete uses the existing UPDATE policy
-- (auth.uid() = submitted_by), so curated recipes (submitted_by IS NULL) can
-- never be soft-deleted by clients.
