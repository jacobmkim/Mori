# Mori — CLAUDE.md

## Commandments
- Use subagents for any exploration requiring 3+ file analysis; have it return a summary.
- Run long tasks (scripts, backfills, builds) via a background agent so the user can keep working.
- Keep this file LEAN. Any changes should be reflected here or updated on the respective .md files.
- Compact at 60% of context usage.
- Do not make changes unless 95% confident. Ask follow-up questions until that threshold is met.
- Bug fix log lives at `.claude/bugfixes.md` — append an entry for every shipped fix batch.

### Security Commandments (April 2026)
- **Never add API endpoints without JWT auth** — use `requireAuth(req)` from `lib/apiAuth.ts` unless explicitly public (waitlist)
- **Always validate inputs** — use Zod schemas from `lib/validation.ts`; create new schemas for new endpoints
- **Always rate-limit user endpoints** — use `rateLimitUser()` from `lib/rateLimit.ts`; public endpoints use `rateLimitIP()`
- **Never log sensitive data** — tokens, passwords, API keys, user IDs. Check for console.log of auth data; use development-only logging if needed
- **Generic error responses only** — never return DB errors, stack traces, or internal details to client. Return { error: 'Failed to...' }
- **Always check ownership** — if user requests data for another user (e.g., taste-profile for userId=abc), verify `userId === authUserId`
- **Never hardcode secrets** — all API keys, SEED_SECRET, etc. go in Vercel environment variables only
- **Never expose .env** — confirm it's in .gitignore; rotate keys if ever committed to git

## Applied Learning
_(Add one-line bullets here only when a workaround is found or something fails repeatedly.)_

---

## 1. What We Are Building
Mori is a swipe-based recipe discovery app. Users swipe on recipe cards → save to library → build a grocery list → send to Instacart. Local weighted scorer ranks recipes on-device. Revenue via Instacart affiliate (Impact). iOS only. Leaning hard into the Japanese meaning - forest.

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
- Add Recipe wizard (4-step): basics, ingredients w/ autocomplete, steps w/ timer hints, review + submit → community recipes in Supabase. Photo upload UI present but not wired (grayed-out "coming soon"). Public recipes appear in all users' Discover decks.
- MoriLogo.tsx + getmori.app/index.html: circle dot removed from all spatula SVGs.
- Steamed/delicate fish hard-excluded from meal prep deck (`MEAL_PREP_EXCLUDE_METHODS` + `MEAL_PREP_DELICATE_FISH` in `lib/api.ts`).
- Profile dark mode: all hardcoded hex replaced with `colors.error` / `colors.errorBg`.
- Apple AI transparency: passive disclosure banner on payoff screen covers App Store requirement.

### ❌ Remaining — Phase 3
| # | Item |
|---|---|
| 1 | ✅ Run `clean-recipes.mjs` — 13 dupes deleted (Indian + Korean), 6 tags fixed. 609 curated recipes remain. FK cascade added to script. |
| 2 | N/A `clean-ingredient-units.mjs` — app display layer handles ingredient formatting; DB data clean. |
| 3 | ✅ App tutorial — `components/TutorialOverlay.tsx` coach-mark overlay, 4 steps, AsyncStorage `@mori_tutorial_seen` flag, shown once post-onboarding on Discover. |
| 4 | ✅ Privacy policy in-app — `app/privacy-policy.tsx` modal, entry row in profile Settings. |
| 5 | ✅ Logo — 3 PNG variants: green-green (light), green-white (dark), white-white (overlay). |
| 6 | ✅ Fix logo on onboarding → main app screens — MoriLogo.tsx uses Canva PNGs, SVG fallback removed. |
| 7 | ❌ Fix screenshots on getmori.app website. |
| 8 | Ingredient substitution optimization. Go through look at what can be substituted.
| 9 | Changing servings in the grocery cart when on discover should show macro changes as well as ingredient changes.
| 10 | meal prep mode tutorial i.e show were you can change it.
| 11 | Profile shows more personalized name or user name?

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
- **App icon:** always linen light (#F8F3EC bg, #2E5438 m + spatula). Never changes between themes.
- **PNG assets only — no SVGs. Never recreate these as inline SVG.**

| File | Dimensions | Spatula | "mori" text | Background | Use when |
|---|---|---|---|---|---|
| `assets/mori-green.png` | 1200×300 (4:1) | Green #2E5438 | Green #2E5438 | Transparent | App light mode (Spontaneous Light, Meal Prep Light). HTML nav + footer. |
| `assets/mori-dark.png` | 1200×300 (4:1) | Green #2E5438 | White #FFFFFF | Transparent | App dark mode (Spontaneous Dark, Meal Prep Dark). |
| `assets/mori-white.png` | 1200×300 (4:1) | White #FFFFFF | White #FFFFFF | Transparent | Welcome overlay, any dark photo background. |
| `assets/mori_icon.png` | 1024×1024 (1:1) | Moss #2E5438 | — (no text) | Linen #F8F3EC | App Store icon (app.json), HTML favicon, 32/40/48px icon badges. |

**App sizes (MoriLogo.tsx):** `sm` 148×37 · `md` 208×52 · `lg` 268×67
**HTML sizes:** nav 152×38 · footer 88×22

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

## 7b. API Security & Rate Limiting (April 2026)

**All Vercel API endpoints have comprehensive security hardening: JWT auth, input validation, rate limiting, security headers.**

See **`.claude/SECURITY_HARDENING_IMPLEMENTATION.md`** for full details:
- Rate limits per endpoint
- Authentication & validation schemas
- Client integration requirements
- Pre-deployment checklist
- Testing recommendations

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
SEED_SECRET=              # Admin-only seed-recipes endpoint (generate: openssl rand -hex 32)
INSTACART_PARTNER_ID=     # Phase 4
INSTACART_API_KEY=        # Phase 4
```

---

## 9. Out of Scope
DoorDash, Uber Eats, Amazon Fresh, push notifications, Android, web app, barcode scanning, fridge vision, baking tab, weather-aware recs, budget tracking, Pexels/Unsplash for generated images (replaced by gpt-image-1).

---
*v7.0 — Lean rewrite. Phase 3 in progress: logo/website update, Apple feedback fixes, Add Recipe wizard. Phase 4 = Grocery APIs.*
