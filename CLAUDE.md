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
- Full swipe mechanic — React Native Animated API, undo, button-tap swipe, stale closure prevention
- Deck sourced from Supabase recipes table (single query, 400 rows) — 30-min in-memory cache keyed by sorted dietary goals
- **Local weighted scorer** (`fetchScoredDeck`) ranks the deck on-device — no API call, no latency
- Dietary filtering: vegan/vegetarian exclude all meat; pescatarian excludes land meat only; desserts always excluded
- Ingredient dislike hard filter — recipes with disliked ingredients removed before scoring
- Skill level hard cap — beginner ≤60 min, home_cook ≤120 min, confident_chef sees all
- Diversity constraint post-sort — maxPerCuisine=3 for variety users, 5 for others
- Graceful fallback cascade — relaxes diversity then skill filter if deck too small
- Pantry specificity weighting — common staples worth 0.2 vs 1.0 in match scoring
- First session pantry boost — +50 for full pantry match when total_sessions ≤ 1
- Session swipe tracking — in-memory Sets prevent left-swiped/shown cards reappearing
- HeadlineMacroPill on top card AND next card (stackIndex=1) — instant display via local estimator
- Every swipe logged to `swipe_events` via fire-and-forget
- Recipe views logged to `recipe_interactions` (interaction_type: 'view')
- Grocery cart button: logs grocery_add interaction, sets liked=true, auto-swipes right
- "Mark as cooked" button on RecipeDetailModal — logs cooked interaction
- **Adventure cards** — niche cuisine at position 6, gated on skill+swipe ratio, cooldown, adjacency map, "✦ New for you" badge
- **"Made before" banner** — green pill on previously-cooked cards for cross-session re-rating
- Info button opens RecipeDetailModal
- **Dev flag button** in action bar (`__DEV__` only) — same reason picker as detail modal
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
- **Ingredients / Instructions tab switcher** — pill tab bar, switches instantly, resets to Ingredients on open
- Step-by-step instructions — numbered green circle badges, parsed from TheMealDB strInstructions
- "Mark as cooked" button — logs cooked interaction, toggles green state within session
- MacroRow wired — full 4-col macros (calories, protein, carbs, fat) with per-serving scaling
- Serving size adjuster — increment/decrement buttons scale macros proportionally
- Post-cook 5-star rating — appears after marking as cooked, persists to saved_recipes.user_rating
- Storage tips — auto-fetches from `/api/storage-tip` (Claude Haiku) after marking cooked
- "Values are estimates and may vary" disclaimer beneath macros
- **Dev flag button** — red flag icon (top-left, `__DEV__` only), 6 preset reasons, AsyncStorage-backed

**Profile Screen**
- Avatar, name, Recipes Saved stat wired to savedStore, preferences display, sign out
- Edit Preferences modal — state resyncs on open, errors surfaced via Alert
- Conflict warnings for incompatible goals
- clearDiscoverCache() + clearRecipeCache() called on preference save
- **Taste Profile card** — Claude Haiku generated via `/api/taste-profile`, cached in DB. Shows "not enough data" if <5 swipes.
- **Dev Tools section** — (`__DEV__` only) flagged recipe count, view/clear buttons

**Saved Recipes**
- savedStore wired to Supabase — persists across sessions

**Stores**
- userStore ✅, savedStore ✅ (Supabase-backed), groceryStore ✅ (full), collectionsStore ✅, mealPlanStore ✅ (Supabase-backed)

**Data / Seed**
- 419 TheMealDB recipes seeded in Supabase with cohort affinity scores (248,886 rows)
- All 419 recipes backfilled with full ingredients, descriptions, steps, and macros
- Lazy ingredient + macro persistence (first fetch writes to DB, all future users load from DB)
- MacroRow component (full + compact), HeadlineMacroPill, estimateMacrosLocally — components/ui/MacroRow.tsx
- MiseLogo component — components/ui/MiseLogo.tsx

**Vercel — Deployed and Live**
- `/api/macros` — Claude Haiku estimates macros from ingredients list. Spoonacular removed.
- `/api/recommendations` — built but not used (local scorer used instead — see Key Decisions)
- `/api/taste-profile` — Claude Haiku generates taste profile paragraph, saves to profiles.taste_profile
- `/api/generate-recipe` — Claude Haiku generates recipes with server-side Jaccard similarity guard (409 on duplicate)

**Tracking / AI Signal Collection**
- `swipe_events` — every swipe logged (direction, mode, time_of_day, day_of_week, session_number)
- `recipe_interactions` — views, grocery_adds, and cooked logged from Discover and Recipes screens

---

### ❌ Known Bugs — Fix Before Beta

These are listed in priority order. Do not move to new features until all four are fixed.

