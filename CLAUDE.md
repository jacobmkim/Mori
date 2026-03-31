# Mori — CLAUDE.md
> This file is the single source of truth for this project. Read it in full at the start of every session before writing any code. It reflects the actual current build state as of the latest update.

---

## 1. What We Are Building

**Mori** is a smart recipe discovery and grocery delivery app powered by personalised recommendations. The name comes from the Korean word for gathering and assembling — which is exactly what the app does. It gathers your taste, your pantry, and your week into one place and assembles everything you need to cook.

**Core loop:**
A local weighted scoring engine ranks recipes personalised to the user's taste, goals, and behaviour → user swipes yes or no on recipe cards → recipes save to personal library → user selects meals and builds a smart grocery list → list is sent to Instacart in one tap or copied to clipboard as a fallback.

**Note on delivery:** Mori uses the Instacart Developer Platform API — not a full logistics partnership. The grocery list is sent to Instacart as a pre-built cart and the user completes checkout inside the Instacart app. Mori earns affiliate commissions through Impact on every attributed order. DoorDash and Uber Eats full API integration remain out of scope.

**Value proposition:**
Mori is the first recipe app that feels genuinely personal from day one, gets smarter every session, surfaces simple macros for health-conscious users, and removes the biggest friction in home cooking — the gap between "what should I make?" and a grocery list ready to order. It does not try to control your oven, partner with appliance brands, or replace Instacart. It connects your taste, your pantry, and your week into a smart list that makes cooking feel like the easier choice.

**Competitive position:**
No competitor has a swipe-based discovery mechanic. Samsung Food (most formidable competitor) has 218,500+ recipes, 4.5M community members, and delivery from 23 retailers — but it is overwhelming and tied to Samsung hardware. Ollie owns AI family meal planning. Mealime owns quick weeknight dinners. Mori owns the exploratory everyday cook who wants to discover something new and get from "that looks good" to groceries ordered in one tap. Community (Phase 4–5) is a retention flywheel, not the primary differentiator.

---

## 2. Current Build State

> **Read this section first every session.** Phases 1, 2, 2.5, 2.6, and 2.7 are complete. Phase 3 (UX overhaul + TestFlight) is next — full spec in Section 18.

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
- userStore ✅, savedStore ✅ (Supabase-backed), groceryStore ✅ (full), collectionsStore ✅, mealPlanStore ✅ (Supabase-backed), discoverStore ✅ (mode state, AsyncStorage-persisted)

**Data / Seed**
- 419 TheMealDB recipes seeded in Supabase with cohort affinity scores (248,886 rows)
- All 419 recipes backfilled with full ingredients, steps, descriptions, and macros
- TheMealDB recipes use TheMealDB CDN image URLs — all 419 have real food photography
- **All 419 TheMealDB steps rewritten by Claude Haiku** — clean 5–8 step format, specific timings/technique, artifacts removed (`scripts/rewrite-steps.mjs`)
- **622 Claude-generated recipes live** — all tagged with `meal_prep_friendly` at generation time
- **Recipe images — gpt-image-1 (OpenAI)** — `scripts/generate-images.mjs` generates food photography via `gpt-image-1` medium quality (~$0.04/image), uploads to Supabase Storage (`recipe-images/generated/{id}.jpg`), writes permanent CDN URL to `recipes.image_url`. All 622 generated recipes have images. ✅ Complete.
- **Image prompts** — description-based: `buildPrompt()` uses recipe title + description + cuisine-specific plating context (Japanese → ceramic bowl + chopsticks, Indian → copper karahi, etc). Photography cues: 45° overhead, soft natural window light, shallow depth of field, warm tones, steam/sheen, authentic garnishes. No text/watermarks.
- **63 recipe descriptions updated** — curries now mention rice/naan, kebabs mention chutney/tzatziki, fried snacks mention dipping sauces — so accompaniments appear in generated images
- `OPENAI_API_KEY` in .env — required for `generate-images.mjs`
- Lazy macro persistence — Claude estimate written to recipes.macros once, served to all users thereafter
- MacroRow component (full + compact), HeadlineMacroPill, estimateMacrosLocally — components/ui/MacroRow.tsx
- MoriLogo component — components/ui/MoriLogo.tsx

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
| 1 | Navigation overhaul — 5 tabs + persistent avatar button replacing Profile tab | Phase 3 |
| 2 | Explore tab — editorial browse screen with sections (Cook Again, Trending, Just Added, Cuisine chips, Under 30 min, High Protein) | Phase 3 |
| 3 | Recipes tab redesign — My Recipes with Saved/Cooked/Mine/Meal Prep sub-tabs | Phase 3 |
| 4 | Recipe Detail redesign — full-screen modal, step cards, sticky footer, My Notes tab | Phase 3 |
| 5 | Cooking Mode — full-screen dark mode, step-by-step, per-step timer, keepScreenAwake | Phase 3 |
| 6 | My Notes — per-recipe notes, substitutions, tags, make-again signal, `recipe_notes` table | Phase 3 |
| 7 | Add Recipe wizard — 4-step: basics → ingredients (autocomplete) → steps (timer hints) → review | Phase 3 |
| 8 | Mobile spacing audit — 44pt touch targets, 16pt margins throughout | Phase 3 |
| 9 | Clean generated recipes — run `clean-recipes.mjs` dedup before TestFlight | Phase 3 |
| 10 | Strip prep instructions from ingredient fields — run `clean-ingredient-units.mjs` | Phase 3 |
| 11 | Fix profile page dark mode — white card backgrounds → `colors.card` | Phase 3 |
| 12 | Steamed/delicate fish hard-exclude from meal prep deck | Phase 3 |
| 13 | Walmart Recipes & Bundle API cart integration | Phase 4 |
| 14 | Kroger API cart integration | Phase 4 |
| 15 | Instacart Developer Platform cart integration | Phase 4 |
| 16 | Grocery ordering bottom sheet (Walmart / Kroger / Instacart / Copy) | Phase 4 |
| 17 | Affiliate tracking via Impact | Phase 4 |
| 18 | Grocery list history view | Phase 4 |
| 19 | Add Recipe goes public + /api/check-recipe AI validator | Phase 5 |
| 20 | Community badge system, public ratings, Creator Insights screen | Phase 5 |
| 21 | Follow system, public meal plans, community feed | Phase 6 |
| 22 | Grocery add scepticism scoring | Post-launch |

### ⚠️ Pre-Launch Required (Admin Tasks)
- **Apple Developer account** ($99/year) — apply now, 24-48hrs to process. Required before any App Store or TestFlight submission.
- **Apple AI transparency disclosure** — Apple requires explicit disclosure that user data is sent to Claude (Anthropic) for taste profile generation and macro estimation. Must be in privacy policy and surfaced in-app before submission.
- **TestFlight internal testing** — test on real devices before any external beta. No placeholder content, no crashes.
- **OpenAI API key** ✅ — `OPENAI_API_KEY` in .env, used by `generate-images.mjs` for gpt-image-1 food photography. All 622 images generated.
- **`getmori.app`** ✅ — domain registered. Landing page, App Store support URL (`https://getmori.app/support`), privacy policy (`https://getmori.app/privacy`).

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
| Recipe Images — Seeded | TheMealDB CDN URLs (all 419 have real food photography) | ✅ Live |
| Recipe Images — Generated | **gpt-image-1 (OpenAI)** via `scripts/generate-images.mjs` → Supabase Storage CDN | ✅ Live — all 622 done |
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
mori/
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
│       └── MoriLogo.tsx               ✅ Italic serif wordmark with green dot accent
├── lib/
│   ├── supabase.ts                    ✅
│   ├── api.ts                         ✅ All DB calls + local recommendation scorer
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
│   └── discoverStore.ts               ✅ mode ('spontaneous'|'meal_prep'), appearanceMode override, AsyncStorage-persisted
├── types/
│   └── index.ts                       ✅ All types including supabase_id?: string on Recipe
├── constants/
│   └── theme.ts                       ✅ lightTheme, darkTheme, mealPrepLightTheme, mealPrepDarkTheme
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
│   ├── backfill-steps.mjs             ✅ TheMealDB strInstructions → parsed steps — superseded by rewrite-steps.mjs
│   ├── rewrite-steps.mjs              ✅ Claude Haiku rewrites all TheMealDB steps — 419/419 done, clean 5-8 step format
│   ├── tag-meal-prep-recipes.mjs      ✅ All 419 tagged — new generated recipes tagged at generation time
│   ├── generate-recipes.mjs           ✅ Bulk generator — meal_prep_friendly at insert, safe to resume
│   ├── generate-images.mjs            ✅ gpt-image-1 food photography — all 622 done, uploads to Supabase Storage
│   │                                     Flags: --missing (skip existing), --test (50 random, timestamped folder),
│   │                                     --cleanse (wipe all Unsplash images first)
│   ├── backfill-images.mjs            ✅ Unsplash fallback backfill — superseded by generate-images.mjs
│   ├── clean-ingredient-units.mjs     ✅ Strips prep instructions from ingredient name/unit/quantity fields
│   └── clean-recipes.mjs              ✅ Jaccard dedup + Haiku tag validation — run before TestFlight
├── supabase/
│   └── schema.sql                     ✅ Full schema
└── README.md                          ✅ Full setup guide
```

---

## 5. Design System

### Brand Identity

#### App Name
**Mori** — from the Korean word for gathering and assembling. Previously called Mise (conflicted with 3+ App Store apps). Renamed March 2026.

#### Logo — Wordmark
- Typeface: Georgia, serif — italic, weight 400
- Letterforms: lowercase `mori` in italic serif
- Letter spacing: −1 to −1.5 (tight, editorial)
- Accent: single dot above the `i` — matches primary green of the current theme
- In-app nav: wordmark only, no tagline, left-aligned top of Discover screen
- Component: `components/ui/MoriLogo.tsx`

```
Spontaneous Light:  text #2E7D32,  dot #2E7D32
Spontaneous Dark:   text #F0EDE6,  dot #4CAF50
Meal Prep Light:    text #2E5438,  dot #2E5438
Meal Prep Dark:     text #F0EDE6,  dot #4CAF50
```

#### App Icon — Linen Light (single version, all contexts)
The icon never changes between themes — always linen light. Consistent home screen presence regardless of system mode.

- Background: `#F8F3EC` (warm linen)
- Letter: italic Georgia lowercase `m`, fill `#2E5438` (deep moss)
- Dot: circle, fill `#2E5438`, positioned top-right above the `m`
- Border: `0.5px solid #E0D4C4` — subtle warm edge, prevents blending into light wallpapers
- Exception: in Meal Prep Light mode header, add `1.5px solid #2E5438` border so icon remains visible against linen background
- Corner radius: iOS squircle — use Xcode automatic rounding, do not manually round in asset

