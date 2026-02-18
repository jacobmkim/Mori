import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireUserId } from "../_shared/auth.ts";
import { handleOptions, jsonResponse, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

interface BuildRequest {
  session_day: string;
  top_meal_ids: number[];
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    const payload = await readJson<BuildRequest>(req);
    const supabase = adminClient();

    const { data: meals } = await supabase
      .from("meal_catalog")
      .select("id, ingredients")
      .in("id", payload.top_meal_ids);

    const merged = new Map<string, { ingredient: string; quantity?: number; unit?: string }>();
    for (const meal of meals ?? []) {
      for (const ingredient of meal.ingredients ?? []) {
        const key = (ingredient.name ?? "").toLowerCase();
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, {
            ingredient: ingredient.name,
            quantity: ingredient.amount,
            unit: ingredient.unit,
          });
        } else {
          existing.quantity = (existing.quantity ?? 0) + (ingredient.amount ?? 0);
        }
      }
    }

    const items = Array.from(merged.values());
    await supabase.from("shopping_lists").upsert({
      user_id: userId,
      session_day: payload.session_day,
      items,
    });

    return jsonResponse({ shopping_list: items });
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
});
