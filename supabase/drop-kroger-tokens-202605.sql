-- Drop `kroger_tokens` — May 2026
--
-- Kroger integration was removed 2026-04-28 (api/kroger-auth.ts,
-- api/kroger-cart.ts, supabase/add-kroger-tokens.sql, KrogerSheet UI in
-- grocery-list.tsx). The table itself was left behind and held plaintext
-- OAuth refresh tokens. Pre-drop verification: 0 rows, 0 FK references
-- pointing at it, 0 code references in the repo (the `kroger` mentions in
-- api/generate-recipe.ts and the docs are unrelated grocery-store-name
-- strings). Tracked in CLAUDE.md §9 as an open cleanup item.

DROP TABLE IF EXISTS public.kroger_tokens;