#### Typography — Direction A (locked)
Recipe titles and headings use italic serif. Body, metadata, and UI elements use system sans-serif. Matches the editorial quality of the wordmark. Differentiates every recipe card from every competitor.

```
Recipe card title:      Georgia, serif, italic, 400, ~21px
Recipe detail title:    Georgia, serif, italic, 400, ~24px
Section headings:       Georgia, serif, italic, 700, ~18px
Metadata (cuisine/time):SF Pro, sans-serif, 400, 11px, uppercase, letter-spacing 0.08em
Body / instructions:    SF Pro, sans-serif, 400, 16px
Macro pills:            SF Pro, sans-serif, 600, 11px
```

The contrast between italic serif titles and tight-tracked sans metadata is intentional and distinctive. Do NOT make recipe titles sans-serif. Do NOT make metadata serif.

---

### Theme Architecture

Mori has four theme states. Use the `useTheme()` hook to get the correct theme everywhere — never import a static color object directly from theme.ts.

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
```typescript
export const lightTheme = {
  primary:      '#2E7D32',
  primaryLight: '#E8F5E9',
  primaryDark:  '#1B5E20',
  background:   '#F9F9F9',
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
```typescript
export const darkTheme = {
  primary:      '#4CAF50',
  primaryLight: '#1B2E1C',
  primaryDark:  '#2E7D32',
  background:   '#0D0D0D',
  card:         '#1A1A1A',
  text:         '#F0EDE6',
  textMuted:    '#9E9E9E',
  border:       '#2C2C2C',
  tabBar:       '#111111',
  tabBorder:    '#2C2C2C',
  error:        '#EF5350',
  swipeRight:   '#4CAF50',
  swipeLeft:    '#EF5350',
  white:        '#FFFFFF',
}
```

### Meal Prep Light — Linen & Moss ✦
Warm linen background, deep moss green. Intentional, grounded, Sunday prep energy.
```typescript
export const mealPrepLightTheme = {
  primary:      '#2E5438',
  primaryLight: '#E0EDD8',
  primaryDark:  '#1A3820',
  background:   '#F8F3EC',
  card:         '#FFFFFF',
  text:         '#1A1408',
  textMuted:    '#5A5040',
  border:       '#D8CCBC',
  tabBar:       '#F0E8DC',
  tabBorder:    '#D8CCBC',
  toggleBg:     '#EDE5D8',
  weekBarBg:    '#E0EDD8',
  dayFilled:    '#2E5438',
  dayEmpty:     '#B8D0B0',
  error:        '#D32F2F',
  swipeRight:   '#2E5438',
  swipeLeft:    '#D32F2F',
  white:        '#FFFFFF',
}
```

### Meal Prep Dark
```typescript
export const mealPrepDarkTheme = {
  primary:      '#4CAF50',
  primaryLight: '#1A3028',
  primaryDark:  '#2E7D32',
  background:   '#0F1F1A',
  card:         '#1E2E28',
  text:         '#F0EDE6',
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

### Typography (legacy — superseded by Direction A above for recipe titles)
- Font: System default (SF Pro on iOS)
- Body: Regular, size 16
- Caption: Regular, size 13, color textMuted

### Spacing
Multiples of 4: 4, 8, 12, 16, 20, 24, 32, 48

### Border Radius
Cards: 16px — Buttons: 12px — Pills/Tags: 999px — Tiles: 12px

### Mode Transition
Animate background and tab bar with 300ms fade when switching modes. Deliberate and satisfying, not instant.

---

## 6. Core Features — Detailed Behaviour

### 6.1 Two App Modes

A pill toggle at the top of the Discover screen switches between modes. Persists to AsyncStorage via `discoverStore`.

**Spontaneous Mode** (default)
- Tight 5-8 card stack, contextual, time-aware, pantry-aware
- Right swipe saves to library
- Same-day delivery option via Instacart (Phase 3)

**Meal Prep Mode**
- Longer 20-30 card stack
- Deck weighted toward `meal_prep_friendly` recipes (+8 score boost)
- Recipes that don't reheat penalised (−10)
- Right swipe triggers slot picker — 7-day × 3 meal-type bottom sheet
- User assigns recipe to slot + sets servings (1×/2×/3×)
- Week progress indicator: "3 of 7 days planned"
- Mode-aware grocery list header showing full week summary
- All swipes logged with `mode: 'meal_prep'`

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

**Screen 3:** Hard filters enforced in `fetchScoredDeck` before scoring. Disliked ingredient = recipe removed entirely.
**Screen 4:** 12 universal cuisines only. Niche cuisines surfaced as adventure cards.
**Screen 5:** Quick/simple → boosts ≤30 min | Variety → diversity constraint | Favourites → familiar cuisines

### 6.3 Swipe Experience
Every swipe logged to Supabase immediately — non-negotiable scorer training data.

### 6.4 Macros
- Swipe cards: one headline macro based on primary dietary goal. Nothing if no relevant goal.
- Recipe detail: full MacroRow — calories, protein, carbs, fat. Per serving / full batch toggle.
- Disclaimer: "Values are estimates and may vary"
- Source: Claude Haiku estimates from ingredients list. `isEstimated: true` always. Cached in `recipes.macros` permanently. Spoonacular removed.

### 6.5 Recipe Library
Pinterest grid. Saved / All / Plan tabs. Plan tab = weekly meal planner. Badge types: Staff Pick, Community Verified, Community Favorite.

### 6.6 Grocery List
Tally header → grouped by category → checkboxes → copy to clipboard. Instacart button Phase 3.

### 6.7 Pantry Tracking (Low Stakes, Opt-In)
Not a main tab. Seeded during onboarding. Manual edit in Profile → My Pantry. Feeds pantry specificity-weighted scoring — common staples worth 0.2 vs 1.0.

### 6.8 Adventure Cards — Skill-Aware Cuisine Expansion
- Only `home_cook` and `confident_chef` — never `beginner`
- Gate: ≥20 swipes AND ≥8 right swipes AND ≥30% ratio — all three required
- Cuisine by adjacency: Italian → Greek/Moroccan | Korean → Vietnamese/Thai | Mexican → Peruvian/Caribbean
- "✦ New for you" amber badge, 10-swipe cooldown, "Keep it familiar" toggle in Profile

---

## 7. Recommendation Engine — Local Weighted Scorer

### Why Local Scorer
Claude Sonnet was tested in `/api/recommendations` — returned 0 results because LLMs cannot reliably reproduce UUIDs. Local scorer: zero latency, zero cost, fully debuggable, no UUID problem.

### When Claude Is Still Used
- Taste profile — reads swipe history, writes 2-3 sentence paragraph
- Macro estimation — estimates from ingredients list, `isEstimated: true` always
- Recipe generation — generates new recipes with two-prompt validation
- Storage tips — post-cook storage/usage tips

### Scoring Formula
```
score = session_penalty (-999 if shown/left-swiped this session)
      + random_jitter (0–0.5)
      + cohort_affinity × 4
      + cuisine_match × 3
      + macro_verified_goal × 10
      + tag_only_goal × 5
      + quick_simple_bonus × 2
      - quick_simple_penalty × 2
      + right_swipe × 5 × decay
      - left_swipe × 15 × decay
      + Math.min(grocery_add_count, 2) × 3
      + Math.min(cooked_count, 2) × 4
      - saved × 3
      + pantry_match_ratio × 20
      + first_session_full_match × 50
      + meal_prep_friendly × 8
      - meal_prep_unfriendly × 10
```

Decay: `Math.exp(-daysSince / 30)` — Today=1.0 | 30 days=0.37 | 90 days=0.05

---

## 8. Scorer Edge Cases — All Fixed

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

---

## 9. Recipe Generation — Two-Prompt Validation + Image Sourcing

### The Problem Claude Cannot Solve Alone
Claude generates recipe text well but has two gaps:
1. It can produce plausible-sounding but fictional dishes or incorrect ingredient ratios
2. It cannot generate images — it has no image output capability

Both gaps are solved by the pipeline below.

### Two-Prompt Validation

Every generated recipe goes through a two-call validation before being written to Supabase. Expected discard rate: ~10-15%. Do not lower thresholds to increase throughput.

**Prompt 1 — Generation with constraints:**
```typescript
const systemPrompt = `You are a professional chef and recipe writer.
You ONLY generate recipes for real, well-established dishes that home
cooks actually make. You never invent fictional combinations or made-up
fusion dishes. Quantities must be correctly proportioned for the stated
serving size. Cooking times and temperatures must be appropriate for
the methods described. If you are not confident a dish is real and
well-established, do not generate it.`
```

**Prompt 2 — Self-validation:**
```typescript
const validatePrompt = `You are a culinary expert reviewing a recipe
for accuracy before publication. Check:
1. Is this a real, established dish home cooks actually make?
2. Are ingredient quantities correctly proportioned for the serving size?
3. Are cooking temperatures and times realistic?
4. Are there dangerous, inedible, or technically flawed combinations?

Respond with JSON only:
{
  "valid": true,
  "confidence": 0-100,
  "dish_is_real": true,
  "issues": []
}`
```

**Acceptance thresholds — all must be true:**
- `valid: true`
- `confidence >= 85`
- `dish_is_real: true`
- `issues` array empty or minor notes only

### Image Sourcing — Unsplash API (primary) + Pexels (fallback)

Claude cannot generate images. Generated recipes get their thumbnail from Unsplash.

**Flow for each generated recipe:**
1. Search Unsplash: `GET https://api.unsplash.com/search/photos?query={recipeTitle}&orientation=landscape&per_page=1`
2. If result found: use `results[0].urls.regular` as `image_url`
3. If no Unsplash result: search Pexels: `GET https://api.pexels.com/v1/search?query={cuisine}+food&per_page=1`
4. If neither returns a result: use a cuisine-level fallback image stored in Supabase storage

**Image source summary:**
- TheMealDB recipes (419) → TheMealDB CDN URLs ✅
- Claude-generated recipes → Unsplash → Pexels fallback → Supabase fallback
- Community-submitted recipes (Phase 4) → user uploads their own photo

### Cost
- Unsplash: free, 45 req/hour rate limiter in script, auto-pauses and resumes
- Two Claude Haiku validation calls per recipe: ~$0.001 total
- 1,200 generated recipes: ~$1.20 in Claude costs + free image fetches

### Human Spot-Check
Before any large batch goes live, manually read 20-30 generated recipes and cook 2-3 of them.

### Environment Variables Required
```bash
UNSPLASH_ACCESS_KEY=     # ✅ registered, in .env
PEXELS_API_KEY=          # register at pexels.com/api — free
```

---

## 10. Database Schema

```sql
create table profiles (
  id uuid references auth.users primary key,
  name text, avatar_url text,
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

create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, cuisine text,
  source_type text check (source_type in ('curated', 'community', 'imported')),
  ingredients jsonb not null,
  steps jsonb not null,
  prep_time_mins integer, cook_time_mins integer, servings integer,
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
  quantity numeric, unit text,
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
  slots jsonb default '[]',
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

## 11. API Endpoints (Vercel — all deployed)

```
POST /api/macros                   ✅ Live
POST /api/taste-profile            ✅ Live
POST /api/generate-recipe          ✅ Live
POST /api/storage-tip              ✅ Live
POST /api/recommendations          ✅ Built — not used (local scorer preferred)
POST /api/instacart-cart           🔲 Phase 3
POST /api/check-recipe             🔲 Phase 4
```

---

## 12. Environment Variables

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=https://project-x-one-roan.vercel.app

# Vercel only — never in client code
ANTHROPIC_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UNSPLASH_ACCESS_KEY=       # ✅ registered, in .env
PEXELS_API_KEY=            # free — register at pexels.com/api
INSTACART_PARTNER_ID=      # Phase 3
INSTACART_API_KEY=         # Phase 3
```

---

## 13. Coding Rules

1. **TypeScript everywhere** — no plain JS, strict mode on
2. **Never call Claude or Instacart from the client** — Vercel functions only
3. **Never expose secret keys in client code** — EXPO_PUBLIC_ prefix only
4. **Use Expo Router** — no React Navigation
5. **Inline styles + constants/theme.ts** — no NativeWind, no StyleSheet.create
6. **React Native Animated API** — do not migrate to Reanimated
7. **Zustand for all global state** — no Redux, no Context
8. **All Supabase calls through lib/api.ts** — never from screens directly
9. **All colors via `useTheme()` hook** — never hardcode hex values, never import static colors directly
10. **Every screen: loading state + error state** — no bare data fetching
11. **Log every swipe to Supabase** — non-negotiable scorer training data
12. **Log every recipe_interaction** — view, grocery_add, cooked
13. **Ingredient dislikes are hard filters** — enforced in fetchScoredDeck before scoring
14. **All macros labelled "estimated"** — never present as precise values
15. **All interaction logging is fire-and-forget** — never block the UI
16. **Do not replace fetchScoredDeck with an API call** — local scorer is intentional
17. **Scorer signal caps** — grocery_add and cooked capped at Math.min(count, 2)
18. **Diversity constraint always applied post-sort** — maxPerCuisine=3 for variety, 5 for others
19. **Generated recipe images via Unsplash first, Pexels fallback** — never AI image generation, never null image_url
20. **Recipe card titles use Georgia italic serif** — Direction A typography, never sans-serif for titles
21. **App name is Mori** — bundle ID `com.mori.app`, logo component is `MoriLogo.tsx`

---

## 14. Phase Status

### ✅ Phase 1 — Complete
Core app: onboarding, swipe mechanic, recipe detail, grocery list, local scorer, Supabase auth.

### ✅ Phase 2 — Complete
Recipe library, collections, profile, taste profile, macro estimation, adventure cards, trending badges, saved/cooked tracking.

### ✅ Phase 2.5 — Complete
Meal Prep Mode: 4-theme system, discoverStore, mode toggle, meal prep scoring, slot picker, serving multiplier, week progress indicator, mode-aware grocery header.

### ✅ Phase 2.6 — Complete
Dark mode fixes, "Already saved" badge, trending badge, MoriLogo dot, Plan tab as dedicated bottom tab, landing page + waitlist API.

### 🔄 Phase 2.7 — In Progress (AI Food Photography)
gpt-image-1 image generation replacing Unsplash. 50-image test complete, full run in progress.

---

### 🔲 Phase 3 — UX Overhaul + TestFlight Launch (NEXT — Q2 2026)

**This is the priority phase before any public launch.**

#### 3a — Immediate pre-flight (do these first, no code required)
- [x] Register `getmori.app` domain ✅
- [ ] Apple Developer Program confirmed ✅ — set up App Store Connect listing (app name: Mori, bundle ID: com.mori.app)
- [ ] Write privacy policy and publish at `getmori.app/privacy` — must disclose: data collected, Claude/Anthropic AI usage, Instacart integration, no ads
- [ ] Apple AI transparency disclosure — add in-app consent for Claude usage (taste profile generation, macro estimation)
- [ ] Deploy landing page to `getmori.app` via Vercel

#### 3b — UX Overhaul (full spec in Section 18)
- [ ] Navigation: remove Profile from tab bar, add avatar circle top-right on every screen
- [ ] **Explore tab** (`app/(tabs)/explore.tsx`) — new editorial browse screen replacing old "All" tab. Sections: Cook Again, Trending, Just Added, Browse by Cuisine, Under 30 min, High Protein (conditional). Full spec in Section 18.2.
- [ ] **Recipes tab redesign** (`app/(tabs)/recipes.tsx`) — personal library with 4 sub-tabs: Saved, Cooked, Mine, Meal Prep. "+ Add" button in header. Full spec in Section 18.3.
- [ ] **Recipe Detail redesign** — steps redesigned as cards with bold action title + detail text + inline timer pills. "Start cooking →" button. Sticky footer with Add to Grocery + Save always visible. Full spec in Section 18.4.
- [ ] **Cooking Mode** (`components/CookingMode.tsx`) — new full-screen dark mode component. One step at a time, per-step timer, per-step ingredients, progress bar, `keepScreenAwake: true`. Full spec in Section 18.5.
- [ ] **My Notes tab** in RecipeDetailModal — per-recipe personal notes with free text, substitutions field, tags, make-again signal. `recipe_notes` table (schema in Section 18.6). Full spec in Section 18.6.
- [ ] **Add Recipe wizard** (`app/add-recipe/`) — 4-step wizard: basics → ingredients (with autocomplete) → steps (with inline timer suggestions) → review + publish. Public/Private toggle. AI photo generation for public recipes without photos. Full spec in Section 18.7.
- [ ] Mobile spacing audit — apply Section 18.9 rules throughout: 44pt touch targets, 16pt margins, 1.6 line height, nothing under 11pt.

#### 3c — TestFlight
- [ ] Run `clean-recipes.mjs` — dedup and validate all generated recipes
- [ ] Fix profile page dark mode (white card backgrounds → `colors.card`)
- [ ] Steamed/delicate fish hard-exclude from meal prep deck
- [ ] Strip prep instructions from ingredient unit fields (`clean-ingredient-units.mjs`)
- [ ] No crashes on iPhone 12 (oldest commonly tested device)
- [ ] All screens show real data — no placeholder content
- [ ] Internal TestFlight build — test every flow end to end on real device
- [ ] Fix any crashes or blank screens found in TestFlight

---

### 🔲 Phase 4 — Grocery API Integrations

Grocery ordering is revenue-critical but requires external API approvals. Run these in parallel with Phase 3 so they're ready when Phase 3 ships.

- [ ] **Walmart Recipes & Bundle API** — apply at `walmart.io`. Specifically the Recipes and Bundle API which is purpose-built for ingredient-to-cart. AddToCart proxy for direct cart building. No waitlist — apply today.
- [ ] **Kroger API** — apply at `developer.kroger.com`. OAuth2 cart API. Covers Kroger, Ralph's, Fred Meyer, King Soopers, Harris Teeter (2,700 stores, 35 states). Mealime already uses this — precedent set. 1–2 week approval.
- [ ] **Instacart Developer Platform** — applied, waiting (1–3 week approval typical). 85,000+ retailers, best UX.
- [ ] Grocery ordering bottom sheet in `grocery-list.tsx` — shows available retailers as tappable options (Walmart, Kroger, Instacart, Copy list). Only shows retailers for which API key is configured.
- [ ] `/api/walmart-cart` Vercel function
- [ ] `/api/kroger-cart` Vercel function  
- [ ] `/api/instacart-cart` Vercel function
- [ ] Affiliate tracking via Impact for all three retailers
- [ ] Grocery list history view

---

### 🔲 Phase 5 — Community

- [ ] Add Recipe goes live publicly (built in Phase 3 but gated — flip the flag)
- [ ] `/api/check-recipe` — Claude validation for user-submitted recipes (two-prompt pipeline, same as generated recipes)
- [ ] Badge system: Community Verified, Community Favorite (based on save count + notes data)
- [ ] Public ratings visible on recipe detail
- [ ] Creator Insights screen — recipe authors see save count, note themes, make-again signal
- [ ] Notes analytics pipeline — weekly Claude batch to surface recipe quality issues from note patterns

---

### 🔲 Phase 6 — Social

- [ ] Follow system
- [ ] Public meal plans with AI adaptation
- [ ] Community feed

---

## 15. App Store Launch Checklist

- [ ] Apple Developer Program ($99/year) — apply at developer.apple.com
- [x] Register `getmori.app` domain ✅
- [ ] Privacy policy live at a URL — disclose all data collected + AI usage
- [ ] Apple AI transparency — explicit disclosure of Anthropic/Claude usage in privacy policy + in-app consent
- [ ] TestFlight internal testing — all flows on real iOS devices
- [ ] App Store Connect listing — screenshots, description, keywords, age rating
- [ ] No placeholder content — every screen shows real data
- [ ] No crashes on oldest supported iOS version
- [ ] Clean generated recipes — run `clean-recipes.mjs` before submission
- [ ] Register Pexels API key — add to Vercel env vars
- [ ] Submit early in the week — avoid Fridays and holidays

---

## 16. Out of Scope — Do Not Build Yet

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
- Stability AI / Midjourney image generation — gpt-image-1 is already in use for generated recipe photography
- Pexels / Unsplash for generated recipe images — replaced by gpt-image-1 (more accurate, dish-specific)

---

## 17. Key Decisions Already Made

- **App name: Mori** — renamed from Mise (March 2026). Korean word for gathering. No App Store conflicts.
- **iOS first**
- **React Native Animated API** — do not migrate
- **Inline styles + theme.ts** — do not migrate to NativeWind
- **Local weighted scorer** — Claude UUID problem makes LLM ranking unreliable
- **Claude used for:** taste profile, macros, recipe generation, storage tips, step rewriting
- **Spoonacular removed** — Claude Haiku estimates suffice for discovery app macros
- **gpt-image-1 for generated recipe images** — OpenAI medium quality (~$0.04/image), uploaded to Supabase Storage for permanent URLs. Description-based prompts with cuisine-specific plating context. All 622 images complete. Unsplash was inaccurate (wrong dishes); gpt-image-1 generates the actual dish.
- **Instacart Developer Platform** — grocery list → pre-built cart → checkout in Instacart. Affiliate via Impact = primary revenue
- **Copy/paste export Phase 1** — Instacart Phase 3
- **Account creation screen 9 of 10** — user invested before committing
- **Ingredient dislikes are hard filters**
- **Pantry low stakes and opt-in**
- **Cold start solved by 248,886 cohort affinity rows**
- **All AI and external APIs server-side only**
- **Community Phase 4, social Phase 5**
- **Direction A typography** — Georgia italic for recipe titles, SF Pro for body/metadata
- **Linen light app icon** — `#F8F3EC` background, moss `m`, consistent across all system themes

---

*Mori CLAUDE.md — v6.0 — Phase restructure: Phase 3 = UX overhaul + TestFlight (Section 18 spec). Phase 4 = Grocery APIs (Walmart, Kroger, Instacart). Phase 5 = Community. Phase 6 = Social. Phase 2.7 complete: all 622 generated recipes have gpt-image-1 food photography (~$27 total). 63 recipe descriptions updated with accompaniments. Immediate next steps: register getmori.app, begin Phase 3 UX overhaul per Section 18.*

---

## 18. UX Redesign Spec — Phase 3 (Mobile-First)

> This section is the authoritative design specification for the Phase 3 UX overhaul. Claude Code must follow these specs exactly. No mockup images are available — build entirely from this written spec. Every measurement assumes a standard iPhone screen (390pt wide). Use generous spacing — minimum 44pt touch targets, minimum 16pt horizontal margins, minimum 12pt vertical padding on all interactive elements.

---

### 18.1 Navigation Architecture Change

**BEFORE:** 5 bottom tabs — Discover, Recipes, Plan, Grocery List, Profile

**AFTER:** 4 bottom tabs + persistent avatar button

Remove Profile from the tab bar entirely. The tab bar now has exactly four tabs:

1. **Discover** — swipe deck (existing)
2. **Explore** — full editorial browse (new, replaces old All Recipes)
3. **Recipes** — personal library (replaces old Recipes tab)
4. **Plan** — weekly meal grid (existing, unchanged)
5. **Grocery** — shopping list (existing, unchanged)

Wait — that's five. Correct count: **Discover, Explore, Recipes, Plan, Grocery = 5 tabs.** Remove Profile only — keep all five functional tabs. The tab bar is slightly tighter but all five fit.

**Profile avatar — persistent top-right on every screen:**
Every screen in the app has a circular avatar button in the top-right corner of the navigation header, always visible. The circle is 36pt diameter. Background colour is the theme primary (`colors.primary`). Text is the user's initials (first letter of first name + first letter of last name) in white, 13pt, weight 600. If no name is set, show a person icon. Tapping this avatar opens a bottom sheet (not a full screen push) containing: profile photo (if set), display name, Recipes Saved count, Taste Profile snippet (2 lines max), quick links to Edit Preferences, My Pantry, Discover Settings, and Sign Out. This replaces the entire Profile tab screen. The avatar must appear on: Discover header, Explore header, Recipes header, Plan header, Grocery header. It sits to the right of the screen title, vertically centred with it.

---

### 18.2 Explore Tab — Full Specification

**File:** `app/(tabs)/explore.tsx`

**Purpose:** Replaces the old "All" recipes view. This is a curated editorial browse screen showing the full recipe catalogue of 1,000+ recipes organised into meaningful sections. It is NOT a flat grid. It uses a ScrollView with sections stacked vertically.

**Header:**
- Screen title: "Explore" — 28pt, weight 700, color `colors.text`
- Avatar button top-right (see 18.1)
- Search bar below title: full-width, 44pt height, background `colors.border` at 30% opacity, border radius 12pt, placeholder text "Search 1,041 recipes..." in `colors.textMuted`. Tapping opens a full-screen search modal with real-time filtering.
- Filter chips row below search bar: horizontally scrollable, no scrollbar visible, 12pt gap between chips, 16pt left padding, 8pt bottom padding. Each chip is 32pt tall, horizontal padding 14pt, border radius 999pt (pill shape). Active chip: background `colors.primary`, text white, weight 600, 12pt font. Inactive chip: background `colors.border` at 40% opacity, text `colors.textMuted`, 12pt font. Chips in order: All (default active), Quick (≤30 min), High Protein, Meal Prep, Vegetarian, Vegan. Selecting a chip filters ALL sections below simultaneously. "All" deselects all other chips.

**Section: "Cook again"**
- Only visible if user has at least 1 cooked recipe (`recipe_interactions` with `interaction_type: 'cooked'`). Hidden entirely if no cook history.
- Section header: "Cook again" 17pt weight 700 left, "See all" 13pt `colors.primary` right, 16pt vertical margin above section.
- Horizontally scrollable row of recipe cards. Card width: 140pt, 16pt gap, 16pt left inset, visible overflow on right to signal scrollability.
- Each card: border radius 14pt, white background, 0.5pt border `colors.border`. Image area 90pt tall, full width. Below image: 10pt padding all sides. Cooked count badge above title (e.g. "Cooked 3×") — background `#E3F2FD`, text `#1565C0` (blue, not green — distinct from saved), 7pt font, weight 700, pill shape. Recipe title in Georgia italic 12pt. Cuisine + time in SF Pro 9pt uppercase `colors.textMuted`.
- Data source: query `recipe_interactions` for the current user, `interaction_type = 'cooked'`, group by `recipe_id`, order by count descending.

**Section: "Trending this week"**
- Always visible.
- Section header: "Trending this week" left, "See all" right.
- Same horizontal scroll card format. Badge: orange/amber — background `#FFF3E0`, text `#BF360C`, label "Hot". 
- Data source: `fetchTrendingRecipeIds()` already in `lib/api.ts` — ≥3 right swipes from any users in last 7 days. 30-min cache.

**Section: "Just added"**
- Always visible.
- Section header: "Just added" left, "See all" right.
- Same horizontal scroll card format. Badge: green — background `#E8F5E9`, text `#1B5E20`, label "New".
- Data source: `recipes` ordered by `created_at` descending, limit 10. Only show recipes added in last 30 days.

**Section: "Browse by cuisine"**
- Always visible.
- Section header: "Browse by cuisine" left (no "See all" — the chips ARE the see-all).
- Horizontally scrollable row of cuisine chips. Each chip is 64pt wide, 72pt tall, border radius 12pt, white background, 0.5pt border `colors.border`. Contains flag emoji (20pt) centered, then cuisine name below in 10pt SF Pro weight 500 `colors.text`. Cuisines in order: Japanese 🇯🇵, Indian 🇮🇳, Mexican 🇲🇽, Korean 🇰🇷, French 🇫🇷, Thai 🇹🇭, Italian 🇮🇹, Chinese 🇨🇳, American 🇺🇸, Spanish 🇪🇸, Mediterranean 🌊, Middle Eastern 🌙. Tapping a cuisine chip navigates to a full-screen filtered grid for that cuisine.

**Section: "Under 30 minutes"**
- Always visible (there are hundreds of these recipes).
- Section header: "Under 30 minutes" left, "See all" right.
- 2-column grid (NOT horizontal scroll). Column gap 10pt. Cards same as grid cards elsewhere. Each card: image 100pt tall, title below in Georgia italic 12pt, cuisine + time in 9pt uppercase. No badge needed.
- Data source: `recipes` where `(prep_time_mins + cook_time_mins) <= 30`, ordered by `save_count` descending, limit 6.

**Section: "High protein"**
- Only visible if user has high_protein in their dietary_goals.
- Same horizontal scroll format. No badge — the section title is the signal.
- Data source: recipes where `macros->>'protein'` cast to numeric >= 25, ordered by protein descending.

**Empty state (if somehow no recipes):**
- Centred in screen: fork and knife emoji 40pt, "Nothing here yet" 16pt weight 700, "Pull to refresh" 13pt `colors.textMuted`.

---

### 18.3 Recipes Tab — Personal Library

**File:** `app/(tabs)/recipes.tsx` (replace existing)

**Purpose:** This is the user's personal recipe library. It only shows recipes the user has interacted with — saved, cooked, or submitted. It is NOT the place to browse all recipes (that's Explore). Mental model: Spotify's "Your Library" vs "Search/Browse".

