-- ─── Recipe submission: visibility + moderation + image storage ───────────────

-- 1. Add visibility + moderation columns
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS moderation_status text
  CHECK (moderation_status IN ('pending', 'approved', 'rejected'));

-- 2. Backfill existing rows so current behavior does not regress.
UPDATE recipes SET moderation_status = 'approved'
  WHERE moderation_status IS NULL;

-- 3. Storage bucket for user-uploaded recipe photos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('recipe-images', 'recipe-images', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS — readers public, writes scoped to {userId}/... folder
DROP POLICY IF EXISTS "Anyone can view recipe images" ON storage.objects;
CREATE POLICY "Anyone can view recipe images" ON storage.objects
  FOR SELECT USING (bucket_id = 'recipe-images');

DROP POLICY IF EXISTS "Users can upload own recipe images" ON storage.objects;
CREATE POLICY "Users can upload own recipe images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'recipe-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own recipe images" ON storage.objects;
CREATE POLICY "Users can update own recipe images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'recipe-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own recipe images" ON storage.objects;
CREATE POLICY "Users can delete own recipe images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'recipe-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
