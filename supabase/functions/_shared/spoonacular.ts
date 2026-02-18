import { MealCard } from "./types.ts";

const base = "https://api.spoonacular.com/recipes/complexSearch";

export async function fetchMealCandidates(limit = 30): Promise<MealCard[]> {
  const apiKey = Deno.env.get("SPOONACULAR_API_KEY");
  if (!apiKey) {
    return [];
  }

  const params = new URLSearchParams({
    number: String(limit),
    addRecipeNutrition: "true",
    addRecipeInformation: "true",
    fillIngredients: "true",
    apiKey,
  });

  const response = await fetch(`${base}?${params.toString()}`);
  if (!response.ok) {
    return [];
  }

  const body = await response.json();
  const results = Array.isArray(body.results) ? body.results : [];

  return results.map((r: any) => ({
    meal_id: r.id,
    title: r.title,
    image_url: r.image,
    cook_minutes: r.readyInMinutes,
    calories: r.nutrition?.nutrients?.find((n: any) => n.name === "Calories")?.amount,
    ingredients: (r.extendedIngredients ?? []).map((i: any) => ({
      name: i.name ?? "",
      amount: i.amount,
      unit: i.unit,
    })),
    diet_tags: [
      ...(r.vegetarian ? ["vegetarian"] : []),
      ...(r.vegan ? ["vegan"] : []),
      ...(r.glutenFree ? ["gluten_free"] : []),
      ...(r.dairyFree ? ["dairy_free"] : []),
      ...(r.diets ?? []),
    ],
    allergen_flags: inferAllergens(r.extendedIngredients ?? []),
    warning_flags: [],
  }));
}

function inferAllergens(ingredients: Array<{ name?: string }>): string[] {
  const map: Record<string, string> = {
    peanut: "peanuts",
    almond: "tree_nuts",
    walnut: "tree_nuts",
    milk: "dairy",
    cheese: "dairy",
    egg: "egg",
    shrimp: "shellfish",
    crab: "shellfish",
    wheat: "gluten",
    soy: "soy",
  };

  const found = new Set<string>();
  for (const item of ingredients) {
    const name = (item.name ?? "").toLowerCase();
    for (const key of Object.keys(map)) {
      if (name.includes(key)) {
        found.add(map[key]);
      }
    }
  }
  return Array.from(found);
}
