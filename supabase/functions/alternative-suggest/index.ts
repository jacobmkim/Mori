import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireUserId } from "../_shared/auth.ts";
import { suggestAlternativesDeterministic, aiEnabled } from "../_shared/alternatives.ts";
import { handleOptions, jsonResponse, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

interface AlternativeRequest {
  base_meal_id: number;
  session_day: string;
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    const payload = await readJson<AlternativeRequest>(req);
    const supabase = adminClient();

    const [{ data: profile }, { data: deck }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_decks").select("meal_ids").eq("user_id", userId).eq("session_day", payload.session_day).single(),
    ]);

    const { data: meals } = await supabase
      .from("meal_catalog")
      .select("id, title, image_url, cook_minutes, calories, ingredients, diet_tags, allergen_flags")
      .in("id", deck?.meal_ids ?? []);

    const candidates = (meals ?? []).map((m) => ({
      meal_id: m.id,
      title: m.title,
      image_url: m.image_url,
      cook_minutes: m.cook_minutes,
      calories: m.calories,
      ingredients: m.ingredients,
      diet_tags: m.diet_tags,
      allergen_flags: m.allergen_flags,
      warning_flags: [],
    }));

    const alternatives = suggestAlternativesDeterministic(payload.base_meal_id, candidates, {
      user_id: userId,
      diet_type: profile?.diet_type,
      allergens: profile?.allergens ?? [],
      max_cook_minutes: profile?.max_cook_minutes ?? 45,
      disliked_ingredients: profile?.disliked_ingredients ?? [],
    });

    await supabase.from("ai_generation_logs").insert({
      user_id: userId,
      session_day: payload.session_day,
      function_name: "alternative-suggest",
      model: aiEnabled ? "openai-enabled" : "rule-only",
      status: "ok",
    });

    return jsonResponse({
      base_meal_id: payload.base_meal_id,
      reason: aiEnabled ? "ai_personalized" : "rule_based_similarity",
      alternatives,
      ai_enabled: aiEnabled,
    });
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
});
