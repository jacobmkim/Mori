# Mori — CLAUDE.md

## Commandments
- Use subagents for any exploration requiring 3+ file analysis; have it return a summary.
- Use relevant models for best purposes. Opus for deep planning and tasks. Sonnet for most of the work. Haiku for easy tasks and large amounts of writing.
- Run long tasks (scripts, backfills, builds) via a background agent so the user can keep working.
- Keep this file LEAN. Any changes should be reflected here or updated on the respective .md files.
- Compact at 60% of context usage.
- Do not make changes unless 95% confident. Ask follow-up questions until that threshold is met.
- Bug fix log lives at `.claude/bugfixes.md` — append an entry for every shipped fix batch.
- Do not always agree with user! Look for missing edge cases things user has not thought of. 

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
- 1,506 curated recipes; all have steps, macros, dietary_tags, meal_prep_friendly, gpt-image-1 images
- Vercel functions: /api/macros, /api/taste-profile, /api/generate-recipe, /api/storage-tip (exactly 12 — Hobby plan limit; `_`-prefixed files don't count)
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
- Recipe flags moved to Supabase (`recipe_flags` table, RLS) — previously AsyncStorage-only, now cross-device and queryable
- Long-press delete mode on Recipes tab (Saved + Mine): multi-select with checkmark-circle icons, Delete(N)/Done header buttons
- Scorer optimized: unsave signal (−3 + neutralizes right-swipe boost), view-no-save penalty (−2 after 3 views), pantry word-containment matching, dietary goal cap +20, swipe history limit 500
- Fusion cuisine: split display in detail modal (individual pills + "Fusion" pill), grid card joins with ", "; scorer splits `cuisine` on comma for preference matching
- Session cuisine affinity: `sessionCuisineSwipes` map in `lib/api.ts` accumulates per-cuisine right/left swipes within a session; applied as bonus/penalty in `scoreRecipe`

### ❌ Phase 4 — Grocery APIs
- ✅ Kroger OAuth + Cart: full PKCE flow using Web Crypto API (Expo Go compatible), tokens in Supabase (`kroger_tokens` table, RLS service-role only), direct cart add. `api/kroger-auth.ts`, `api/kroger-cart.ts`, `KrogerSheet` in `grocery-list.tsx`. `cleanForSearch()` strips quantities/prep words before search; not-found items shown in results instead of silently dropped.
- ⏳ **Waiting on Kroger production API approval** — Partner Request submitted via `developer.kroger.com` contact form (Jacob Kim, jkim2002@gmail.com, April 2026). Sandbox (`api-ce.kroger.com`) has limited catalog so most ingredients won't be found. Once approved: add `KROGER_ENVIRONMENT=production` + production credentials to Vercel env vars. Code is ready; `filter.limit` bumped to 5 with best-match fallback already in `api/kroger-cart.ts`.
- ⏳ **Waiting on Instacart Developer Platform approval** — applied, waiting.
- ✅ Grocery list persists across restarts — `groceryStore` now uses Zustand `persist` + `createJSONStorage(() => AsyncStorage)`, partializing `list` + `selectedRecipes`
- ✅ Meal Prep sub-tab shows all saved recipes when `mode === 'meal_prep'` — previously filtered by `meal_prep_friendly` which is `null` for most DB recipes
- ✅ **New Recipe Backfill (483 recipes)** — two-phase workflow complete:
  - **Phase 1:** `node scripts/generate-new-recipes.mjs [--csv path] [--cuisine X] [--dry-run]` reads CSV, calls `/api/generate-recipe`, writes JSONL draft. Resume-safe.
  - **Phase 2:** `node scripts/upload-new-recipes.mjs` — batch-inserts draft → Supabase (50 rows/batch). Fixed pagination bug: uses `.range()` to fetch all existing titles, not just first 1000.
  - **CSV format:** `title,cuisine,meal_prep_friendly,difficulty,approx_time_mins`. Fusion cuisines quoted (e.g., `"cajun,italian"`). Cuisine stored as-is (comma-separated for fusions).
  - **DB cleanup:** 385 duplicates removed (caused by original pagination bug); 43 macros backfilled; 349 dietary tags backfilled; 319 dirty MealDB tags cleaned.
- **Recipe title polish pass** — `scripts/polish-recipe-titles.mjs` built (Haiku rewrites generic titles to be ingredient-forward). **Not yet run in production.**
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

api/ (Vercel functions — exactly 12, Hobby plan limit)
  macros.ts, taste-profile.ts, generate-recipe.ts, storage-tip.ts,
  kroger-auth.ts, kroger-cart.ts
  (recommendations.ts + backfill-meal-prep.ts deleted to stay within limit)

scripts/ (all one-time or safe-to-resume, already ran)
  seed-recipes, backfill-*, rewrite-steps, generate-recipes,
  generate-images, clean-recipes, clean-ingredient-units,
  new-recipes.csv (source list for bulk backfill),
  generate-new-recipes.mjs (Phase 1: generate → JSONL; supports --csv, --cuisine, --dry-run),
  upload-new-recipes.mjs (Phase 2: JSONL → Supabase; pagination-safe),
  recheck-meal-prep.mjs (re-evaluate meal_prep_friendly via Haiku; --all/--false/--dry-run),
  backfill-dietary-tags.mjs (clean dirty MealDB tags + Haiku classify empty tags),
  polish-recipe-titles.mjs (Haiku rewrites generic titles; --limit N, --dry-run, --recent N)

__tests__/                 ✅ Jest 29 + jest-expo@54 — 103+ tests, 11 suites
  api/_apiAuth.test.ts     AuthError, extractBearerToken, handleAuthError
  api/_rateLimit.test.ts   rateLimitUser, rateLimitIP, getClientIP
  api/generate-recipe.test.ts  auth gate (no JWT + no seed secret → 401)
  api/waitlist.test.ts     CORS rejection, input validation
  lib/utils.test.ts        formatTime, formatCost, capitalize, getWeekStart, getTimeOfDay
  stores/collectionsStore.test.ts
  stores/mealPlanStore.test.ts
  stores/groceryStore.test.ts
  stores/savedStore.test.ts
  stores/discoverStore.test.ts
  lib/substitutions.test.ts
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
12. Log every recipe_interaction (view, grocery_add, cooked, unsave)
13. Ingredient dislikes are hard filters — enforced before scoring
14. All macros labelled "estimated"
15. All interaction logging is fire-and-forget — never block UI
16. Scorer signal caps: grocery_add and cooked capped at Math.min(count, 2); dietary bonus capped at +20 total
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
- [x] `/api/generate-recipe` allows unauthenticated calls — fixed: now requires valid JWT or `x-seed-secret` header; no fallthrough.
- [x] Rate limiting fails **open** — fixed: infra error now returns `success: false` (fail closed).
- [x] Timing-attack risk on seed secret string comparison — fixed: uses `crypto.timingSafeEqual()`.
- [x] `waitlist` CORS logic inverted — fixed: non-allowlisted origins now return 403.
- [ ] Kroger `access_token` / `refresh_token` stored as plaintext `TEXT` in Supabase (`kroger_tokens` table). Encrypt with `pgsodium`.
- [ ] No production error logging — all errors swallowed silently in prod. Add Sentry or equivalent.
- [ ] No CSRF protection on public endpoints (`/api/waitlist`).
- [ ] Missing security headers (X-Content-Type-Options, X-Frame-Options) on Vercel functions.

### 🔴 Bugs
- [x] `scoreRecipe` (`lib/api.ts:555`) — already has `if (m)` null guard wrapping all macro accesses. Safe.
- [x] `RecipeDetailModal` crashes if `recipe.ingredients` is null — fixed: added `?.length` optional chaining on line 287.
- [x] Race condition in `savedStore.addRecipe` — already fixed: no `loadSavedRecipes()` reload called; trusts optimistic update by design.
- [x] `EditPreferencesModal` save button stuck in loading if `onSave` throws — fixed: moved `onClose()` to `finally`, added `catch` for error logging.
- [x] `detailCache` and `macroCache` refs on Discover grow unbounded — already fixed: both caches `.clear()` on every deck reload (line 470-471).
- [x] `mealPlanStore` error state never cleared on successful reload — confirmed fixed by test suite (`loadPlan` clears error on success).
- [x] `AsyncStorage` JSON.parse in `discoverStore.loadMode` not in try-catch — already fixed: no JSON.parse used; string comparison only, wrapped in try-catch.
- [x] Empty `image_url` (`""`) passed to `expo-image` (`grocery-list.tsx:205`) — already fixed: truthy check returns `undefined` for empty strings.

### 🟡 Edge Cases
- [ ] **Offline** — no network detection anywhere. All API failures are silent; Discover deck goes blank with no message.
- [ ] **Deck exhaustion** — no empty state when all recipes are swiped. Screen goes blank or crashes.
- [x] **Timezone bug** — fixed: `toDateStr()` and `getWeekStart()` now use local date formatting instead of `toISOString()`.
- [x] **Grocery quantity dedup** — fixed: quantities now combine as `"1 cup + 2 cups"` when same ingredient added from two recipes.
- [x] **Meal plan deleted recipes** — fixed: shows "Recipe removed" with dismiss button when slot references a deleted recipe.
- [ ] **Kroger token refresh silent failure** — tokens deleted from DB on revocation with no re-auth prompt to user.
- [ ] **Dislike filter not retroactive** — editing dislikes mid-session doesn't refresh the active deck until tab switch.
- [ ] **Rapid swiping** — concurrent `logSwipeBackground()` calls can log swipes out of order; recommendation signal degrades.
- [x] **Search + filter don't compose** — verified: `filtered()` in recipes.tsx correctly applies both search + filters; no code bug (UX perception only).
- [x] **Substitution partial matching** — fixed: word-boundary matching prevents "oil" matching "coconut oil", etc.
- [x] **Macro float precision** — fixed: all macro values rounded to 1 decimal (calories rounded to integer).
- [ ] **Budget field unused** — collected in onboarding, stored in profile, never used for filtering anywhere.
- [ ] **Adventure card pause not persisted** — session-only; resets on app relaunch.

---
*v9.0 — Phases 1–3 complete. Phase 4 in progress. Scorer: session cuisine affinity, fusion split matching. 1,506 recipes (deduped); all have images, macros, dietary tags, meal_prep_friendly. Security: auth gate on generate-recipe, rate limit fail-closed, timing-safe seed compare, CORS fix. Jest: 103+ tests, 11 suites.*