#### Bug 1 — Ingredient dislikes not enforced at data layer 🔥 MOST URGENT
`fetchDiscoverRecipes` filters by dietary goals but never checks `profile.ingredient_dislikes`. Users who listed cilantro, mushrooms, etc. during onboarding still see those recipes. This is a broken promise from onboarding and will cause immediate 1-star reviews.

**Fix:** Filter the recipe pool in `fetchScoredDeck` before scoring:
```typescript
const filteredRecipes = recipes.filter(recipe =>
  !recipe.ingredients?.some(ingredient =>
    user.ingredient_dislikes.some(dislike =>
      ingredient.name.toLowerCase().includes(dislike.toLowerCase())
    )
  )
)
```
Hard filter only — never soft deprioritise. Disliked ingredients must never appear, ever.

#### Bug 2 — Cooked/grocery_add signal feedback loop 🔥 FIX BEFORE BETA
A recipe cooked 5× gets +20 and permanently dominates the deck. A recipe grocery-added many times never fades. Both signals need a ceiling to prevent a small number of recipes locking the top of the deck forever.

**Fix — one line each in the scorer:**
```typescript
+ Math.min(groceryAddCount, 2) * 3    // was: groceryAddCount * 3
+ Math.min(cookedCount, 2) * 4        // was: cookedCount * 4
```
Cap both at 2 occurrences max. After that, the recency decay on swipe signals naturally handles preference tracking.

#### Bug 3 — Variety eating style has no diversity enforcement
The scorer rates each recipe independently, so the top results for a "variety is everything" user can be 10 Italian dishes in a row. This directly contradicts what the user asked for.

**Fix — post-sort diversity pass:**
```typescript
function applyDiversityConstraint(rankedRecipes: Recipe[], maxPerCuisine = 4): Recipe[] {
  const cuisineCounts: Record<string, number> = {}
  const diverseDeck: Recipe[] = []

  for (const recipe of rankedRecipes) {
    const count = cuisineCounts[recipe.cuisine ?? 'other'] ?? 0
    if (count < maxPerCuisine) {
      diverseDeck.push(recipe)
      cuisineCounts[recipe.cuisine ?? 'other'] = count + 1
    }
    if (diverseDeck.length >= 30) break
  }
  return diverseDeck
}

// Apply after scoring, before returning deck
// For variety eating style: maxPerCuisine = 3 (stricter)
// For all other styles: maxPerCuisine = 4 (softer)
const maxPerCuisine = profile.eating_style === 'variety' ? 3 : 4
const deck = applyDiversityConstraint(scoredRecipes, maxPerCuisine)
```

#### Bug 4 — MacroRow not wired to recipe detail modal
The MacroRow component exists and works on swipe cards. It is not connected to the RecipeDetailModal. Users see no macro data when they open a recipe.

**Fix:** Import and render `<MacroRow macros={recipe.macros} />` inside RecipeDetailModal beneath the ingredient list. Call `fetchMacros(recipe)` if `recipe.macros` is null, show a loading state while fetching. Add the "Values are estimates and may vary" disclaimer beneath.

---

### ⚠️ Pre-Launch Required (Admin Tasks)
- **Apple Developer account** ($99/year) — needed before App Store submission

---

