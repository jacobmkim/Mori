-- 2026-05-07 — adds an audit_data column to recipes for storing the
-- pre-approval cron's audit results on community-submitted recipes.
--
-- Schema:
--   audit_data jsonb — { score, category, issues[], audited_at, computed_macros, warns[] }
--
-- Used by api/cron/audit-pending-community.ts. Admin sees the score in
-- Supabase Studio when reviewing pending community recipes for moderation.

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS audit_data jsonb;

-- Index for efficient cron queries: "find pending community recipes that
-- haven't been audited yet (or were audited but ingredients changed since)".
CREATE INDEX IF NOT EXISTS idx_recipes_pending_unaudited
  ON recipes (moderation_status)
  WHERE source_type = 'community' AND moderation_status = 'pending';
