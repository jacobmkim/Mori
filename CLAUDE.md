# Mori — CLAUDE.md

## Commandments
- Use subagents for any exploration requiring 3+ file analysis; have it return a summary.
- Run long tasks (scripts, backfills, builds) via a background agent so the user can keep working.
- Keep this file LEAN.
- Do not make changes unless 95% confident. Ask follow-up questions until that threshold is met.
- Bug fix log lives at `.claude/bugfixes.md` — append an entry for every shipped fix batch.

## Applied Learning
_(Add one-line bullets here only when a workaround is found or something fails repeatedly.)_

---

## 1. What We Are Building
Mori is a swipe-based recipe discovery app. Users swipe on recipe cards → save to library → build a grocery list → send to Instacart. Local weighted scorer ranks recipes on-device. Revenue via Instacart affiliate (Impact). iOS only.

---

## 2. Current Build State

### ✅ Complete
- Expo SDK 54 / RN 0.81.5 / Expo Router / Supabase auth + schema
- Onboarding (10 screens), all fields persisted
- Discover: swipe mechanic, local scorer, dietary/dislike/skill filters, adventure cards, macro pills, interaction logging
- Explore tab: editorial sections, filter chips
- Recipes tab: Saved/Cooked/Mine/Meal Prep, search + filter
- Recipe Detail: full-screen modal, step cards, sticky footer, My Notes tab
- Cooking Mode: full-screen dark, per-step timer
- Plan tab: weekly meal grid, Supabase-backed
- Grocery List: grouped categories, checkboxes, copy-to-clipboard
- Profile: AvatarButton → ProfileSheet, taste profile, pantry, preferences
- recipe_notes table + RLS + updated_at trigger
- 419 TheMealDB + 622 generated recipes seeded; all have steps, macros, gpt-image-1 images
- Vercel functions: /api/macros, /api/taste-profile, /api/generate-recipe, /api/storage-tip
- app.json: name Mori, bundle ID app.getmori.mori
- Landing page: getmori.app (Vercel), hello@getmori.app email routing
- App icon: italic m + spatula, linen #F8F3EC, 1024×1024 ✅
- TestFlight internal live; external submitted for Beta App Review

### ❌ Remaining — Phase 3
| # | Item |
|---|---|
| 1 | Add Recipe wizard — 4-step: basics → ingredients (autocomplete) → steps (timer hints) → review (spec: Section 6) |
| 2 | Update `MoriLogo.tsx` — replace circle dot with spatula SVG |
| 3 | Update `getmori.app/index.html` — replace circle dot in inline SVGs with spatula |
| 4 | Run `clean-recipes.mjs` — dedup before TestFlight |
| 5 | Run `clean-ingredient-units.mjs` — strip prep instructions from ingredient fields |
| 6 | Fix profile page dark mode — white card backgrounds → `colors.card` |
| 7 | Steamed/delicate fish hard-exclude from meal prep deck |
| 8 | Apple AI transparency in-app consent (required before App Store, not internal TF) |
| 9 | App tutorial for new users. Show user key features.

### ❌ Phase 4 — Grocery APIs
- Kroger API (`developer.kroger.com`) — Done. Ask user for key.
- Instacart Developer Platform — applied, waiting
- User ability to add photos for ALL recipes. User created or current Mori recipes.
- Grocery ordering bottom sheet in `grocery-list.tsx`
- Vercel functions: `/api/walmart-cart`, `/api/kroger-cart`, `/api/instacart-cart`
- Affiliate tracking via Impact
- Grocery list history view

### ❌ Phase 5+ — Community, Social
Out of scope until Phase 4 ships.

---

## 3. Tech Stack

| Layer | Technology | Note |
|---|---|---|
| Framework | React Native 0.81.5 + Expo SDK 54 | |
| Navigation | Expo Router | |
| Backend/Auth | Supabase | |
| Animations | **React Native Animated API** | ⚠️ Do NOT migrate to Reanimated |
| Icons | Ionicons (Expo Vector Icons) | |
| Images | expo-image | |
| Styling | **Inline styles + constants/theme.ts** | ⚠️ Do NOT migrate to NativeWind |
| State | Zustand | |
| Recommendation | **Local weighted scorer** (lib/api.ts) | ⚠️ Do NOT replace with API call |
| Serverless | Vercel | |
| AI | Claude Haiku — taste profile, macros, recipe gen, storage tips | |
| Recipe images | gpt-image-1 via scripts/generate-images.mjs → Supabase Storage | All 622 done |

---

## 4. Project Structure (key files only)

