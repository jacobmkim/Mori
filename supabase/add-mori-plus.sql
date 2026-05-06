-- Migration: Mori+ subscription tier — schema additions
-- Run this once in the Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS)
--
-- Adds:
--   1. Subscription columns on profiles (driven by RevenueCat webhook)
--   2. ai_usage — monthly free-tier budget tracking + atomic increment RPC
--   3. rc_webhook_events — webhook idempotency
--   4. sunday_drops — weekly personalized recipe pack (Mori+ only)
--   5. macro_goals + macro_logs — Macro Coach (Mori+ only)
--   6. decks — saved filter combos (Mori+ only)
--   7. family_groups + family_members — v1.2 Family Share (RLS scaffolded now)
--   8. founders_waitlist — pre-v1.1 email capture for the lifetime SKU
--
-- profiles.push_token already exists (added by add-push-token.sql) — not duplicated here.

-- ─── 1. Subscription columns on profiles ──────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_premium               BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_product_id       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_expires_at       TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_will_renew       BOOLEAN;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_in_grace_period  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_started_at       TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revenuecat_user_id       TEXT;

-- One Apple receipt per RC subscriber id; index supports webhook lookup.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_revenuecat_user_id_key
  ON profiles (revenuecat_user_id)
  WHERE revenuecat_user_id IS NOT NULL;

-- Partial index — only premium rows; speeds up cron eligibility scans.
CREATE INDEX IF NOT EXISTS profiles_is_premium_idx
  ON profiles (is_premium)
  WHERE is_premium = TRUE;


-- ─── 2. ai_usage — monthly free-tier budget ───────────────────────────────────
--
-- One row per (user, endpoint, UTC YYYY-MM). Atomic increment RPC below.
-- Budget gates live in lib/aiUsage.ts; failed AI generations don't increment.

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint  TEXT NOT NULL,
  month     TEXT NOT NULL,                    -- 'YYYY-MM' (UTC)
  count     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, month)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage owner select" ON ai_usage;
DROP POLICY IF EXISTS "ai_usage owner insert" ON ai_usage;
DROP POLICY IF EXISTS "ai_usage owner update" ON ai_usage;

CREATE POLICY "ai_usage owner select"
  ON ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ai_usage owner insert"
  ON ai_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_usage owner update"
  ON ai_usage FOR UPDATE USING (auth.uid() = user_id);

-- Atomic upsert — avoids the read-then-write race when two AI calls fire concurrently.
-- SECURITY DEFINER so the RPC can write regardless of the caller's RLS context;
-- callers must pass their own auth.uid() (validated server-side in lib/aiUsage.ts).
CREATE OR REPLACE FUNCTION increment_ai_usage(p_user UUID, p_endpoint TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO ai_usage (user_id, endpoint, month, count)
  VALUES (p_user, p_endpoint, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), 1)
  ON CONFLICT (user_id, endpoint, month)
  DO UPDATE SET count = ai_usage.count + 1;
END $$;


-- ─── 3. rc_webhook_events — RevenueCat webhook idempotency ────────────────────
--
-- Insert event_id on every webhook call; duplicate-key error → return 200 noop.
-- RC retries failed deliveries; this prevents double-applying state.

CREATE TABLE IF NOT EXISTS rc_webhook_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  user_id      UUID,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service-role only; webhook is the sole writer. No RLS policies needed
-- (webhook uses service role key which bypasses RLS), but enable RLS so
-- accidental anon-key reads fail closed.
ALTER TABLE rc_webhook_events ENABLE ROW LEVEL SECURITY;


-- ─── 4. sunday_drops — weekly personalized recipe pack ────────────────────────

CREATE TABLE IF NOT EXISTS sunday_drops (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,                -- the Sunday this drop is for (user-local)
  recipe_ids    UUID[] NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at   TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  UNIQUE (user_id, week_start)                -- cron idempotency
);

CREATE INDEX IF NOT EXISTS sunday_drops_user_week_idx
  ON sunday_drops (user_id, week_start DESC);

