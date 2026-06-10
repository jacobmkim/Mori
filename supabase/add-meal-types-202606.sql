-- ─── Meal-type tags for the Mori+ week optimizer (Track B1, 2026-06-10) ───────
--
-- The optimizer routes recipes into breakfast/lunch/dinner slots; only 8/2,618
-- recipes carried any meal-slot signal before this. Array (not single value)
-- because most savory mains are legitimately lunch AND dinner.
-- NULL = not yet classified (the backfill's resume filter). The CHECK lets
-- NULL through (SQL three-valued logic) but pins any written value to the enum.
--
-- Backfill: node scripts/backfill-meal-types.mjs  (Haiku classifier, resume-safe)

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS meal_types text[]
  CHECK (meal_types <@ ARRAY['breakfast','lunch','dinner','snack','dessert']::text[]);

-- GIN index: the optimizer filters candidate pools with `meal_types @> '{dinner}'`.
CREATE INDEX IF NOT EXISTS recipes_meal_types_idx ON recipes USING GIN (meal_types);
