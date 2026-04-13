# Mori — CLAUDE.md

## Commandments
- Use subagents for any exploration requiring 3+ file analysis; have it return a summary.
- Use relevant models for best purposes. Opus for deep planning and tasks. Sonnet for most of the work. Haiku for easy tasks and large amounts of writing.
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

### ✅ Complete (Phases 1–3)
- Expo SDK 54 / RN 0.81.5 / Expo Router / Supabase auth + schema
- Onboarding (10 screens), all fields persisted
- Discover: swipe mechanic, local scorer, dietary/dislike/skill filters, adventure cards, macro pills, interaction logging
- Explore tab: editorial sections, filter chips
- Recipes tab: Saved/Cooked/Mine sub-tabs; Saved has inline quick-filter chips (Meal Prep, Quick, High Protein, Low Carb); recipe cards show Meal Prep + Quick tags
- Recipe Detail: full-screen modal, step cards, My Notes tab, cooking mode
- Plan tab: weekly meal grid, Supabase-backed
- Grocery List: grouped categories, checkboxes, copy-to-clipboard
- Profile: AvatarButton → ProfileSheet, taste profile (monthly cron + update modal), pantry, preferences, editable display name, appearance toggle
- 609 curated recipes (419 TheMealDB + generated); all have steps, macros, gpt-image-1 images
- Vercel functions: /api/macros, /api/taste-profile, /api/generate-recipe, /api/storage-tip
- app.json: name Mori, bundle ID app.getmori.mori
- Landing page: getmori.app (Vercel), hello@getmori.app email routing. Screenshots + taste profile section updated.
- App icon: italic m + spatula, linen #F8F3EC, 1024×1024
- TestFlight internal live; external submitted for Beta App Review
- Add Recipe wizard (4-step): basics, ingredients w/ autocomplete, steps w/ timer hints, review + submit → community recipes. Public recipes appear in all Discover decks.
- Unit system toggle (imperial/metric); ingredient substitutions (`lib/substitutions.ts`, ~125 entries)
- Deck Servings Sheet on Discover: scaled macros + ingredients reactively (`scaleDeckMacros()`)
- Tutorial overlays: first-launch coach marks (`TutorialOverlay.tsx`) + meal prep tip
- Privacy policy in-app (`app/privacy-policy.tsx`)
- API security hardening: JWT auth, Zod validation, rate limiting on all endpoints
- Forgot password + confirm password flow
- Mori logo: 3 PNG variants, correct per light/dark mode; heart/X buttons theme-synced

### ❌ Phase 4 — Grocery APIs
- ✅ Kroger OAuth + Cart: full PKCE flow using Web Crypto API (Expo Go compatible), tokens in Supabase (`kroger_tokens` table, RLS service-role only), direct cart add. `api/kroger-auth.ts`, `api/kroger-cart.ts`, `KrogerSheet` in `grocery-list.tsx`. `cleanForSearch()` strips quantities/prep words before search; not-found items shown in results instead of silently dropped.
- ⏳ **Waiting on Kroger production API approval** — Partner Request submitted via `developer.kroger.com` contact form (Jacob Kim, jkim2002@gmail.com, April 2026). Sandbox (`api-ce.kroger.com`) has limited catalog so most ingredients won't be found. Once approved: add `KROGER_ENVIRONMENT=production` + production credentials to Vercel env vars. Code is ready; `filter.limit` bumped to 5 with best-match fallback already in `api/kroger-cart.ts`.
- ⏳ **Waiting on Instacart Developer Platform approval** — applied, waiting.
- ✅ Grocery list persists across restarts — `groceryStore` now uses Zustand `persist` + `createJSONStorage(() => AsyncStorage)`, partializing `list` + `selectedRecipes`
- ✅ Meal Prep sub-tab shows all saved recipes when `mode === 'meal_prep'` — previously filtered by `meal_prep_friendly` which is `null` for most DB recipes
- ✅ **New Recipe Backfill (1000+ recipes)** — two-phase workflow for bulk additions:
  - **Phase 1:** `node scripts/generate-new-recipes.mjs` reads CSV (`scripts/new-recipes.csv`), calls `/api/generate-recipe` with `save: false`, writes JSONL output to `scripts/new-recipes-draft.json` (one recipe per line). Resume-safe: skips titles already in Supabase + already in draft file.
  - **Phase 2:** `node scripts/upload-new-recipes.mjs` — ❌ **NOT YET BUILT**. Needs to: read JSONL draft, batch-insert (50 rows/batch) to Supabase with deduplication. Photos added via `generate-images.mjs` after upload. Fields: `cuisine` stored as-is (e.g. `"cajun,italian"` for fusions), `skill_level: 'home_cook'`, `meal_prep_friendly` from recipe response, `image_url: null` until photos ready.
  - **CSV format:** `title,cuisine,meal_prep_friendly,difficulty,approx_time_mins`. Fusion cuisines quoted (e.g., `"cajun,italian"`). ~330 unique recipes.
  - **Cuisine handling:** Comma-separated for fusions (both parent cuisines kept); passed to API as `"cuisine1 and cuisine2"` for Claude context.
  - **Parser:** RFC 4180 quoted-CSV in `generate-new-recipes.mjs:loadDishes()` handles embedded commas.
