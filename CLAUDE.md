# PrepSwipe — CLAUDE.md
> This file is the single source of truth for this project. Read it in full at the start of every session before writing any code.

---

## 1. What We Are Building

**PrepSwipe** is a smart recipe discovery and grocery delivery app powered by Claude AI. It learns the user's cooking habits, anticipates what they want to make next, and gets ingredients delivered with one tap.

**Core loop:**
The AI suggests recipes based on the user's taste, goals, and pantry → user swipes yes or no on recipe cards → grocery list is built automatically → one tap sends the order to a delivery app.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Mobile Framework | React Native with Expo (SDK 51+) |
| Navigation | Expo Router (file-based routing) |
| Backend & Auth | Supabase |
| Serverless Functions | Vercel |
| AI | Claude API via Anthropic SDK (called from Vercel functions only — never from the client) |
| Styling | NativeWind (Tailwind for React Native) |
| Animations | React Native Reanimated + React Native Gesture Handler |
| Icons | Expo Vector Icons |
| Image Handling | Expo Image |
| Recipe Seed Data | TheMealDB open source API |
| Delivery | Instacart API (primary), DoorDash Drive, Uber Eats |
| State Management | Zustand |
| Forms | React Hook Form |

---

## 3. Project Structure

```
prepswipe/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout
│   ├── index.tsx                 # Entry redirect
│   ├── onboarding/
│   │   ├── _layout.tsx
│   │   ├── welcome.tsx           # Screen 1
│   │   ├── dietary-goals.tsx     # Screen 2
│   │   ├── cuisine-prefs.tsx     # Screen 3
│   │   ├── cook-frequency.tsx    # Screen 4
│   │   ├── skill-level.tsx       # Screen 5
│   │   ├── budget.tsx            # Screen 6
│   │   ├── account.tsx           # Screen 7
│   │   └── payoff.tsx            # Screen 8
│   └── (tabs)/
│       ├── _layout.tsx           # Tab navigator
│       ├── discover.tsx          # Swipe screen
│       ├── recipes.tsx           # Recipe library
│       ├── grocery-list.tsx      # Grocery list + delivery
│       └── profile.tsx           # User profile
├── components/
│   ├── cards/
│   │   ├── RecipeCard.tsx        # Swipeable recipe card
│   │   └── RecipeGridCard.tsx    # Pinterest grid card
│   ├── onboarding/
│   │   ├── GoalTile.tsx          # Dietary goal tile
│   │   ├── CuisineCard.tsx       # Cuisine swipe card
│   │   └── ProgressBar.tsx       # Onboarding progress
│   ├── grocery/
│   │   ├── GroceryItem.tsx       # Checklist item
│   │   └── DeliveryButton.tsx    # Order now button
│   └── ui/
│       ├── Badge.tsx             # Recipe badges
│       ├── PillTag.tsx           # Dietary goal pills
│       └── Button.tsx            # Reusable button
├── lib/
│   ├── supabase.ts               # Supabase client
│   ├── api.ts                    # API call helpers
│   └── utils.ts                  # Shared utilities
├── stores/
│   ├── userStore.ts              # User profile + preferences
│   ├── pantryStore.ts            # Pantry state
│   ├── groceryStore.ts           # Grocery list state
│   └── mealPlanStore.ts          # Weekly meal plan state
├── types/
│   └── index.ts                  # All TypeScript types
├── constants/
│   └── theme.ts                  # Colors, spacing, fonts
└── supabase/
    └── schema.sql                # Database schema
```

---

## 4. Design System

### Colors
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
- Headings: Bold, sizes 28/24/20/18
- Body: Regular, size 16
- Caption: Regular, size 13, color textMuted

### Spacing
Use multiples of 4: 4, 8, 12, 16, 20, 24, 32, 48

### Border Radius
- Cards: 16px
- Buttons: 12px
- Pills/Tags: 999px (fully rounded)
- Tiles: 12px

---

## 5. Core Features — Detailed Behaviour

### 5.1 Two App Modes
The app has two modes toggled at the top of the Discover screen:
- **Meal Prep Mode** — plan a full week, longer swipe stack, weekly grocery order
- **Spontaneous Mode** — on-the-fly, tight stack of 5-8 cards, same-day delivery option

Both modes share the same swipe mechanic, pantry, dietary goals, and AI engine.

