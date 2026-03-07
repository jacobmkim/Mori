// ─── User / Profile ──────────────────────────────────────────────────────────

export type SkillLevel = 'beginner' | 'home_cook' | 'confident_chef';
export type CookingFrequency = 'few_times_week' | 'most_days' | 'just_starting';
export type AppMode = 'meal_prep' | 'spontaneous';
export type SwipeDirection = 'right' | 'left';
export type RecipeBadge = 'none' | 'staff_pick' | 'community_verified' | 'community_favorite';
export type RecipeSourceType = 'curated' | 'community' | 'imported';
export type GroceryListType = 'weekly' | 'spontaneous';
export type GroceryListStatus = 'active' | 'ordered' | 'complete';
export type PantryAddedVia = 'delivery' | 'receipt' | 'manual';
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface Profile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  dietary_goals: string[];
  cuisine_preferences: string[];
  skill_level: SkillLevel | null;
  cooking_frequency: CookingFrequency | null;
  weekly_budget: string | null;
  meals_cooked_count: number;
  recipes_submitted_count: number;
  onboarding_complete: boolean;
  created_at: string;
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface RecipeStep {
  order: number;
  instruction: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  cuisine: string | null;
  source_type: RecipeSourceType;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  servings: number | null;
  cost_per_serving: number | null;
  dietary_tags: string[];
  badge: RecipeBadge;
  submitted_by: string | null;
  avg_rating: number;
  rating_count: number;
  save_count: number;
  image_url: string | null;
  created_at: string;
}

// ─── Swipe ───────────────────────────────────────────────────────────────────

export interface SwipeEvent {
  id: string;
  user_id: string;
  recipe_id: string;
  direction: SwipeDirection;
  mode: AppMode;
  swiped_at: string;
}

// ─── Saved Recipes ───────────────────────────────────────────────────────────

export interface SavedRecipe {
  id: string;
  user_id: string;
  recipe_id: string;
  liked: boolean;
  user_rating: number | null;
  saved_at: string;
}

// ─── Pantry ──────────────────────────────────────────────────────────────────

export interface PantryItem {
  id: string;
  user_id: string;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  added_via: PantryAddedVia;
  added_at: string;
  expires_at: string | null;
}

// ─── Grocery ─────────────────────────────────────────────────────────────────

export interface GroceryItem {
  ingredient_name: string;
  quantity: string;
  unit: string;
  checked: boolean;
  recipe_ids: string[];
}

export interface GroceryList {
  id: string;
  user_id: string;
  list_type: GroceryListType;
  status: GroceryListStatus;
  items: GroceryItem[];
  estimated_total_cost: number | null;
  delivery_partner: string | null;
  created_at: string;
}

// ─── Meal Plan ───────────────────────────────────────────────────────────────

export interface MealSlot {
  day: number; // 0-6
  meal_type: MealType;
  recipe_id: string;
  servings_multiplier: number;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  is_public: boolean;
  slots: MealSlot[];
  created_at: string;
}

// ─── Collections ─────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  recipe_ids: string[];
  created_at: string;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingState {
  dietary_goals: string[];
  cuisine_preferences: string[];
  cooking_frequency: CookingFrequency | null;
  skill_level: SkillLevel | null;
  weekly_budget: string | null;
}
