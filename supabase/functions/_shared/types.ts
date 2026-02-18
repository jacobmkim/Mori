export type DietType = "omnivore" | "vegetarian" | "vegan" | "keto" | "paleo" | "pescatarian";

export interface UserProfile {
  user_id: string;
  diet_type: DietType;
  allergens: string[];
  max_cook_minutes: number;
  disliked_ingredients?: string[];
}

export interface MealIngredient {
  name: string;
  amount?: number;
  unit?: string;
}

export interface MealCard {
  meal_id: number;
  title: string;
  image_url?: string;
  cook_minutes?: number;
  calories?: number;
  ingredients: MealIngredient[];
  diet_tags: string[];
  allergen_flags: string[];
  warning_flags: string[];
}

export interface SwipeEvent {
  event_id: string;
  meal_id: number;
  decision: "yes" | "no";
  timestamp: string;
  session_day: string;
}

export interface AlternativeSuggestion {
  base_meal_id: number;
  reason: string;
  alternatives: MealCard[];
}

export interface ShoppingItem {
  ingredient: string;
  quantity?: number;
  unit?: string;
}

export interface DailyResult {
  top_meals: MealCard[];
  shopping_list: ShoppingItem[];
  confidence_score: number;
}