- Check ALL tags for all recipes and categories. Make sure that we are scoring properly for all of these categories and tags.
- Payment wall take cut of grocery?
- User ability to add photos for ALL recipes. User created or current Mori recipes.
- Vercel functions: `/api/walmart-cart`, `/api/instacart-cart`
- Affiliate tracking via Impact
- Grocery list history view
- Profile picture and user names

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
| Recipe images | gpt-image-1 via scripts/generate-images.mjs → Supabase Storage | All done |

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
  ui/MoriLogo.tsx         ✅

lib/
  supabase.ts, api.ts (scorer here), mealdb.ts, utils.ts, substitutions.ts

stores/
  userStore, savedStore, groceryStore, collectionsStore,
  mealPlanStore, discoverStore

api/ (Vercel functions)
  macros.ts, taste-profile.ts, generate-recipe.ts,
  storage-tip.ts, recommendations.ts (built, unused)

scripts/ (all one-time or safe-to-resume, already ran)
  seed-recipes, backfill-*, rewrite-steps, generate-recipes,
  generate-images, clean-recipes, clean-ingredient-units,
  new-recipes.csv (source list for bulk backfill),
  generate-new-recipes.mjs (Phase 1: generate → JSONL),
  upload-new-recipes.mjs (Phase 2: JSONL → Supabase)

__tests__/                 ✅ Jest 29 + jest-expo@54 — 101 tests, 9 suites
  api/_apiAuth.test.ts     AuthError, extractBearerToken, handleAuthError
  api/_rateLimit.test.ts   rateLimitUser, rateLimitIP, getClientIP
  lib/utils.test.ts        formatTime, formatCost, capitalize, getWeekStart, getTimeOfDay
  stores/collectionsStore.test.ts
  stores/mealPlanStore.test.ts
  stores/groceryStore.test.ts     (includes test.failing() for quantity-dedup bug)
  stores/savedStore.test.ts
  stores/discoverStore.test.ts
  lib/substitutions.test.ts       (includes test.failing() for word-boundary bug)
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

## 6. Coding Rules

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

### API Security & Rate Limiting
See **`.claude/SECURITY_HARDENING_IMPLEMENTATION.md`** for full details (rate limits, auth schemas, pre-deploy checklist).

---

## 7. Environment Variables

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

## 8. Out of Scope
DoorDash, Uber Eats, Amazon Fresh, push notifications, Android, web app, barcode scanning, fridge vision, baking tab, weather-aware recs, budget tracking, Pexels/Unsplash for generated images (replaced by gpt-image-1).

---

## 9. Audit Findings (April 2026)
Full audit run across security, bugs, and edge cases. Items below are **unresolved**. Mark off as fixed.

