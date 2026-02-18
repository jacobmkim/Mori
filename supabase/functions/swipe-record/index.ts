import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireUserId } from "../_shared/auth.ts";
import { handleOptions, jsonResponse, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { SwipeEvent } from "../_shared/types.ts";

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    const payload = await readJson<SwipeEvent>(req);
    const supabase = adminClient();

    const { error } = await supabase.from("swipes").upsert({
      event_id: payload.event_id,
      user_id: userId,
      meal_id: payload.meal_id,
      decision: payload.decision,
      session_day: payload.session_day,
    }, { onConflict: "user_id,event_id" });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
});
