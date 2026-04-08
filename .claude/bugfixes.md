# Mori — Bug Fix Log

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
