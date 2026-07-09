-- Mise Database Schema — v1.3
-- Run this in the Supabase SQL Editor
-- Safe to re-run on a fresh project (drops and recreates all public tables)

-- ─── Tear down existing objects ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

DROP TABLE IF EXISTS recipe_cohort_affinities CASCADE;
DROP TABLE IF EXISTS user_cohorts CASCADE;
DROP TABLE IF EXISTS collections CASCADE;
DROP TABLE IF EXISTS meal_plans CASCADE;
DROP TABLE IF EXISTS grocery_lists CASCADE;
DROP TABLE IF EXISTS pantry_items CASCADE;
DROP TABLE IF EXISTS saved_recipes CASCADE;
DROP TABLE IF EXISTS swipe_events CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ─── Profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id uuid REFERENCES auth.users PRIMARY KEY,
  name text,
  avatar_url text,
  dietary_goals text[] DEFAULT '{}',
  dietary_extra_preferences text,
  ingredient_dislikes text[] DEFAULT '{}',
  cuisine_preferences text[] DEFAULT '{}',
  eating_style text CHECK (eating_style IN ('quick_simple', 'variety', 'favourites_rotation')),
  skill_level text CHECK (skill_level IN ('beginner', 'home_cook', 'confident_chef')),
  cooking_frequency text CHECK (cooking_frequency IN ('few_times_week', 'most_days', 'just_starting')),
  weekly_budget text,
  meals_cooked_count integer DEFAULT 0,
  recipes_submitted_count integer DEFAULT 0,
  total_sessions integer DEFAULT 0,
  taste_profile jsonb,
  onboarding_complete boolean DEFAULT false,
  email_verified_at timestamptz,
  email_verification_token uuid,
  email_verification_sent_at timestamptz,
  timezone text DEFAULT 'UTC', -- IANA zone for per-user local scheduling (Sunday Drop); see add-profiles-timezone-202606.sql
  plan_preferences jsonb, -- last-used Auto Plan tuning toggles; own column so taste_profile writers can't wipe it (add_profiles_plan_preferences)
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email_verification_token
  ON profiles(email_verification_token)
  WHERE email_verification_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_timezone_idx ON profiles (timezone);

-- Auto-create profile row on sign up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- A SECURITY DEFINER trigger fn fires in the table-owner context regardless of
-- EXECUTE grants, so clients never need to call it directly. Revoke the default
-- PUBLIC grant. (Folded from add-storage-trigger-hardening-202606.sql, applied 2026-06-02.)
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

-- Exclusive push-token claim — one device token lives on exactly one profile.
-- Strips the token from every other profile, then writes it to the caller
-- (auth.uid(), never caller-supplied). Without this, multi-account devices
-- receive crons for every profile they ever signed into.
-- (Folded from add-claim-push-token-202606.sql, applied 2026-06-10.)
CREATE OR REPLACE FUNCTION claim_push_token(p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_token IS NULL OR length(p_token) = 0 OR length(p_token) > 200 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  UPDATE profiles SET push_token = NULL  WHERE push_token = p_token AND id <> uid;
  UPDATE profiles SET push_token = p_token WHERE id = uid;
END $$;

REVOKE EXECUTE ON FUNCTION claim_push_token(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION claim_push_token(TEXT) TO authenticated;

-- ─── Recipes ──────────────────────────────────────────────────────────────────

CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  cuisine text,
  source_type text CHECK (source_type IN ('curated', 'community', 'imported')),
  ingredients jsonb NOT NULL DEFAULT '[]',
  steps jsonb NOT NULL DEFAULT '[]',
  prep_time_mins integer,
  cook_time_mins integer,
  servings integer,
  cost_per_serving numeric(6,2),
  dietary_tags text[] DEFAULT '{}',
  -- Meal-slot routing for the week optimizer; NULL = unclassified (backfill-meal-types.mjs)
  meal_types text[] CHECK (meal_types <@ ARRAY['breakfast','lunch','dinner','snack','dessert']::text[]),
  meal_prep_friendly boolean DEFAULT false,
  macros jsonb,
  badge text CHECK (badge IN ('none', 'staff_pick', 'community_verified', 'community_favorite')) DEFAULT 'none',
  submitted_by uuid REFERENCES profiles(id),
  avg_rating numeric(3,2) DEFAULT 0,
  rating_count integer DEFAULT 0,
  save_count integer DEFAULT 0,
  image_url text,
  spoonacular_id text,
  external_id text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

-- ─── Swipe Events ─────────────────────────────────────────────────────────────

CREATE TABLE swipe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  direction text CHECK (direction IN ('right', 'left')) NOT NULL,
  mode text CHECK (mode IN ('meal_prep', 'spontaneous')) NOT NULL,
  time_of_day text CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),
  session_number integer,
  swiped_at timestamp with time zone DEFAULT now()
);

-- ─── Saved Recipes ────────────────────────────────────────────────────────────

CREATE TABLE saved_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  liked boolean DEFAULT false,
  user_rating integer CHECK (user_rating BETWEEN 1 AND 5),
  saved_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, recipe_id)
);

-- ─── Pantry ───────────────────────────────────────────────────────────────────

CREATE TABLE pantry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  ingredient_name text NOT NULL,
  quantity numeric,
  unit text,
  added_via text CHECK (added_via IN ('onboarding', 'grocery_list', 'manual')),
  added_at timestamp with time zone DEFAULT now()
);

-- ─── Grocery Lists ────────────────────────────────────────────────────────────

