// ─── User / Profile ──────────────────────────────────────────────────────────

export type SkillLevel = 'beginner' | 'home_cook' | 'confident_chef';
export type CookingFrequency = 'few_times_week' | 'most_days' | 'just_starting';
export type EatingStyle = 'quick_simple' | 'variety' | 'favourites_rotation';
export type AppMode = 'meal_prep' | 'spontaneous';
export type SwipeDirection = 'right' | 'left';
export type RecipeBadge = 'none' | 'staff_pick' | 'community_verified' | 'community_favorite';
export type RecipeSourceType = 'curated' | 'community' | 'imported';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export type GroceryListType = 'weekly' | 'spontaneous';
export type GroceryListStatus = 'active' | 'exported' | 'complete';
export type PantryAddedVia = 'onboarding' | 'grocery_list' | 'manual';
export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface Profile {
  id: string;
  name: string | null;
  username: string | null;
  username_changed_at: string | null;
  avatar_url: string | null;
  dietary_goals: string[];
  dietary_extra_preferences: string | null;
  ingredient_dislikes: string[];
  cuisine_preferences: string[];
  eating_style: EatingStyle | null;
  skill_level: SkillLevel | null;
  cooking_frequency: CookingFrequency | null;
  weekly_budget: string | null;
  meals_cooked_count: number;
  recipes_submitted_count: number;
  total_sessions: number;
  taste_profile: Record<string, unknown> | null;
  onboarding_complete: boolean;
  created_at: string;
  current_streak: number;
  longest_streak: number;
  last_cooked_date: string | null;
  push_token: string | null;
  notify_creator_events: boolean;
  last_creator_digest_at: string | null;
  email_verified_at: string | null;
  last_active_at: string | null;
  notify_winback: boolean;
  timezone?: string | null; // IANA zone for per-user local scheduling (Sunday Drop); DB default 'UTC'
}

// ─── Macros ───────────────────────────────────────────────────────────────────

export interface Macros {
  calories: number;
  protein: number;        // grams
  carbohydrates: number;  // grams
  fat: number;            // grams
  fibre: number;          // grams
  netCarbs?: number;      // carbohydrates - fibre, for keto users
  isEstimated: boolean;   // true = Claude estimate, false = Spoonacular data
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
  title?: string; // 3-5 word summary, e.g., "Beat egg mixture"
  timer_minutes?: number | null;
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
  meal_types?: string[] | null; // ['dinner','lunch',...] — backfilled; drives Auto Plan slot fit
  meal_prep_friendly?: boolean;
  skill_level?: 'beginner' | 'home_cook' | 'confident_chef' | null;
  macros?: Macros | null;
  badge: RecipeBadge;
  submitted_by?: string | null;
  avg_rating: number;
  rating_count?: number;
  save_count: number;
  cook_count?: number;
  image_url: string | null;
  spoonacular_id?: string | null;
  external_id?: string | null;
  created_at?: string;
  // Set by fetchRecommendedDeck — the actual Supabase UUID before id is remapped to external_id.
  // Used by discover.tsx to log interactions without calling upsertRecipeByExternalId.
  supabase_id?: string;
  // True when this card was injected by the adventure card system (cuisine expansion).
  // Renders "✦ New for you" badge on the swipe card.
  isAdventure?: boolean;
  // True when this recipe is trending (many right swipes from other users recently).
  isTrending?: boolean;
  // Visibility + moderation gates for community submissions.
  is_public?: boolean;
  moderation_status?: ModerationStatus | null;
  // Joined from profiles via submitted_by — for "By @{name}" attribution on cards.
  submitter_name?: string | null;
  submitter_avatar?: string | null;
  submitter_username?: string | null;
}

// ─── Auto Plan (Mori+ flagship) ──────────────────────────────────────────────
// MealType (breakfast/lunch/dinner) is defined above and reused here — Auto Plan fills
// meal-plan slots, so its slot types match MealSlot. (recipes.meal_types is a separate
// string[] that may also include snack/dessert; the optimizer only checks membership.)

export type SlotProvenance = 'auto_plan' | 'sunday_drop' | 'manual';

