-- ─── Cook photos: user-uploaded photo of a dish they cooked ───────────────────
-- Attached to the user's review (recipe_reviews already gates INSERT on a real
-- 'cooked' interaction and is public-read), so this needs no new RLS on the row
-- itself — the existing cooked-gate INSERT + owner UPDATE/DELETE policies cover
-- the new column. Photos live in a dedicated `cook-photos` storage bucket, kept
-- separate from `recipe-images` (recipe hero photos) for lifecycle + moderation.

-- 1. Photo column on reviews
ALTER TABLE recipe_reviews ADD COLUMN IF NOT EXISTS photo_url text;

-- DB-level guard: photo_url must be NULL or a public URL in our cook-photos
-- bucket. The client already validates, but this stops a forged direct write
-- (anon key + JWT) from parking an arbitrary off-domain URL on a public review.
ALTER TABLE recipe_reviews DROP CONSTRAINT IF EXISTS recipe_reviews_photo_url_check;
ALTER TABLE recipe_reviews ADD CONSTRAINT recipe_reviews_photo_url_check
  CHECK (photo_url IS NULL OR photo_url LIKE 'https://%/storage/v1/object/public/cook-photos/%');

-- 2. Storage bucket for user-uploaded cook photos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('cook-photos', 'cook-photos', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS — readers public, writes scoped to {userId}/... folder
DROP POLICY IF EXISTS "Anyone can view cook photos" ON storage.objects;
CREATE POLICY "Anyone can view cook photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'cook-photos');

DROP POLICY IF EXISTS "Users can upload own cook photos" ON storage.objects;
CREATE POLICY "Users can upload own cook photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'cook-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own cook photos" ON storage.objects;
CREATE POLICY "Users can update own cook photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'cook-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own cook photos" ON storage.objects;
CREATE POLICY "Users can delete own cook photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'cook-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