**Header:**
- Screen title: "My Recipes" — 28pt, weight 700
- Avatar button top-right (see 18.1)
- "+" Add button top-right alongside avatar: green pill button, 32pt height, label "+ Add", 14pt weight 600, background `colors.primary`, white text, border radius 999pt. Tapping opens the Add Recipe flow (see 18.5). Position: to the LEFT of the avatar, 8pt gap between them.
- Search bar below header: same spec as Explore search bar but placeholder "Search your recipes..."
- Segmented control below search: 4 equal segments. 36pt height total, 3pt internal padding, background `colors.border` at 30% opacity, border radius 10pt. Active segment: white background, black text, weight 600, border radius 8pt. Inactive: transparent background, `colors.textMuted` text. Segments: **Saved | Cooked | Mine | Meal Prep**

**Saved tab (default):**
- Sub-section "Recently saved": horizontal scroll row, same card format as Explore. Shows last 5 saved recipes by `saved_at` descending.
- Sub-section "All saved (N)": full-width 2-column grid. N = total saved count. Sort button top-right: "Sort ↕" — tapping shows bottom sheet with options: Recently saved, A–Z, Cook time, Rating.
- Each grid card: 16pt border radius, white background, 0.5pt border. Image height 100pt. Below image: 10pt padding. If recipe has been cooked: small green pill "✓ Cooked Nx" above title (background `#E8F5E9`, text `#2E7D32`, 8pt, weight 700). Title in Georgia italic 12pt, 2 lines max with ellipsis. Cuisine + time below in 9pt SF Pro uppercase `colors.textMuted`.

