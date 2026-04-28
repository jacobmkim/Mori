-- ─── @handle username on profiles ────────────────────────────────────────────
-- Adds a unique, public @handle field separate from display name (`name`).
-- Format: lowercase letters, numbers, underscores; 3-30 chars.
-- Rate limit: one change per 30 days, enforced at DB level via trigger.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- Drop-and-recreate guards (idempotent re-runs)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_username_unique;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_unique UNIQUE (username);

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,30}$');

CREATE INDEX IF NOT EXISTS idx_profiles_username
  ON profiles (username) WHERE username IS NOT NULL;

-- 30-day rate limit + auto-stamp on change.
-- Setting username for the first time (NULL → 'x') counts as a change and
-- starts the 30-day clock. This prevents a "set then change" evasion path.
CREATE OR REPLACE FUNCTION enforce_username_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF OLD.username_changed_at IS NOT NULL
       AND NOW() - OLD.username_changed_at < interval '30 days' THEN
      RAISE EXCEPTION 'username_rate_limit'
        USING HINT = (OLD.username_changed_at + interval '30 days')::TEXT;
    END IF;
    NEW.username_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_username_rate_limit ON profiles;
CREATE TRIGGER profiles_username_rate_limit
  BEFORE UPDATE OF username ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_username_rate_limit();