/** A single planned slot produced by the week optimizer (lib/autoPlan.ts). */
export interface AutoPlanSlot {
  day: number;            // 0-based index into the planned week
  mealType: MealType;
  recipe: Recipe | null;  // null = no catalog fit; the endpoint may fill with <=1 generation
  provenance: SlotProvenance;
  explanation: string;    // short per-slot "why this"
  // The next-best ranked candidates for this slot (same meal type, excluding the pick),
  // capped small. Powers one-tap "swap to next best" in the review sheet. Not persisted.
  alternates?: Recipe[];
}

/** Inputs to the PURE week optimizer. The caller pre-filters the catalog for dietary rules. */
export interface AutoPlanInput {
  catalog: Recipe[];
  savedExternalIds: Set<string>;
  scoreFn: (recipe: Recipe) => number;  // taste score (scoreRecipe bound to the user)
  mealTypes: MealType[];                 // v1 = ['dinner']
  days: number;                          // e.g. 7
  weeklyBudgetUsd?: number | null;       // soft cap (+5% tolerance); null/undefined = ignore
  leftoversSet?: Set<string>;            // active leftover ingredient names, lowercased
  random: () => number;                  // injected RNG (Math.random in prod, seeded in tests)
}

export interface AutoPlanResult {
  slots: AutoPlanSlot[];
  generateNeeded: number;   // count of empty (recipe === null) slots
  totalCost: number;        // sum of cost_per_serving for filled slots
  overBudget: boolean;      // totalCost exceeded the base (pre-tolerance) budget
  explanation: string;      // one-paragraph "why these"
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  recipe_id: string;
  user_id: string;
  rating: number;
  review_text: string | null;
  photo_url?: string | null;
  created_at: string;
  updated_at: string;
  reviewer_name?: string | null;
  reviewer_username?: string | null;
  reviewer_avatar?: string | null;
}

export interface CreatorStats {
  right_swipes: number;
  left_swipes: number;
  saves: number;
  cooks: number;
  views: number;
  avg_rating: number;
  rating_count: number;
}

// ─── Recipe Notes ─────────────────────────────────────────────────────────────
export interface RecipeNote {
  id?: string;
  user_id?: string;
  recipe_id?: string;
  note_text: string | null;
  substitutions: string | null;
  tags: string[];
  make_again: 'yes' | 'with_changes' | 'no' | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Swipe ───────────────────────────────────────────────────────────────────

export interface SwipeEvent {
  id: string;
  user_id: string;
  recipe_id: string;
  direction: SwipeDirection;
  mode: AppMode;
  time_of_day: TimeOfDay | null;
  day_of_week: number | null;
  session_number: number | null;
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
  recipe_ids: string[];
  estimated_total_cost: number | null;
  combined_macros: Macros | null;
  instacart_cart_url: string | null;
  created_at: string;
}

// ─── Leftovers ───────────────────────────────────────────────────────────────

export interface UserLeftover {
  id: string;
  user_id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  added_at: string;
  storage_method: string;
  spoils_at: string;
  dismissed_at: string | null;
  extended_count: number;
}

// ─── Meal Plan ───────────────────────────────────────────────────────────────

export interface MealSlot {
  day: number; // 0-6
  meal_type: MealType;
  recipe_id: string;
  servings_multiplier: number;
  cooked_at?: string | null; // ISO timestamp when marked cooked; absent/null = not cooked
  // How this slot got filled. Absent/undefined = legacy/manual (the default before Auto Plan).
  // Load-bearing for the I9 dogfood gate (cooked-rate measured on auto_plan slots).
  provenance?: SlotProvenance;
  // Auto Plan's per-slot "why this" copy, e.g. "Uses your leftover spinach". Only set on
  // auto_plan / sunday_drop slots; rides the JSONB slots column (no migration).
  auto_explanation?: string | null;
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

// ─── Cohorts ─────────────────────────────────────────────────────────────────

export interface UserCohort {
  id: string;
  user_id: string;
  cohort_key: string;
  assigned_at: string;
}

export interface RecipeCohortAffinity {
  recipe_id: string;
  cohort_key: string;
  affinity_score: number;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingState {
  dietary_goals: string[];
  dietary_extra_preferences: string | null;
  ingredient_dislikes: string[];
  cuisine_preferences: string[];
  eating_style: EatingStyle | null;
  cooking_frequency: CookingFrequency | null;
  skill_level: SkillLevel | null;
  weekly_budget: string | null;
  pantry_staples: string[];
}
