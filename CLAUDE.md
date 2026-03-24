# Mise — CLAUDE.md
> This file is the single source of truth for this project. Read it in full at the start of every session before writing any code. It reflects the actual current build state as of the latest update.

---

## 1. What We Are Building

**Mise** is a smart recipe discovery and grocery delivery app powered by personalised recommendations. The name comes from *mise en place* — the chef's practice of having everything prepared and in its place before cooking begins. The app does exactly that for everyday home cooks.

**Core loop:**
A local weighted scoring engine ranks recipes personalised to the user's taste, goals, and behaviour → user swipes yes or no on recipe cards → recipes save to personal library → user selects meals and builds a smart grocery list → list is sent to Instacart in one tap or copied to clipboard as a fallback.

**Note on delivery:** Mise uses the Instacart Developer Platform API — not a full logistics partnership. The grocery list is sent to Instacart as a pre-built cart and the user completes checkout inside the Instacart app. Mise earns affiliate commissions through Impact on every attributed order. DoorDash and Uber Eats full API integration remain out of scope.

**Value proposition:**
Mise is the first recipe app that feels genuinely personal from day one, gets smarter every session, surfaces simple macros for health-conscious users, and removes the biggest friction in home cooking — the gap between "what should I make?" and a grocery list ready to order. It does not try to control your oven, partner with appliance brands, or replace Instacart. It connects your taste, your pantry, and your week into a smart list that makes cooking feel like the easier choice.

**Competitive position:**
No competitor has a swipe-based discovery mechanic. Samsung Food (most formidable competitor) has 218,500+ recipes, 4.5M community members, and delivery from 23 retailers — but it is overwhelming and tied to Samsung hardware. Ollie owns AI family meal planning. Mealime owns quick weeknight dinners. Mise owns the exploratory everyday cook who wants to discover something new and get from "that looks good" to groceries ordered in one tap. Community (Phase 4–5) is a retention flywheel, not the primary differentiator.

---

## 2. Current Build State

> **Read this section first every session.** Phases 1, 2, and 2.5 are complete. Phase 3 (Instacart) is next — waiting on Instacart Developer Platform approval.

### ✅ Built and Working

**Foundation**
- Expo SDK 54 / React Native 0.81.5 / Expo Router
- Supabase auth — email sign in/sign up
- Supabase schema applied — all tables, RLS, indexes, auto-profile trigger live
- Bottom tab navigation — Discover, Recipes, Grocery List, Profile
- constants/theme.ts, types/index.ts, lib/supabase.ts, lib/api.ts, lib/utils.ts, lib/mealdb.ts

**Onboarding — 10 screens complete**
- welcome → dietary-goals (with free text field) → ingredient-dislikes → cuisine-prefs (12 universal) → eating-style → cook-frequency → skill-level → budget → account → payoff (pantry staple seed)
- All fields persisted to Supabase on account creation
- onboarding_complete: true set on payoff; pantry staples written to pantry_items

**Discover Screen**
- Full swipe mechanic — React Native Animated API, undo, button-tap swipe, stale closure prevention
- Deck sourced from Supabase recipes table (single query, 400 rows) — 30-min in-memory cache keyed by sorted dietary goals
- **Local weighted scorer** (`fetchScoredDeck`) ranks the deck on-device — no API call, no latency
- Dietary filtering: vegan/vegetarian exclude all meat; pescatarian excludes land meat only; desserts always excluded
- Ingredient dislike hard filter — recipes with disliked ingredients removed before scoring
- Skill level hard cap — beginner ≤60 min, home_cook ≤120 min, confident_chef sees all
- Diversity constraint post-sort — maxPerCuisine=3 for variety users, 5 for others
- Graceful fallback cascade — relaxes diversity then skill filter if deck too small (never relaxes dislikes/dietary)
- Pantry specificity weighting — common staples worth 0.2 vs 1.0 in match scoring
- First session pantry boost — +50 for full pantry match when total_sessions ≤ 1
- Session swipe tracking — in-memory Sets prevent left-swiped/shown cards reappearing within session
- HeadlineMacroPill on top card AND next card (stackIndex=1) — instant display via local estimator
- Every swipe logged to `swipe_events` via fire-and-forget
- Recipe views logged to `recipe_interactions` (interaction_type: 'view')
- Grocery cart button: logs grocery_add, sets liked=true, auto-swipes right
- "Mark as cooked" button on RecipeDetailModal — logs cooked interaction
- **Adventure cards** — niche cuisine at deck position 6, gated on skill+swipe ratio, cooldown, adjacency map, "✦ New for you" amber badge
- **"Made before" banner** — green pill on previously-cooked cards for cross-session re-rating
- Dev flag button in action bar (`__DEV__` only)
- clearDiscoverCache() + clearSessionState() called on preference save / new deck load

**Recipes Screen**
- Pinterest grid — Saved / All / Plan tabs (3-way segmented control)
- Filter dropdown (Type + Cuisine, OR/AND logic), collections bar, search bar
- **Weekly meal planner** — Plan tab, 7-day × 3 meal type grid (Mon–Sun, Breakfast/Lunch/Dinner), recipe picker, "Add all to grocery" (deduped), Supabase-backed
- Grocery adds and views logged to recipe_interactions

**Grocery List Screen**
- Tally header: meals, items, estimated cost, combined macros
- Ingredients grouped by category (Produce, Meat & Seafood, Dairy, Pantry, Frozen, Other)
- Checkboxes, edit mode, undo (batch + single item delete)
- Copy-to-clipboard export (formatted plain text)