**Cooked tab:**
- Same 2-column grid, but filtered to only recipes with `interaction_type = 'cooked'` in `recipe_interactions`.
- Sort defaults to cook count descending. Badge shows "Cooked Nx" prominently.
- If empty: centred empty state — chef hat emoji 36pt, "Nothing cooked yet" 15pt weight 700, "Mark a recipe as cooked to see it here" 12pt `colors.textMuted`.

**Mine tab:**
- Shows only recipes where `submitted_by = current user id` in the `recipes` table.
- Same 2-column grid. Each card has a badge: "Public" (background `#E8F5E9`, text `#1B5E20`) or "Private" (background `#EDE7F6`, text `#4527A0`). If recipe has ≥1 saves from other users, show save count "N saves" in small grey text below cuisine/time.
- Below the grid, if any public recipes have received saves or notes from other users: a soft green notification card (background `#E8F5E9`, border radius 12pt, padding 14pt) with text "[Recipe name] is getting attention — N people saved it." Tapping navigates to a Creator Insights screen (Phase 4, spec this screen when building Phase 4).
- Empty state: "+" dashed-border card in the grid at position [0,0] if no recipes — "Add your first recipe" 10pt `colors.textMuted` centred inside, font size 24pt "+" above. Tapping this adds a recipe.

