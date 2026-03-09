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
- Expo SDK 54 project with React Native 0.81.5
- Expo Router file-based navigation
- Root layout with Supabase session check
- Onboarding flow — 8 screens (welcome → dietary-goals → cuisine-prefs → cook-frequency → skill-level → budget → account → payoff)
- Supabase auth — email sign in/sign up working
- Bottom tab navigation — Discover, Recipes, Grocery (placeholder), Profile
- Discover screen — full swipe mechanic with React Native Animated API, TheMealDB data, parallel detail fetching, Fisher-Yates shuffle, undo support, button tap swipe, stale closure prevention
- Recipes screen — Pinterest grid, All/Saved toggle, cuisine filter bar, search bar, 8 static seed recipes
- Saved recipes — Zustand savedStore working in memory
- Profile screen — avatar, name from Supabase, stats row, preferences display, sign out
- constants/theme.ts — all colors used consistently
- types/index.ts — TypeScript types defined
- lib/supabase.ts, lib/api.ts, lib/utils.ts — scaffolded
- Zustand stores — userStore, savedStore, groceryStore (placeholder), mealPlanStore (placeholder)
- supabase/schema.sql — schema written but NOT YET APPLIED to Supabase

### ❌ Broken / Incomplete — Fix These First
1. **Supabase schema not applied** — schema.sql exists but has not been run against the Supabase project. RLS policies unverified. Nothing persists reliably until this is done. **Priority 1.**
2. **Saved recipes not persisted** — savedStore is in-memory only. User loses all saved recipes on app close. **Priority 2.**
3. **Profile "Recipes Saved" stat hardcoded to 0** — not wired to savedStore count.
4. **Grocery list screen is a placeholder** — needs a full build. **Priority 3.**
5. **Recipes screen uses 8 static seed recipes** — should pull from TheMealDB (same as Discover) or Supabase once schema is applied.

### 🔲 Not Yet Built — In Scope
- Ingredient dislikes onboarding screen (insert between dietary-goals and cuisine-prefs)
- Eating style onboarding screen (insert after cuisine-prefs)
- Pantry staple seed on payoff screen
- Free text field on dietary-goals screen
- Expanded cuisine options (20-25 granular)
- Macro display on recipe cards and detail screens
- Spoonacular API integration for nutrition data
- Grocery list screen — full build with copy/paste export
- Instacart Developer Platform integration (Phase 3)
- Weekly meal planner
- Pantry tracking (low stakes, opt-in, not a main tab)
- AI recommendation layer (Phase 2)
- Cohort affinity tagging on recipe seed data
- Swipe event logging to Supabase
- Taste profile display in profile tab
- Baking tab (future — noted, not yet scoped)

---

## 3. Tech Stack — Actual

| Layer | Technology | Status |
|---|---|---|
| Mobile Framework | React Native 0.81.5 with Expo SDK 54 | ✅ Live |
| Navigation | Expo Router (file-based routing) | ✅ Live |
| Backend & Auth | Supabase | ✅ Auth live, schema not yet applied |
| Animations | **React Native Animated API** (not Reanimated) | ✅ Live — do not refactor |
| Icons | **Ionicons** (via Expo Vector Icons package) | ✅ Live |
| Image Handling | expo-image | ✅ Live |
| Styling | **Inline styles + constants/theme.ts** (NativeWind installed but not used) | ✅ Live — do not refactor |
| State Management | Zustand | ✅ Live |
| Recipe Seed Data | TheMealDB open source API | ✅ Live in Discover |
| Nutrition / Macro Data | Spoonacular API | 🔲 Not yet built |
| Serverless Functions | Vercel | 🔲 Not yet built |
| AI | Claude API via Anthropic SDK (Vercel functions only — never client) | 🔲 Not yet built |
| Grocery Export — Primary | Instacart Developer Platform API | 🔲 Phase 3 |
| Grocery Export — Fallback | Copy/paste plain text | 🔲 Phase 1 priority |
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
│   ├── _layout.tsx                    ✅ Root layout, session check
│   ├── index.tsx                      ✅ Redirects to onboarding or tabs
│   ├── onboarding/
│   │   ├── _layout.tsx                ✅
│   │   ├── welcome.tsx                ✅ Screen 1
│   │   ├── dietary-goals.tsx          ✅ Screen 2 — needs free text field added
│   │   ├── ingredient-dislikes.tsx    🔲 Screen 3 — NEW, build this
│   │   ├── cuisine-prefs.tsx          ✅ Screen 4 (renumbered) — expand to 20-25 options
│   │   ├── eating-style.tsx           🔲 Screen 5 — NEW, build this
│   │   ├── cook-frequency.tsx         ✅ Screen 6 (renumbered)
│   │   ├── skill-level.tsx            ✅ Screen 7 (renumbered)
│   │   ├── budget.tsx                 ✅ Screen 8 (renumbered)
│   │   ├── account.tsx                ✅ Screen 9 (renumbered)
│   │   └── payoff.tsx                 ✅ Screen 10 — needs pantry staple seed added
│   └── (tabs)/
│       ├── _layout.tsx                ✅ Tab navigator
│       ├── discover.tsx               ✅ Full swipe mechanic — add macro pill + swipe logging
│       ├── recipes.tsx                ✅ Pinterest grid — wire to TheMealDB/Supabase
│       ├── grocery-list.tsx           🔲 Placeholder — full build needed
│       └── profile.tsx                ✅ Wire Recipes Saved stat to savedStore
├── components/
│   ├── cards/
│   │   ├── RecipeCard.tsx             ✅ Swipeable card — add macro pill
│   │   └── RecipeGridCard.tsx         ✅ Pinterest grid card
│   ├── onboarding/
│   │   ├── GoalTile.tsx               ✅
│   │   ├── CuisineCard.tsx            ✅
│   │   └── ProgressBar.tsx            ✅
│   ├── grocery/
│   │   ├── GroceryItem.tsx            🔲 Build this
│   │   └── InstacartButton.tsx        🔲 Build this (Phase 3)
│   └── ui/
│       ├── Badge.tsx                  🔲 Build this
│       ├── PillTag.tsx                🔲 Build this
│       ├── MacroRow.tsx               🔲 NEW — build this
│       └── Button.tsx                 🔲 Build this
├── lib/
│   ├── supabase.ts                    ✅
│   ├── api.ts                         ✅ scaffolded — expand as features are added
│   └── utils.ts                       ✅ formatTime, formatCost
├── stores/
│   ├── userStore.ts                   ✅
│   ├── savedStore.ts                  ✅ in-memory — wire to Supabase
│   ├── groceryStore.ts                🔲 Placeholder — build out
│   └── mealPlanStore.ts               🔲 Placeholder
├── types/
│   └── index.ts                       ✅ add Macros type
├── constants/
│   └── theme.ts                       ✅ all colors defined, use exclusively
└── supabase/
    └── schema.sql                     ✅ written — APPLY THIS FIRST
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
2. Recipe seed DB must be tagged with cohort affinity scores before launch
3. Ingredient dislikes enforced as hard filters at the data layer
4. Dietary free text stored verbatim, passed to Claude at recommendation time
5. Session count incremented on every app open (profiles.total_sessions)
6. Taste profile auto-generated from swipe history and stored on the profiles row

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