### 🔴 Security
- [ ] `/api/generate-recipe` allows unauthenticated calls — auth header is optional; seed scripts bypass rate limiting entirely. Require auth OR `x-seed-secret`.
- [ ] Rate limiting fails **open** (`rateLimit.ts:159`) — infra error returns `success: true`. Should fail closed.
- [ ] Kroger `access_token` / `refresh_token` stored as plaintext `TEXT` in Supabase (`kroger_tokens` table). Encrypt with `pgsodium`.
- [ ] No production error logging — all errors swallowed silently in prod. Add Sentry or equivalent.
- [ ] No CSRF protection on public endpoints (`/api/waitlist`).
- [ ] Timing-attack risk on seed secret string comparison — use `crypto.timingSafeEqual()`.
- [ ] Missing security headers (X-Content-Type-Options, X-Frame-Options) on Vercel functions.

### 🔴 Bugs
- [ ] `scoreRecipe` (`lib/api.ts:555`) accesses `m.protein` without null-checking macros — crashes on recipes with null macros.
- [ ] `RecipeDetailModal` crashes if `recipe.ingredients` is null (`RecipeDetailModal.tsx:250`) — use `?.length`.
- [ ] Race condition in `savedStore.addRecipe` — optimistic update followed by `loadSavedRecipes()` reload; rapid saves can create duplicates or lost saves.
- [ ] `EditPreferencesModal` save button stuck in loading if `onSave` throws — `setSaving(false)` only runs in `finally` but `onClose()` inside `try` may not get called.
- [ ] `detailCache` and `macroCache` refs on Discover grow unbounded — never cleared on deck reload (memory leak over long sessions).
- [x] `mealPlanStore` error state never cleared on successful reload — confirmed fixed by test suite (`loadPlan` clears error on success).
- [ ] `AsyncStorage` JSON.parse in `discoverStore.loadMode` not in try-catch — corrupted storage crashes preference load.
- [ ] Empty `image_url` (`""`) passed to `expo-image` (`grocery-list.tsx:205`) — causes silent render failure; use `undefined` or a placeholder.

### 🟡 Edge Cases
- [ ] **Offline** — no network detection anywhere. All API failures are silent; Discover deck goes blank with no message.
- [ ] **Deck exhaustion** — no empty state when all recipes are swiped. Screen goes blank or crashes.
- [ ] **Timezone bug** — `toDateStr()` in `plan.tsx:41` uses `toISOString()` which converts to UTC before splitting. Users near midnight get wrong week. Use local date formatting instead.
- [ ] **Grocery quantity dedup** — same ingredient from two recipes only keeps first recipe's quantity (`groceryStore.ts:42`). User buys insufficient ingredients.
- [ ] **Meal plan deleted recipes** — `slotRecipes[slot.recipe_id]` returns `undefined` if recipe was deleted. Show "Recipe removed" instead of crashing.
- [ ] **Kroger token refresh silent failure** — tokens deleted from DB on revocation with no re-auth prompt to user.
- [ ] **Dislike filter not retroactive** — editing dislikes mid-session doesn't refresh the active deck until tab switch.
- [ ] **Rapid swiping** — concurrent `logSwipeBackground()` calls can log swipes out of order; recommendation signal degrades.
- [ ] **Search + filter don't compose** in Recipes tab — applying a filter resets active search query.
- [ ] **Substitution partial matching** — `"buttermilk".includes("butter")` → wrong substitutions returned. Use word-boundary matching.
- [ ] **Macro float precision** — combined macros in grocery list display unrounded floats (e.g. `45.333333g`). Round to 1 decimal.
- [ ] **Budget field unused** — collected in onboarding, stored in profile, never used for filtering anywhere.
- [ ] **Adventure card pause not persisted** — session-only; resets on app relaunch.

---
*v8.3 — Phases 1–3 complete. Phase 4 in progress. Grocery persistence + Meal Prep tab fixed. New recipe backfill workflow (2-phase: generate → JSONL → Supabase) ready. Jest test suite live (101 tests, 9 suites).*
