# Mori — Bug Fix Log

## 2026-04-05 (TestFlight Round 1)
- **Step titles on cards** — Added `title?` to `RecipeStep` type; `CookingMode` + `RecipeDetailModal` use AI-generated title with sentence-extraction fallback
- **Ingredient measure missing unit** — `discover.tsx` + `RecipeDetailModal.tsx` now show qty + unit (was qty only)
- **Ingredient pills on wrong cards** — Pills only render when card `isTop` (was showing on all stacked cards)
- **Pantry boost bug** — Removed 50-pt magic score boost; replaced with deck reorder surfacing top 3 pantry-matched recipes to front of deck
- **generate-recipe step titles** — `/api/generate-recipe` now enforces 3-5 word action verb `title` per step in prompt + JSON schema
- **Step title backfill** — Ran `backfill-step-titles.mjs` to add titles to all 1000 existing recipes in Supabase
