import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireUserId } from "../_shared/auth.ts";
import { handleOptions, jsonResponse, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

interface ReminderRequest {
  reminder_time: string;
  timezone: string;
  enabled: boolean;
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    const payload = await readJson<ReminderRequest>(req);

    const supabase = adminClient();
    const { error } = await supabase.from("reminder_settings").upsert({
      user_id: userId,
      reminder_time: payload.reminder_time,
      timezone: payload.timezone,
      enabled: payload.enabled,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
});