### Build Status — In Scope
1. ✅ Ingredient dislike hard filter (Bug 1)
2. ✅ Cooked/grocery_add signal cap (Bug 2)
3. ✅ Variety diversity pass (Bug 3)
4. ✅ MacroRow on recipe detail modal (Bug 4)
5. ✅ Session-level left-swipe tracking (Bug 7)
6. ✅ Zero-result fallback for restrictive dietary combos (Bug 9)
7. ✅ Skill level hard cap on recipe pool (Bug 8)
8. ✅ Pantry specificity weighting (Bug 5)
9. ✅ Adventure cards — skill-aware cuisine expansion
10. ✅ Weekly meal planner (Plan tab in Recipes)
11. ✅ Pantry tracking screen — opt-in, in Profile
12. ✅ Post-cook check-in flow — "Made before" banner, 5-star rating, storage tips
13. ✅ /api/storage-tip endpoint — Claude Haiku, live on Vercel
14. ✅ /api/macros — Spoonacular removed, Claude Haiku only
15. ✅ Recipe steps wired into RecipeDetailModal
16. ✅ Claude macro backfill — all 419 recipes pre-populated (scripts/backfill-macros.mjs)
17. ✅ Dev recipe flagging — red flag button on detail modal (__DEV__ only), Dev Tools in Profile
18. ✅ Macro-verified dietary tag matching (Bug 6) — scorer uses real macros over tags; 10pts verified, 5pts tag-only
19. ✅ Recipe steps backfilled — 419/419 via scripts/backfill-steps.mjs; tab switcher UI in RecipeDetailModal
20. 🔲 Grocery add scepticism scoring (Bug 12 — post-launch)
21. 🔲 Instacart integration (Phase 3)

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
| Nutrition / Macro Data | **Claude Haiku via /api/macros** — estimates from ingredients list | ✅ Live — Spoonacular removed |
| Recommendation Engine | **Local weighted scorer** (on-device, lib/api.ts) | ✅ Live — no API cost, no latency |
| Serverless Functions | Vercel | ✅ Deployed |
| AI — Taste Profile | Claude Haiku via /api/taste-profile | ✅ Live |
| AI — Recipe Gen | Claude Haiku via /api/generate-recipe | ✅ Live |
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
│       │                                 RecipeDetailModal, mark as cooked
│       ├── recipes.tsx                ✅ Pinterest grid, Saved/All tabs, filter dropdown,
│       │                                 collections bar, interaction logging, RecipeDetailModal
│       ├── grocery-list.tsx           ✅ Tally header, grouped categories, checkboxes,
│       │                                 edit mode, undo, copy-to-clipboard export
│       └── profile.tsx                ✅ Stats, taste profile card, preferences, edit modal,
│                                         sign out, clears discover + recipe cache on pref save
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
│   ├── RecipeDetailModal.tsx          ✅ Slide-up pageSheet, Ingredients/Instructions tabs,
│   │                                     MacroRow, serving adjuster, mark as cooked,
│   │                                     post-cook rating, storage tips, dev flag button
│   └── ui/
│       ├── MacroRow.tsx               ✅ MacroRow (full 4-col), HeadlineMacroPill (goal-aware),
│       │                                 estimateMacrosLocally (instant local estimate)
│       └── MiseLogo.tsx               ✅
├── lib/
│   ├── supabase.ts                    ✅
│   ├── api.ts                         ✅ All DB calls + local recommendation scorer:
│   │                                     fetchDiscoverRecipes(dietaryGoals) — Supabase deck, 30-min cache
│   │                                     fetchScoredDeck(userId, dietaryGoals, profile, savedIds) — local scorer
│   │                                     getRecentSwipes(userId, limit) — swipe history with timestamps
│   │                                     clearDiscoverCache()
│   │                                     upsertRecipeByExternalId(recipe)
│   │                                     resolveSupabaseId(recipe)
│   │                                     updateRecipeDetail / updateRecipeMacros — lazy persist
│   │                                     logSwipe / logInteraction
│   │                                     fetchMacros / estimateMacrosLocally
│   │                                     saveRecipe / removeRecipe / setRecipeLiked / getSavedRecipes
│   │                                     addPantryItems / upsertProfile / patchProfile
│   ├── mealdb.ts                      ✅ fetchMealDBRecipes, fetchMealDetail, fetchMealDBRecipesByCategory
│   │                                     shouldExclude(title, goals) — dietary filter for deck
│   │                                     clearRecipeCache()
│   └── utils.ts                       ✅ formatTime, formatCost, capitalize, getWeekStart, getTimeOfDay
├── stores/
│   ├── userStore.ts                   ✅
│   ├── savedStore.ts                  ✅ Supabase-backed
│   ├── groceryStore.ts                ✅ full
│   ├── collectionsStore.ts            ✅ FAVORITES_ID + custom collections
│   └── mealPlanStore.ts               🔲 Placeholder
├── types/
│   └── index.ts                       ✅ All types including supabase_id?: string on Recipe
├── constants/
│   └── theme.ts                       ✅
├── api/
│   ├── macros.ts                      ✅ Vercel fn
│   ├── recommendations.ts             ✅ Vercel fn — built, not used for deck ranking
│   ├── taste-profile.ts               ✅ Vercel fn
│   ├── generate-recipe.ts             ✅ Vercel fn
│   └── seed-recipes.ts                ✅ Vercel fn — already ran, do not re-run
├── scripts/
│   ├── seed-recipes.mjs               ✅ One-time (already ran)
│   ├── backfill-recipe-details.mjs    ✅ Safe to re-run, skips populated
│   ├── backfill-macros.mjs            ✅ Claude Haiku macro estimation for all recipes
│   ├── backfill-steps.mjs             ✅ TheMealDB strInstructions → parsed steps
│   ├── generate-recipes.mjs           ✅ Bulk recipe generator
│   └── clean-recipes.mjs              ✅ Jaccard dedup + Haiku tag validation
├── supabase/
│   └── schema.sql                     ✅ Full schema
└── README.md                          ✅ Full setup guide
```

---

## 5. Design System

### Colors (from constants/theme.ts — never hardcode hex values)
```typescript
export const colors = {
  primary: '#2E7D32',
  primaryLight: '#E8F5E9',
  primaryDark: '#1B5E20',
  white: '#FFFFFF',
  background: '#F9F9F9',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#666666',
  border: '#E0E0E0',
  error: '#D32F2F',
  swipeRight: '#2E7D32',
  swipeLeft: '#D32F2F',
}
```

### Typography
- Font: System default (SF Pro on iOS)
- Headings: Bold, sizes 28 / 24 / 20 / 18
- Body: Regular, size 16
- Caption: Regular, size 13, color textMuted

### Spacing
Multiples of 4: 4, 8, 12, 16, 20, 24, 32, 48

### Border Radius
- Cards: 16px — Buttons: 12px — Pills/Tags: 999px — Tiles: 12px

---

## 6. Core Features — Detailed Behaviour

### 6.1 Two App Modes
- **Meal Prep Mode** — full week planning, longer swipe stack, weekly grocery order
- **Spontaneous Mode** — tight 5-8 card stack, contextual, same-day delivery option

### 6.2 Onboarding Flow — 10 Screens

| # | Screen | Status |
|---|---|---|
| 1 | Welcome | ✅ |
| 2 | Dietary Goals | ✅ free text field added |
| 3 | Ingredient Dislikes | ✅ built |
| 4 | Cuisine Preferences (12 universal) | ✅ |
| 5 | Eating Style | ✅ built |
| 6 | Cooking Frequency | ✅ |
| 7 | Skill Level | ✅ |
| 8 | Budget | ✅ |
| 9 | Account Creation | ✅ |
| 10 | Payoff + Pantry Seed | ✅ |

**Screen 3 — Ingredient Dislikes — critical rule:**
Hard filters. Any recipe containing a disliked ingredient is removed entirely — never soft-deprioritised. Enforced at the data layer, not the UI layer. Currently broken — Bug 1 above.

**Screen 4 — Cuisine Preferences:**
12 universal cuisines only: Italian, Mexican, Chinese, Japanese, Indian, American, Mediterranean, Thai, French, Greek, Korean, Middle Eastern. Do NOT add niche cuisines here — they are surfaced as adventure cards.

**Screen 5 — Eating Style:**
- "Quick and simple most nights" → scorer boosts ≤30 min recipes
- "Variety is everything" → diversity constraint enforced post-sort
- "I find favourites and rotate them" → scorer surfaces familiar cuisines

### 6.3 Swipe Experience
Every swipe logged to Supabase immediately — non-negotiable scorer training data.

### 6.4 Macros
- **On swipe cards:** One headline macro based on primary dietary goal. No macro shown if no relevant goal.
- **On recipe detail:** Full MacroRow — calories, protein, carbs, fat. Always visible. Per serving / full batch toggle.
- **Disclaimer:** "Values are estimates and may vary" beneath all macro displays.
- **Source:** Claude Haiku estimates macros from the recipe's ingredients list via `/api/macros`. Results cached in `recipes.macros` permanently — served from Supabase to all users after first fetch. Always labelled "estimated".

### 6.5 Recipe Library
Pinterest grid. Saved tab default. Badge types: Staff Pick, Community Verified, Community Favorite.

### 6.6 Grocery List
Tally header → grouped by category → checkboxes → copy to clipboard. Instacart button Phase 3.

### 6.7 Pantry Tracking (Low Stakes, Opt-In)
Not a main tab. Seeded during onboarding payoff. Manual edit in Profile → Pantry. Feeds pantry match indicator on swipe cards (not yet built).

### 6.8 Adventure Cards — Skill-Aware Cuisine Expansion
Niche cuisines never shown during onboarding. Introduced as earned rewards in Discover feed.

**Rules:**
- Only `home_cook` and `confident_chef` — never `beginner`
- First card after ~20 swipes AND minimum 8 right swipes AND right-swipe ratio ≥ 30%
- Cuisine selected by adjacency to liked cuisines (Italian → Greek/Moroccan, Korean → Vietnamese/Thai, Mexican → Peruvian/Caribbean)
- Subtle "✦ New for you" badge
- Left swipe = wait longer before next adventure card
- Can be disabled in Profile → Settings ("Keep it familiar")

---

## 7. Recommendation Engine — Local Weighted Scorer

### Why Local Scorer Instead of Claude API
Claude Sonnet was built into `/api/recommendations` and wired to the Discover screen. It returned 0 results in testing because LLMs cannot reliably reproduce UUIDs — Sonnet generated plausible-looking but invalid IDs. The local scorer solves this cleanly:
- **Zero latency** — runs on-device after one Supabase fetch
- **Zero API cost** — no Claude call per session
- **Fully debuggable** — scores are inspectable, weights are tunable
- **No UUID problem** — all matching done in JS

### When Claude Is Still Used
- **Taste profile** — language task, Claude Haiku reads swipe history and writes a 2-3 sentence paragraph
- **Macro estimation** — Claude Haiku estimates macros from ingredients list (always, Spoonacular removed)
- **Recipe generation** — Claude Haiku generates new recipes for the seed database

### Current Scoring Formula
```
score = random_jitter (0–0.5)
      + cohort_affinity × 4           // cold-start baseline from 248,886 affinity rows
      + cuisine_match × 3
      + macro_verified_goal × 10 each  // protein≥25, keto≤10 netCarbs, etc.
      + tag_only_goal × 5 each         // fallback if no macros or non-macro goal
      + quick_simple_bonus × 2        // eating_style = quick_simple AND ≤30 min total
      - quick_simple_penalty × 2      // eating_style = quick_simple AND >45 min total
      + right_swipe × 5 × decay       // decay = e^(-days/30)
      - left_swipe × 15 × decay
      + Math.min(grocery_add_count, 2) × 3    // CAPPED — Bug 2 fix
      + Math.min(cooked_count, 2) × 4         // CAPPED — Bug 2 fix
      - saved × 3
