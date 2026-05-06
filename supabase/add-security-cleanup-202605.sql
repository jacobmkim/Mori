-- Security cleanup — May 2026
--
-- Drops a stray wide-open RLS policy on `recipe_flags` that nullified the
-- scoped trio added by `supabase/add-recipe-flags.sql` (2026-04-27). The
-- wide-open policy used `USING (true) WITH CHECK (true)` for the `ALL` action
-- on the `authenticated` role, which — because Postgres RLS OR-merges
-- permissive policies — meant any signed-in user could UPDATE or DELETE flag
-- rows belonging to other users. Worst case: a single
-- `DELETE FROM recipe_flags` (no WHERE) would wipe every user's "don't show
-- me again" list globally, which is exactly the vector the 04-27 migration
-- claimed to close.
--
-- The three scoped policies in `add-recipe-flags.sql` (insert/select/delete,
-- all gated on `auth.uid() = flagged_by`) are already applied and remain in
-- place. After this drop, only those three policies govern access from the
-- anon client. UPDATE has no policy intentionally — no client code path
-- updates flag rows.

DROP POLICY IF EXISTS "Authenticated users can manage flags" ON public.recipe_flags;
