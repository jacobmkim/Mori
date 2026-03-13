# Mise — CLAUDE.md
> This file is the single source of truth for this project. Read it in full at the start of every session before writing any code. It reflects the actual current build state as of the latest update.

---

## 1. What We Are Building

**Mise** is a smart recipe discovery and grocery delivery app powered by Claude AI. The name comes from *mise en place* — the chef's practice of having everything prepared and in its place before cooking begins. The app does exactly that for everyday home cooks.

**Core loop:**
The AI suggests recipes personalised to the user's taste, goals, and pantry → user swipes yes or no on recipe cards → recipes save to personal library → user selects meals and builds a smart grocery list → list is sent to Instacart in one tap or copied to clipboard as a fallback.

**Note on delivery:** Mise uses the Instacart Developer Platform API — not a full logistics partnership. The grocery list is sent to Instacart as a pre-built cart and the user completes checkout inside the Instacart app. Mise earns affiliate commissions through Impact on every attributed order. DoorDash and Uber Eats full API integration remain out of scope.

**Value proposition:**
Mise is the first recipe app that feels genuinely personal from day one, gets smarter every session, surfaces simple macros for health-conscious users, and removes the biggest friction in home cooking — the gap between "what should I make?" and a grocery list ready to order. It does not try to control your oven, partner with appliance brands, or replace Instacart. It connects your taste, your pantry, and your week into a smart list that makes cooking feel like the easier choice.

---

## 2. Current Build State

> **Read this section first every session.** It tells you exactly what exists, what is broken, and what needs to be built next.

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
- Full swipe mechanic — React Native Animated API, Fisher-Yates shuffle, undo, button-tap swipe, stale closure prevention
- Deck sourced from Supabase recipes table (single query, 400 rows), not TheMealDB API — 30-min in-memory cache keyed by sorted dietary goals
- Dietary filtering: vegan/vegetarian exclude all meat; pescatarian excludes land meat only; desserts always excluded
- Cache key `mise_recipe_deck_v3_` — invalidates all stale AsyncStorage caches
- HeadlineMacroPill on top card AND next card (stackIndex=1) — instant display via local estimator, updates silently when Spoonacular data arrives
- Goal priority chain: high_protein/paleo/pescatarian → keto (net carbs) → low_carb → low_fat → balanced/vegan/vegetarian/dairy_free/gluten_free
- Every swipe logged to `swipe_events` via fire-and-forget (upsertRecipeByExternalId → logSwipe)
- Recipe views logged to `recipe_interactions` (interaction_type: 'view')
- Grocery cart button: logs `recipe_interactions` (interaction_type: 'grocery_add'), sets liked=true, auto-swipes right
- Info button opens RecipeDetailModal
- clearDiscoverCache() called from profile.tsx on preference save

**Recipes Screen**
- Pinterest grid — Saved tab default, All tab shows TheMealDB category recipes
- Filter dropdown (Type + Cuisine, OR/AND logic), collections bar, search bar
- Grocery adds logged to `recipe_interactions` (interaction_type: 'grocery_add')
- Recipe views logged to `recipe_interactions` (interaction_type: 'view')
- Ingredients loaded from Supabase if backfilled; falls back to TheMealDB fetch + persists result

**Grocery List Screen**
- Tally header: meals, items, estimated cost, combined macros
- Ingredients grouped by category (Produce, Meat & Seafood, Dairy, Pantry, Frozen, Other)
- Checkboxes, edit mode, undo (batch + single item delete)
- Copy-to-clipboard export (formatted plain text)

**Recipe Detail Modal**
- Slide-up pageSheet — ingredient list, Save + Add to Grocery wired
- Instructions placeholder (Phase 2: Claude descriptions)

**Profile Screen**
- Avatar, name, Recipes Saved stat wired to savedStore, preferences display, sign out
- Edit Preferences modal — state resyncs on open, errors surfaced via Alert
- Conflict warnings for incompatible goals (vegan+paleo, keto+low_fat, etc.)
- clearDiscoverCache() + clearRecipeCache() called on preference save

**Saved Recipes**
- savedStore wired to Supabase — persists across sessions
- Loaded on app open (index.tsx) and sign-in (account.tsx)

**Stores**
- userStore ✅, savedStore ✅ (Supabase-backed), groceryStore ✅ (full), collectionsStore ✅ (FAVORITES_ID + custom lists), mealPlanStore 🔲 placeholder

**Data / Seed**
- 419 recipes seeded in Supabase with cohort affinity scores (248,886 rows)
- All 419 recipes backfilled with full ingredients + descriptions from TheMealDB
- Lazy ingredient persistence: first TheMealDB fetch writes to `recipes.ingredients` — all subsequent views load from DB
- Lazy macro persistence: after fetchMacros returns, writes to `recipes.macros` — shared across all users
- MacroRow component (full + compact), HeadlineMacroPill, estimateMacrosLocally — all in components/ui/MacroRow.tsx
- MiseLogo component — components/ui/MiseLogo.tsx
- api/macros.ts Vercel function (Spoonacular → Claude estimate → local fallback) — written, not yet deployed

**Tracking / AI Signal Collection**
- `swipe_events` — every swipe logged (direction, mode, time_of_day, day_of_week, session_number)
- `recipe_interactions` — views and grocery_adds logged from both Discover and Recipes screens
  - `view`: logged when RecipeDetailModal opens
  - `grocery_add`: logged when recipe added to grocery list (strongest positive signal — repeat adds = "regularly cooks this")
  - `cooked`: type defined, UI not yet wired (needs "mark as cooked" feature)