**Meal Prep tab:**
- Filtered to saved recipes where `meal_prep_friendly = true`.
- Same 2-column grid. Small green "Meal prep ✓" label replaces cuisine in meta row.
- Empty state: "No meal prep recipes saved yet — explore the Meal Prep section in Explore to find some."

---

### 18.4 Recipe Detail — Redesigned

**Component:** `components/RecipeDetailModal.tsx` (update existing)

The recipe detail opens as a full-screen modal pushed from either Discover (as existing swipe card) or any recipe grid. It is NOT a bottom sheet — it pushes full screen so there is space to breathe on mobile.

**Header image area:**
- Full-width image, 220pt tall. Uses `expo-image` with `contentFit: 'cover'`.
- Back button (←) top-left: 36pt circle, background rgba(255,255,255,0.85), border radius 18pt, 16pt from left edge, 16pt from top of safe area. Chevron icon 18pt, color `#1A1A1A`.
- Save button (♡ or ♥ if saved) top-right: same circle spec. 16pt from right edge.
- Add to grocery button: NOT in the header. Lives at the bottom of the screen as a sticky footer bar.

**Recipe info block (below image, white background):**
- 16pt horizontal padding, 14pt top padding.
- Recipe title: Georgia serif italic, 22pt, weight 400, color `colors.text`, 2 lines max. Do NOT truncate — allow wrapping.
- Meta pills row: 10pt gap between pills, 8pt top margin. Each pill: background `#F5F5F5`, border radius 8pt, 6pt vertical padding, 12pt horizontal padding, 11pt SF Pro, color `#555555`. Pills in order: cuisine, total time (prep + cook), servings, estimated cost.
- Macros row: 4 equal tiles in a row, 8pt gap, 10pt top margin. Each tile: background `#F9F9F9`, border radius 8pt, 8pt padding, centered. Number: 14pt weight 700 `colors.primary`. Label: 8pt SF Pro uppercase `colors.textMuted`. Values: calories (kcal), protein (g), carbs (g), fat (g). "Estimated values" in 9pt `colors.textMuted` centered below the row.