**Recipe Detail Modal**
- Slide-up pageSheet — Save + Add to Grocery wired
- **Ingredients / Instructions tab switcher** — pill tab bar, resets to Ingredients on open
- Step-by-step instructions — numbered green circle badges, parsed from TheMealDB strInstructions
- MacroRow wired — full 4-col macros (calories, protein, carbs, fat) with per-serving scaling
- Serving size adjuster — increment/decrement buttons scale macros proportionally
- "Mark as cooked" button — logs cooked interaction, toggles green state within session
- Post-cook 5-star rating — appears after marking as cooked, persists to saved_recipes.user_rating
- Storage tips — auto-fetches from `/api/storage-tip` (Claude Haiku) after marking cooked
- "Values are estimates and may vary" disclaimer beneath macros
- Dev flag button — red flag icon (top-left, `__DEV__` only), 6 preset reasons, AsyncStorage-backed

**Profile Screen**
- Avatar, name, Recipes Saved stat wired to savedStore, preferences display, sign out
- Edit Preferences modal — conflict warnings for incompatible goals
- clearDiscoverCache() + clearRecipeCache() called on preference save
- **Taste Profile card** — Claude Haiku generated via `/api/taste-profile`, cached in DB. Shows "not enough data" if <5 swipes.
- **My Pantry card** — PantryModal (add/delete items, source tags)
- **Discover Settings** — "Keep it familiar" toggle for adventure cards (AsyncStorage-backed)
- Dev Tools section (`__DEV__` only) — flagged recipe count, view/clear buttons

**Saved Recipes**
- savedStore wired to Supabase — persists across sessions

**Stores**
- userStore ✅, savedStore ✅ (Supabase-backed), groceryStore ✅ (full), collectionsStore ✅, mealPlanStore ✅ (Supabase-backed)

**Data / Seed**
- 419 TheMealDB recipes seeded in Supabase with cohort affinity scores (248,886 rows)
- All 419 recipes backfilled with full ingredients, steps, descriptions, and macros
- Lazy macro persistence — Claude estimate written to recipes.macros once, served to all users thereafter
- MacroRow component (full + compact), HeadlineMacroPill, estimateMacrosLocally — components/ui/MacroRow.tsx
- MiseLogo component — components/ui/MiseLogo.tsx

**Vercel — Deployed and Live**
- `/api/macros` — Claude Haiku estimates macros from ingredients list (Spoonacular removed)
- `/api/recommendations` — built but not used (local scorer used instead)
- `/api/taste-profile` — Claude Haiku generates taste profile paragraph, saves to profiles.taste_profile
- `/api/generate-recipe` — Claude Haiku generates recipes with Jaccard similarity guard (409 on duplicate)
- `/api/storage-tip` — Claude Haiku generates storage/usage tips after cooking

**Tracking / AI Signal Collection**
- `swipe_events` — every swipe logged (direction, mode, time_of_day, day_of_week, session_number)
- `recipe_interactions` — views, grocery_adds, and cooked logged from Discover and Recipes screens

---

### ❌ Not Yet Built — Remaining Scope

| # | Feature | Phase |
|---|---|---|
| 1 | Run `tag-meal-prep-recipes.mjs` to populate `meal_prep_friendly` on all 419 recipes | Pre-release |
| 2 | "Order on Instacart" button + /api/instacart-cart | Phase 3 |
| 3 | Impact affiliate tracking | Phase 3 |
| 4 | Grocery list history view | Phase 3 |
| 5 | Recipe submission form | Phase 4 |
| 6 | /api/check-recipe AI checker + badge system | Phase 4 |
| 7 | Public ratings and community explore page | Phase 4 |
| 8 | Follow system + community feed | Phase 5 |
| 9 | Public meal plans with AI adaptation | Phase 5 |
| 10 | Grocery add scepticism scoring | Post-launch |

### ⚠️ Pre-Launch Required (Admin Tasks)
- **Apple Developer account** ($99/year) — apply now, 24-48hrs to process. Required before any App Store or TestFlight submission.
- **Apple AI transparency disclosure** — Apple requires explicit disclosure that user data is sent to Claude (Anthropic) for taste profile generation and macro estimation. Must be in privacy policy and surfaced in-app before submission.
- **TestFlight internal testing** — test on real devices before any external beta. No placeholder content, no crashes.

---

## 3. Tech Stack — Actual

| Layer | Technology | Status |
|---|---|---|
| Mobile Framework | React Native 0.81.5 with Expo SDK 54 | ✅ Live |
| Navigation | Expo Router (file-based routing) | ✅ Live |
| Backend & Auth | Supabase | ✅ Auth live, schema applied, all tables live |
| Animations | **React Native Animated API** (not Reanimated) | ✅ Live — do not refactor |
| Icons | **Ionicons** (via Expo Vector Icons package) | ✅ Live |
| Image Handling | expo-image | ✅ Live |
| Styling | **Inline styles + constants/theme.ts** (NativeWind installed but not used) | ✅ Live — do not refactor |
| State Management | Zustand | ✅ Live |
| Recipe Seed Data | TheMealDB + Supabase (419 recipes, steps, macros all backfilled) | ✅ Live |
| Nutrition / Macro Data | **Claude Haiku via /api/macros** — estimates from ingredients list | ✅ Live — Spoonacular removed |
| Recommendation Engine | **Local weighted scorer** (on-device, lib/api.ts) | ✅ Live — no API cost, no latency |
| Serverless Functions | Vercel | ✅ Deployed |
| AI — Taste Profile | Claude Haiku via /api/taste-profile | ✅ Live |
| AI — Recipe Gen | Claude Haiku via /api/generate-recipe | ✅ Live |
| AI — Storage Tips | Claude Haiku via /api/storage-tip | ✅ Live |
| AI — Deck Ranking | **Not used** — replaced by local weighted scorer | Intentional — see Key Decisions |
| Grocery Export — Primary | Instacart Developer Platform API | 🔲 Phase 3 |
| Grocery Export — Fallback | Copy/paste plain text | ✅ Live |
| Affiliate Tracking | Impact (Instacart affiliate program) | 🔲 Phase 3 |