### ❌ Not Yet Built — Priority Order
1. **Macro display on recipe detail screen** — MacroRow component exists, not yet wired to detail modal
2. **Spoonacular backfill** — defer until plan upgraded before beta (free tier: 150 points/day)
3. **"Mark as cooked" UI** — logs `recipe_interactions` type: 'cooked' (strongest signal)
4. **Taste profile display** — auto-generated from swipe history, shown in Profile tab (Phase 2)
5. **AI recommendation layer** — /api/recommendations Vercel endpoint (Phase 2)
6. **Adventure cards** — skill-aware cuisine expansion after ~20 swipes (Phase 2)
7. **Instacart integration** — /api/instacart-cart Vercel endpoint (Phase 3)
8. **Weekly meal planner** — Phase 2
9. **Pantry tracking screen** — opt-in, in Profile (Phase 2)

### ⚠️ Pre-Launch Required
- **Run SQL in Supabase** to create `recipe_interactions` table (see Section 8 — not yet applied)
- **Spoonacular plan upgrade** before beta — free tier exhausted in dev

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
| Recipe Seed Data | TheMealDB open source API + Supabase (419 recipes seeded) | ✅ Live |
| Nutrition / Macro Data | Spoonacular API via /api/macros | ✅ Endpoint written; local estimator active in dev |
| Serverless Functions | Vercel | 🔲 Not yet deployed |
| AI | Claude API via Anthropic SDK (Vercel functions only — never client) | 🔲 Phase 2 |
| Grocery Export — Primary | Instacart Developer Platform API | 🔲 Phase 3 |
| Grocery Export — Fallback | Copy/paste plain text | ✅ Live |
| Affiliate Tracking | Impact (Instacart affiliate program) | 🔲 Phase 3 |
| Forms | React Hook Form | 🔲 Not yet used |

