import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { applyRuleFlags } from "./rules.ts";

Deno.test("applyRuleFlags sets warnings", () => {
  const meals = [{
    meal_id: 1,
    title: "Peanut Pasta",
    image_url: "",
    cook_minutes: 50,
    calories: 500,
    ingredients: [{ name: "peanut" }],
    diet_tags: ["omnivore"],
    allergen_flags: ["peanuts"],
    warning_flags: [],
  }];

  const profile = {
    user_id: "user-1",
    diet_type: "vegan" as const,
    allergens: ["peanuts"],
    max_cook_minutes: 20,
    disliked_ingredients: [],
  };

  const flagged = applyRuleFlags(meals, profile);
  assertEquals(flagged[0].warning_flags.includes("allergy_conflict"), true);
  assertEquals(flagged[0].warning_flags.includes("diet_mismatch"), true);
  assertEquals(flagged[0].warning_flags.includes("cook_time_exceeded"), true);
});