### ⚠️ Do Not Refactor These
- **React Native Animated API** — swipe animation is complex, well-built, working. Do not migrate to Reanimated.
- **Inline styles + theme.ts** — NativeWind not in use. Do not migrate.
- **fetchScoredDeck** — the local weighted scorer is the recommendation engine. Do not replace with an API call.

---

## 4. Project Structure — Actual

```
mise/
├── app/
│   ├── _layout.tsx                    ✅ Root layout, session check, total_sessions increment
│   ├── index.tsx                      ✅ Redirects to onboarding or tabs; loads savedStore on session restore
│   ├── onboarding/
│   │   ├── _layout.tsx                ✅
│   │   ├── welcome.tsx                ✅ Screen 1
│   │   ├── dietary-goals.tsx          ✅ Screen 2 — tile grid + optional free text field
│   │   ├── ingredient-dislikes.tsx    ✅ Screen 3 — searchable tap-to-add, pre-populated chips
│   │   ├── cuisine-prefs.tsx          ✅ Screen 4 — 12 universal cuisines only
│   │   ├── eating-style.tsx           ✅ Screen 5 — 3 large visual tap cards
│   │   ├── cook-frequency.tsx         ✅ Screen 6
│   │   ├── skill-level.tsx            ✅ Screen 7
│   │   ├── budget.tsx                 ✅ Screen 8
│   │   ├── account.tsx                ✅ Screen 9 — email/password, saves all onboarding fields
│   │   └── payoff.tsx                 ✅ Screen 10 — pantry staple tap grid, writes pantry_items
│   └── (tabs)/
│       ├── _layout.tsx                ✅ Tab navigator
│       ├── discover.tsx               ✅ Full swipe mechanic, fetchScoredDeck, dietary filtering,
│       │                                 swipe logging, interaction logging, macro pills,
│       │                                 RecipeDetailModal, mark as cooked, adventure cards,
│       │                                 "Made before" badge, session swipe tracking, dev flag
│       ├── recipes.tsx                ✅ Pinterest grid, Saved/All/Plan tabs, filter dropdown,
│       │                                 collections bar, interaction logging, RecipeDetailModal,
│       │                                 MealPlanView (weekly 7×3 grid, recipe picker, grocery add)
│       ├── grocery-list.tsx           ✅ Tally header, grouped categories, checkboxes,
│       │                                 edit mode, undo, copy-to-clipboard export
│       └── profile.tsx                ✅ Stats, taste profile card, preferences, edit modal,
│                                         sign out, PantryModal, adventure cards toggle, dev tools
├── components/
│   ├── cards/
│   │   ├── RecipeCard.tsx             ✅ Swipeable card with HeadlineMacroPill
│   │   └── RecipeGridCard.tsx         ✅ Pinterest grid card
│   ├── onboarding/
│   │   ├── GoalTile.tsx               ✅
│   │   ├── CuisineCard.tsx            ✅
│   │   └── ProgressBar.tsx            ✅
│   ├── grocery/
│   │   └── InstacartButton.tsx        🔲 Phase 3
│   ├── RecipeDetailModal.tsx          ✅ Ingredients/Instructions tabs, MacroRow, serving adjuster,
│   │                                     mark as cooked, post-cook rating, storage tips, dev flag
│   └── ui/
│       ├── MacroRow.tsx               ✅ MacroRow (full 4-col), HeadlineMacroPill (goal-aware),
│       │                                 estimateMacrosLocally (instant local estimate)
│       └── MiseLogo.tsx               ✅
├── lib/
│   ├── supabase.ts                    ✅
│   ├── api.ts                         ✅ All DB calls + local recommendation scorer:
│   │                                     fetchDiscoverRecipes / fetchScoredDeck
│   │                                     scoreRecipe — all signals including pantry, session penalty
│   │                                     recordSessionSwipe / clearSessionState
│   │                                     recordAdventureCardLeftSwipe
│   │                                     getAdventureCardsEnabled / setAdventureCardsEnabled
│   │                                     getCookedRecipeIds / rateRecipe
│   │                                     getMealPlanForWeek / saveMealPlan
│   │                                     getRecipesBySupabaseIds
│   │                                     getPantryItems / addPantryItem / deletePantryItem
│   │                                     logSwipe / logInteraction / fetchMacros
│   │                                     saveRecipe / removeRecipe / getSavedRecipes
│   │                                     upsertProfile / patchProfile / resolveSupabaseId
│   ├── mealdb.ts                      ✅ fetchMealDBRecipes, fetchMealDetail, shouldExclude, clearRecipeCache
│   └── utils.ts                       ✅ formatTime, formatCost, capitalize, getWeekStart, getTimeOfDay
├── hooks/
│   └── useTheme.ts                    ✅ Returns correct theme (light/dark × spontaneous/meal_prep)
├── stores/
│   ├── userStore.ts                   ✅
│   ├── savedStore.ts                  ✅ Supabase-backed
│   ├── groceryStore.ts                ✅ full
│   ├── collectionsStore.ts            ✅ FAVORITES_ID + custom collections
│   ├── mealPlanStore.ts               ✅ loadPlan/savePlan async, Supabase-backed
│   └── discoverStore.ts               ✅ mode ('spontaneous'|'meal_prep'), AsyncStorage-persisted
├── types/
│   └── index.ts                       ✅ All types including supabase_id?: string on Recipe
├── constants/
│   └── theme.ts                       ✅
├── api/
│   ├── macros.ts                      ✅ Vercel fn — Claude Haiku estimates from ingredients
│   ├── recommendations.ts             ✅ Vercel fn — built, not used for deck ranking
│   ├── taste-profile.ts               ✅ Vercel fn
│   ├── generate-recipe.ts             ✅ Vercel fn
│   ├── storage-tip.ts                 ✅ Vercel fn
│   └── seed-recipes.ts                ✅ Vercel fn — already ran, do not re-run
├── scripts/
│   ├── seed-recipes.mjs               ✅ One-time (already ran — do not re-run)
│   ├── backfill-recipe-details.mjs    ✅ Safe to re-run, skips populated
│   ├── backfill-macros.mjs            ✅ Claude Haiku macro estimation — all 419 recipes done
│   ├── backfill-steps.mjs             ✅ TheMealDB strInstructions → parsed steps — 419/419 done
│   ├── tag-meal-prep-recipes.mjs      🔲 Run once before release — tags all 419 recipes
│   ├── generate-recipes.mjs           ✅ Bulk recipe generator
│   └── clean-recipes.mjs              ✅ Jaccard dedup + Haiku tag validation
├── supabase/
│   └── schema.sql                     ✅ Full schema
└── README.md                          ✅ Full setup guide
```