**Tab bar (Ingredients | Steps | My Notes):**
- 3 equal-width tabs, 44pt total height, border bottom 0.5pt `colors.border`.
- Active tab: text `colors.primary` weight 600 13pt, bottom border 2pt `colors.primary`, no fill.
- Inactive tab: text `colors.textMuted` 13pt.
- Default to Ingredients on first open. Remembers last selected tab for that session.

**Ingredients tab:**
- Serving size adjuster at top: "Servings" label left, minus button / number / plus button right. Buttons 36pt circle, border 1pt `colors.border`. All ingredient quantities scale proportionally.
- Each ingredient row: 16pt horizontal padding, 14pt vertical padding, border bottom 0.5pt `colors.border` (no border on last item). Quantity + unit left (weight 600 13pt `colors.text`), ingredient name right (13pt `colors.text`). Row height minimum 44pt.
- "Add all to grocery list" tappable text at bottom: 14pt `colors.primary` weight 600, centered, 20pt top padding.

**Steps tab — SIMPLIFIED (this is the most important change):**
Each step is a self-contained card. Not a bulleted list. Not paragraph text with bold words buried inside. Full cards with clear visual hierarchy.

Step card specification:
- Background: `#F9F9F9` for upcoming/incomplete steps. `colors.card` (white) with `colors.border` for the active step (add 1.5pt green border around the entire active card). `colors.border` at 20% opacity background for completed steps.
- Border radius: 14pt. Margin bottom: 10pt. Padding: 14pt all sides.
- Inside the card, left side: step number circle. 24pt diameter, background `colors.primary` for active, `#A5D6A7` (lighter green) for completed (with a ✓ checkmark instead of number), `#CCCCCC` for upcoming. Number/check is white, 11pt weight 700.
- To the right of the number (10pt gap): step title in SF Pro 13pt weight 700 `colors.text` (e.g. "Soak the noodles"). Below title: step detail in SF Pro 13pt weight 400 `colors.textMuted`, line height 1.6. Maximum 2 sentences. The title summarises the action. The detail explains HOW. This is the key to making it readable — non-cooks scan titles, then read detail only if confused.
- If the step has a time: below the detail text, a tappable timer pill — background `#E8F5E9`, border radius 999pt, 6pt vertical padding, 12pt horizontal padding. Stopwatch icon (14pt) + "4 min" text in 11pt weight 600 `colors.primary`. Tapping starts a countdown timer that shows as a persistent banner at the top of the screen.
- Completed steps are visually dimmed but remain visible above the active step so users can reference what they already did.
- Upcoming steps below the active step are also visible but dimmed. This gives context — the user can see what's coming.

**"Start cooking mode" button:**
- Full-width green button at bottom of Steps tab. 52pt height. Background `colors.primary`. Text "Start cooking →" white 16pt weight 700. Border radius 14pt. Margin 16pt horizontal, 20pt top. This launches the full-screen Cooking Mode (see 18.5).

**My Notes tab:**
See Section 18.6 for full spec.

**Sticky footer bar (always visible regardless of tab):**
- 80pt height total including safe area. White background. Border top 0.5pt `colors.border`.
- Two buttons side by side with 12pt gap, 16pt horizontal padding:
  - "Add to grocery" (outline button): flex 1, height 52pt, border 1.5pt `colors.primary`, text `colors.primary` 15pt weight 600, border radius 14pt.
  - "Save recipe" (filled): flex 1, same height, background `colors.primary`, white text, same border radius. If already saved: background `colors.primaryLight`, text `colors.primary`, label "Saved ✓".

---

### 18.5 Cooking Mode — Full Screen

**Component:** `components/CookingMode.tsx` (new component)

Triggered by "Start cooking →" button on the Steps tab. Opens as a full-screen modal over the recipe detail. The screen goes entirely dark. This keeps the phone from activating auto-brightness and helps focus in a kitchen environment. `keepScreenAwake: true` must be set so the screen does not lock.

**Background:** `#1A1A1A` (near-black). All text is light.

**Header (top of screen):**
- Recipe title in Georgia italic 14pt `#F0EDE6` (warm off-white), truncated to 1 line with ellipsis.
- Right side: microphone icon button (voice commands, Phase 4 — render the button but make it a no-op for now, labelled "Voice") and an ✕ close button (tapping exits cooking mode and returns to recipe detail).
- Both buttons are 36pt circles, background `#2A2A2A`.

**Progress bar (below header):**
- Full-width bar, 4pt height, background `#333333`, border radius 2pt.
- Fill: `#4CAF50` (bright green), width = (currentStep / totalSteps) * 100%.
- Below bar: "Step N of M — [encouraging label]" in 10pt `#666666`. Encouraging labels cycle: "Let's go!", "Keep going!", "Nearly there!", "Last step!".

**Active step card (main content):**
- Rounded rectangle, background `#2A2A2A`, border radius 16pt, margin 16pt horizontal, 12pt vertical padding.
- Step label: "STEP N" in 9pt SF Pro weight 700 `#4CAF50`, uppercase, letter-spacing 0.1em. 
- Step title in SF Pro 16pt weight 700 `#F0EDE6`, margin top 6pt.
- Step detail in SF Pro 15pt weight 400 `#C0C0C0`, line height 1.7, margin top 6pt. Key quantities (weights, temperatures, times) are highlighted: text `#4CAF50` weight 700. For example: "Cook for **4 minutes** on **high heat** until golden" — "4 minutes" and "high heat" both green bold.
- This card takes up roughly 40% of the screen height. Large text, lots of breathing room.

**Timer block (below active step card):**
- Only shown if the current step has a timer. Background `#1E3A1E` (very dark green), border radius 12pt, margin 16pt horizontal, padding 16pt.
- Left side: large timer countdown — 28pt weight 700 `#4CAF50`, format "4:00". Below: "Timer ready" or "Running..." in 9pt `#4CAF50` at 70% opacity.
- Right side: "Start" button when idle (background `#4CAF50`, text `#fff`, border radius 8pt, padding 8pt 16pt, 13pt weight 700). When running: "Pause" (same style). When finished: brief vibration + "Done ✓" in green.

**Ingredients for this step (below timer or active card):**
- Small section: "INGREDIENTS THIS STEP" label in 8pt `#555555` uppercase.
- Horizontal row of ingredient pills. Each pill: background `#252525`, border radius 8pt, 6pt vertical padding, 10pt horizontal padding, ingredient emoji (if available) + ingredient name in 11pt `#F0EDE6`. Only show ingredients actually used in this specific step, parsed from the step text by matching ingredient names.