```

### Signal Hierarchy (strongest → weakest)
1. `recipe_interactions.cooked` — explicit cook confirmation (capped at 2)
2. `recipe_interactions.grocery_add` × N — repeated grocery-listing (capped at 2)
3. `swipe_events.direction = 'right'` with 30-day exponential decay
4. `recipe_cohort_affinities.affinity_score` — cold-start cohort baseline
5. Cuisine + dietary tag match — static preference alignment
6. `swipe_events.direction = 'left'` with 30-day exponential decay
7. `saved_recipes` presence — soft deprioritisation

### Recency Decay
```typescript
// Applied to all swipe signals
const recencyWeight = (interactedAt: string): number => {
  const daysSince = (Date.now() - new Date(interactedAt).getTime()) / (1000 * 60 * 60 * 24)
  return Math.exp(-daysSince / 30)
  // Today = 1.0 | 30 days ago = 0.37 | 90 days ago = 0.05
}
```

---

## 8. Scorer Edge Cases — Documented Fixes

These are known edge cases in the scoring system. The four marked 🔥 must be fixed before beta. The rest are improvements to implement in Phase 2.

### 🔥 Bug 1 — Ingredient dislike hard filter missing
See Section 2 Known Bugs. Fix in `fetchScoredDeck` before scoring loop.

### 🔥 Bug 2 — Cooked/grocery_add feedback loop
See Section 2 Known Bugs. Cap both signals at `Math.min(count, 2)`.

### 🔥 Bug 3 — Variety eating style has no diversity enforcement
See Section 2 Known Bugs. Post-sort diversity pass with `maxPerCuisine = 3` for variety users.

### 🔥 Bug 4 — MacroRow not wired to recipe detail modal
See Section 2 Known Bugs. Wire existing component, call fetchMacros if macros null.

---

### Bug 5 — Pantry match gaming (Phase 2)
Users who seed common staples (salt, olive oil, garlic) get near-100% pantry match on almost every recipe because those ingredients appear everywhere. The signal becomes noise.

**Fix — ingredient specificity weighting:**
```typescript
const COMMON_STAPLES = new Set([
  'salt', 'pepper', 'olive oil', 'oil', 'water', 'butter',
  'garlic', 'onion', 'flour', 'sugar', 'eggs'
])

