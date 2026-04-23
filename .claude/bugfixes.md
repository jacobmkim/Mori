# Mori — Bug Fix Log

## 2026-04-23 (Instacart quantity fixes)
- **Instacart selecting 1 unit for proteins** — "4 salmon fillets" / "8 chicken thighs" sent as `{quantity: N, unit: 'each'}` which Instacart ignores for cart quantity. Fixed by running `normalize-ingredient-units.mjs` on all 1,294 metric recipes: Haiku converted count-based proteins to weight (salmon → 1.5 lb, chicken thighs → 2 lb). Instacart now calculates package count from weight.
- **"lemon 2 whole + 1 whole" not summing** — `unit: "whole"` missing from UNIT_MAP caused parse failure → raw string displayed and sent to Instacart. Fixed: added `whole: 'each', wholes: 'each'` to UNIT_MAP in `lib/instacartUtils.ts`. After re-adding recipes, lemons sum to 3 correctly.
- **Grocery list showing metric units in US mode** — stale AsyncStorage data from pre-normalization. Fix: clear grocery list and re-add; fresh DB data flows through `formatGroceryQuantity` with correct US units.

## 2026-04-23 (Leftover expiration — stop notifying on shelf-stable items)
- **Bogus 2-day expiration warnings on vinegar / spices / honey / dry goods** — `getIngredientStorageDays` in `lib/api.ts` returned only `days_fridge`; for room-temp-stable items that column is NULL, so `PostCookLeftoversModal` fell back to `DEFAULT_FRIDGE_DAYS = 4`, firing a 2-day warning almost immediately. Fixed: function now returns `days_fridge ?? days_room_temp ?? null` so honey gets 730 days, spices get 180-730, etc.
- **STAPLES expanded per USDA shelf-life standards** — added distilled/wine vinegars (indefinite), dry grains/pasta/rice/oats (2+ yr), dried legumes (indefinite), sweeteners (honey indefinite, syrups 1+ yr), extra oils (rapeseed/peanut/coconut/avocado, 1-2 yr), dry spices + seasoning blends (2-3 yr), spirits (indefinite), dry stock cubes / bouillon powder (2+ yr), non-food items (water variants, bamboo skewers, corn husks). Balsamic vinegar intentionally kept trackable (180-day fridge). Liquid stock & broth stay trackable (3-5 day spoilage, powers scorer bonus).
- **DB cleanup** — `supabase/fix-vinegar-leftovers.sql` deletes existing `user_leftovers` rows for new staples and drops 170 `ingredient_storage` rows so the backfill script won't re-add them. Ran against production. Legitimate tracked items (soy sauce, fish sauce, hot sauce, miso, gochujang, kimchi, mustard, ketchup, balsamic, stock/broth, coconut milk, tomato paste) preserved.

## 2026-04-16 (Leftovers feature + storage-tip fix)
- **storage-tip always returned 401** — client sent `{ ingredients: [] }` (array) but schema expected `{ ingredient: string }` (singular), and there was no `Authorization` header; fixed `StorageTipRequestSchema` to accept `ingredients: z.array(...)`, updated `api/storage-tip.ts` to concat, added `Bearer` token in `RecipeDetailModal.tsx` storage-tip fetch
- **storage-tip auth missing** — same fetch had no `Authorization` header, causing requireAuth to reject every call; now wraps fetch with `supabase.auth.getSession()` and attaches `Bearer ${session.access_token}` (`RecipeDetailModal.tsx`)
- **New: leftover tracking** — `user_leftovers` + `ingredient_storage` tables; `leftoversStore.ts` (Zustand + persist); `PostCookLeftoversModal` (post-cook checklist, staples filtered); `LeftoversReminderCard` (Discover top, spoil-date reminder with Yes/Used/Tossed); scorer bonus +2/match cap +10 in `scoreRecipe`

## 2026-04-12 (Phase 4 Bugs)
- **Grocery list not persisting across restarts** — `groceryStore` was plain Zustand with no persistence; added `persist` middleware with `createJSONStorage(() => AsyncStorage)`, partializing `list` and `selectedRecipes` only (`groceryStore.ts`)
- **Meal Prep sub-tab empty when in meal_prep mode** — `mealPrepList` filtered by `r.meal_prep_friendly` which is `null` for most recipes in DB; changed to show all saved recipes when `mode === 'meal_prep'`, and filter by `meal_prep_friendly` only in spontaneous mode (`recipes.tsx:291`)

## 2026-04-12 (Audit Bug Batch)
- **RecipeDetailModal crash on null ingredients** — `recipe.ingredients.length` threw when ingredients was null; changed to `(recipe.ingredients?.length ?? 0) > 0` (`RecipeDetailModal.tsx:250`)
- **mealPlanStore stale error banner** — `savePlan` set `error` on failure but never cleared it on success; added `error: null` to the success `set()` call (`mealPlanStore.ts`)
- **grocery-list silent image failure** — `recipe.image_url ?? ''` passed empty string to `expo-image` causing silent render failure; changed to `recipe.image_url ? { uri: recipe.image_url } : undefined` (`grocery-list.tsx:212`)
- **detailCache/macroCache memory leak** — both `useRef` Maps on Discover grew unbounded across deck reloads; added `clear()` calls at the top of the deck-load `useEffect` before `fetchScoredDeck` (`discover.tsx`)
- **savedStore race condition on rapid save/unsave** — `addRecipe` called `loadSavedRecipes()` after Supabase persist, which could overwrite in-flight `removeRecipe` optimistic updates; removed the reload, trusting the optimistic update (`savedStore.ts`)
- **discoverStore loadMode unhandled rejection** — `AsyncStorage.getItem` calls in `loadMode` had no try-catch; corrupted/unavailable storage would crash preference load; wrapped entire function in try-catch with silent fallback to defaults (`discoverStore.ts`)