**Navigation buttons (bottom of screen):**
- Two buttons above the safe area, 16pt horizontal margin, 12pt gap.
- "← Back" (left, flex 1): background `#2A2A2A`, text `#F0EDE6` 13pt, border radius 12pt, 48pt height.
- "Next step →" (right, flex 2): background `#4CAF50`, text `#ffffff` 15pt weight 700, border radius 12pt, same height.
- On the final step: "Next step →" becomes "Mark as cooked ✓" with the same green background.

**Voice command hint (below navigation):**
- "Say 'next', 'back', or 'timer'" in 10pt `#444444` centered. Phase 4 functionality — text is visible now as a placeholder.

---

### 18.6 My Notes Tab — Recipe Detail

**Location:** Third tab inside `RecipeDetailModal.tsx`, accessible as "My Notes"

**Purpose:** Personal, private notes that live on a specific recipe. Entirely per-user — other users never see your notes. This is a retention feature: once a user writes a note, they have a personal investment in that recipe and the app.

**Empty state:**
- White background, 20pt padding all sides.
- A warm yellow notepad-style empty card: background `#FFFDE7`, border radius 14pt, border 1pt `#FDD835` (yellow), padding 20pt. Centred inside: pencil emoji 28pt, then "Your personal notes on this recipe" in 15pt weight 700 `colors.text`, then "Tweaks, substitutions, what to do differently next time." in 12pt `colors.textMuted` line height 1.6.
- Rating row below: "Rate this recipe" label 12pt `colors.textMuted`, then 5 star icons in a row 24pt each, default all grey `#DDDDDD`. Tapping a star fills all stars up to and including that one in `#FFC107` (amber). Persists to `saved_recipes.user_rating`.
- Green "+ Add a note" button at bottom: full width, 52pt height, background `colors.primary`, white text 15pt weight 600, border radius 14pt.

**Filled state (has existing note):**
- Rating row at top (same as above, but pre-filled to saved rating).
- Tags row below rating: horizontally scrollable, shows existing tags as green pills (background `#E8F5E9`, text `#2E7D32`, 11pt weight 600, 6pt vertical padding, 12pt horizontal padding, border radius 999pt). "+ tag" pill at end (dashed outline style, `colors.textMuted`). Tapping "+ tag" opens a bottom sheet with: 6 quick-add tags (Family favourite, Make again, Too spicy, Too salty, Weekend only, Quick win) plus a custom text input.
- Note card: background `#FFFDE7`, border radius 12pt, border 0.5pt `#F9A825` (warm amber), padding 14pt. Note text in 13pt `colors.text` line height 1.6. Date below in 9pt `#BFA000` — "Added March 14 · edited March 16". Full text, no truncation — this is a personal note and users need to read the whole thing.
- If substitutions were logged: separate card below, background `#E8F5E9`, border radius 12pt, padding 12pt. Header "Substitutions" 10pt `#2E7D32` weight 700. Content in 12pt `colors.text`.
- Make-again response (if recorded): small row showing their answer — "You said: Yes, exactly as is ✓" in 11pt `colors.textMuted`.
- "Edit note" button at bottom: same spec as add button but label "Edit note".

**Editing state:**
- Full-screen sheet pushes from bottom when "+ Add a note" or "Edit note" is tapped.
- Title: "My note — [Recipe name]" 14pt weight 700.
- Section: free text area — label "What do you want to remember?" 10pt uppercase `colors.textMuted`. Text input: background `#FFFDE7`, border radius 12pt, border 1pt `#F9A825`, padding 12pt, font 13pt `colors.text`, min height 90pt, multiline, auto-expands. Placeholder: "Tweaks, substitutions, what to do differently next time..."
- Section: substitutions — label "What did you swap?" 10pt uppercase. Text input same styling, placeholder "e.g. chicken thighs instead of breast, oat milk instead of cream". This is a separate field, not part of the main note.
- Section: quick tags — label "Tags" 10pt uppercase. 3-column grid of tag buttons. Each: 36pt height, border radius 8pt. Unselected: background `#F5F5F5` text `#555`. Selected: background `#E8F5E9` text `#2E7D32` with a small ✓. Tags: Family favourite, Make again, Too spicy, Too salty, Weekend only, Quick win. Custom tag text input at end.
- Section: make-again — label "Would you cook it again?" 10pt uppercase. Three wide buttons stacked: "Yes, exactly as is" / "Yes, with some changes" / "Probably not". Each 44pt height, border radius 10pt. Unselected: background `#F5F5F5` text `#555`. Selected: first = background `#E8F5E9` text `#2E7D32`, second = `#FFF8E1` / `#E65100`, third = `#FFEBEE` / `#C62828`.
- Footer: "Cancel" (grey outline) and "Save note" (green filled) side by side, 52pt height each, 12pt gap.
- On save: write to `recipe_notes` table (see schema below). Dismiss sheet. Show note in filled state.

**Database table required:**
```sql
create table recipe_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  note_text text,
  substitutions text,
  tags text[] default '{}',
  make_again text check (make_again in ('yes', 'with_changes', 'no')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, recipe_id)
);
```

---

### 18.7 Add Recipe Flow — 4-Step Wizard

**Navigation:** Triggered from "+" Add button on Recipes tab header. Pushes a full-screen modal. Progress indicator at top shows "Step N of 4". Back arrow top-left exits with confirmation dialog if any data has been entered ("Discard recipe?").

**Step indicator:** 4 equal-width pills in a row, 3pt height each, 4pt gap. Completed = `colors.primary` solid. Active = `#4CAF50` (slightly lighter). Upcoming = `colors.border`.

---

**Step 1 — The basics:**

- Title: "The basics" 20pt weight 700.
- Recipe name field: label "Recipe name" 10pt uppercase `colors.textMuted`. Input: background `colors.background`, border 1pt `colors.border`, border radius 10pt, 48pt height, 15pt font, 14pt horizontal padding. Placeholder "What do you call this dish?"
- Description field: label "A one-line description" 10pt uppercase. Multiline input, 3 lines tall, same styling. Placeholder "e.g. A smoky, slow-cooked lamb shoulder with harissa and preserved lemon." This directly improves the AI-generated images — better descriptions = better prompts.
- Cuisine selector: label "Cuisine" 10pt uppercase. Horizontally scrollable row of cuisine pill buttons (same 12 cuisines as onboarding). Selected: `colors.primary` background white text. Unselected: `#F5F5F5` background `#555` text.
- Time fields: two side-by-side inputs, each flex 1, 12pt gap. Left: "Prep time (mins)" label, number input. Right: "Cook time (mins)" label, number input. Both: background `colors.background`, border 1pt `colors.border`, border radius 10pt, 48pt height, number keypad.
- Servings: same single input "Serves" label, number input, 0-20 range.
- Visibility toggle (public/private): label "Who can see this?" 10pt uppercase. Two buttons side by side (not a segmented control — these feel weightier and more deliberate). Each: flex 1, 56pt height, border radius 12pt, 12pt gap.
  - Public button: when selected — background `#E8F5E9`, border 1.5pt `#2E7D32`, globe icon 14pt `#2E7D32`, text "Public" 13pt weight 700 `#2E7D32` below icon, sub-text "Others can discover it" 9pt `#2E7D32` at 70% opacity. When unselected: background `#F5F5F5`, border 1pt `#E0E0E0`, same layout but all grey.
  - Private button: when selected — background `#EDE7F6`, border 1.5pt `#7B1FA2`, lock icon 14pt `#7B1FA2`, text "Private" 13pt weight 700 `#7B1FA2`, sub-text "Only visible to you" 9pt. When unselected: grey as above.
  - Default: Public.
- "Next →" button: full width, 52pt height, `colors.primary` background, white text 16pt weight 700, border radius 14pt, 20pt top margin.

---

**Step 2 — Ingredients:**

- Title: "Ingredients" 20pt weight 700.
- Hint text below title: "Keep it simple. '2 chicken breasts' not '2 large free-range chicken breasts, patted dry and at room temperature'." 12pt `colors.textMuted` line height 1.5. This actively coaches non-cooks.
- Column headers: "Qty" / "Unit" / "Ingredient" in 9pt uppercase `colors.textMuted`, left-aligned above each column.
- Ingredient rows: each row is 48pt height, contains three inputs side by side.
  - Qty input: 52pt wide. Number keypad. Background `#F5F5F5`, border radius 8pt, border 0.5pt `colors.border`, centered text, 13pt font.
  - Unit input: 60pt wide. Text input OR tappable — tapping opens a bottom sheet picker with common units: whole, g, kg, ml, l, tsp, tbsp, cup, handful, pinch, slice. 13pt font same styling.
  - Ingredient name input: flex 1 (takes remaining width). Text input with AUTOCOMPLETE.