### ⚠️ Do Not Refactor These
- **React Native Animated API** — the swipe animation architecture is complex, well-built, and working. Do not migrate to Reanimated unless a specific new feature requires it and cannot be built any other way.
- **Inline styles + theme.ts** — NativeWind is installed but not in active use. Continue using inline styles with theme constants for all new screens. Do not migrate to NativeWind unless explicitly instructed.

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
│       ├── discover.tsx               ✅ Full swipe mechanic, Supabase deck, dietary filtering,
│       │                                 swipe logging, interaction logging, macro pills, RecipeDetailModal
│       ├── recipes.tsx                ✅ Pinterest grid, Saved/All tabs, filter dropdown,
│       │                                 collections bar, interaction logging, RecipeDetailModal
│       ├── grocery-list.tsx           ✅ Tally header, grouped categories, checkboxes,
│       │                                 edit mode, undo, copy-to-clipboard export
│       └── profile.tsx                ✅ Stats, preferences, edit modal, sign out,
│                                         clears discover + recipe cache on pref save
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
│   ├── RecipeDetailModal.tsx          ✅ Slide-up pageSheet, ingredients, Save + Add to Grocery
│   └── ui/
│       ├── MacroRow.tsx               ✅ MacroRow (full 4-col), HeadlineMacroPill (goal-aware),
│       │                                 estimateMacrosLocally (instant local estimate)
│       └── MiseLogo.tsx               ✅ Spatula logo, size/textColor/showTagline props
├── lib/
│   ├── supabase.ts                    ✅ Supabase client
│   ├── api.ts                         ✅ All DB calls:
│   │                                     fetchDiscoverRecipes(dietaryGoals) — Supabase deck, 30-min cache
│   │                                     clearDiscoverCache() — called on pref save
│   │                                     upsertRecipeByExternalId(recipe) — get/create Supabase UUID
│   │                                     updateRecipeDetail(externalId, ingredients, blurb) — lazy persist
│   │                                     updateRecipeMacros(externalId, macros) — lazy persist
│   │                                     logSwipe(event) — writes to swipe_events
│   │                                     logInteraction(userId, recipeId, type, session?) — writes to recipe_interactions
│   │                                     fetchMacros(recipe) — Spoonacular → Claude → local fallback
│   │                                     estimateMacrosLocally(title, ingredients) — instant keyword estimate
│   │                                     saveRecipe / removeRecipe / setRecipeLiked / getSavedRecipes
│   │                                     addPantryItems / upsertProfile / patchProfile
│   ├── mealdb.ts                      ✅ fetchMealDBRecipes, fetchMealDetail, fetchMealDBRecipesByCategory
│   │                                     MEAL_AREAS (28), MAIN_CUISINES (12), MEAL_CATEGORIES
│   │                                     LAND_MEAT_KEYWORDS, SEAFOOD_KEYWORDS, ALL_MEAT_KEYWORDS
│   │                                     shouldExclude(title, goals) — dietary filter for deck
│   │                                     clearRecipeCache() — invalidates AsyncStorage deck cache
│   └── utils.ts                       ✅ formatTime, formatCost, capitalize, getWeekStart, getTimeOfDay
├── stores/
│   ├── userStore.ts                   ✅ profile, userId, sessionNumber
│   ├── savedStore.ts                  ✅ Supabase-backed: addRecipe, removeRecipe, isSaved, loadSavedRecipes
│   ├── groceryStore.ts                ✅ addFromDetail, removeRecipeFromList, deleteItem (with undo),
│   │                                     selectedRecipes, items grouped by category
│   ├── collectionsStore.ts            ✅ FAVORITES_ID, custom collections (RecipeCollection type)
│   └── mealPlanStore.ts               🔲 Placeholder
├── types/
│   └── index.ts                       ✅ All types: Profile, Recipe, Ingredient, RecipeStep, Macros,
│                                         SwipeEvent, SavedRecipe, PantryItem, GroceryItem, GroceryList,
│                                         MealSlot, MealPlan, Collection, UserCohort, RecipeCohortAffinity,
│                                         OnboardingState + all union types
├── constants/
│   └── theme.ts                       ✅ All colors — never hardcode hex values
├── api/
│   ├── macros.ts                      ✅ Vercel fn: Spoonacular → Claude estimate → local fallback
│   └── seed-recipes.ts                ✅ Vercel fn: seeded 419 recipes + 248,886 cohort affinity rows
├── scripts/
│   ├── seed-recipes.mjs               ✅ One-time seed (already ran — do not re-run)
│   └── backfill-recipe-details.mjs    ✅ One-time backfill (already ran — safe to re-run, skips populated)
├── supabase/
│   └── schema.sql                     ✅ Full schema — apply to a fresh project before anything else
└── README.md                          ✅ Full setup guide
```

---

## 5. Design System

### Colors (from constants/theme.ts — already in use, do not hardcode elsewhere)
```typescript
export const colors = {
  primary: '#2E7D32',         // Main green — buttons, active states, accents
  primaryLight: '#E8F5E9',    // Light green — backgrounds, selected tiles
  primaryDark: '#1B5E20',     // Dark green — pressed states
  white: '#FFFFFF',
  background: '#F9F9F9',      // App background
  card: '#FFFFFF',            // Card background
  text: '#1A1A1A',            // Primary text
  textMuted: '#666666',       // Secondary text
  border: '#E0E0E0',          // Borders and dividers
  error: '#D32F2F',           // Error states
  swipeRight: '#2E7D32',      // Green swipe overlay
  swipeLeft: '#D32F2F',       // Red swipe overlay
}
```

### Typography
- Font: System default (SF Pro on iOS)
- Headings: Bold, sizes 28 / 24 / 20 / 18
- Body: Regular, size 16
- Caption: Regular, size 13, color textMuted

### Spacing
Use multiples of 4: 4, 8, 12, 16, 20, 24, 32, 48

### Border Radius
- Cards: 16px
- Buttons: 12px
- Pills / Tags: 999px (fully rounded)
- Tiles: 12px

---

## 6. Core Features — Detailed Behaviour

### 6.1 Two App Modes
Toggled at the top of the Discover screen:
- **Meal Prep Mode** — plan a full week, longer swipe stack, weekly grocery order
- **Spontaneous Mode** — tight 5-8 card stack, highly contextual, same-day delivery option

Both modes share the same swipe mechanic, pantry, dietary goals, and AI engine.

---

### 6.2 Onboarding Flow — 10 Screens

**Design principle:** Every screen must feel like part of the fun, not a form. Fast, visual, and rewarding. Account creation is screen 9 — not screen 1. All preference data collected before the user commits to creating an account.

| # | Screen | File | Status |
|---|---|---|---|
| 1 | Welcome | welcome.tsx | ✅ |
| 2 | Dietary Goals | dietary-goals.tsx | ✅ free text field added |
| 3 | Ingredient Dislikes | ingredient-dislikes.tsx | ✅ built |
| 4 | Cuisine Preferences | cuisine-prefs.tsx | ✅ 12 universal cuisines |
| 5 | Eating Style | eating-style.tsx | ✅ built |
| 6 | Cooking Frequency | cook-frequency.tsx | ✅ |
| 7 | Skill Level | skill-level.tsx | ✅ |
| 8 | Budget | budget.tsx | ✅ |
| 9 | Account Creation | account.tsx | ✅ |
| 10 | Payoff + Pantry Seed | payoff.tsx | ✅ pantry seed added |

Progress bar shown on screens 2–9.

#### Screen 2 — Dietary Goals
High level tiles only — do not get granular. Broad tiles that are instantly understood:
Vegan, Vegetarian, Pescatarian, Keto, High Protein, Low Fat, Gluten Free, Dairy Free, Halal, Kosher

**Add:** Optional free text field below tiles:
> "Anything else? (e.g. low sodium, diabetic friendly, low FODMAP)"

This captures niche needs without cluttering the main UI. Claude reads this free text at recommendation time — no preprocessing needed. Field is clearly optional and low pressure. Saved as `dietary_extra_preferences: text`.

#### Screen 3 — Ingredient Dislikes (NEW — build this)
Tone: *"Life's too short to eat things you hate. What's off the table?"*

A searchable tap-to-add interface. Pre-populated chips for common dislikes the user can tap immediately:
Cilantro, Mushrooms, Olives, Blue Cheese, Anchovies, Lamb, Tofu, Beetroot, Shellfish, Liver, Fennel, Offal

User can also type any ingredient not shown. No limit on how many they add. Saved as `ingredient_dislikes: string[]`.

**Critical rule:** These are hard filters. Any recipe containing a disliked ingredient is removed from the swipe stack entirely — never soft-deprioritised. Enforce this at the data layer, not just the UI layer. Editable at any time in Profile → Settings.

#### Screen 4 — Cuisine Preferences
**12 universal cuisines only** — every user knows all of these, no explanation needed:
Italian, Mexican, Chinese, Japanese, Indian, American, Mediterranean, Thai, French, Greek, Korean, Middle Eastern

**Do NOT add niche cuisines to this screen.** Moroccan, Ethiopian, Peruvian, Szechuan, Lebanese, Turkish, Caribbean, Vietnamese, Tex-Mex, Spanish etc. are surfaced by the AI as "adventure cards" in the Discover feed — a reward for engaged users, not a form field. See Section 6.10.

#### Screen 5 — Eating Style (NEW — build this)
*"What does a good week of eating look like for you?"*

Three large visual tap cards (single select):
- **"Quick and simple most nights"** — AI weights toward meals under 30 mins, one bigger recipe on weekends
- **"Variety is everything"** — AI maximises cuisine and ingredient diversity across the week
- **"I find favourites and rotate them"** — AI surfaces reliable go-to recipes, gradually introduces new ones

Saved as `eating_style: 'quick_simple' | 'variety' | 'favourites_rotation'`

#### Screen 10 — Payoff + Pantry Seed
After the preference summary card, add a single optional prompt before entering the app:

**"Tell us what's always in your kitchen"**

A tap-to-add grid of 25-30 common staples:
olive oil, garlic, pasta, rice, canned tomatoes, eggs, onions, butter, soy sauce, flour, chicken stock, lemon, cumin, paprika, salt, pepper, balsamic vinegar, Parmesan, chilli flakes, honey, mustard, tinned chickpeas, coconut milk, bread, potatoes

User taps a handful in seconds — zero typing. These are written to the pantry_items table immediately.

The first swipe card then surfaces a recipe that uses those tapped ingredients with: **"You can make this tonight — you already have everything."** This is the engineered magic moment and must work on session one.

---

### 6.3 Swipe Experience
The swipe mechanic is built and working well. Do not refactor the animation architecture.

**Add to each swipe card:**
- Dietary goal match pills — green pills for matching goals, e.g. "High Protein ✓"
- Pantry match indicator — "You have 6 of 9 ingredients" shown below recipe name
- **Headline macro pill** — one macro only, based on primary dietary goal:
  - High Protein → "32g protein"
  - Keto → "4g net carbs"
  - Low Fat → "8g fat"
  - No relevant goal set → no macro shown at all
- Badge if applicable (Staff Pick / Community Verified / Community Favorite)

**Every swipe must be logged to Supabase immediately.** This is non-negotiable — it is the AI's training data:
```typescript
swipe_events: {
  user_id, recipe_id, direction ('right' | 'left'),
  mode ('meal_prep' | 'spontaneous'),
  time_of_day ('morning' | 'afternoon' | 'evening' | 'night'),
  day_of_week (0-6),
  session_number
}
```

---

### 6.4 Macros — Full Behaviour

Macros are contextual and goal-aware. They serve users who care without overwhelming users who don't.

#### Data Source
**Spoonacular API** is the primary source of macro data per recipe. Spoonacular returns calories, protein (g), carbohydrates (g), fat (g), and fibre (g) per serving.

For community-submitted recipes without Spoonacular data, Claude estimates macros from the ingredients list. These are always labelled **"estimated"** in the UI.

#### Macro Display Rules

**On swipe cards:** One headline macro only, based on primary dietary goal. Small green pill. If no relevant goal is set, no macro shown on the card.

**On recipe detail screen:** Full macro row — always visible for all users:
```
  Calories    Protein    Carbs    Fat
    420         32g       38g     14g
             per serving  ▾
