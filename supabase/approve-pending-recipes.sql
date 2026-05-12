-- One-time backfill: approve all currently-pending community recipes.
-- Paired with dropping the moderation gate from fetchDiscoverRecipes and
-- deleting the audit-pending-community cron. Run once via Supabase Studio or
-- `supabase db push`.
--
-- Rejected rows are intentionally left alone — those were flagged bad and
-- should stay out of the feed.

UPDATE recipes
SET moderation_status = 'approved'
WHERE moderation_status = 'pending';

-- Sanity check (commented; run manually after the UPDATE):
--   SELECT moderation_status, COUNT(*)
--   FROM recipes
--   GROUP BY moderation_status;