function getPantryMatch(recipeIngredients, pantryItems): number {
  const pantrySet = new Set(pantryItems.map(p => p.ingredient_name.toLowerCase()))
  let weightedMatches = 0
  let totalWeight = 0

  for (const ingredient of recipeIngredients) {
    const name = ingredient.name.toLowerCase()
    const weight = COMMON_STAPLES.has(name) ? 0.2 : 1.0
    totalWeight += weight
    if (pantrySet.has(name)) weightedMatches += weight
  }

  return totalWeight === 0 ? 0 : (weightedMatches / totalWeight) * 20
}
```

### Bug 6 — Dietary tag quality (improve after Claude macro backfill)
TheMealDB recipe tags are inconsistent — a recipe tagged "high_protein" may only have 15g protein. The scorer trusts tags blindly.

**Fix — macro-verified tag matching:**
```typescript
function getGoalMatch(recipe, userGoals): number {
  let score = 0
  for (const goal of userGoals) {
    if (recipe.macros) {
      // Trust verified macro data over tags
      if (goal === 'high_protein' && recipe.macros.protein >= 25)        score += 10
      else if (goal === 'keto' && recipe.macros.netCarbs <= 10)          score += 10
      else if (goal === 'low_fat' && recipe.macros.fat <= 10)            score += 10
      else if (goal === 'low_carb' && recipe.macros.carbohydrates <= 30) score += 10
    } else {
      // No macro data yet — half points for unverified tags
      if (recipe.dietary_tags.includes(goal)) score += 5
    }
  }
  return score
}
```
Automatically improves as Claude macro backfill completes and `recipes.macros` is populated.

### Bug 7 — Cold session: left-swiped cards reappearing (Phase 2)
The cache window is 30 minutes. If a user swipes through 15 cards and re-opens the app within that window, the deck hasn't refreshed. Left-swiped recipes can reappear.

**Fix — session-level in-memory tracking:**
```typescript
// Module-level sets, reset on app close — not persisted
const sessionLeftSwipes = new Set<string>()
const sessionShownIds = new Set<string>()

