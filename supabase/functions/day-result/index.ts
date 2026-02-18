import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireUserId } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/http.ts";
import { scoreMeals } from "../_shared/ranking.ts";
import { adminClient } from "../_shared/supabase.ts";

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    const sessionDay = new URL(req.url).searchParams.get("session_day") ?? new Date().toISOString().slice(0, 10);
    const supabase = adminClient();

    const [{ data: deck }, { data: swipes }, { data: profile }] = await Promise.all([
      supabase.from("daily_decks").select("meal_ids").eq("user_id", userId).eq("session_day", sessionDay).single(),
      supabase.from("swipes").select("event_id, meal_id, decision, created_at, session_day").eq("user_id", userId).eq("session_day", sessionDay),
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
    ]);

    const { data: meals } = await supabase
      .from("meal_catalog")
      .select("id, title, image_url, cook_minutes, calories, ingredients, diet_tags, allergen_flags")
      .in("id", deck?.meal_ids ?? []);

    const mealCards = (meals ?? []).map((m) => ({
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

    const ranked = scoreMeals(mealCards, {
      user_id: userId,
      diet_type: profile?.diet_type,
      allergens: profile?.allergens ?? [],
      max_cook_minutes: profile?.max_cook_minutes ?? 45,
      disliked_ingredients: profile?.disliked_ingredients ?? [],
    }, (swipes ?? []).map((s) => ({
      event_id: s.event_id,
      meal_id: s.meal_id,
      decision: s.decision,
      timestamp: s.created_at,
      session_day: s.session_day,
    })));

    const top = ranked.slice(0, 3);
    if (top.length < 3) {
      return jsonResponse({ error: "insufficient-candidates" }, 409);
    }

    await supabase.from("daily_results").upsert({
      user_id: userId,
      session_day: sessionDay,
      top_meal_ids: top.map((m) => m.meal_id),
      confidence_score: 0.74,
      explanation: "Rule-based ranking from swipe signal and profile constraints.",
    });

    return jsonResponse({ top_meals: top, confidence_score: 0.74 });
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
});