---

## 5. Design System

### Theme Architecture

Mise has four theme states. Use the `useTheme()` hook to get the correct theme everywhere — never import a static color object directly from theme.ts.

```typescript
// hooks/useTheme.ts
import { useColorScheme } from 'react-native'
import { useDiscoverStore } from '../stores/discoverStore'
import { lightTheme, darkTheme, mealPrepLightTheme, mealPrepDarkTheme } from '../constants/theme'

export function useTheme() {
  const colorScheme = useColorScheme()
  const isMealPrep = useDiscoverStore(s => s.mode === 'meal_prep')
  const isDark = colorScheme === 'dark'

  if (isMealPrep && isDark)  return mealPrepDarkTheme
  if (isMealPrep && !isDark) return mealPrepLightTheme
  if (isDark)                return darkTheme
  return lightTheme
}
```

Every component calls `const colors = useTheme()` — all four states handled automatically.

---

### Spontaneous Light (default)
Fresh, light, exploratory — everyday discovery energy.

```typescript
export const lightTheme = {
  primary:      '#2E7D32',   // Forest green
  primaryLight: '#E8F5E9',   // Light green tint
  primaryDark:  '#1B5E20',   // Pressed state
  background:   '#F9F9F9',   // Near white
  card:         '#FFFFFF',
  text:         '#1A1A1A',
  textMuted:    '#666666',
  border:       '#E0E0E0',
  tabBar:       '#FFFFFF',
  tabBorder:    '#E0E0E0',
  error:        '#D32F2F',
  swipeRight:   '#2E7D32',
  swipeLeft:    '#D32F2F',
  white:        '#FFFFFF',
}
```

### Spontaneous Dark
Same brand, near-black background, brighter green for contrast on dark surfaces.

```typescript
export const darkTheme = {
  primary:      '#4CAF50',   // Brighter green — readable on dark
  primaryLight: '#1B2E1C',   // Dark green tint
  primaryDark:  '#2E7D32',   // Original green as dark variant
  background:   '#0D0D0D',   // Near black (not pure — easier on eyes)
  card:         '#1A1A1A',
  text:         '#F0EDE6',   // Warm off-white
  textMuted:    '#9E9E9E',
  border:       '#2C2C2C',
  tabBar:       '#111111',
  tabBorder:    '#2C2C2C',
  error:        '#EF5350',   // Brighter red on dark
  swipeRight:   '#4CAF50',
  swipeLeft:    '#EF5350',
  white:        '#FFFFFF',
}
```

### Meal Prep Light — Linen & Moss ✦
Warm linen background, deep moss green — feels like a premium cookbook or a well-equipped kitchen. Intentional, grounded, Sunday prep energy. The warm tones contrast clearly with the cool spontaneous palette so users immediately feel the mode shift.

```typescript
export const mealPrepLightTheme = {
  primary:      '#2E5438',   // Deep moss green
  primaryLight: '#E0EDD8',   // Soft sage tint
  primaryDark:  '#1A3820',   // Pressed state
  background:   '#F8F3EC',   // Warm linen
  card:         '#FFFFFF',   // Pure white cards on linen bg
  text:         '#1A1408',   // Warm near-black
  textMuted:    '#5A5040',   // Warm grey-brown
  border:       '#D8CCBC',   // Warm divider
  tabBar:       '#F0E8DC',   // Deeper linen — ties the screen together
  tabBorder:    '#D8CCBC',
  toggleBg:     '#EDE5D8',   // Toasted linen for mode toggle
  weekBarBg:    '#E0EDD8',   // Sage fill for week progress bar
  dayFilled:    '#2E5438',   // Moss dot — planned days
  dayEmpty:     '#B8D0B0',   // Pale sage — unplanned days
  error:        '#D32F2F',
  swipeRight:   '#2E5438',
  swipeLeft:    '#D32F2F',
  white:        '#FFFFFF',
}
```

### Meal Prep Dark
Deep forest green background, bright green accents — the most premium looking of the four states. Rich and focused.

```typescript
export const mealPrepDarkTheme = {
  primary:      '#4CAF50',   // Bright green — pops on dark forest bg
  primaryLight: '#1A3028',   // Dark green tint
  primaryDark:  '#2E7D32',
  background:   '#0F1F1A',   // Deep forest — green-tinted dark
  card:         '#1E2E28',   // Dark green-tinted card surface
  text:         '#F0EDE6',   // Warm off-white
  textMuted:    '#8AAB9E',
  border:       '#2A3D35',
  tabBar:       '#0A1610',
  tabBorder:    '#2A3D35',
  toggleBg:     '#1A3028',
  weekBarBg:    '#1A3028',
  dayFilled:    '#4CAF50',
  dayEmpty:     '#2A4038',
  error:        '#EF5350',
  swipeRight:   '#4CAF50',
  swipeLeft:    '#EF5350',
  white:        '#FFFFFF',
}
```