-- Recipe Cohort Affinities (populated during seed data prep)
create table recipe_cohort_affinities (
  recipe_id uuid references recipes(id) not null,
  cohort_key text not null,
  affinity_score numeric(4,3),
  primary key (recipe_id, cohort_key)
);
```

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
12. **Ingredient dislikes are hard filters** — exclude at the data layer, not just the UI layer
13. **Macros from Claude are always labelled "estimated"** — never present them as precise values

---

## 12. Immediate Priority Build Order

Work through these in order. Do not build new features while Priority 1 and 2 items are outstanding.

### 🔥 Priority 1 — Fix the Foundation
- [ ] Apply supabase/schema.sql to the Supabase project
- [ ] Verify all RLS policies are correct and active
- [ ] Wire savedStore to Supabase saved_recipes table — saves must persist across sessions
- [ ] Wire Profile "Recipes Saved" stat to savedStore count

### 🔥 Priority 2 — Complete Onboarding
- [ ] Build ingredient-dislikes.tsx (Screen 3)
- [ ] Build eating-style.tsx (Screen 5)
- [ ] Update onboarding _layout.tsx to 10-screen navigation order
- [ ] Add optional free text field to dietary-goals.tsx
- [ ] Expand cuisine-prefs.tsx to 20-25 granular options
- [ ] Add pantry staple seed tap grid to payoff.tsx
- [ ] Save all new fields (ingredient_dislikes, eating_style, dietary_extra_preferences, pantry staples) to Supabase on onboarding completion

### 🔥 Priority 3 — Build Grocery List Screen
- [ ] Build grocery-list.tsx — ingredients grouped by category, checkboxes, pantry items crossed out
- [ ] Build out groceryStore.ts — add from recipe, consolidate ingredients, deduplicate, calculate cost
- [ ] Build tally header component — meals, items, pantry matches, cost estimate, combined macros
- [ ] Build copy-to-clipboard export with formatted plain text output
- [ ] Wire "Add to Grocery List" action from recipe cards and recipe library

### Priority 4 — Macros
- [ ] Integrate Spoonacular API in lib/api.ts
- [ ] Add macros column to recipes table in schema
- [ ] Add Macros type to types/index.ts
- [ ] Build MacroRow component (reusable)
- [ ] Add headline macro pill to RecipeCard
- [ ] Add full macro row to recipe detail screen
- [ ] Add combined macros to grocery list tally header

### Priority 5 — Swipe Data + Cohort Foundation
- [ ] Log every swipe event to Supabase in discover.tsx
- [ ] Increment total_sessions on every app open in root _layout.tsx
- [ ] Tag all seed recipes with cohort affinity scores in recipe_cohort_affinities table
- [ ] Map new users to cohort key on onboarding completion

---

## 13. Phased Build Plan

### Phase 1 — Foundation (Current Focus)
All Immediate Priority items above.

### Phase 2 — AI Layer
- [ ] Vercel project set up, environment variables configured
- [ ] /api/recommendations endpoint — Claude-powered personalised stack
- [ ] Connect recommendations to Discover screen (replace TheMealDB direct fetch)
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