```
Four clean numbers. No micronutrients shown. "Per serving" / "Full batch" toggle — useful for meal preppers scaling up.

**In the weekly planner:** Day totals and week totals for the user's primary tracked macro. Highlights days that fall short of a target range (e.g. low protein days flagged for High Protein goal users).

**Macro disclaimer:** Small "Values are estimates and may vary" note beneath all macro displays.

#### Macros Type (add to types/index.ts)
```typescript
interface Macros {
  calories: number;
  protein: number;        // grams
  carbohydrates: number;  // grams
  fat: number;            // grams
  fibre: number;          // grams
  netCarbs?: number;      // carbohydrates - fibre, for keto users
  isEstimated: boolean;   // true = Claude estimate, false = Spoonacular data
}
```

---

### 6.5 Recipe Library
Pinterest-style visual grid. Currently wired to 8 static seed recipes — needs to pull from TheMealDB or Supabase.

Filter bar at top. Each grid card shows: image, name, rating, badges, headline macro pill (if goal set).

Actions per recipe: Like (private), Rate (1-5 stars, public), Edit/Remix, Add to Grocery List, Add to Weekly Plan, Save to Collection.

Badge types:
- **Staff Pick** — from curated library
- **Community Verified** — passed AI checker
- **Community Favorite** — high rating + high cook count

---

### 6.6 Grocery List Screen

Build this screen completely. It is core to the value proposition and the revenue model.

#### Structure
- Tally header at top (see below)
- Ingredients grouped by category: Produce, Meat & Seafood, Dairy, Pantry, Frozen
- Each item: ingredient name, quantity, unit, checkbox
- Pantry-owned items shown crossed out and greyed out
- Running estimated total cost at bottom

#### Tally Header
When meals are selected and list is built, show:
- Meals selected (e.g. "3 meals")
- Ingredients to order (e.g. "12 items")
- Already in pantry (e.g. "9 already at home")
- Estimated total (e.g. "~$42.00")
- Combined macro summary for all selected meals (calories, protein, carbs, fat — total for the week/session)

#### Export Options

**Phase 1 — Copy to Clipboard (build now)**
Always visible. Copies clean formatted plain text:
```
🛒 Mise Grocery List — [Date]