---

### Typography
- Font: System default (SF Pro on iOS)
- Headings: Bold, sizes 28 / 24 / 20 / 18
- Body: Regular, size 16
- Caption: Regular, size 13, color textMuted

### Spacing
Multiples of 4: 4, 8, 12, 16, 20, 24, 32, 48

### Border Radius
Cards: 16px — Buttons: 12px — Pills/Tags: 999px — Tiles: 12px

### Mode Transition
When the user switches between Spontaneous and Meal Prep, animate the background and tab bar with a 300ms fade. The shift should feel deliberate and satisfying — not instant, not slow.

---

## 6. Core Features — Detailed Behaviour

### 6.1 Two App Modes

A pill toggle at the top of the Discover screen switches between modes. Persists to AsyncStorage.

**Spontaneous Mode** (default)
- Tight 5-8 card stack, highly contextual
- Time-aware, pantry-aware, swipe-history-aware
- Right swipe saves to library
- Stack refreshes when low
- Same-day delivery option via Instacart (Phase 3)

**Meal Prep Mode** (Phase 2.5)
- Longer 20-30 card stack — enough to fill a full week
- Deck weighted toward `meal_prep_friendly` recipes (+8 score boost)
- Recipes that don't reheat well are penalised (-10)
- Right swipe triggers slot picker — lightweight bottom sheet with 7-day × 3 meal-type grid
- User assigns recipe to a day/meal slot + sets servings (1x/2x/3x) before confirming
- Week progress indicator at bottom of screen: "3 of 7 days planned"
- Grocery list built from Meal Prep mode shows full week consolidated view with week summary header
- All swipes logged with `mode: 'meal_prep'` for scorer signal separation

### 6.2 Onboarding Flow — 10 Screens (all complete)

| # | Screen | Status |
|---|---|---|
| 1 | Welcome | ✅ |
| 2 | Dietary Goals + free text field | ✅ |
| 3 | Ingredient Dislikes — hard filter enforced | ✅ |
| 4 | Cuisine Preferences (12 universal) | ✅ |
| 5 | Eating Style | ✅ |
| 6 | Cooking Frequency | ✅ |
| 7 | Skill Level | ✅ |
| 8 | Budget | ✅ |
| 9 | Account Creation | ✅ |
| 10 | Payoff + Pantry Seed | ✅ |

**Screen 3 — Ingredient Dislikes:**
Hard filters enforced in `fetchScoredDeck` before scoring. Any recipe containing a disliked ingredient is removed entirely — never soft-deprioritised.

**Screen 4 — Cuisine Preferences:**
12 universal cuisines only: Italian, Mexican, Chinese, Japanese, Indian, American, Mediterranean, Thai, French, Greek, Korean, Middle Eastern. Do NOT add niche cuisines — they are surfaced as adventure cards.

**Screen 5 — Eating Style:**
- "Quick and simple" → boosts ≤30 min recipes
- "Variety is everything" → diversity constraint post-sort (maxPerCuisine=3)
- "Favourites rotation" → surfaces familiar cuisines

### 6.3 Swipe Experience
Every swipe logged to Supabase immediately — non-negotiable scorer training data.

### 6.4 Macros
- **On swipe cards:** One headline macro based on primary dietary goal. Nothing shown if no relevant goal.
- **On recipe detail:** Full MacroRow — calories, protein, carbs, fat. Per serving / full batch toggle.
- **Disclaimer:** "Values are estimates and may vary" beneath all macro displays.
- **Source:** Claude Haiku estimates macros from the recipe's ingredients list via `/api/macros`. Results written to `recipes.macros` once and served from Supabase permanently. Spoonacular removed — Claude is accurate enough for a discovery app where macros are directional signals, not precise dietary logs. All values `isEstimated: true`.

### 6.5 Recipe Library
Pinterest grid. Saved / All / Plan tabs. Plan tab shows weekly meal planner (7-day × 3 grid). Badge types: Staff Pick, Community Verified, Community Favorite.

### 6.6 Grocery List
Tally header → grouped by category → checkboxes → copy to clipboard. Instacart button Phase 3.

### 6.7 Pantry Tracking (Low Stakes, Opt-In)
Not a main tab. Seeded during onboarding payoff. Manual edit in Profile → My Pantry. Feeds pantry specificity-weighted scoring — common staples worth 0.2 vs 1.0.

### 6.8 Adventure Cards — Skill-Aware Cuisine Expansion
- Only `home_cook` and `confident_chef` — never `beginner`
- Gate: ≥20 swipes AND ≥8 right swipes AND ≥30% right-swipe ratio — all three required
- Cuisine by adjacency: Italian → Greek/Moroccan | Korean → Vietnamese/Thai | Mexican → Peruvian/Caribbean
- "✦ New for you" amber badge, left-swipe cooldown (10 swipes), "Keep it familiar" toggle in Profile

---

## 7. Recommendation Engine — Local Weighted Scorer

### Why Local Scorer Instead of Claude API
Claude Sonnet was built and tested in `/api/recommendations`. It returned 0 results because LLMs cannot reliably reproduce UUIDs. Local scorer solves this: zero latency, zero cost, fully debuggable, no UUID problem.

