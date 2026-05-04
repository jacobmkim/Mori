-- Migration: account-deletion cleanup — Apple Guideline 5.1.1(v)
-- Run once in Supabase SQL Editor. Safe to re-run (uses IF EXISTS / DO blocks).
--
-- Goal: when a user is deleted from auth.users, every row that references
-- their user_id in our public schema gets cleaned up automatically. Today the
-- /api/delete-account function does explicit ordered deletes as defense-in-
-- depth — this migration makes that defense redundant by adding ON DELETE
-- CASCADE to every user-owned foreign key.
--
-- Tables handled: profiles, swipe_events, saved_recipes, pantry_items,
-- grocery_lists, meal_plans, collections, user_cohorts, recipe_interactions.
-- Tables added by later migrations (recipe_flags, recipe_reviews, recipe_notes,
-- user_leftovers) should declare CASCADE in their own migration files; this
-- migration only patches the original schema.sql tables.

-- Helper: drop a constraint if it exists, then add it with CASCADE.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- profiles → auth.users
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

  -- swipe_events → profiles
  ALTER TABLE swipe_events DROP CONSTRAINT IF EXISTS swipe_events_user_id_fkey;
  ALTER TABLE swipe_events
    ADD CONSTRAINT swipe_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- saved_recipes → profiles
  ALTER TABLE saved_recipes DROP CONSTRAINT IF EXISTS saved_recipes_user_id_fkey;
  ALTER TABLE saved_recipes
    ADD CONSTRAINT saved_recipes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- pantry_items → profiles
  ALTER TABLE pantry_items DROP CONSTRAINT IF EXISTS pantry_items_user_id_fkey;
  ALTER TABLE pantry_items
    ADD CONSTRAINT pantry_items_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- grocery_lists → profiles
  ALTER TABLE grocery_lists DROP CONSTRAINT IF EXISTS grocery_lists_user_id_fkey;
  ALTER TABLE grocery_lists
    ADD CONSTRAINT grocery_lists_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- meal_plans → profiles
  ALTER TABLE meal_plans DROP CONSTRAINT IF EXISTS meal_plans_user_id_fkey;
  ALTER TABLE meal_plans
    ADD CONSTRAINT meal_plans_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- collections → profiles
  ALTER TABLE collections DROP CONSTRAINT IF EXISTS collections_user_id_fkey;
  ALTER TABLE collections
    ADD CONSTRAINT collections_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- user_cohorts → profiles
  ALTER TABLE user_cohorts DROP CONSTRAINT IF EXISTS user_cohorts_user_id_fkey;
  ALTER TABLE user_cohorts
    ADD CONSTRAINT user_cohorts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- recipe_interactions → profiles
  ALTER TABLE recipe_interactions DROP CONSTRAINT IF EXISTS recipe_interactions_user_id_fkey;
  ALTER TABLE recipe_interactions
    ADD CONSTRAINT recipe_interactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

  -- recipes.submitted_by → profiles. SET NULL preserves the recipe row for
  -- other users who saved/cooked it; the /api/delete-account function also
  -- soft-deletes (sets deleted_at) so the recipe drops out of new discovery.
  ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_submitted_by_fkey;
  ALTER TABLE recipes
    ADD CONSTRAINT recipes_submitted_by_fkey
    FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE SET NULL;
END $$;
