-- ─── Exclusive push-token claim (2026-06-10) ──────────────────────────────────
--
-- Push tokens are per-DEVICE, but registration wrote them to whichever profile
-- was signed in and sign-out never cleared them. On multi-account devices the
-- same ExponentPushToken ended up on several profiles, so cron pushes for
-- account A landed on whoever holds the phone now — found when the
-- apple-review demo account's streak reminder hit the developer's phone.
--
-- claim_push_token() makes registration exclusive: strips the token from every
-- other profile, then writes it to the caller. User derived from auth.uid()
-- (never caller-supplied — security commandment). Sign-out additionally clears
-- the token client-side; this RPC is the backstop for paths that skip it
-- (app deletion, token rotation, crashed sign-out).

CREATE OR REPLACE FUNCTION claim_push_token(p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_token IS NULL OR length(p_token) = 0 OR length(p_token) > 200 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  UPDATE profiles SET push_token = NULL  WHERE push_token = p_token AND id <> uid;
  UPDATE profiles SET push_token = p_token WHERE id = uid;
END $$;

REVOKE EXECUTE ON FUNCTION claim_push_token(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION claim_push_token(TEXT) TO authenticated;
