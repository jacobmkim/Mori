# Mori — Bug Fix Log

## 2026-04-27 (Audit batch — high-severity security)
- **`waitlist` table had no RLS** — `ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY` (no policies → service-role only). Any signed-in client with the anon key could otherwise `select * from waitlist` and exfiltrate every signup email. Migration: `supabase/add-waitlist-rls.sql`.
- **`recipe_reviews` had no migration / RLS in repo** — created `supabase/add-recipe-reviews.sql` with public SELECT, INSERT scoped to `auth.uid() = user_id` AND a `cooked` interaction must exist for the recipe, UPDATE/DELETE owner-only, UNIQUE(recipe_id, user_id) to prevent multi-review spam.
- **`recipe_flags` had no migration / RLS in repo** — created `supabase/add-recipe-flags.sql` with INSERT scoped to `flagged_by = auth.uid()`, SELECT/DELETE owner-only. Closes the risk where `clearFlaggedRecipes()`'s `delete().not('id', 'is', null)` could wipe the global flag table.
- **`profiles` join exposure** — discover/reviews queries embedded `submitter:profiles!recipes_submitted_by_fkey(...)` which either silently returned null (broken feature) or relied on a permissive policy that exposed `taste_profile`, `weekly_budget`, `push_token`, `dietary_goals`, `last_cooked_date`. Fixed: `supabase/add-profiles-public-view.sql` creates a SECURITY DEFINER `profiles_public` view projecting only `id, name, username, avatar_url, recipes_submitted_count, meals_cooked_count`. Updated all 5 join sites in `lib/api.ts` to embed `profiles_public` instead of `profiles`. Migration also drops any non-baseline SELECT policy on `profiles`.
- **IDOR on `/api/macros`** — service-role `update().eq('id', supabaseId)` let any authenticated user overwrite any recipe's macros. Fixed in `api/macros.ts:saveMacrosToDB`: now reads the recipe first and only writes when (a) it's a curated recipe with no macros (legitimate backfill) or (b) the caller is the recipe's `submitted_by`.
- **`SEED_SECRET` accepted as cron auth fallback** — both `api/cron/streak-reminders.ts` and `api/cron/taste-notifications.ts` accepted either `CRON_SECRET` or `SEED_SECRET`. A leaked dev secret could trigger push-notification floods. Fixed: cron now requires `CRON_SECRET` only, with `timingSafeEqual` to avoid string-comparison timing leaks.
- **Sentry PII + Session Replay leak** — `app/_layout.tsx` had `sendDefaultPii: true`, `enableLogs: true`, and `mobileReplayIntegration()` recording 10% of sessions / 100% of errors. Replay captured rendered screens including bearer tokens in dev panes, taste profiles, names. Fixed: `sendDefaultPii: false`, replay disabled, `beforeSend` redacts `Authorization` and `Cookie` headers.
- **Deep-link substring match (reset-password phishing)** — `app/_layout.tsx` matched `mori://reset-password` anywhere in the URL via `String.includes`, so `https://evil.com?x=mori://reset-password#access_token=…` would route the user to the reset flow with attacker-controlled fragments. Fixed: `Linking.parse` + strict `scheme === 'mori' && hostname === 'reset-password'` check.
- **`savedStore` lost saves on cold start** — `partialize` only persisted `mealPrepIds`. Optimistic offline saves were lost on relaunch; if `loadSavedRecipes()` was slow, `isSaved()` returned false → duplicate optimistic insert + duplicate Supabase upsert. Fixed: persist `savedRecipes` and `_removedPositions` alongside `mealPrepIds`.
- **Image upload size/MIME validation** — `AddRecipeWizard.uploadImage` and `edit-profile.handlePickAvatar` both did `fetch(uri).blob()` then forced `contentType: 'image/jpeg'` regardless of actual type, with no size cap. A 20 MB HEIC ≈ 60 MB peak in JS memory → iOS app kill, plus egress-abuse vector. Fixed: new `lib/imageUpload.ts` `validateImageForUpload()` rejects empty/oversize blobs (5 MB recipes, 2 MB avatars), allowlists JPEG/PNG/WebP/HEIC, and returns the actual `contentType` for the upload.

## 2026-04-23 (Offline banner + dislike filter retroactive)
- **Offline detection** — installed `@react-native-community/netinfo`; `NetInfo.addEventListener` in `discover.tsx`; amber banner renders above header when `isConnected === false`, auto-hides on reconnect. No user action required.
- **Dislike filter not retroactive** — `ingredient_dislikes` was missing from the deck-load `useEffect` dependency array in `discover.tsx`. Added `ingredientDislikes` Zustand selector + added it to deps alongside `dietaryGoals`. Deck now reloads silently the moment dislikes are saved. Test coverage: `__tests__/lib/dislikeFilter.test.ts` (6 cases, `fetchScoredDeck` integration via supabase chain mock).

## 2026-04-23 (Sentry + Deck exhaustion + Security headers)
- **No prod error visibility** — installed `@sentry/react-native` + `@sentry/node`; `lib/sentry.ts` initializes on app boot (`_layout.tsx`), `api/_sentry.ts` exposes `captureException`; added to all 11 API catch blocks. Add `EXPO_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` env vars to activate.
- **Deck exhaustion blank screen** — `discover.tsx`: added `reloadKey` state wired to deck-load `useEffect`; split empty states into 3 branches: meal_prep empty → switch mode, spontaneous load failure → "Try Again" (resets `hasDeckRef` + spinner), deck exhausted → "Start Over" (reloads fresh deck).
- **Security headers audit item** — headers already present in `vercel.json` for all `/api/*` routes; marked resolved in CLAUDE.md.

## 2026-04-23 (InstacartButton dark mode + multi-unit qty)
- **InstacartButton icon invisible in dark mode** — always used `instacart-carrot.png` (green on dark `#003D29` bg); swapped source to `instacart-carrot-white.png` when `isDark` (`components/grocery/InstacartButton.tsx:45`)
- **Multi-unit combined qty drops second part** — `parseGroceryMeasurement` returned `parsed[0]` when units differed, losing the second recipe's quantity. Fixed: normalize metric → US first so same-class-different-notation parts sum correctly; when units are genuinely incompatible (e.g. cup + oz), return the dominant part by normalized magnitude instead of always the first (`lib/instacartUtils.ts`)

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
