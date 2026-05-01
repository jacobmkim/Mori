-- Email verification columns — 2026-05-01
--
-- Goal: non-blocking verification. Supabase's "Confirm email" toggle is
-- intentionally OFF, so signup auto-confirms and the user gets a session
-- immediately. Verification status is tracked separately via these columns
-- and surfaced as a soft banner in-app — no functionality is gated on it.
--
-- Token lifecycle:
--   1. POST /api/send-welcome-email — generates a UUID, stores it on the
--      profile, sends an email with a link containing the token.
--   2. GET  /api/send-welcome-email?token=<uuid> — looks up the profile by
--      token, sets email_verified_at = now(), clears the token.
--   3. Tokens expire 24h after email_verification_sent_at.
--
-- Stored on the profile (not a separate table) because there is only ever
-- one outstanding verification token per user; "Resend" rotates it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verification_token uuid;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verification_sent_at timestamptz;

-- Token lookups happen on a public endpoint (no JWT — the token IS the auth)
-- so the GET path needs an indexed lookup. Partial index keeps it tight:
-- once a token is consumed it's nulled out, so the index only ever holds
-- live tokens.
CREATE INDEX IF NOT EXISTS idx_profiles_email_verification_token
  ON public.profiles(email_verification_token)
  WHERE email_verification_token IS NOT NULL;

-- RLS: existing profile policies cover this. Users read their own row;
-- only the service role (used by /api/send-welcome-email) writes the
-- verification columns. No new policies needed.
