import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireUserId } from "../_shared/auth.ts";
import { handleOptions, jsonResponse, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { UserProfile } from "../_shared/types.ts";

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    const payload = await readJson<Omit<UserProfile, "user_id">>(req);

    if (!payload.diet_type || !payload.max_cook_minutes) {
      return jsonResponse({ error: "Missing required profile fields" }, 400);
    }

    const supabase = adminClient();
    const { error } = await supabase.from("profiles").upsert({
      user_id: userId,
      diet_type: payload.diet_type,
      allergens: payload.allergens ?? [],
      max_cook_minutes: payload.max_cook_minutes,
      disliked_ingredients: payload.disliked_ingredients ?? [],
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
});