export function recordSessionSwipe(recipeId: string, direction: 'left' | 'right') {
  sessionShownIds.add(recipeId)
  if (direction === 'left') sessionLeftSwipes.add(recipeId)
}

export function getSessionPenalty(recipeId: string): number {
  if (sessionLeftSwipes.has(recipeId)) return -999
  if (sessionShownIds.has(recipeId))   return -999
  return 0
}
```
Apply `getSessionPenalty` as the very first check in `scoreRecipe`, before any other calculation. This is separate from Supabase-persisted history — in-memory only, resets on app close.

### Bug 8 — Skill level mismatch (Phase 2)
Beginner users can see advanced, time-intensive recipes if they score well on other signals.

**Fix — hard cap, not score penalty:**
```typescript
function isAppropriateForSkillLevel(recipe, skillLevel): boolean {
  const totalTime = (recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0)

  if (skillLevel === 'beginner') {
    if (recipe.difficulty === 'advanced') return false
    if (totalTime > 60) return false
  }
  if (skillLevel === 'home_cook') {
    if (totalTime > 120) return false
  }
  return true // confident_chef sees everything
}

// Apply before scoring — filter pool before scoreRecipe runs
const eligibleRecipes = recipes.filter(r =>
  isAppropriateForSkillLevel(r, profile.skill_level)
)
```

### Bug 9 — Zero-result edge case (implement before beta)
Highly restrictive dietary combinations (vegan + gluten free + keto — contradictory goals) combined with a long ingredient dislikes list can filter out nearly the entire 419-recipe pool. Never show an empty deck.

**Fix — graceful relaxation cascade:**
```typescript
function buildDeckWithFallback(recipes, user, context) {
  // Attempt 1 — full constraints
  let deck = buildDeck(recipes, user, context, {
    diversityConstraint: true, skillFilter: true, eatingStyleBoost: true
  })
  if (deck.length >= 10) return deck

  // Attempt 2 — relax diversity constraint
  deck = buildDeck(recipes, user, context, {
    diversityConstraint: false, skillFilter: true, eatingStyleBoost: true
  })
  if (deck.length >= 10) return deck

  // Attempt 3 — relax skill filter too
  deck = buildDeck(recipes, user, context, {
    diversityConstraint: false, skillFilter: false, eatingStyleBoost: false
  })
  if (deck.length >= 5) return deck

  // Attempt 4 — last resort, hard filters only
  // ingredient_dislikes and dietary exclusions are NEVER relaxed
  return buildDeckHardFiltersOnly(recipes, user)
}
```
Show a gentle message if the deck is very small: "Your preferences are pretty specific — here's what we found."

### Bug 10 — Adventure card timing
If a user swipes 20 times very fast but mostly left-swipes, there is not enough positive signal for Claude to make a good adjacency call for the adventure card cuisine.

**Fix — gate on positive signal ratio, not just count:**
```typescript
function isReadyForAdventureCard(profile, swipeHistory): boolean {
  const totalSwipes = swipeHistory.length
  const rightSwipes = swipeHistory.filter(s => s.direction === 'right').length
  const ratio = totalSwipes > 0 ? rightSwipes / totalSwipes : 0

  return (
    profile.skill_level !== 'beginner' &&
    totalSwipes >= 20 &&
    rightSwipes >= 8 &&
    ratio >= 0.3
  )
}
```

### Bug 11 — New user, session one (already partially handled)
A brand new user has zero swipe history, zero interactions. Cohort affinity carries the full weight on session one. The pantry seed and ingredient dislikes from onboarding add signal immediately — make sure scorer uses both before any swipes exist.

**Fix — first session pantry boost:**
```typescript
const isFirstSession = profile.total_sessions <= 1
if (isFirstSession && pantryItems.length > 0) {
  // Force pantry-matching recipes to top of first deck
  // This powers the "You can make this tonight" magic moment
  score += pantryMatchRatio === 1.0 ? +50 : 0
}
```

### Bug 12 — Grocery add without cook (low priority, improve post-launch)
Some users add recipes to their grocery list speculatively and never cook them. A recipe grocery-added 5 times but never cooked may represent aspiration rather than actual preference. The signal is ambiguous.

**Fix (after mark as cooked is established in user habits):**
```typescript
function getGroceryAddSignal(recipeId, interactions): number {
  const adds   = interactions.filter(i => i.recipe_id === recipeId && i.interaction_type === 'grocery_add')
  const cooks  = interactions.filter(i => i.recipe_id === recipeId && i.interaction_type === 'cooked')
  const addCount = Math.min(adds.length, 2)

  // Reduce confidence if added multiple times but never cooked
  const conversionPenalty = addCount >= 2 && cooks.length === 0 ? 0.7 : 1.0
  return addCount * 3 * conversionPenalty
}
```
Only implement once "mark as cooked" is established in user behaviour — otherwise the penalty fires unfairly.

---

### Fix Priority Summary

| # | Bug | Priority | Effort |
|---|---|---|---|
| 1 | Ingredient dislike hard filter | 🔥 Before beta | ~20 lines |
| 2 | Cooked/grocery_add signal cap | 🔥 Before beta | 2 lines |
| 3 | Variety diversity pass | 🔥 Before beta | ~30 lines |
| 4 | MacroRow on recipe detail | 🔥 Before beta | ~20 lines |
| 9 | Zero-result fallback | Before beta | ~40 lines |
| 7 | Session left-swipe tracking | Phase 2 | ~20 lines |
| 8 | Skill level hard cap | Phase 2 | ~15 lines |
| 5 | Pantry specificity weighting | Phase 2 | ~25 lines |
| 6 | Macro-verified goal matching | Phase 2 (post Claude macro backfill) | ~20 lines |
| 10 | Adventure card gating | Phase 2 (with adventure cards) | ~10 lines |
| 11 | First session pantry boost | Phase 2 | ~5 lines |
| 12 | Grocery add scepticism | Post-launch | ~15 lines |

---

## 9. Database Schema

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
  taste_profile jsonb,                 -- { text: string, generated_at: string }
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
  ingredients jsonb not null,
  steps jsonb not null,
  prep_time_mins integer,
  cook_time_mins integer,
  servings integer,
  cost_per_serving numeric(6,2),
  dietary_tags text[] default '{}',
  meal_prep_friendly boolean default false,
  macros jsonb,
  badge text check (badge in ('none', 'staff_pick', 'community_verified', 'community_favorite')) default 'none',
  submitted_by uuid references profiles(id),
  avg_rating numeric(3,2) default 0,
  rating_count integer default 0,
  save_count integer default 0,
  image_url text,
  spoonacular_id text,
  external_id text,
  created_at timestamp with time zone default now()
);

-- Swipe Events
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
  items jsonb not null,
  recipe_ids uuid[] default '{}',
  estimated_total_cost numeric(8,2),
  combined_macros jsonb,
  instacart_cart_url text,
  created_at timestamp with time zone default now()
);

-- Meal Plans
create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  week_start_date date not null,
  is_public boolean default false,
  slots jsonb default '[]',
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

-- Recipe Interactions
create table recipe_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  interaction_type text check (interaction_type in ('view', 'grocery_add', 'cooked')) not null,
  session_number integer,
  interacted_at timestamp with time zone default now()
);

-- Recipe Cohort Affinities
create table recipe_cohort_affinities (
  recipe_id uuid references recipes(id) not null,
  cohort_key text not null,
  affinity_score numeric(4,3),
  primary key (recipe_id, cohort_key)
);
```