### 5.2 Onboarding Flow
8 screens collected in order. Account creation is screen 7 — not screen 1. All preferences collected before sign up so the user is invested before committing. Screens:
1. Welcome — full screen hero image, tagline, Get Started CTA
2. Dietary Goals & Allergies — visual icon tiles, multi-select, highlights green on select
3. Cuisine Preferences — swipe cards (right = like, left = pass), previews core mechanic
4. Cooking Frequency — 3 tap cards in conversational language
5. Skill Level — 3 cards with fun one-line descriptions
6. Budget — 4 range options via tap cards
7. Account Creation — email + Google Sign In, minimal fields
8. Payoff — summary of selected preferences, drops into personalised swipe stack

Progress bar shown on screens 2–7. Smooth animated transitions throughout.

### 5.3 Swipe Experience
Each recipe card shows:
- Hero food image (65% of card height)
- Recipe name (bold)
- Cuisine type tag
- Cost per serving
- Prep + cook time
- Dietary goal match pills (green)
- Pantry match indicator ("You have 6 of 9 ingredients")
- Badge if applicable

Swipe right = save (green overlay). Swipe left = pass (red overlay).
Spring animation on card release. X and Heart buttons below card as tap alternatives.
Every swipe logged as AI training data regardless of direction.

### 5.4 Recipe Library
Pinterest-style visual grid. Filter bar at top. Each card shows image, name, rating, badges.
Actions: Like (private), Rate (public 1–5 stars), Edit/Remix, Add to Grocery List, Add to Weekly Plan, Save to Collection.

Badge types:
- **Staff Pick** — curated library
- **Community Verified** — passed AI checker
- **Community Favorite** — high rating + high cook count

### 5.5 Grocery List
Ingredients grouped by category: Produce, Meat & Seafood, Dairy, Pantry, Frozen.
Each item: name, quantity, checkbox. Running total cost at bottom. Order Now button triggers delivery flow.

### 5.6 Pantry Tracking
Built from: auto-deduction from deliveries + receipt scanning + manual entry.
Post-cook check-in: "Was anything left over?" → flags partial ingredients → updates pantry.
Storage tips returned by Claude for any flagged leftover ingredient.

### 5.7 Meal Planner (Meal Prep Mode)
7-day calendar, Breakfast/Lunch/Dinner slots, drag and drop recipe placement.
Quantity counter per recipe for meal prep multiplier.
Build Grocery List button consolidates all meals, deduplicates, removes pantry items.

---

## 6. Database Schema

```sql
-- Users (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  name text,
  avatar_url text,
  dietary_goals text[] default '{}',
  cuisine_preferences text[] default '{}',
  skill_level text check (skill_level in ('beginner', 'home_cook', 'confident_chef')),
  cooking_frequency text check (cooking_frequency in ('few_times_week', 'most_days', 'just_starting')),
  weekly_budget text,
  meals_cooked_count integer default 0,
  recipes_submitted_count integer default 0,
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
  ingredients jsonb not null, -- [{ name, quantity, unit }]
  steps jsonb not null,       -- [{ order, instruction }]
  prep_time_mins integer,
  cook_time_mins integer,
  servings integer,
  cost_per_serving numeric(6,2),
  dietary_tags text[] default '{}',
  badge text check (badge in ('none', 'staff_pick', 'community_verified', 'community_favorite')) default 'none',
  submitted_by uuid references profiles(id),
  avg_rating numeric(3,2) default 0,
  rating_count integer default 0,
  save_count integer default 0,
  image_url text,
  created_at timestamp with time zone default now()
);

-- Swipe Events (AI training data)
create table swipe_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  direction text check (direction in ('right', 'left')) not null,
  mode text check (mode in ('meal_prep', 'spontaneous')) not null,
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
  added_via text check (added_via in ('delivery', 'receipt', 'manual')),
  added_at timestamp with time zone default now(),
  expires_at timestamp with time zone
);

-- Grocery Lists
create table grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  list_type text check (list_type in ('weekly', 'spontaneous')) not null,
  status text check (status in ('active', 'ordered', 'complete')) default 'active',
  items jsonb not null, -- [{ ingredient_name, quantity, unit, checked, recipe_ids }]
  estimated_total_cost numeric(8,2),
  delivery_partner text,
  created_at timestamp with time zone default now()
);

-- Meal Plans
create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  week_start_date date not null,
  is_public boolean default false,
  slots jsonb default '[]', -- [{ day: 0-6, meal_type, recipe_id, servings_multiplier }]
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
```

---

## 7. API Endpoints (Vercel Serverless Functions)

All Claude API calls happen server-side only. Never expose the Anthropic API key on the client.

