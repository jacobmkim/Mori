-- Migration: Add kroger_tokens table for Kroger OAuth integration
-- Run this once in the Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS kroger_tokens (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS enabled with NO policies = only service_role (Vercel) can access.
-- Regular authenticated users cannot read or write their own tokens directly.
-- All token access goes through Vercel functions which use the service role key.
ALTER TABLE kroger_tokens ENABLE ROW LEVEL SECURITY;
