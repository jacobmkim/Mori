import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireUserId } from "../_shared/auth.ts";
import { handleOptions, jsonResponse } from "../_shared/http.ts";
import { applyRuleFlags } from "../_shared/rules.ts";
import { adminClient } from "../_shared/supabase.ts";
import { fetchMealCandidates } from "../_shared/spoonacular.ts";

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    const supabase = adminClient();

    const today = new Date().toISOString().slice(0, 10);
    const { data: existingDeck } = await supabase
      .from("daily_decks")
      .select("meal_ids")
      .eq("user_id", userId)
      .eq("session_day", today)
      .maybeSingle();

    if (existingDeck?.meal_ids?.length) {
      const { data: existingMeals } = await supabase
        .from("meal_catalog")
        .select("id, title, image_url, cook_minutes, calories, ingredients, diet_tags, allergen_flags")
        .in("id", existingDeck.meal_ids);

      return jsonResponse({ meals: (existingMeals ?? []).map((m) => ({
        meal_id: m.id,
        title: m.title,
        image_url: m.image_url,
        cook_minutes: m.cook_minutes,
        calories: m.calories,
        ingredients: m.ingredients,
        diet_tags: m.diet_tags,
        allergen_flags: m.allergen_flags,
        warning_flags: [],
      })) });
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
    if (!profile) {
      return jsonResponse({ error: "Profile missing" }, 400);
    }

    const candidates = await fetchMealCandidates(40);
    const mealsWithRules = applyRuleFlags(candidates, { ...profile, user_id: userId });
    const deckMeals = mealsWithRules.slice(0, 20);

    if (deckMeals.length === 0) {
      return jsonResponse({ error: "No meals available" }, 503);
    }

    await supabase.from("meal_catalog").upsert(deckMeals.map((m) => ({
      id: m.meal_id,
      title: m.title,
      image_url: m.image_url,
      cook_minutes: m.cook_minutes,
      calories: m.calories,
      ingredients: m.ingredients,
      diet_tags: m.diet_tags,
      allergen_flags: m.allergen_flags,
      updated_at: new Date().toISOString(),
    })));

    await supabase.from("daily_decks").upsert({
      user_id: userId,
      session_day: today,
      meal_ids: deckMeals.map((m) => m.meal_id),
      generated_with: { source: "spoonacular", mode: "rule_only" },
    });

    return jsonResponse({ meals: deckMeals });
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
});