**Ingredient autocomplete specification:**
As the user types in the ingredient name field, a dropdown appears immediately below THAT SPECIFIC ROW (not at the bottom of the screen — it must appear inline below the active field). The dropdown is a white card, border radius 10pt, border 0.5pt `colors.border`, elevation (shadow: 0 4pt 12pt rgba(0,0,0,0.12)). Maximum 4 suggestions visible before scrolling. Each suggestion row is 44pt height, 14pt horizontal padding, 8pt vertical padding, border bottom 0.5pt `colors.border`.

Each suggestion row contains:
- Left: ingredient category emoji (🥦 Produce, 🥩 Meat, 🧀 Dairy, 🫙 Pantry, ❄️ Frozen) — 16pt
- Middle: ingredient name in 13pt `colors.text`. Matching characters are shown in weight 700 (e.g. if user typed "chick", "chicken" shows "**chick**en" with the first 5 letters bold).
- Right: category label in 10pt `colors.textMuted` (e.g. "Meat", "Produce", "Pantry")

The autocomplete is powered by a local index of all unique ingredient names already in your Supabase `recipes` table — across all 1,000+ recipes you have, parse out the distinct ingredient names once and cache them in AsyncStorage on app load. No API call. When the user selects a suggestion, the ingredient name field fills and focus moves to the Qty field of the NEXT row.

If the user types something not in the list, they can still free-type it — autocomplete is a helper not a gate.

- Delete row button: ✕ to the right of each ingredient row, 36pt tap target, color `colors.textMuted`. Visible on all rows.
- "+ Add ingredient" tappable row at the bottom of the ingredient list: `colors.primary` color, 13pt weight 600, left-aligned, 16pt left padding, 44pt tap target.
- Maximum 30 ingredients. Show "(30 max)" counter when approaching limit.
- Footer navigation: "← Back" outline button (flex 1) + "Next →" filled button (flex 2). 52pt height, 12pt gap.

---

**Step 3 — Steps (instructions):**

- Title: "Steps" 20pt weight 700.
- Hint below title: "One action per step. Start with a verb. 'Heat oil in a pan' — not 'You'll want to start by heating up some oil in a pan'." 12pt `colors.textMuted`. This is critical for recipe quality.

- Existing steps displayed above the current input as numbered cards (same visual style as the recipe detail steps tab — this is intentional, users see exactly how their recipe will look). Completed/filled steps: white background, 0.5pt `colors.border`, border radius 12pt, 14pt padding, step number circle (24pt, `colors.primary`) left, step title right (13pt weight 600 `colors.text`).

- Current step input area: highlighted card, background `#F1FBF1`, border 1.5pt `#4CAF50`, border radius 12pt, padding 12pt.
  - Step number shown top-left of card in green circle (same spec as above).
  - Text input inside: multiline, background transparent, 13pt `colors.text`, line height 1.6, placeholder "What happens in this step?". Auto-expands vertically.
  - Timer suggestion bar (appears when user types a number followed by "min" or "minutes"): appears at the bottom of the step input card as a soft yellow strip. Background `#FFF8E1`, border radius 0 0 10pt 10pt, padding 8pt 12pt. "Add a timer?" label 10pt `colors.textMuted` left. Quick-tap timer pills: "2 min", "5 min", "10 min", "15 min", "custom" — each pill 28pt height, border radius 999pt, background white, border 0.5pt `colors.border`, 10pt font. Tapping a pill attaches that timer to the step. Once attached: pill turns green (background `#E8F5E9` border `#2E7D32` text `#2E7D32`) and shows "⏱ 5 min" with an × to remove it.

- "+ Add next step" tappable row: same spec as ingredient add row.
- Maximum 15 steps. Show counter "(N of 15 max)".
- Footer: "← Back" + "Next →" same as step 2.

---

**Step 4 — Review and publish:**

- Title: "Review" 20pt weight 700.
- This is a READ-ONLY preview of the recipe exactly as it will appear to users. The recipe title renders in Georgia italic 20pt. Meta row shows cuisine, total time, servings. A placeholder image (camera icon + "Add a photo" — see below). Ingredient list. Steps list.

- Photo upload section: label "Add a photo" 10pt uppercase. Upload card: 140pt tall, full width, background `#F5F5F5`, border 1.5pt dashed `#C0C0C0`, border radius 14pt. Camera icon 28pt centered, "Tap to add a photo of your dish" 11pt `colors.textMuted` below. Tapping opens the native image picker. If a photo is selected, it fills the card with `contentFit: 'cover'`, border becomes solid 1pt `colors.border`, an ✕ in the corner allows removal. Photos are uploaded to Supabase Storage `recipe-images/user/{userId}/{recipeId}.jpg` on submission. Note: photo is OPTIONAL — recipes can be submitted without one. If no photo is provided and the recipe is public, `gpt-image-1` will generate one using the recipe title + description as the prompt (same pipeline as generated recipes).

- Visibility reminder: small card showing their choice from Step 1 — globe icon + "Public" or lock icon + "Private" in appropriate colour. "Change" link tapping goes back to Step 1. This is a second chance to confirm before publishing.

- AI review notice (for public recipes only): soft blue card, background `#E3F2FD`, border radius 10pt, padding 12pt. "Before going live, Mori checks your recipe for accuracy. This takes less than a minute." 11pt `#1565C0` line height 1.5. This manages expectations — the two-prompt Claude validation will happen server-side on submission.

- Submit button: "Publish recipe" (if public) or "Save recipe" (if private). Full width, 52pt height, `colors.primary` background, white 16pt weight 700, border radius 14pt.

- On submit: loading state — button becomes a spinner, label "Checking your recipe..." for public recipes (this is the two-prompt Claude validation running). On success: navigate to the recipe detail screen for the newly created recipe, with a green toast "Recipe published!" at the top. On validation failure: show a bottom sheet explaining what needs fixing in plain language.

---

### 18.8 Notes Analytics — What to Track

Every field in `recipe_notes` should be monitored in aggregate. Specifically:

**Query weekly:**
- For each recipe: count of `make_again = 'no'` as a percentage of total notes. Any recipe >30% "no" should be flagged for manual review.
- Most common tags by recipe — "Family favourite" on a recipe many times → strong Staff Pick signal.
- Most common words in `substitutions` field across all recipes — extract patterns with Claude to find systematic recipe issues (e.g. "sauce too thin" appearing in many notes for the same recipe).

**Real-time:**
- When a public user-submitted recipe receives its 10th save, send the creator a push notification (Phase 4) or an in-app notification card on the Mine tab.
- Flag any recipe where `note_text` contains words like "wrong", "bad", "awful", "undercooked", "raw" — surface to admin review.

**Schema addition for analytics:**
```sql
-- Add to existing recipe_notes table on creation, or via migration:
-- make_again, tags, substitutions columns are already specified above
-- Add a trigger to update updated_at on every note change:
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger recipe_notes_updated_at
before update on recipe_notes
for each row execute function update_updated_at();
```

---

### 18.9 Mobile Spacing Rules — Apply Everywhere

These rules override any existing spacing in the codebase. When in doubt, use MORE space not less.

- **Minimum touch target:** 44pt × 44pt for any tappable element. If the visual element is smaller (e.g. a small icon), add transparent padding to reach 44pt.
- **Horizontal screen margins:** 16pt minimum on all sides. Never let content touch the screen edge.
- **Vertical padding inside cards:** 14pt minimum top and bottom. 12pt minimum left and right inside cards.
- **Gap between cards in a grid:** 10pt minimum.
- **Gap between vertical sections:** 20pt minimum between section header and previous section's content.
- **Line height for body text:** 1.6 minimum. Never pack text tightly — it is unreadable while cooking.
- **Font sizes:** No font below 11pt anywhere in the app. Recipe card titles minimum 12pt. Body text 13pt minimum. Step text in cooking mode 15pt minimum.
- **Scrollable rows:** always 16pt left inset so users can see content starts from the edge. Show partial card (approximately 20pt visible) on the right to signal horizontal scrollability.
- **Bottom sheets:** always have 20pt bottom padding below the last interactive element to clear the safe area. Never let buttons sit behind the home indicator.
- **Button heights:** primary CTAs 52pt. Secondary buttons 44pt. Never under 36pt for any button.

*Mori CLAUDE.md — v5.9 — Phase restructure complete. Phase 3 = UX overhaul + TestFlight. Phase 4 = Grocery APIs. Phase 5 = Community. Phase 6 = Social. Section 18 is the full Phase 3 build spec.
