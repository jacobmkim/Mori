-- Migration: storage enumeration + SECURITY DEFINER trigger-function hardening
-- 2026-06-02. Run once in the Supabase SQL editor. Idempotent (safe to re-run).
--
-- Verified against the LIVE project (gsqvhepgjzjwbezivfid) on 2026-06-02:
--   • avatars / cook-photos / recipe-images buckets are all public:true.
--   • Each had a broad SELECT policy `USING (bucket_id = '<bucket>')` granted to
--     PUBLIC, so ANY client could list()/enumerate every user's files. Object
--     paths are `{userId}/...`, so enumeration leaks user ids + activity.
--     (INSERT/UPDATE/DELETE were already correctly scoped to the owner's folder.)
--   • handle_new_user() + the 3 recipe-counter trigger fns are SECURITY DEFINER
--     with EXECUTE granted to PUBLIC/anon/authenticated.
--
-- SAFE FOR RENDERING: the app reads these images via getPublicUrl() and public
-- buckets serve those URLs bypassing RLS entirely. The SELECT policy only gates
-- the authenticated list()/download API — which the client never uses for these
-- buckets — so scoping SELECT to the owner does not affect image display.

-- ── 1. Scope storage SELECT to the owner's own folder (kill cross-user list) ──

DROP POLICY IF EXISTS "avatar_select" ON storage.objects;
CREATE POLICY "avatar_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Anyone can view cook photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can list own cook photos" ON storage.objects;
CREATE POLICY "Users can list own cook photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'cook-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Anyone can view recipe images" ON storage.objects;
DROP POLICY IF EXISTS "Users can list own recipe images" ON storage.objects;
CREATE POLICY "Users can list own recipe images" ON storage.objects FOR SELECT
  USING (bucket_id = 'recipe-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── 2. Lock SECURITY DEFINER trigger functions to the trigger path only ──────
--
-- Trigger functions are invoked by the trigger mechanism in the table-owner
-- context, which does NOT consult the calling user's EXECUTE privilege — so
-- revoking EXECUTE is safe (the triggers keep firing). This removes the broad
-- PUBLIC/anon/authenticated EXECUTE grant, closing the direct-invoke surface and
-- future-proofing against a refactor to a non-trigger return type (which
-- PostgREST WOULD expose as an RPC).

REVOKE EXECUTE ON FUNCTION public.handle_new_user()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recipes_bump_cook_count_on_interaction()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recipes_bump_save_count_on_insert()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recipes_drop_save_count_on_delete()        FROM PUBLIC, anon, authenticated;

-- After applying: fold these changes into supabase/schema.sql (and the original
-- add-streaks-avatar.sql / add-cook-photos-202605.sql / add-recipe-submission.sql
-- policy definitions) so canonical schema and migrations don't drift.