```
app/
  _layout.tsx, index.tsx
  onboarding/          ✅ 10 screens complete
  (tabs)/
    discover.tsx       ✅ swipe + scorer
    explore.tsx        ✅ editorial browse
    recipes.tsx        ✅ personal library
    plan.tsx           ✅ weekly meal grid
    grocery-list.tsx   ✅ grouped list + clipboard
    profile.tsx        ✅ stats + preferences

components/
  RecipeDetailModal.tsx   ✅ full-screen, step cards, My Notes
  CookingMode.tsx         ✅ dark full-screen cooking
  AvatarButton.tsx        ✅ initials circle → ProfileSheet
  cards/RecipeCard.tsx    ✅
  cards/RecipeGridCard.tsx ✅
  grocery/InstacartButton.tsx  🔲 Phase 4
  ui/MacroRow.tsx         ✅
  ui/MoriLogo.tsx         ⚠️ needs spatula update

lib/
  supabase.ts, api.ts (scorer here), mealdb.ts, utils.ts

stores/
  userStore, savedStore, groceryStore, collectionsStore,
  mealPlanStore, discoverStore

api/ (Vercel functions)
  macros.ts, taste-profile.ts, generate-recipe.ts,
  storage-tip.ts, recommendations.ts (built, unused)

scripts/ (all one-time or safe-to-resume, already ran)
  seed-recipes, backfill-*, rewrite-steps, generate-recipes,
  generate-images, clean-recipes, clean-ingredient-units
```

---

## 5. Design System

### Brand
- **Name:** Mori. Bundle ID: `app.getmori.mori`.
- **Logo accent:** spatula SVG (NOT a circle dot) — matches primary green of current theme.
- **App icon:** always linen light (#F8F3EC bg, #2E5438 m + spatula). Never changes between themes.

### Typography (Direction A — locked)
```
Recipe titles:    Georgia, serif, italic, 400 — NEVER sans-serif
Section headings: Georgia, serif, italic, 700
Metadata:         SF Pro, 400, 11px, uppercase, 0.08em spacing
Body/steps:       SF Pro, 400, 16px
```

### Themes (4 states — always use `useTheme()` hook, never hardcode hex)
- Spontaneous Light / Spontaneous Dark
- Meal Prep Light (linen #F8F3EC + moss #2E5438) / Meal Prep Dark

Full color values in `constants/theme.ts`.

---

## 6. Add Recipe Wizard — Spec (Phase 3, item #1)

4-step full-screen modal. Progress bar (4 pills) at top. Back arrow with "Discard recipe?" confirm dialog.

**Step 1 — Basics:** recipe name, one-line description, cuisine (12 pill chips), prep time, cook time, servings, public/private toggle (default public).

**Step 2 — Ingredients:** Qty / Unit / Ingredient columns. Ingredient field has inline autocomplete powered by local index of all distinct ingredient names from Supabase (cached in AsyncStorage on load — no API call). Dropdown appears below active row, max 4 suggestions, shows category emoji + name with matched chars bold + category label. Unit field opens picker (whole, g, kg, ml, l, tsp, tbsp, cup, handful, pinch, slice). "+" Add ingredient row. Max 30. Delete ✕ on each row.

**Step 3 — Steps:** One action per step. Hint: "Start with a verb." Current step input is a highlighted card. Timer suggestion bar appears when user types a number + "min" — quick-tap pills (2/5/10/15/custom) attach a timer to the step. Filled steps render as preview cards (same style as RecipeDetailModal). Max 15 steps.

**Step 4 — Review:** Read-only preview. Optional photo upload (Supabase Storage `recipe-images/user/{userId}/{recipeId}.jpg`). If no photo + public → gpt-image-1 generates one server-side. AI review notice for public recipes ("checking accuracy…"). Submit runs two-prompt Claude validation via `/api/check-recipe` (Phase 5 for public; for now save directly). On success → navigate to recipe detail + toast "Recipe saved!".

**DB write:** `recipes` table, `submitted_by = current user id`, `source_type = 'community'`.

---

## 7. Coding Rules

1. TypeScript everywhere, strict mode
2. Never call Claude or Instacart from client — Vercel functions only
3. Never expose secret keys — EXPO_PUBLIC_ prefix only
4. Expo Router — no React Navigation
5. Inline styles + theme.ts — no NativeWind, no StyleSheet.create
6. React Native Animated API — do not migrate
7. Zustand for all global state
8. All Supabase calls through lib/api.ts
9. All colors via `useTheme()` — never hardcode hex
10. Every screen needs loading + error state
11. Log every swipe to Supabase (non-negotiable)
12. Log every recipe_interaction (view, grocery_add, cooked)
13. Ingredient dislikes are hard filters — enforced before scoring
14. All macros labelled "estimated"
15. All interaction logging is fire-and-forget — never block UI
16. Scorer signal caps: grocery_add and cooked capped at Math.min(count, 2)
17. Recipe card titles use Georgia italic — never sans-serif

---

## 8. Environment Variables

```bash
# Client (EXPO_PUBLIC_ only)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=https://project-x-one-roan.vercel.app

# Vercel only — never in client
ANTHROPIC_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=           # gpt-image-1 for generate-images.mjs
UNSPLASH_ACCESS_KEY=      # registered
INSTACART_PARTNER_ID=     # Phase 4
INSTACART_API_KEY=        # Phase 4
```

---

## 9. Out of Scope
DoorDash, Uber Eats, Amazon Fresh, push notifications, Android, web app, barcode scanning, fridge vision, baking tab, weather-aware recs, budget tracking, Pexels/Unsplash for generated images (replaced by gpt-image-1).

---
*v7.0 — Lean rewrite. Phase 3 in progress: logo/website update, Apple feedback fixes, Add Recipe wizard. Phase 4 = Grocery APIs.*