PRODUCE
• Garlic — 3 cloves
• Cherry tomatoes — 200g

MEAT & SEAFOOD
• Chicken breast — 500g

DAIRY
• Butter — 50g

PANTRY
• Olive oil — 2 tbsp
• Pasta — 200g

---
Estimated total: ~$34.50
Generated by Mise
```

**Phase 3 — Send to Instacart**
"Order on Instacart" button calls `/api/instacart-cart`, gets back a cart URL, opens it with `Linking.openURL()`. User confirms and checks out in the Instacart app. Mise earns affiliate commission via Impact.

---

### 6.7 Pantry Tracking (Low Stakes, Opt-In)

Pantry is a background feature. It is not a main tab. It is not prominent in the navigation. It surfaces quietly where relevant.

**How pantry is populated:**
1. Pantry staple seed on the payoff screen (tap common items, takes 10 seconds)
2. Auto-update when a grocery list order is marked complete in Mise
3. Manual add/edit in Profile → Pantry

**What pantry does:**
- Feeds the pantry match indicator on swipe cards
- Removes already-owned items from the grocery list
- Boosts pantry-available recipes in AI ranking
- Powers the post-cook check-in: "Was anything left over?" → surfaces storage tip

**What pantry does NOT do (yet):**
- Receipt scanning (Phase 2)
- Barcode scanning (out of scope)
- Expiry date tracking (out of scope)

Directionally accurate is enough. It does not need to be perfect to be useful.

---

### 6.8 Meal Prep Mode — Weekly Planner

7-day calendar view with Breakfast / Lunch / Dinner slots. Drag and drop recipe placement. Each placed recipe has a servings multiplier (1x, 2x, 3x) that scales ingredient quantities proportionally.

**Build Grocery List** from the planner: consolidates all meals, deduplicates shared ingredients, cross-references pantry, groups by category, calculates estimated cost and combined macros for the full week.

---

### 6.9 Spontaneous Mode

Tight 5-8 card stack. Highly contextual: time of day, pantry state, recent swipe history, dietary goals. Stack refreshes when it runs low.

**Live counter while swiping (minimal — two numbers only):**
- "4 meals saved"
- "14 already in your pantry"

**After swiping, three ways to act on saved recipes:**
1. **Build a Grocery List** — select recipes, tap Build, tally shown, export via clipboard or Instacart
2. **Add to Calendar** — lightweight day + meal slot picker, not the full weekly planner
3. **Save for Later** — stays in library, no action

---

### 6.10 Adventure Cards — Skill-Aware Cuisine Expansion

Niche cuisines (Moroccan, Ethiopian, Peruvian, Szechuan, Lebanese, Vietnamese, Turkish, Caribbean, Tex-Mex, Spanish, etc.) are **never** shown during onboarding. Instead they are introduced by Claude as "adventure cards" in the Discover feed — an earned reward, not a form.

**Rules:**
- Only shown to `home_cook` and `confident_chef` users — never `beginner`
- First adventure card appears after ~20 swipes (baseline taste signal established)
- Cuisine selected by Claude based on adjacency to the user's liked cuisines:
  - Italian lover → Greek, Moroccan, Spanish
  - Korean lover → Vietnamese, Japanese, Thai
  - Mexican lover → Peruvian, Caribbean, Tex-Mex
- Card carries a subtle `✦ New for you` badge so users know it's intentional, not a bug
- If the user swipes right: that cuisine enters their rotation. If left: Claude waits longer before trying another adventure card
- Can be disabled in Profile → Settings ("Keep it familiar")
- `confident_chef` users receive adventure cards more frequently and from more distant cuisines

---

## 7. AI Personalisation Strategy

### Why Previous Apps Failed
- **Yummly** — 15M users, acquired by Whirlpool 2017, pivoted to smart appliance integration no one wanted, shut down December 2024. Never drift from the core product identity.
- **Innit** — impressive tech but required smart ovens most users don't own. Meet users where they already are.
- **Mealime** — still exists but never broke through. Solved a narrow problem adequately, no delight, no community flywheel. Utility alone does not build retention.
- **Common failure pattern:** cold start problem never solved, AI never felt personal quickly enough, users churned in week one.

### Six Layers of Personalisation

**Layer 1 — Onboarding signals:**
Ingredient dislikes (hard filters), dietary goals + free text, cuisine swipe, eating style, skill level, budget, pantry seed. All collected before the first swipe stack loads.

**Layer 2 — Cohort cold start:**
New users are immediately mapped to a cohort from onboarding data (e.g. "beginner_home_cook_italian_mexican_quick_meals"). Recipe seed database is pre-tagged with cohort affinity scores. First stack is drawn from that cohort's highest-performing recipes. Individual swipe data overrides cohort weighting after 10-15 swipes. **This must be in place before launch.**

**Layer 3 — Engineered magic moment:**
First card in the first stack uses ingredients from the pantry seed. Card reads: *"You can make this tonight — you already have everything."* This moment must work perfectly on session one. It is the hook that creates habitual use.

**Layer 4 — Real-time stack adaptation:**
Three consecutive left swipes on similar recipes triggers a visible stack shift. Message: *"Trying something different for you."* Responsiveness makes the AI feel alive within the session.

**Layer 5 — Session two retention:**
Second session stack is visibly smarter than session one. Adjacent cuisines introduced based on cohort patterns. Subtle prompt: *"Based on what you loved last time, we think you'll like these."* Time-aware: if a week has passed, acknowledge the gap.

**Layer 6 — Visible learning:**
Auto-generated taste profile in the profile tab:
> *"You tend to love Italian and Mexican, quick weeknight meals, bold flavours, and anything you can make with what's already in your kitchen."*

Progress narrative: "Mise is learning your taste" → "Mise knows your taste" as swipe history grows.

**Layer 7 — Adventure cards (skill-aware cuisine expansion):**
Users who selected `home_cook` or `confident_chef` during onboarding receive occasional "adventure cards" in their Discover feed — recipes from cuisines they did not select (Moroccan, Ethiopian, Peruvian, Szechuan, Lebanese, Vietnamese, Caribbean, Turkish etc.). These are introduced gradually after ~20 swipes, once the AI has a baseline taste signal.

Card treatment: a subtle "✦ New for you" badge distinguishes adventure cards from the main stack. Claude selects the adventure cuisine based on adjacency to the user's liked cuisines (e.g. a Korean lover gets introduced to Japanese street food; an Italian lover gets introduced to Greek or Moroccan).

`beginner` users never receive adventure cards — their stack stays familiar and confidence-building. Adventure cards can be disabled in Profile → Settings.

### Non-Negotiable Technical Requirements
1. Every swipe logged to Supabase immediately — no batching, no skipping
2. Every recipe view and grocery_add logged to recipe_interactions — frequency is Claude's strongest signal
3. Recipe seed DB must be tagged with cohort affinity scores before launch ✅ done
4. Ingredient dislikes enforced as hard filters at the data layer
5. Dietary free text stored verbatim, passed to Claude at recommendation time
6. Session count incremented on every app open (profiles.total_sessions) — not yet done
7. Taste profile auto-generated from swipe + interaction history, stored on profiles row (Phase 2)

---

## 8. Database Schema

```sql
-- Users (extends Supabase auth.users)
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
  taste_profile jsonb,
  onboarding_complete boolean default false,
  created_at timestamp with time zone default now()
);