---

## 10. API Endpoints (Vercel Serverless Functions)

```
POST /api/macros
  Body: { spoonacularId?, recipeTitle, ingredients }
  Returns: { macros: Macros }

POST /api/taste-profile
  Body: { userId }
  Returns: { tasteProfile: string | null, reason?: 'not_enough_data' }
  — Claude Haiku reads last 100 swipes + interactions, generates taste paragraph.
    Returns null if <5 swipes. Saves to profiles.taste_profile.

POST /api/generate-recipe
  Body: { cuisine, dietaryGoals, skillLevel, maxMins?, avoidDishes?: string[] }
  Returns: { recipe } or 409 if Jaccard similarity ≥60% to avoidDishes

POST /api/recommendations
  Body: { userId, mode, limit }
  Returns: { recipeIds: string[] }
  — Built, deployed, not used for deck ranking. Local scorer used instead.

POST /api/instacart-cart          [Phase 3]
POST /api/check-recipe            [Phase 4]
POST /api/storage-tip             [Phase 2]
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
INSTACART_PARTNER_ID=
INSTACART_API_KEY=
```

---

## 12. Coding Rules

1. **TypeScript everywhere** — no plain JS, strict mode on
2. **Never call Claude or Instacart from the client** — Vercel functions only
3. **Never expose secret keys in client code** — EXPO_PUBLIC_ prefix only on client
4. **Use Expo Router** — no React Navigation
5. **Inline styles + constants/theme.ts** — no NativeWind, no StyleSheet.create
6. **React Native Animated API** — do not migrate to Reanimated
7. **Zustand for all global state** — no Redux, no Context
8. **All Supabase calls through lib/api.ts** — never from screens directly
9. **All colors from constants/theme.ts** — no hardcoded hex values
10. **Every screen: loading state + error state** — no bare data fetching
11. **Log every swipe to Supabase** — non-negotiable scorer training data
12. **Log every recipe_interaction** — view, grocery_add, cooked. All are scorer signals.
13. **Ingredient dislikes are hard filters** — data layer, not UI layer. Currently broken — Bug 1 is top priority.
14. **Macros from Claude always labelled "estimated"**
15. **All interaction logging is fire-and-forget** — never block the UI
16. **Do not replace fetchScoredDeck with an API call** — local scorer is intentional
17. **Scorer signal caps** — grocery_add and cooked both capped at Math.min(count, 2)
18. **Diversity constraint always applied post-sort** — maxPerCuisine=3 for variety, 4 for all others

