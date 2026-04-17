-- Migration: Add ingredient_storage + user_leftovers tables
-- Run this once in the Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS)
--
-- ingredient_storage: global reference of shelf-life per ingredient.
--   Backfilled once via scripts/backfill-ingredient-storage.mjs (Haiku).
--   Read by all authenticated users; written only by service role.
--
-- user_leftovers: per-user rows for perishables the user has on hand
--   after cooking. Feeds scorer bonus + reminder card on Discover.

CREATE TABLE IF NOT EXISTS ingredient_storage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  TEXT UNIQUE NOT NULL,
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  category        TEXT,
  days_fridge     INT,
  days_freezer    INT,
  days_room_temp  INT,
  tips_text       TEXT,
  is_staple       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingredient_storage_aliases_idx
  ON ingredient_storage USING GIN (aliases);

CREATE TABLE IF NOT EXISTS user_leftovers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ingredient_id    UUID REFERENCES ingredient_storage(id) ON DELETE SET NULL,
  ingredient_name  TEXT NOT NULL,                 -- denormalized for resilience
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  storage_method   TEXT NOT NULL DEFAULT 'fridge',
  spoils_at        TIMESTAMPTZ NOT NULL,
  dismissed_at     TIMESTAMPTZ,
  extended_count   INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS user_leftovers_active_idx
  ON user_leftovers (user_id, spoils_at)
  WHERE dismissed_at IS NULL;

ALTER TABLE ingredient_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_leftovers     ENABLE ROW LEVEL SECURITY;

-- ingredient_storage: world-readable; writes go through service role.
DROP POLICY IF EXISTS "ingredient_storage read" ON ingredient_storage;
CREATE POLICY "ingredient_storage read"
  ON ingredient_storage FOR SELECT USING (true);

-- user_leftovers: owner only.
DROP POLICY IF EXISTS "user_leftovers owner select" ON user_leftovers;
DROP POLICY IF EXISTS "user_leftovers owner insert" ON user_leftovers;
DROP POLICY IF EXISTS "user_leftovers owner update" ON user_leftovers;
DROP POLICY IF EXISTS "user_leftovers owner delete" ON user_leftovers;

CREATE POLICY "user_leftovers owner select"
  ON user_leftovers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_leftovers owner insert"
  ON user_leftovers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_leftovers owner update"
  ON user_leftovers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_leftovers owner delete"
  ON user_leftovers FOR DELETE USING (auth.uid() = user_id);
