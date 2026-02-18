import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { scoreMeals } from "./ranking.ts";

Deno.test("scoreMeals favors liked ingredients", () => {
  const meals = [
    {
      meal_id: 1,
      title: "Chicken Bowl",
      ingredients: [{ name: "chicken" }],
      diet_tags: ["omnivore"],
      allergen_flags: [],
      warning_flags: [],
    },
    {
      meal_id: 2,
      title: "Chicken Rice",
      ingredients: [{ name: "chicken" }, { name: "rice" }],
      diet_tags: ["omnivore"],
      allergen_flags: [],
      warning_flags: [],
    },
  ];

  const profile = {
    user_id: "u1",
    diet_type: "omnivore" as const,
    allergens: [],
    max_cook_minutes: 60,
    disliked_ingredients: [],
  };

  const swipes = [{
    event_id: "e1",
    meal_id: 1,
    decision: "yes" as const,
    timestamp: "",
    session_day: "2026-02-17",
  }];

  const ranked = scoreMeals(meals as any, profile, swipes as any);
  assertEquals(ranked[0].meal_id, 1);
});