-- Recipes
create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cuisine text,
  source_type text check (source_type in ('curated', 'community', 'imported')),
  ingredients jsonb not null,         -- [{ name, quantity, unit }]
  steps jsonb not null,               -- [{ order, instruction }]
  prep_time_mins integer,
  cook_time_mins integer,
  servings integer,
  cost_per_serving numeric(6,2),
  dietary_tags text[] default '{}',
  meal_prep_friendly boolean default false,
  macros jsonb,                        -- { calories, protein, carbohydrates, fat, fibre, netCarbs, isEstimated }
  badge text check (badge in ('none', 'staff_pick', 'community_verified', 'community_favorite')) default 'none',
  submitted_by uuid references profiles(id),
  avg_rating numeric(3,2) default 0,
  rating_count integer default 0,
  save_count integer default 0,
  image_url text,
  spoonacular_id text,
  external_id text,                    -- TheMealDB id or other source id
  created_at timestamp with time zone default now()
);

-- Swipe Events (AI training data — log every single swipe)
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

-- Saved Recipes
create table saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  liked boolean default false,
  user_rating integer check (user_rating between 1 and 5),
  saved_at timestamp with time zone default now(),
  unique(user_id, recipe_id)
);

-- Pantry
create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  ingredient_name text not null,
  quantity numeric,
  unit text,
  added_via text check (added_via in ('onboarding', 'grocery_list', 'manual')),
  added_at timestamp with time zone default now()
);

-- Grocery Lists
create table grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  list_type text check (list_type in ('weekly', 'spontaneous')) not null,
  status text check (status in ('active', 'exported', 'complete')) default 'active',
  items jsonb not null,               -- [{ ingredient_name, quantity, unit, checked, recipe_ids }]
  recipe_ids uuid[] default '{}',
  estimated_total_cost numeric(8,2),
  combined_macros jsonb,              -- total macros across all selected recipes
  instacart_cart_url text,
  created_at timestamp with time zone default now()
);

-- Meal Plans
create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  week_start_date date not null,
  is_public boolean default false,
  slots jsonb default '[]',           -- [{ day: 0-6, meal_type, recipe_id, servings_multiplier }]
  created_at timestamp with time zone default now()
);

-- Collections
create table collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  name text not null,
  recipe_ids uuid[] default '{}',
  created_at timestamp with time zone default now()
);

-- User Cohorts
create table user_cohorts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  cohort_key text not null,
  assigned_at timestamp with time zone default now()
);

-- Recipe Interactions (AI signal: views, grocery adds, cooks)
-- Frequency is the signal — a recipe grocery-listed 3 times outweighs a right swipe.
create table recipe_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  interaction_type text check (interaction_type in ('view', 'grocery_add', 'cooked')) not null,
  session_number integer,
  interacted_at timestamp with time zone default now()
);

-- Recipe Cohort Affinities (populated during seed data prep)
create table recipe_cohort_affinities (
  recipe_id uuid references recipes(id) not null,
  cohort_key text not null,
  affinity_score numeric(4,3),
  primary key (recipe_id, cohort_key)
);
```

### Signal Hierarchy (strongest → weakest, for Phase 2 AI weighting)
1. `recipe_interactions.grocery_add` × N — repeated grocery-listing = "regularly cooks this"
2. `recipe_interactions.cooked` — explicit cook confirmation (not yet wired)
3. `swipe_events.direction = 'right'` — expressed intent
4. `saved_recipes.liked = true` — set automatically on cart add
5. `recipe_interactions.view` × N — repeated views = high interest or hesitation
6. `swipe_events.direction = 'left'` — negative signal (soft; not a hard filter like ingredient_dislikes)

---

## 9. API Endpoints (Vercel Serverless Functions)

All Claude and Instacart API calls happen server-side only. Never expose API keys on the client.

```
POST /api/recommendations
  Body: { userId, mode, limit }
  Returns: { recipeIds: string[] }
  — Claude ranks recipes for user based on profile + swipe history + pantry + cohort