### When Claude Is Still Used
- **Taste profile** — Claude Haiku reads swipe history, writes 2-3 sentence paragraph
- **Macro estimation** — Claude Haiku estimates from ingredients list. `isEstimated: true` always. No Spoonacular.
- **Recipe generation** — Claude Haiku generates new recipes for the seed database
- **Storage tips** — Claude Haiku generates post-cook storage/usage tips

### Scoring Formula
```
score = session_penalty (-999 if shown/left-swiped this session)
      + random_jitter (0–0.5)
      + cohort_affinity × 4           // cold-start baseline (248,886 affinity rows)
      + cuisine_match × 3
      + macro_verified_goal × 10      // protein≥25g, keto netCarbs≤10, etc.
      + tag_only_goal × 5             // fallback when macros not available
      + quick_simple_bonus × 2        // eating_style=quick_simple AND ≤30 min
      - quick_simple_penalty × 2      // eating_style=quick_simple AND >45 min
      + right_swipe × 5 × decay       // decay = e^(-days/30)
      - left_swipe × 15 × decay
      + Math.min(grocery_add_count, 2) × 3    // CAPPED at 2
      + Math.min(cooked_count, 2) × 4         // CAPPED at 2
      - saved × 3
      + pantry_match_ratio × 20       // specificity-weighted (staples=0.2, others=1.0)
      + first_session_full_match × 50 // total_sessions ≤ 1 AND pantry ratio = 1.0
```

Decay: `Math.exp(-daysSince / 30)` — Today=1.0, 30 days ago=0.37, 90 days ago=0.05

### Signal Hierarchy (strongest → weakest)
1. `recipe_interactions.cooked` — explicit cook (capped at 2)
2. `recipe_interactions.grocery_add` — repeated listing (capped at 2)
3. `swipe_events.right` with 30-day decay
4. `recipe_cohort_affinities.affinity_score` — cold-start baseline
5. Cuisine + macro-verified goal match
6. `swipe_events.left` with 30-day decay
7. `saved_recipes` — soft deprioritisation

---

## 8. Scorer Edge Cases — All Fixed

All 12 scorer edge cases identified and resolved. Summary:

| # | Bug | Status |
|---|---|---|
| 1 | Ingredient dislike hard filter | ✅ Fixed |
| 2 | Cooked/grocery_add signal cap | ✅ Fixed |
| 3 | Variety diversity pass | ✅ Fixed |
| 4 | MacroRow on recipe detail | ✅ Fixed |
| 5 | Pantry specificity weighting | ✅ Fixed |
| 6 | Macro-verified goal matching | ✅ Fixed |
| 7 | Session left-swipe tracking | ✅ Fixed |
| 8 | Skill level hard cap | ✅ Fixed |
| 9 | Zero-result fallback cascade | ✅ Fixed |
| 10 | Adventure card gating | ✅ Fixed |
| 11 | First session pantry boost | ✅ Fixed |
| 12 | Grocery add scepticism | 🔲 Post-launch |

### Bug 12 — Grocery add scepticism (implement post-launch)
Once "mark as cooked" is established in user behaviour, add scepticism for recipes added many times but never cooked:
```typescript
function getGroceryAddSignal(recipeId, interactions): number {
  const adds  = interactions.filter(i => i.recipe_id === recipeId && i.interaction_type === 'grocery_add')
  const cooks = interactions.filter(i => i.recipe_id === recipeId && i.interaction_type === 'cooked')
  const addCount = Math.min(adds.length, 2)
  const conversionPenalty = addCount >= 2 && cooks.length === 0 ? 0.7 : 1.0
  return addCount * 3 * conversionPenalty
}
```

---

## 9. Database Schema

```sql
create table profiles (
  id uuid references auth.users primary key,
  name text,
  avatar_url text,
  dietary_goals text[] default '{}',
  dietary_extra_preferences text,
  ingredient_dislikes text[] default '{}',
  cuisine_preferences text[] default '{}',
  eating_style text check (eating_style in ('quick_simple', 'variety', 'favourites_rotation')),
  skill_level text check (skill_level in ('beginner', 'home_cook', 'confident_chef')),
  cooking_frequency text check (cooking_frequency in ('few_times_week', 'most_days', 'just_starting')),
  weekly_budget text,
  meals_cooked_count integer default 0,
  recipes_submitted_count integer default 0,
  total_sessions integer default 0,
  taste_profile jsonb,               -- { text: string, generated_at: string }
  onboarding_complete boolean default false,
  created_at timestamp with time zone default now()
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cuisine text,
  source_type text check (source_type in ('curated', 'community', 'imported')),
  ingredients jsonb not null,
  steps jsonb not null,              -- [{ order, instruction }] — 419/419 backfilled
  prep_time_mins integer,
  cook_time_mins integer,
  servings integer,
  cost_per_serving numeric(6,2),
  dietary_tags text[] default '{}',
  meal_prep_friendly boolean default false,
  macros jsonb,                      -- { calories, protein, carbohydrates, fat, fibre, netCarbs, isEstimated }
  badge text check (badge in ('none', 'staff_pick', 'community_verified', 'community_favorite')) default 'none',
  submitted_by uuid references profiles(id),
  avg_rating numeric(3,2) default 0,
  rating_count integer default 0,
  save_count integer default 0,
  image_url text,
  external_id text,
  created_at timestamp with time zone default now()
);

create table swipe_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  direction text check (direction in ('right', 'left')) not null,
  mode text check (mode in ('meal_prep', 'spontaneous')) not null,
  time_of_day text check (time_of_day in ('morning', 'afternoon', 'evening', 'night')),
  day_of_week integer check (day_of_week between 0 and 6),
  session_number integer,
  swiped_at timestamp with time zone default now()
);

create table saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  liked boolean default false,
  user_rating integer check (user_rating between 1 and 5),
  saved_at timestamp with time zone default now(),
  unique(user_id, recipe_id)
);

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  ingredient_name text not null,
  quantity numeric,
  unit text,
  added_via text check (added_via in ('onboarding', 'grocery_list', 'manual')),
  added_at timestamp with time zone default now()
);

create table grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  list_type text check (list_type in ('weekly', 'spontaneous')) not null,
  status text check (status in ('active', 'exported', 'complete')) default 'active',
  items jsonb not null,
  recipe_ids uuid[] default '{}',
  estimated_total_cost numeric(8,2),
  combined_macros jsonb,
  instacart_cart_url text,
  created_at timestamp with time zone default now()
);

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  week_start_date date not null,
  is_public boolean default false,
  slots jsonb default '[]',          -- [{ day: 0-6, meal_type, recipe_id, servings_multiplier }]
  created_at timestamp with time zone default now()
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  name text not null,
  recipe_ids uuid[] default '{}',
  created_at timestamp with time zone default now()
);

create table user_cohorts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  cohort_key text not null,
  assigned_at timestamp with time zone default now()
);

create table recipe_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  interaction_type text check (interaction_type in ('view', 'grocery_add', 'cooked')) not null,
  session_number integer,
  interacted_at timestamp with time zone default now()
);

create table recipe_cohort_affinities (
  recipe_id uuid references recipes(id) not null,
  cohort_key text not null,
  affinity_score numeric(4,3),
  primary key (recipe_id, cohort_key)
);
```