CREATE TABLE grocery_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  list_type text CHECK (list_type IN ('weekly', 'spontaneous')) NOT NULL,
  status text CHECK (status IN ('active', 'exported', 'complete')) DEFAULT 'active',
  items jsonb NOT NULL DEFAULT '[]',
  recipe_ids uuid[] DEFAULT '{}',
  estimated_total_cost numeric(8,2),
  combined_macros jsonb,
  instacart_cart_url text,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Meal Plans ───────────────────────────────────────────────────────────────

CREATE TABLE meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  week_start_date date NOT NULL,
  is_public boolean DEFAULT false,
  slots jsonb DEFAULT '[]',
  created_at timestamp with time zone DEFAULT now(),
  -- One plan per (user, week) — enables idempotent saveMealPlan upserts and
  -- prevents duplicate week rows. Added via add_meal_plans_user_week_unique (2026-06-21).
  CONSTRAINT meal_plans_user_week_unique UNIQUE (user_id, week_start_date)
);

-- ─── Collections ──────────────────────────────────────────────────────────────

CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  name text NOT NULL,
  recipe_ids uuid[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

-- ─── User Cohorts ─────────────────────────────────────────────────────────────

CREATE TABLE user_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  cohort_key text NOT NULL,
  assigned_at timestamp with time zone DEFAULT now()
);

-- ─── Recipe Interactions (AI signal: views, grocery adds, cooks) ──────────────

CREATE TABLE recipe_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  interaction_type text CHECK (interaction_type IN ('view', 'grocery_add', 'cooked', 'unsave')) NOT NULL,
  session_number integer,
  interacted_at timestamp with time zone DEFAULT now()
);

-- ─── Recipe Cohort Affinities ─────────────────────────────────────────────────

CREATE TABLE recipe_cohort_affinities (
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  cohort_key text NOT NULL,
  affinity_score numeric(4,3),
  PRIMARY KEY (recipe_id, cohort_key)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_cohort_affinities ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Recipes: public rows readable by anyone; PRIVATE rows (is_public = false:
-- community drafts + saved pantry-generated recipes) readable only by their
-- owner. COALESCE treats NULL as public (legacy-safe). Applied to prod
-- 2026-07-05 (harden-recipes-select-202607.sql), behaviorally verified:
-- anon sees the full public catalog, anon cannot read private rows, owners can.
CREATE POLICY "Public recipes, or own private ones" ON recipes
  FOR SELECT USING (
    COALESCE(is_public, true) = true
    OR auth.uid() = submitted_by
  );
CREATE POLICY "Users can insert own recipes" ON recipes
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "Users can update own recipes" ON recipes
  FOR UPDATE USING (auth.uid() = submitted_by);

-- Swipe events
CREATE POLICY "Users can insert own swipes" ON swipe_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own swipes" ON swipe_events
  FOR SELECT USING (auth.uid() = user_id);

-- Saved recipes
CREATE POLICY "Users can manage own saved recipes" ON saved_recipes
  FOR ALL USING (auth.uid() = user_id);

-- Pantry
CREATE POLICY "Users can manage own pantry" ON pantry_items
  FOR ALL USING (auth.uid() = user_id);

-- Grocery lists
CREATE POLICY "Users can manage own grocery lists" ON grocery_lists
  FOR ALL USING (auth.uid() = user_id);

-- Meal plans
CREATE POLICY "Users can manage own meal plans" ON meal_plans
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view public meal plans" ON meal_plans
  FOR SELECT USING (is_public = true);

-- Collections
CREATE POLICY "Users can manage own collections" ON collections
  FOR ALL USING (auth.uid() = user_id);

-- Recipe interactions
CREATE POLICY "Users can insert own interactions" ON recipe_interactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own interactions" ON recipe_interactions
  FOR SELECT USING (auth.uid() = user_id);

-- User cohorts
CREATE POLICY "Users can view own cohorts" ON user_cohorts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cohorts" ON user_cohorts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Recipe cohort affinities: public read (used for cold-start recommendations)
CREATE POLICY "Anyone can view recipe cohort affinities" ON recipe_cohort_affinities
  FOR SELECT USING (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_swipe_events_user_id ON swipe_events(user_id);
CREATE INDEX idx_swipe_events_recipe_id ON swipe_events(recipe_id);
CREATE INDEX idx_saved_recipes_user_id ON saved_recipes(user_id);
CREATE INDEX idx_pantry_items_user_id ON pantry_items(user_id);
CREATE INDEX idx_grocery_lists_user_id ON grocery_lists(user_id);
CREATE INDEX idx_meal_plans_user_id ON meal_plans(user_id);
CREATE INDEX idx_recipes_cuisine ON recipes(cuisine);
CREATE INDEX IF NOT EXISTS recipes_meal_types_idx ON recipes USING GIN (meal_types);
CREATE INDEX idx_recipes_badge ON recipes(badge);
CREATE INDEX idx_recipes_external_id ON recipes(external_id);
CREATE INDEX idx_recipes_active ON recipes(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_cohorts_user_id ON user_cohorts(user_id);
CREATE INDEX idx_recipe_cohort_affinities_cohort ON recipe_cohort_affinities(cohort_key);
CREATE INDEX idx_recipe_interactions_user_id ON recipe_interactions(user_id);
CREATE INDEX idx_recipe_interactions_recipe_id ON recipe_interactions(recipe_id);
CREATE INDEX idx_recipe_interactions_type ON recipe_interactions(user_id, interaction_type);

-- ─── Waitlist ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  -- Cohort tag from the landing form (e.g. 'mori-plus-founders'). Was missing
  -- from prod until 2026-06-10 — every tagged signup 500'd; column added live.
  name       text,
  created_at timestamp with time zone default now()
);