POST /api/instacart-cart
  Body: { items: [{ name, quantity, unit }] }
  Returns: { cart_url: string }
  — Sends ingredient list to Instacart Developer Platform, returns pre-built cart URL

POST /api/macros
  Body: { spoonacularId?, recipeTitle, ingredients: [{ name, quantity, unit }] }
  Returns: { macros: Macros }
  — Fetches from Spoonacular if spoonacularId present, else Claude estimates

POST /api/check-recipe
  Body: { recipe: RecipeSubmission }
  Returns: { passed: boolean, feedback: string[], tags: string[], macros: Macros }
  — Quality checker + auto-tagging + macro estimation for community submissions

POST /api/storage-tip
  Body: { ingredientName, quantity, unit, upcomingRecipes }
  Returns: { tip: string, expiryDays: number }
  — Claude returns storage advice for a leftover ingredient

POST /api/adapt-meal-plan
  Body: { mealPlan, userGoals, userPantry }
  Returns: { adaptedSlots, flags: ConflictFlag[] }
  — Claude adapts a copied public meal plan to the viewer's goals and pantry
```

---

## 10. Environment Variables

```bash
# Supabase — safe to use in client code
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# Vercel serverless functions only — never in client code
ANTHROPIC_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SPOONACULAR_API_KEY=
INSTACART_PARTNER_ID=
INSTACART_API_KEY=
```

---

## 11. Coding Rules

1. **TypeScript everywhere** — no plain JS files, strict mode on
2. **Never call Claude, Instacart, or Spoonacular APIs from the client** — all external API calls go through Vercel serverless functions
3. **Never expose secret keys in client code** — only EXPO_PUBLIC_ prefixed vars are safe on client
4. **Use Expo Router for all navigation** — no React Navigation
5. **Use inline styles with constants/theme.ts** — do not use NativeWind or StyleSheet.create unless there is no other option
6. **Use React Native Animated API for animations** — do not migrate to Reanimated unless a specific feature requires it and cannot be built otherwise
7. **Use Zustand for all global state** — no Redux, no Context for app state
8. **All Supabase calls go through lib/api.ts** — never call Supabase directly from a screen
9. **All colors and spacing from constants/theme.ts** — no hardcoded hex values in components
10. **Every screen gets a loading state and an error state** — no bare data fetching without handling both
11. **Log every swipe to Supabase** — direction, recipe_id, mode, time_of_day, day_of_week, session_number. Non-negotiable.
12. **Log every recipe_interaction to Supabase** — view when detail modal opens, grocery_add when recipe added to list. Both are AI training signals.
13. **Ingredient dislikes are hard filters** — exclude at the data layer, not just the UI layer
14. **Macros from Claude are always labelled "estimated"** — never present them as precise values
15. **All interaction logging is fire-and-forget** — upsertRecipeByExternalId first (to get Supabase UUID), then logSwipe/logInteraction. Errors are silently swallowed — never block the UI.

---

## 12. Phase 1 — Complete ✅

All Phase 1 items are done and merged to main. Below is the full record.

### ✅ Priority 1 — Foundation
- [x] Apply supabase/schema.sql to Supabase (all tables, RLS, indexes, auto-profile trigger)
- [x] Wire savedStore to Supabase saved_recipes table — persists across sessions
- [x] Wire Profile "Recipes Saved" stat to savedStore count
- [x] Profile auto-created on first auth load if missing

### ✅ Priority 2 — Onboarding
- [x] ingredient-dislikes.tsx (Screen 3) — searchable tap-to-add
- [x] eating-style.tsx (Screen 5) — 3 large visual tap cards
- [x] Optional free text field on dietary-goals.tsx
- [x] cuisine-prefs.tsx — 12 universal cuisines only
- [x] payoff.tsx — pantry staple tap grid → writes pantry_items
- [x] All onboarding fields persisted to Supabase on account creation
- [x] onboarding_complete: true on payoff completion

### ✅ Priority 3 — Grocery List Screen
- [x] grocery-list.tsx — tally header, grouped categories, checkboxes, edit mode, undo
- [x] groceryStore.ts — addFromDetail, consolidate, deduplicate, deleteItem with undo
- [x] Copy-to-clipboard export (formatted plain text)
- [x] "Add to Grocery List" wired from Discover (cart button) and Recipes screen

### ✅ Priority 4 — Macros
- [x] MacroRow component — full 4-col layout + compact variant
- [x] HeadlineMacroPill — goal-aware, on top card and next card (stackIndex=1)
- [x] estimateMacrosLocally — instant keyword-based estimate, no API delay
- [x] api/macros.ts Vercel endpoint written (Spoonacular → Claude → local fallback)
- [x] Lazy macro persistence — after fetchMacros, writes to recipes.macros, shared across all users
- [ ] Wire MacroRow to recipe detail screen (next up)
- [ ] Spoonacular backfill of all 419 recipes (after plan upgrade before beta)

### ✅ Priority 5 — Swipe Data + Interaction Logging
- [x] Every swipe logged to swipe_events (direction, mode, time_of_day, day_of_week, session_number)
- [x] recipe_interactions table — logs views and grocery_adds from both Discover and Recipes screens
- [x] 419 recipes seeded with cohort affinity scores (248,886 rows in recipe_cohort_affinities)
- [x] All 419 recipes backfilled with full ingredients + descriptions from TheMealDB
- [x] Lazy ingredient persistence — first TheMealDB fetch writes to recipes table for all future users
- [ ] Map new users to cohort_key on onboarding completion (Phase 2)
- [ ] Increment total_sessions on every app open (Phase 2)

### ⚠️ Pre-Launch Before Beta
- Run `recipe_interactions` table SQL in Supabase (see Section 8 — not yet applied to live DB)
- Upgrade Spoonacular plan — free tier (150 points/day) exhausted in dev
- Run Spoonacular macro backfill script once upgraded

---

## 13. Phased Build Plan

### ✅ Phase 1 — Foundation (Complete — merged to main)
All Priority 1–5 items complete. See Section 12.

### Phase 2 — AI Layer
- [ ] Vercel project set up, environment variables configured
- [ ] Wire MacroRow to recipe detail screen
- [ ] Map new users to cohort_key in user_cohorts on onboarding completion
- [ ] Increment total_sessions on every app open in _layout.tsx
- [ ] /api/describe-recipe endpoint — Claude generates a one-sentence description
      per recipe from { title, cuisine, category, ingredients }. Currently the
      blurb falls back to the first sentence of TheMealDB strInstructions which
      is often a cooking step, not a description. Claude descriptions ship with
      Phase 2 Vercel setup. Wire into fetchMealDetail in lib/mealdb.ts.
- [ ] /api/recommendations endpoint — Claude ranks recipes using: profile, swipe_events,
      recipe_interactions (weighted by type + frequency), pantry, cohort affinity scores
- [ ] Connect recommendations to Discover screen (replace shuffle-based Supabase fetch)
- [ ] "Mark as cooked" UI — logs recipe_interactions type: 'cooked'
- [ ] Adventure cards — home_cook/confident_chef only, after ~20 swipes, cuisine adjacency
- [ ] Pantry screen in Profile → Pantry (opt-in, not a main tab)
- [ ] Post-cook check-in flow
- [ ] /api/storage-tip endpoint + storage tip UI
- [ ] Taste profile auto-generation + display in Profile tab
- [ ] Food waste reduction goal + nudges

### Phase 3 — Instacart Integration
- [ ] Apply to Instacart Developer Platform (start this during Phase 1 in parallel)
- [ ] Build /api/instacart-cart Vercel function
- [ ] Add "Order on Instacart" button to grocery list
- [ ] Deep link via Linking.openURL()
- [ ] Impact affiliate tracking integrated and verified
- [ ] Grocery list history view

### Phase 4 — Community
- [ ] Recipe submission form
- [ ] /api/check-recipe AI checker + auto-tagging
- [ ] Badge system
- [ ] Public ratings and likes
- [ ] Community explore page

### Phase 5 — Social
- [ ] Follow system
- [ ] Public meal plans with AI adaptation
- [ ] Community feed
- [ ] /api/adapt-meal-plan endpoint
- [ ] Full profile tabs (Recipes / Cooked / Collections)

---

## 14. Out of Scope — Do Not Build Yet

- DoorDash Drive and Uber Eats full API integration
- Amazon Fresh and Walmart Grocery (after Instacart is proven)
- Push notifications and engagement nudges
- Cooking streaks and stats dashboard
- Android build
- Web companion app
- Budget tracking and savings summaries
- Grocery store loyalty card integration
- Barcode scanning for pantry
- Photo of fridge or pantry AI vision
- Weather-aware recommendations
- Baking tab (noted as future interest, not yet scoped)

---

## 15. Key Decisions Already Made

- **iOS first** — Android after iOS is solid and proven
- **React Native Animated API** — working well, do not migrate to Reanimated
- **Inline styles + theme.ts** — do not migrate to NativeWind
- **Spoonacular replaces TheMealDB as primary recipe/nutrition source** — TheMealDB used in current Discover screen; Spoonacular will be integrated for macro data in Priority 4
- **Instacart Developer Platform in scope** — developer program available to meal planning apps, not a full logistics partnership. Grocery list → pre-built cart → user checks out in Instacart. Affiliate commissions via Impact = primary revenue model
- **Copy/paste export ships Phase 1** — Instacart button ships Phase 3
- **DoorDash and Uber Eats remain out of scope** — Instacart covers same-day grocery delivery adequately
- **Account creation is screen 9 of 10** — not screen 1. User is invested before committing
- **Dietary goals are high level** — broad tiles plus optional free text, never granular sub-categories on the main tile grid
- **Ingredient dislikes are hard filters** — never soft deprioritisation, enforced at data layer
- **Macros are contextual, not shown by default** — one headline macro on swipe cards only if user has a relevant dietary goal; full macro row always on recipe detail
- **Macros from Spoonacular** — Claude estimates as fallback only, always labelled "estimated"
- **Pantry is low stakes and opt-in** — no main tab, surfaces in the background, directionally accurate is enough
- **Cold start solved by cohort data** — seed recipes must be tagged before launch
- **All AI and external APIs run server-side** — no API keys in client code, ever
- **Social features are Phase 5** — after the core product is proven

---

*Mise CLAUDE.md — v1.3 — Updated to reflect actual build state, animation stack, tech corrections, new onboarding screens, macro strategy, Spoonacular integration, and full priority build order.*