---

## 10. API Endpoints (Vercel — all deployed)

```
POST /api/macros                   ✅ Live
  Body: { recipeTitle, ingredients: [{ name, quantity, unit }] }
  Returns: { macros: Macros }
  — Claude Haiku estimates macros from ingredients. isEstimated: true always.
    Results cached in recipes.macros permanently. Spoonacular removed.

POST /api/taste-profile            ✅ Live
  Body: { userId }
  Returns: { tasteProfile: string | null, reason?: 'not_enough_data' }
  — Claude Haiku reads last 100 swipes + interactions. Null if <5 swipes.
    Saves to profiles.taste_profile.

POST /api/generate-recipe          ✅ Live
  Body: { cuisine, dietaryGoals, skillLevel, maxMins?, avoidDishes?: string[] }
  Returns: { recipe } or 409 if Jaccard similarity ≥60%

POST /api/storage-tip              ✅ Live
  Body: { ingredients: string[] }
  Returns: { tips: string }
  — Claude Haiku generates 2-3 practical storage/usage tips.

POST /api/recommendations          ✅ Built — not used (local scorer preferred)
  Body: { userId, mode, limit }
  Returns: { recipeIds: string[] }

POST /api/instacart-cart           🔲 Phase 3
POST /api/check-recipe             🔲 Phase 4
```

---

## 11. Environment Variables

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=https://project-x-one-roan.vercel.app

# Vercel only — never in client code
ANTHROPIC_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
INSTACART_PARTNER_ID=      # Phase 3
INSTACART_API_KEY=         # Phase 3