```
POST /api/recommendations
  Body: { userId, mode, limit }
  Returns: { recipeIds: string[] }
  — Calls Claude with user profile + swipe history + pantry to rank recipes

POST /api/check-recipe
  Body: { recipe: RecipeSubmission }
  Returns: { passed: boolean, feedback: string[], tags: string[] }
  — AI quality checker for user submitted recipes

POST /api/scan-receipt
  Body: { imageBase64: string }
  Returns: { items: PantryItem[] }
  — Claude reads receipt image and returns structured pantry items

POST /api/storage-tip
  Body: { ingredientName, quantity, unit, upcomingRecipes }
  Returns: { tip: string, expiryDays: number }
  — Claude returns storage advice for a leftover ingredient

POST /api/adapt-meal-plan
  Body: { mealPlan, userGoals, userPantry }
  Returns: { adaptedSlots, flags: ConflictFlag[] }
  — Claude checks a copied meal plan against user's goals and pantry
```

---

## 8. Environment Variables

```bash
# Supabase
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# Only used in Vercel serverless functions — never in client code
ANTHROPIC_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Delivery APIs (Phase 3)
INSTACART_API_KEY=
DOORDASH_API_KEY=
UBER_EATS_API_KEY=
```

---

## 9. Coding Rules

1. **TypeScript everywhere** — no plain JS files, strict mode on
2. **Never call Claude API from the client** — all AI calls go through Vercel serverless functions
3. **Never expose secret keys in client code** — only EXPO_PUBLIC_ prefixed vars are safe on client
4. **Use Expo Router for all navigation** — no React Navigation
5. **Use NativeWind for all styling** — no StyleSheet.create unless absolutely necessary
6. **Use Zustand for all global state** — no Redux, no Context for app state
7. **Use React Hook Form for all forms** — no uncontrolled inputs
8. **All Supabase calls go through lib/api.ts** — never call Supabase directly from screens
9. **All colors and spacing from constants/theme.ts** — no hardcoded hex values in components
10. **Every screen gets a loading state and error state** — no bare data fetching without handling
11. **Animations use React Native Reanimated** — no Animated API from core React Native

---

## 10. Phased Build Order

Build in this order. Do not skip ahead.

### Phase 1 — Foundation (Current Focus)
- [ ] Expo project setup with all dependencies installed
- [ ] Supabase project connected, schema applied, RLS policies set
- [ ] NativeWind and theme constants configured
- [ ] Zustand stores scaffolded
- [ ] Onboarding flow — all 8 screens fully built and functional
- [ ] Supabase auth integrated (email + Google)
- [ ] Bottom tab navigation with all 4 tabs
- [ ] Swipe screen with static recipe cards from TheMealDB seed data
- [ ] Recipe library with Pinterest grid and basic filtering
- [ ] Manual grocery list — add recipes, view consolidated list
- [ ] Basic profile screen with stats

### Phase 2 — AI Layer
- [ ] Vercel project set up with serverless functions
- [ ] /api/recommendations endpoint built and connected to swipe screen
- [ ] Pantry screen — manual entry, auto-deduction from orders
- [ ] /api/scan-receipt endpoint + receipt scanning UI
- [ ] Post-cook check-in flow
- [ ] /api/storage-tip endpoint + storage tip display
- [ ] Food waste reduction goal and nudges

### Phase 3 — Delivery Integration
- [ ] Instacart API integration
- [ ] DoorDash Drive API integration
- [ ] Uber Eats API integration
- [ ] Delivery partner selection UI
- [ ] Same-day vs scheduled delivery option

### Phase 4 — Community
- [ ] Recipe submission form
- [ ] /api/check-recipe AI checker endpoint
- [ ] Badge system
- [ ] Public ratings and likes
- [ ] Community explore page

### Phase 5 — Social
- [ ] Follow system
- [ ] Public meal plans
- [ ] Community feed
- [ ] /api/adapt-meal-plan endpoint
- [ ] Profile tabs

---

## 11. Out of Scope — Do Not Build Yet

These are documented for future phases. Do not implement until instructed:
- Push notifications and engagement nudges
- Cooking streaks and stats dashboard
- Android build
- Web companion app
- Budget tracking and savings summaries

---

## 12. Key Decisions Already Made

- **iOS first** — Android comes after iOS is solid
- **No design tool** — UI is built directly in code and previewed via Expo Go on device
- **Delivery preferences captured at first order** — not during onboarding
- **Account creation is the last onboarding screen** — not the first
- **Social features come after core app is proven** — Phase 5
- **All AI runs server-side** — Claude API key never touches the client

---

*PrepSwipe CLAUDE.md — v1.0 — Keep this file updated as decisions change.*