ALTER TABLE sunday_drops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sunday_drops owner select" ON sunday_drops;
DROP POLICY IF EXISTS "sunday_drops owner update" ON sunday_drops;

CREATE POLICY "sunday_drops owner select"
  ON sunday_drops FOR SELECT USING (auth.uid() = user_id);
-- Only opened_at + notified_at are user-writable (mark-as-opened);
-- inserts go through service role from the cron.
CREATE POLICY "sunday_drops owner update"
  ON sunday_drops FOR UPDATE USING (auth.uid() = user_id);


-- ─── 5. macro_goals + macro_logs — Macro Coach ────────────────────────────────

CREATE TABLE IF NOT EXISTS macro_goals (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  goal               TEXT NOT NULL CHECK (goal IN ('cut', 'maintain', 'bulk')),
  target_weight_lbs  NUMERIC(5,1),
  current_weight_lbs NUMERIC(5,1),
  height_in          NUMERIC(4,1),
  age                INT CHECK (age BETWEEN 13 AND 120),
  sex                TEXT CHECK (sex IN ('male', 'female', 'unspecified')),
  activity_level     TEXT NOT NULL CHECK (activity_level IN
                       ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  daily_kcal         INT,
  daily_protein_g    INT,
  daily_carbs_g      INT,
  daily_fat_g        INT,
  set_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE macro_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "macro_goals owner all" ON macro_goals;
CREATE POLICY "macro_goals owner all"
  ON macro_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS macro_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_for   DATE NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('apple_health', 'recipe_cooked', 'manual')),
  kcal         INT,
  protein_g    INT,
  carbs_g      INT,
  fat_g        INT,
  recipe_id    UUID REFERENCES recipes(id) ON DELETE SET NULL,
  external_id  TEXT,                          -- HealthKit UUID for v1.2 dedupe
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS macro_logs_user_date_idx
  ON macro_logs (user_id, logged_for DESC);

-- Dedupe: same external_id (HealthKit UUID) per user can only land once.
CREATE UNIQUE INDEX IF NOT EXISTS macro_logs_external_id_unique
  ON macro_logs (user_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE macro_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "macro_logs owner all" ON macro_logs;
CREATE POLICY "macro_logs owner all"
  ON macro_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── 6. decks — saved filter combos ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  filter      JSONB NOT NULL,                  -- { cuisines, tags, time_max, etc. }
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decks_user_idx ON decks (user_id, created_at DESC);

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decks owner all" ON decks;
CREATE POLICY "decks owner all"
  ON decks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─── 7. Family Share (v1.2; RLS scaffolded now) ───────────────────────────────

CREATE TABLE IF NOT EXISTS family_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code  TEXT UNIQUE NOT NULL,           -- e.g. 'MORI-7K2X'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family_members (
  group_id   UUID REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE family_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_groups visible to members" ON family_groups;
DROP POLICY IF EXISTS "family_groups owner write"        ON family_groups;
DROP POLICY IF EXISTS "family_members visible to group"  ON family_members;
DROP POLICY IF EXISTS "family_members self insert"       ON family_members;
DROP POLICY IF EXISTS "family_members owner remove"      ON family_members;

CREATE POLICY "family_groups visible to members"
  ON family_groups FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT group_id FROM family_members WHERE user_id = auth.uid())
  );

CREATE POLICY "family_groups owner write"
  ON family_groups FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "family_members visible to group"
  ON family_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR group_id IN (SELECT id FROM family_groups WHERE owner_id = auth.uid())
  );

CREATE POLICY "family_members self insert"
  ON family_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "family_members owner remove"
  ON family_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR group_id IN (SELECT id FROM family_groups WHERE owner_id = auth.uid())
  );


-- ─── 8. founders_waitlist — pre-v1.1 email capture ────────────────────────────

CREATE TABLE IF NOT EXISTS founders_waitlist (
  email         TEXT PRIMARY KEY,
  signed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at   TIMESTAMPTZ
);

ALTER TABLE founders_waitlist ENABLE ROW LEVEL SECURITY;
-- No public RLS policies: writes via /api/founders-waitlist Vercel function
-- (service role); reads are admin-only via service role key.