# Spoonacular removed — Claude handles all macro estimation
```

---

## 12. Coding Rules

1. **TypeScript everywhere** — no plain JS, strict mode on
2. **Never call Claude or Instacart from the client** — Vercel functions only
3. **Never expose secret keys in client code** — EXPO_PUBLIC_ prefix only
4. **Use Expo Router** — no React Navigation
5. **Inline styles + constants/theme.ts** — no NativeWind, no StyleSheet.create
6. **React Native Animated API** — do not migrate to Reanimated
7. **Zustand for all global state** — no Redux, no Context
8. **All Supabase calls through lib/api.ts** — never from screens directly
9. **All colors via `useTheme()` hook** — never hardcode hex values, never import static colors directly. The hook returns the correct theme for the current mode (spontaneous/meal prep) and system color scheme (light/dark) automatically.
10. **Every screen: loading state + error state** — no bare data fetching
11. **Log every swipe to Supabase** — non-negotiable scorer training data
12. **Log every recipe_interaction** — view, grocery_add, cooked
13. **Ingredient dislikes are hard filters** — enforced in fetchScoredDeck before scoring
14. **All macros labelled "estimated"** — Claude estimates are directionally correct for discovery; never present as precise values
15. **All interaction logging is fire-and-forget** — never block the UI
16. **Do not replace fetchScoredDeck with an API call** — local scorer is intentional
17. **Scorer signal caps** — grocery_add and cooked capped at Math.min(count, 2)
18. **Diversity constraint always applied post-sort** — maxPerCuisine=3 for variety, 5 for others

---

## 13. Phase Status

### ✅ Phase 1 — Complete
Foundation, onboarding, grocery list, macros, swipe logging, Supabase schema.

### ✅ Phase 2 — Complete
Full AI layer, local scorer with all edge cases fixed, adventure cards, meal planner grid, pantry tracking, post-cook flow, taste profile, recipe steps and macros wired, Vercel deployed.

### ✅ Phase 2.5 — Complete
Meal Prep Mode end-to-end: 4-theme system, discoverStore, mode toggle, meal prep deck scoring, slot picker, serving multiplier, week progress indicator, mode-aware grocery header, tag-meal-prep-recipes.mjs script.

### ✅ Phase 2.5 — Meal Prep Mode (Complete)

**Built:**
- [x] `tag-meal-prep-recipes.mjs` — Claude Haiku tags all 419 recipes with `meal_prep_friendly` boolean. Run once: `node scripts/tag-meal-prep-recipes.mjs`
- [x] Mode toggle on Discover — "Quick" ↔ "Meal Prep" pill toggle. Persists to AsyncStorage via `discoverStore`. Triggers deck re-fetch + theme change on switch.
- [x] Meal prep deck scoring — `fetchScoredDeck` accepts `mode` param. `meal_prep_friendly: true` → +8, `meal_prep_friendly: false` → −10. All swipes logged with `mode: 'meal_prep'`.
- [x] Week progress indicator — dot row + "X of 7 days planned" at bottom of Discover in Meal Prep mode. Updates live as slots are added.
- [x] Post-swipe slot picker — right swipe in Meal Prep mode triggers bottom sheet: "Add to your week?" with 7-day × 3 meal-type grid. Tapping a slot assigns recipe + saves to `meal_plans` via Supabase. Skippable.
- [x] Serving multiplier on slot picker — 1× / 2× / 3× buttons before confirming slot assignment.
- [x] Mode-aware grocery list header — "Week of [date] · X meals · Y ingredients" banner shown in Meal Prep mode.
- [x] 4-theme system — `lightTheme`, `darkTheme`, `mealPrepLightTheme`, `mealPrepDarkTheme` in `constants/theme.ts`. `useTheme()` hook in `hooks/useTheme.ts` returns correct theme based on mode + system color scheme. All components migrated from static `colors` import.
- [x] `stores/discoverStore.ts` — Zustand store for mode state, AsyncStorage-persisted.

**Still pending (run tag script before release):**
- [ ] Run `node scripts/tag-meal-prep-recipes.mjs` to populate `meal_prep_friendly` on all 419 recipes

### Phase 3 — Instacart Integration (waiting on dev key approval — apply now)
- [ ] Apply to Instacart Developer Platform ← already submitted, waiting
- [ ] Build /api/instacart-cart Vercel function
  ```
  POST /api/instacart-cart
    Body: { items: [{ name, quantity, unit }] }
    Returns: { cart_url: string }
  ```
- [ ] Add "Order on Instacart" button to grocery-list.tsx
- [ ] Deep link via Linking.openURL() → user checks out in Instacart app
- [ ] Build InstacartButton.tsx component (components/grocery/)
- [ ] Impact affiliate tracking set up and verified
- [ ] Grocery list history view

### Phase 4 — Community
- [ ] Recipe submission form
- [ ] /api/check-recipe AI checker + auto-tagging
- [ ] Badge system (Staff Pick, Community Verified, Community Favorite)
- [ ] Public ratings and likes
- [ ] Community explore page

### Phase 5 — Social
- [ ] Follow system
- [ ] Public meal plans with AI adaptation (/api/adapt-meal-plan)
- [ ] Community feed
- [ ] Full profile tabs (Recipes / Cooked / Collections)

---

## 14. App Store Launch Checklist

Budget 1-2 weeks from submission-ready to live on App Store.

- [ ] **Apple Developer Program** ($99/year) — apply now at developer.apple.com, 24-48hrs to process
- [ ] **Privacy policy** live at a URL — must disclose all data collected including AI usage
- [ ] **Apple AI transparency** — explicit disclosure that swipe history and preferences are sent to Anthropic/Claude. Required since November 2025. Must appear in privacy policy and in-app consent flow before first AI call.
- [ ] **TestFlight internal testing** — test on real iOS devices, verify all flows end-to-end
- [ ] **App Store Connect listing** — screenshots (at least 3), description, keywords, age rating
- [ ] **No placeholder content** — leading cause of rejection. Every screen must show real data.
- [ ] **No crashes** — test on oldest supported iOS version
- [ ] **Submit early in the week** — avoid Fridays and holidays
- [ ] Review takes 24-48 hours for new apps. Build in a 3-5 day buffer for any rejection and resubmission.

---

## 15. Out of Scope — Do Not Build Yet

- DoorDash / Uber Eats full API integration
- Amazon Fresh / Walmart Grocery (after Instacart proven)
- Push notifications
- Cooking streaks / stats dashboard
- Android build
- Web companion app
- Budget tracking
- Grocery loyalty card integration
- Barcode scanning for pantry
- Photo of fridge AI vision
- Weather-aware recommendations
- Baking tab

---

## 16. Key Decisions Already Made

- **iOS first** — Android after iOS is solid
- **React Native Animated API** — do not migrate to Reanimated
- **Inline styles + theme.ts** — do not migrate to NativeWind
- **Local weighted scorer instead of Claude for deck ranking** — Claude Sonnet returned 0 results (UUID problem). Local scorer: zero latency, zero cost, fully tunable.
- **Claude used for:** taste profile, macro estimation, recipe generation, storage tips
- **Spoonacular removed** — Claude Haiku estimates macros from ingredients list. Accurate enough for discovery. All values `isEstimated: true`. Cached permanently in recipes.macros.
- **Instacart Developer Platform** — not a logistics partnership. Grocery list → pre-built cart → user checks out in Instacart. Affiliate commissions via Impact = primary revenue model.
- **Copy/paste export Phase 1** — Instacart button Phase 3
- **Account creation is screen 9 of 10** — user is invested before committing
- **Ingredient dislikes are hard filters** — enforced at data layer in fetchScoredDeck
- **Macros contextual** — headline pill on cards only if relevant goal; full MacroRow always on recipe detail
- **Pantry low stakes and opt-in** — not a main tab, directionally accurate is enough
- **Cold start solved by 248,886 cohort affinity rows** — seeded before launch
- **All AI and external APIs server-side only** — no API keys in client code
- **Community is Phase 4, social is Phase 5** — retention flywheel, not primary differentiator

---

*Mise CLAUDE.md — v5.2 — Four-state theme system locked: Spontaneous Light, Spontaneous Dark, Meal Prep Light (Linen & Moss), Meal Prep Dark. useTheme() hook pattern documented. Phase 2.5 Meal Prep Mode is the active build focus.*