-- Mori+ I2 — capture each user's IANA timezone for per-user local-time scheduling.
-- Sunday Drop fires at the user's LOCAL Sunday morning, so day-boundary logic must be
-- local, not UTC. Default 'UTC' is the safe, non-presumptuous default; the client
-- overwrites it with the device's resolved IANA zone on the next app open, so existing
-- users backfill organically without a one-off migration script.
--
-- Idempotent (IF NOT EXISTS) — safe to re-run. Apply to prod, then fold into schema.sql.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Index supports the Sunday Drop cron, which scans premium users by zone.
CREATE INDEX IF NOT EXISTS profiles_timezone_idx ON profiles (timezone);