---

## 13. Phase Status

### ✅ Phase 1 — Complete
All foundation, onboarding, grocery list, macros, swipe logging done.

### 🔄 Phase 2 — Active (feat/phase-2-ai-layer)

**✅ Complete in Phase 2:**
- Vercel deployed — macros, taste-profile, generate-recipe, recommendations live
- Local weighted scorer (fetchScoredDeck) — replaces Claude for deck ranking
- Mark as cooked — logs cooked interaction
- Taste profile display — Claude Haiku generated, cached in DB
- resolveSupabaseId helper
- Recipe generation pipeline (generate-recipes.mjs + clean-recipes.mjs)

**Phase 2 — in priority order:**
- [x] Fix Bug 1 — ingredient dislike hard filter
- [x] Fix Bug 2 — cooked/grocery_add signal caps
- [x] Fix Bug 3 — variety diversity pass
- [x] Fix Bug 4 — MacroRow on recipe detail modal
- [x] Fix Bug 9 — zero-result fallback
- [x] Session-level left-swipe tracking (Bug 7)
- [x] Skill level hard cap on recipe pool (Bug 8)
- [x] Pantry specificity weighting + first-session boost (Bugs 5, 11)
- [x] Adventure cards (home_cook/confident_chef, ≥20 swipes, ≥8 right swipes, ≥30% ratio)
- [x] Adventure card cooldown, "Keep it familiar" toggle, "Made before" banner
- [x] Pantry tracking screen in Profile
- [x] Post-cook check-in flow (5-star rating)
- [x] /api/storage-tip endpoint
- [x] /api/macros — Spoonacular removed, Claude Haiku only
- [x] Recipe steps wired into RecipeDetailModal
- [x] Weekly meal planner (Plan tab)
- [x] mealPlanStore wired (loadPlan/savePlan async, Supabase-backed)
- [x] 10 edge-case bug fixes (race conditions, null safety, stale closures, session state)
- [x] Claude macro backfill — all 419 recipes pre-populated via scripts/backfill-macros.mjs
- [x] Dev recipe flagging — red flag button on RecipeDetailModal (__DEV__ only), AsyncStorage-backed, Dev Tools section in Profile with view/clear
- [x] Macro-verified goal matching (Bug 6) — scorer uses real macros; 10pts verified, 5pts tag-only fallback
- [x] Recipe steps backfilled — 419/419 via scripts/backfill-steps.mjs; Ingredients/Instructions tab switcher in RecipeDetailModal

### Phase 3 — Instacart Integration
- [ ] Apply to Instacart Developer Platform
- [ ] /api/instacart-cart Vercel function
- [ ] "Order on Instacart" button in grocery list
- [ ] Deep link via Linking.openURL()
- [ ] Impact affiliate tracking

### Phase 4 — Community
- [ ] Recipe submission + /api/check-recipe AI checker
- [ ] Badge system, public ratings, explore page

### Phase 5 — Social
- [ ] Follow system, public meal plans, community feed

---

## 14. Out of Scope — Do Not Build Yet

- DoorDash / Uber Eats full API integration
- Amazon Fresh / Walmart Grocery
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

## 15. Key Decisions Already Made

- **iOS first**
- **React Native Animated API** — do not migrate to Reanimated
- **Inline styles + theme.ts** — do not migrate to NativeWind
- **Local weighted scorer instead of Claude for deck ranking** — Claude Sonnet returned 0 results because LLMs cannot reliably reproduce UUIDs. Local scorer: zero latency, zero cost, fully tunable.
- **Claude still used for:** taste profile generation, macro estimation, recipe generation
- **Instacart Developer Platform** — affiliate commissions via Impact = primary revenue model
- **Copy/paste export Phase 1, Instacart Phase 3**
- **Account creation is screen 9 of 10**
- **Ingredient dislikes are hard filters** — currently broken, fix is top priority
- **Macros contextual** — headline pill on cards only if relevant goal; full row always on detail
- **Claude Haiku for all macro estimation** — Spoonacular removed. Claude estimates from ingredients list, cached in recipes.macros permanently. Always labelled "estimated".
- **Pantry is low stakes and opt-in** — not a main tab
- **Cold start solved by 248,886 cohort affinity rows**
- **All AI and external APIs server-side only**
- **Social features Phase 5**

---

*Mise CLAUDE.md — v4.0 — Phase 2 active. Local scorer live. All 12 scorer edge cases documented with fixes. Four pre-beta bugs identified and prioritised. Vercel deployed. Apple App Store submission: budget 1-2 weeks from submission-ready to live. Apple Developer Program ($99/yr) required before submission.*