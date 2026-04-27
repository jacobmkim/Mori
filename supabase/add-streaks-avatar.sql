-- Streak columns on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_streak integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longest_streak integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_cooked_date date;

-- Avatars storage bucket (public reads, user-scoped writes)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT DO NOTHING;

CREATE POLICY "avatar_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatar_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatar_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