## 2026-04-08
- **Recipe dedup FK constraint** — `clean-recipes.mjs` failed deleting 10 Indian + 2 Korean dupes due to `swipe_events_recipe_id_fkey`; fixed by cascade-deleting `swipe_events`, `saved_recipes`, `recipe_interactions`, `recipe_cohort_affinities` rows before recipe delete; 13 dupes removed, 6 dietary tags corrected, 609 curated recipes remain


- **Profile dark mode hardcoded hex** — Dev Tools section in `profile.tsx` had `#B00020` (text color) and `#FFCDD2` (border color) that broke dark mode; replaced with `colors.error` and `colors.errorBg` from theme

## 2026-04-07
- **NativeWind CSS interop crash on signin** — `babel.config.js` had `jsxImportSource: "nativewind"` and `_layout.tsx` imported `global.css`, activating `react-native-css-interop` for all JSX; it failed trying to wrap `SafeAreaProvider` (`displayName` undefined), throwing `TypeError` on every render of the account screen; fixed by removing both — project uses inline styles only
- **Keyboard covers password inputs** — `account.tsx` had no `KeyboardAvoidingView`; wrapped screen in `KeyboardAvoidingView` + `ScrollView` (buttons moved inside scroll) so inputs stay visible above keyboard; added `TouchableWithoutFeedback` → `Keyboard.dismiss` so tapping outside any input collapses the keyboard
- **Budget card clipped by AI notice on payoff screen** — absolute-positioned footer (AI disclosure + CTA button, ~184px tall) overlapped the last scroll card; `ScrollView` `paddingBottom` increased from 140 → 220 to clear it

## 2026-04-05 (TestFlight Round 5)
- **No undo for accidentally checked grocery item** — checking an unchecked item in the active list now shows "Moved to Done" undo banner for 5s; tapping Undo calls `toggleItem` to restore it; reuses existing `UndoBanner` component (added optional `message` prop); Done-section toggle stays unchanged

## 2026-04-05 (TestFlight Round 4)
- **Macros in servings sheet** — Added `MacroRow` (compact) + "Estimated · per serving" label inside the animated servings overlay; uses already-computed `scaledMacros` so values update live as user adjusts serving count
- **Remove from grocery on recipe card** — Footer button and ingredients tab "Add all" link now toggle: show "Remove from grocery" / "Remove from grocery list" in `colors.error` when `isInCart=true`; calls new `onRemoveFromCart` prop → `removeRecipeFromList(id)` wired in discover, recipes, explore
- **Ingredients tab "Add all" using stale setter** — Fixed `setShowServingsSheet(true)` → `openServingsSheet()` on ingredients tab link

## 2026-04-05 (TestFlight Round 3)
- **Add-to-grocery black card / does nothing** — `RecipeDetailModal` ServingsSheet was a nested `pageSheet` Modal inside a `fullScreen` Modal; on iOS this causes the sheet to render invisible and leaves the outer modal black on dismiss; replaced with an inline `Animated.View` overlay that slides up/down using spring/timing animations; also fixed missing `grocery_add` interaction log in `discover.tsx` `onAddToCart` callback

## 2026-04-05 (TestFlight Round 2)
- **Recipe position on re-save** — `savedStore` tracks removed positions; optimistic re-add inserts at original index; `loadSavedRecipes` re-applies positions after DB reload; `getSavedRecipesWithDetails` now orders by `saved_at ASC` for stable baseline
- **Odd-count grid tile** — Appends ghost `null` item in `recipes.tsx` FlatList when saved count is odd; real last tile stays half-width instead of stretching to full row
- **Add-to-grocery closes modal** — Removed `setDetailVisible/setShowDetail(false)` from `onAddToCart` in `recipes.tsx`, `explore.tsx`, `discover.tsx`; modal now stays open after adding
- **No servings prompt** — `RecipeDetailModal` footer + "Add all" link now open a `ServingsSheet` pageSheet with stepper before adding; discover deck green button opens `DeckServingsSheet` with same pattern; both scale ingredient quantities by servings ratio
- **"Added to grocery" toast moved into modal** — `groceryToast` state + toast View now live inside `RecipeDetailModal`; parent screens no longer manage toast state; button shows "In grocery list ✓" (non-interactive) once added

## 2026-04-05 (TestFlight Round 1)
- **Step titles on cards** — Added `title?` to `RecipeStep` type; `CookingMode` + `RecipeDetailModal` use AI-generated title with sentence-extraction fallback
- **Ingredient measure missing unit** — `discover.tsx` + `RecipeDetailModal.tsx` now show qty + unit (was qty only)
- **Ingredient pills on wrong cards** — Pills only render when card `isTop` (was showing on all stacked cards)
- **Pantry boost bug** — Removed 50-pt magic score boost; replaced with deck reorder surfacing top 3 pantry-matched recipes to front of deck
- **generate-recipe step titles** — `/api/generate-recipe` now enforces 3-5 word action verb `title` per step in prompt + JSON schema
- **Step title backfill** — Ran `backfill-step-titles.mjs` to add titles to all 1000 existing recipes in Supabase
