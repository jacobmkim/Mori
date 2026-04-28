-- Enable Row Level Security on the waitlist table.
-- The /api/waitlist Vercel function uses the service-role key, which bypasses RLS,
-- so signup INSERTs continue to work. With RLS enabled and no policies declared,
-- both anon and authenticated client roles are denied SELECT/INSERT/UPDATE/DELETE.
-- This prevents any signed-in client from exfiltrating the full email list via
-- the public Supabase URL + anon key.

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
