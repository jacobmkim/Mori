# Mori — CLAUDE.md

## Current Priority — v1 Live, Bug-Fix Pass

**Mori v1 live in the US + CA App Store as of 2026-05-05.** Free tier only. Mori+ stays on the `mori-plus` branch until v1.1.

**Right now: bug-fix pass on the live Mori (free tier), not Mori+.** Bug fixes land on `main` and ship via normal `eas build` + `eas submit` cadence (each submission triggers a fresh App Store Review — keep the `apple-review@getmori.app` demo account intact).

### What shipped (v1)
- Code on `origin/main`: `082257a` → `1bbfe61` → `603754c` → `f99a586`. Privacy Manifest, in-app account deletion (Guideline 5.1.1(v)), Help screen, cook-flow streak/badges fix across all tabs.
- App Store Connect: 10 screenshots in 6.9" slot (resized from 6.3" via `scripts/resize-screenshots.ps1`, 24-bit RGB, no alpha), App Privacy nutrition labels (Linked: yes / Tracking: no for all 9 data types), Age rating with UGC + moderation, Free Apps Agreement Active (Paid Apps NOT signed — defer until Mori+).
- Reviewer demo account ([.claude/apple-review-info.md](.claude/apple-review-info.md)) preserved for any future re-review. Safe to touch but no reason to.

### Post-approval housekeeping
- Production builds now flow through normal EAS submit. Bump version + buildNumber in `app.json` for each new release.
- Bug-fix and feature work on `main` is unblocked. Continue to honour the Pre-Ship Commandments (EAS env audit, Vercel function smoke-test, etc.) before each `eas submit`.
- Monitor crash-free rate in Sentry + Apple's first-week analytics (acquisition, retention, crash %). Flag any regression-class issue early.

### v1.1 (Mori+) — paid IAP submission rules
When ready to ship the `mori-plus` branch:
- Sign **Paid Apps Agreement** + Tax forms (W-9) + Banking. Cannot ship IAP without all three Active.
- Apply to **App Store Small Business Program** (15% rate vs 30%, automatic for new devs).
- Configure subscription products in App Store Connect: `mori_plus_monthly`, `mori_plus_annual`, `mori_plus_lifetime`.
- Update App Privacy form — add Purchases → Purchase History (Linked to user, App Functionality).
- Cardinal rule: **paywall NEW features only, never existing free ones**. Swipe / save / plan / grocery / Instacart stay free forever. Mori+ adds Auto Plan, Sunday Drops, Generate from Pantry, Macro Coach, Saved Decks. Drift from this = Guideline 3.1.2 rejection.
- IAP review is **separate** from binary review. Both must pass; both submitted together.
- Once Paid Apps Agreement is signed there's no clean revert to "free only" — sign only when ready to ship Mori+ binary.

v1 is approved. Mori+ on the `mori-plus` branch is now cleared to merge to `main` and ship as v1.1 whenever the paid-apps prerequisites above are signed and the IAP review is queued.

## Commandments
- Use subagents for any exploration requiring 3+ file analysis; have it return a summary.
- Use relevant models for best purposes. Opus for deep planning and tasks. Sonnet for most of the work. Haiku for easy tasks and large amounts of writing.
- Run long tasks (scripts, backfills, builds) via a background agent so the user can keep working.
- Keep this file LEAN. Any changes should be reflected here or updated on the respective .md files.
- Compact at 60% of context usage.
- Do not make changes unless 95% confident. Ask follow-up questions until that threshold is met.
- Bug fix log lives at `.claude/bugfixes.md` — append an entry for every shipped fix batch.
- Do not always agree with user! Look for missing edge cases things user has not thought of.
- **Look for potential issues proactively, especially in invisible state.** When something works locally but breaks in TestFlight/prod, check config that lives outside the repo first: EAS dashboard env, Vercel env, Supabase RLS, EAS Secrets, custom domain → deployment binding. Don't theorize about code paths until you've verified config alignment. The local `.env` is NOT a source of truth for built apps.
- **No binary scoring** — never use all-or-nothing pool inclusion as a feature signal. Use score bonuses/penalties so signals compete on merit (e.g. favourites_rotation gets +6 saved bonus, not unconditional deck inclusion).

### Security Commandments (April 2026)
- **Never add API endpoints without JWT auth** — use `requireAuth(req)` from `lib/apiAuth.ts` unless explicitly public (waitlist)
- **Always validate inputs** — use Zod schemas from `lib/validation.ts`; create new schemas for new endpoints
- **Always rate-limit user endpoints** — use `rateLimitUser()` from `lib/rateLimit.ts`; public endpoints use `rateLimitIP()`
- **Never log sensitive data** — tokens, passwords, API keys, user IDs. Check for console.log of auth data; use development-only logging if needed
- **Generic error responses only** — never return DB errors, stack traces, or internal details to client. Return { error: 'Failed to...' }
- **Always check ownership** — if user requests data for another user (e.g., taste-profile for userId=abc), verify `userId === authUserId`
- **Never hardcode secrets** — all API keys, SEED_SECRET, etc. go in Vercel environment variables only
- **Never expose .env** — confirm it's in .gitignore; rotate keys if ever committed to git

### Pre-Ship Commandments (April 2026)
- **Before any TestFlight or production build, run `eas env:list --environment production`** and cross-check it against every `process.env.EXPO_PUBLIC_*` reference in the client (`grep -rn "process\.env\.EXPO_PUBLIC_" --exclude-dir=node_modules`). Every referenced var must be present AND current. Pin critical ones in `eas.json` `build.<profile>.env` so they're source-controlled, not hidden dashboard state. Reason: `EXPO_PUBLIC_*` is Babel-inlined at bundle time on the EAS server, which never sees the gitignored local `.env`. Missing vars degrade to `undefined` and silently disable features (e.g. Sentry init guards on the DSN).
- **Don't conflate EAS env with Vercel env.** EAS env = client-side `EXPO_PUBLIC_*` baked into the IPA. Vercel env = server-side keys read by API functions at runtime (Anthropic, Supabase service role, Instacart, Resend). Adding `INSTACART_API_KEY` to EAS does nothing; adding `EXPO_PUBLIC_API_URL` to Vercel does nothing. When debugging "feature X is broken in prod", first identify which side the failing code lives on.
- **After modifying any Vercel function, smoke-test the deployed endpoint with curl** before declaring the change shipped. Probe for the expected status (e.g. 401 unauth, not 404 deployment-not-found) and the expected response shape. `vercel deploy` succeeding is not the same as the route being reachable.
- **Async side effects in Vercel functions must `await` before `res.end()`.** Sentry, analytics, push-notification dispatch — all of it. Vercel kills the event loop on response, so fire-and-forget after the response is functionally a no-op. Use `try { … } finally { await Sentry.flush(2000); }` for ship-critical signals.
- **For "broken in prod, works locally" bugs, check invisible state first** — in this order: EAS env, Vercel env, Supabase RLS policies, custom domain bindings, EAS Secrets. Read live state (`eas env:list`, Vercel dashboard, Supabase Studio) before reading code. Local source code matching expectations is not evidence that production matches.

## Applied Learning
- **2026-04-29 — EAS dashboard env drift caused TestFlight rebuild.** Local `.env` had `getmori.app`, EAS prod env still had retired `project-x-one-roan.vercel.app`. All API calls (taste-profile, macros, Instacart) returned `DEPLOYMENT_NOT_FOUND`. Fix path = update EAS env + pin in `eas.json` `env` blocks + add runtime fallback in `lib/apiBaseUrl.ts`.
- **2026-04-29 — `EXPO_PUBLIC_SENTRY_DSN` was missing from EAS env entirely.** Client Sentry init in `app/_layout.tsx` guards on the DSN, so Sentry has been silently disabled in every TestFlight build. Fix = add to EAS prod + preview envs and pin in `eas.json`. The `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` vars in EAS are build-time sourcemap-upload vars, not runtime DSN.
- **2026-04-28 — Sentry events silently dropped on Vercel.** Functions returned before `Sentry.flush()`; Vercel kills the event loop on response. Fix = `await Sentry.flush(2000)` in a `finally`. Commit `a2645f2`.
- **2026-05-04 — App Store screenshot uploads must be 24-bit RGB, no alpha.** Apple's Media Manager rejects PNGs with alpha channels even if they look identical. Default `System.Drawing.Bitmap` ctor on Windows creates 32bpp ARGB. Fix in `scripts/resize-screenshots.ps1` = pass `[PixelFormat]::Format24bppRgb` to the Bitmap ctor + `Graphics.Clear(White)` before drawing. Also: iloveimg.com preserves aspect ratio and outputs off-by-a-few-pixels dimensions → Apple rejects "wrong dimensions." Always force exact target pixels.

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
- Plan tab: calendar-style week view (week strip + selected-day detail), per-day macro line, weekly macro totals card, "Copy last week" / "Clear week" actions, "Hot meals" suggestions row when day has empty slots; Supabase-backed
- Grocery List: grouped categories, checkboxes, copy-to-clipboard
- Profile: AvatarButton → ProfileSheet, taste profile (monthly cron + update modal), pantry, preferences, editable display name, appearance toggle
- 2,600+ curated recipes (live count: 2,619 as of 2026-05-04 — verify with `node scripts/count-recipes.mjs`); all have steps, macros, dietary_tags, meal_prep_friendly, gpt-image-1 images
- Vercel functions: /api/macros, /api/taste-profile, /api/generate-recipe, /api/storage-tip, /api/send-welcome-email, /api/sentry-test (10 user-facing + 2 cron; Hobby plan limit is 12 — Kroger functions removed 2026-04-28; `_`-prefixed files don't count)
- app.json: name Mori, bundle ID app.getmori.mori
- Landing page: getmori.app (Vercel), hello@getmori.app email routing. Screenshots + taste profile section updated. **Served from `public/index.html` — `landing/index.html` is a stale copy, do not edit it.**
- App icon: italic m + spatula, linen #F8F3EC, 1024×1024
- TestFlight internal live; external submitted for Beta App Review
- Add Recipe wizard (4-step): basics, ingredients w/ autocomplete, steps w/ timer hints, review + submit → community recipes. Public recipes appear in all Discover decks.
- Unit system toggle (imperial/metric); ingredient substitutions (`lib/substitutions.ts`, ~125 entries)
- Deck Servings Sheet on Discover: scaled macros + ingredients reactively (`scaleMacros()` from `lib/macroUtils.ts`)
- Plan-tab recipe picker: search + Filter sheet (Type / Cuisine / Total time / Skill); hybrid data source (Saved + lazy-loaded Browse-all from `fetchDiscoverRecipes`); tap row → `RecipeDetailModal` preview with "Add to {Day} · {Meal}" CTA (`slotContext` prop); "+" on row → quick-add to current slot. Shared `CUISINES` constant in `constants/cuisines.ts` (with explore.tsx); pure filter logic in `lib/pickerFilters.ts` with full unit-test coverage
- Tutorial overlays: first-launch coach marks (`TutorialOverlay.tsx`) + meal prep tip
- Privacy policy in-app (`app/privacy-policy.tsx`)
- API security hardening: JWT auth, Zod validation, rate limiting on all endpoints
- Forgot password + confirm password flow
- Mori logo: 3 PNG variants, correct per light/dark mode; heart/X buttons theme-synced
- Recipe flags moved to Supabase (`recipe_flags` table, RLS) — previously AsyncStorage-only, now cross-device and queryable
- Long-press delete mode on Recipes tab (Saved + Mine): multi-select with checkmark-circle icons, Delete(N)/Done header buttons
- Recipe reviews — `recipe_reviews` table (RLS, INSERT requires `cooked` interaction); `RecipeDetailModal` Reviews tab with `ReviewComposer` + `ReviewItem`; per-recipe rating aggregation
- Badges + streaks: `lib/badges.ts`, `components/badges/*`, push-notified milestones; `current_streak` + `last_cooked_date` in profiles
- Edit profile screen (`app/edit-profile.tsx`): display name + username (3–30 chars, 30-day rate-limit lock) + avatar upload
- Dietary classifier (`lib/dietaryClassifier.ts`): client-side rules for community-recipe dietary tags; tested in `__tests__/lib/dietaryClassifier.test.ts`
- Scorer optimized: unsave signal (−3 + neutralizes right-swipe boost), view-no-save penalty (−2 after 3 views), pantry word-containment matching, dietary goal cap +20, swipe history limit 500
- Fusion cuisine: split display in detail modal (individual pills + "Fusion" pill), grid card joins with ", "; scorer splits `cuisine` on comma for preference matching
- Session cuisine affinity: `sessionCuisineSwipes` map in `lib/api.ts` accumulates per-cuisine right/left swipes within a session; applied as bonus/penalty in `scoreRecipe`
- **Pescatarian** dietary goal added — onboarding, profile, EditPreferencesModal, payoff screen; conflict guard vs vegan; hard filter in `fetchDiscoverRecipes`

### ❌ Phase 4 — Grocery APIs
- ⛔ **Kroger removed (2026-04-28)** — `api/kroger-auth.ts`, `api/kroger-cart.ts`, `supabase/add-kroger-tokens.sql`, and the `KrogerSheet` UI in `grocery-list.tsx` deleted. Freed two Vercel function slots for `send-welcome-email`. The `kroger_tokens` table itself was not dropped from Supabase — drop manually if you want the rows gone (`DROP TABLE kroger_tokens;`). All grocery flow now goes through Instacart.
- ✅ **Instacart integration** — `api/instacart-cart.ts` live. Link-generation model: POST items → get URL → open in WebBrowser. No OAuth needed. Sandbox key active (`INSTACART_API_KEY`). **Prod key pending** — apply at developer.instacart.com. When approved: add `INSTACART_ENVIRONMENT=production` to Vercel env vars.
  - ✅ **Staples filter + pantry hints on send** — `partitionForInstacart()` in `lib/staples.ts` auto-strips staples (USDA-shelf-stable; distilled vinegars excl. balsamic, dry spices, sweeteners, etc.). Pantry items are a *hint* (2026-05-04 after user reported eggs being silently stripped from a Korean egg soufflé cart): sent by default, with an inline `IN PANTRY` / `SKIPPED — TAP TO SEND` pill on each row so the user can opt out per-item. Notice line shows only "Skipping N staples you likely have". Empty-after-filter alert names the dropped items + offers "Send anyway" override.
  - ✅ **Ingredient quantity normalization** — `scripts/normalize-ingredient-units.mjs` ran on all 1,294 metric-unit recipes. Haiku rewrote metric → US grocery amounts AND converted count-based proteins to weight (e.g. "4 salmon fillets" → "1.5 lb", "8 chicken thighs" → "2 lb", "300g spinach" → "10 oz"). `whole`/`wholes` added to UNIT_MAP in `lib/instacartUtils.ts`. Instacart now auto-calculates correct package counts from weight measurements.
  - ✅ **Structured qty/unit spike** — `lib/instacartUtils.ts` (`parseGroceryMeasurement`, `convertMeasurementToUs`, `formatGroceryQuantity`). Grocery list passes structured `measurement` field to Instacart + converts metric → US when `unitSystem === 'us'`.
  - ⏳ **Product preferences (organic / brand)** — no UX yet. Defer until post-launch signal justifies.
  - ✅ **Affiliate / Impact params** — UTM params appended to every `products_link_url`; Impact partner ID 7220009 live in Vercel (`INSTACART_PARTNER_ID`).
- ✅ Grocery list persists across restarts — `groceryStore` now uses Zustand `persist` + `createJSONStorage(() => AsyncStorage)`, partializing `list` + `selectedRecipes`
- ✅ Meal Prep sub-tab shows all saved recipes when `mode === 'meal_prep'` — previously filtered by `meal_prep_friendly` which is `null` for most DB recipes
- ✅ **New Recipe Backfill (483 recipes)** — two-phase workflow complete:
  - **Phase 1:** `node scripts/generate-new-recipes.mjs [--csv path] [--cuisine X] [--dry-run]` reads CSV, calls `/api/generate-recipe`, writes JSONL draft. Resume-safe.
  - **Phase 2:** `node scripts/upload-new-recipes.mjs` — batch-inserts draft → Supabase (50 rows/batch). Fixed pagination bug: uses `.range()` to fetch all existing titles, not just first 1000.
  - **CSV format:** `title,cuisine,meal_prep_friendly,difficulty,approx_time_mins`. Fusion cuisines quoted (e.g., `"cajun,italian"`). Cuisine stored as-is (comma-separated for fusions).
  - **DB cleanup:** 385 duplicates removed (caused by original pagination bug); 43 macros backfilled; 349 dietary tags backfilled; 319 dirty MealDB tags cleaned.

  - ✅ **Leftover tracking** — post-cook "What's left?" modal; `user_leftovers` + `ingredient_storage` tables (apply `supabase/add-leftovers-tables.sql`); `LeftoversReminderCard` on Discover; scorer +2/ingredient match cap +10; auto-expiry + Yes/Used/Tossed check-in flow; storage-tip endpoint fixed (array schema + auth header). `ingredient_storage` backfilled: 1,769 ingredients with shelf-life data (ran `scripts/backfill-ingredient-storage.mjs`). PostCookLeftoversModal has step 2: per-ingredient storage tips (fridge/freezer/counter + tips_text). CookingMode: single "Mark as Cooked ✓" CTA on last step, auto-closes, triggers leftovers flow immediately.
  - ⏳ **Leftover amounts** — `user_leftovers` only stores ingredient name + spoil date. Should also capture quantity (e.g. "1 cup", "half a block") for portion-aware scoring and reminder copy. Needs schema change (`quantity TEXT`) + UI input in PostCookLeftoversModal step 1.
- **Recipe title polish pass** — `scripts/polish-recipe-titles.mjs` built (Haiku rewrites generic titles to be ingredient-forward). **Not yet run in production.**
- Check ALL tags for all recipes and categories. Make sure that we are scoring properly for all of these categories and tags.
- Payment wall take cut of grocery?
- long touch and the click one and then unclick i.e. nothing is selected in long touch in recipes. exit the multi-select mode. 
- User ability to add photos for ALL recipes. User created or current Mori recipes.
- usda standard all food saving processes. give user information on cooked version or raw version.
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
  grocery/InstacartButton.tsx  ✅ themed pill button w/ carrot icon + loading state
  ui/MacroRow.tsx         ✅
  ui/MoriLogo.tsx         ✅

lib/
  supabase.ts, api.ts (scorer + reviews + flags here), mealdb.ts, utils.ts,
  substitutions.ts, badges.ts, dietaryClassifier.ts,
  instacartUtils.ts (parseGroceryMeasurement, convertMeasurementToUs, formatGroceryQuantity),
  imageUpload.ts (size + MIME validation; 5 MB recipes / 2 MB avatars),
  deepLink.ts (strict scheme/host check for reset-password — anti-phishing),
  macrosOwnership.ts (canWriteMacros — IDOR gate for /api/macros),
  macroUtils.ts (scaleMacros, aggregateWeeklyMacros — used by Plan tab + Discover deck servings),
  pickerFilters.ts (filterPickerRecipes — pure filter logic for the Plan-tab picker)

constants/
  theme.ts, cuisines.ts (12 cuisines + flag emojis — shared by explore + Plan picker)

stores/
  userStore, savedStore (persists savedRecipes + _removedPositions),
  groceryStore, collectionsStore, mealPlanStore, discoverStore, leftoversStore

api/ (Vercel functions — exactly 12, Hobby plan limit)
  macros.ts, taste-profile.ts, generate-recipe.ts, storage-tip.ts,
  instacart-cart.ts, waitlist.ts, admin-recipes.ts, substitutions.ts,
  kroger-auth.ts, kroger-cart.ts (deprioritized)
  cron/streak-reminders.ts, cron/taste-notifications.ts (CRON_SECRET only),
  cron/_auth.ts (shared verifyCronAuth helper, timing-safe)

scripts/ (all one-time or safe-to-resume, already ran)
  seed-recipes, backfill-*, rewrite-steps, generate-recipes,
  generate-images, clean-recipes, clean-ingredient-units,
  new-recipes.csv (source list for bulk backfill),
  generate-new-recipes.mjs (Phase 1: generate → JSONL; supports --csv, --cuisine, --dry-run),
  upload-new-recipes.mjs (Phase 2: JSONL → Supabase; pagination-safe),
  recheck-meal-prep.mjs (re-evaluate meal_prep_friendly via Haiku; --all/--false/--dry-run),
  backfill-dietary-tags.mjs (clean dirty MealDB tags + Haiku classify empty tags),
  polish-recipe-titles.mjs (Haiku rewrites generic titles; --limit N, --dry-run, --recent N),
  normalize-ingredient-units.mjs (metric/awkward → standard US amounts via Haiku; --metric-only, --limit N, --dry-run),
  validate-recipe-ratios.mjs (Haiku scores ingredient plausibility 0-100; rewrites anything below 85; --id, --offset, --limit, --dry-run),
  audit-recipes-full.mjs (full pass: ingredients + steps; same 85 threshold; --id, --offset, --limit, --verbose, --dry-run)

__tests__/                 ✅ Jest 29 + jest-expo@54 — 36 suites, 471 tests
  api/_apiAuth.test.ts     AuthError, extractBearerToken, handleAuthError
  api/_rateLimit.test.ts   rateLimitUser, rateLimitIP, getClientIP
  api/cronAuth.test.ts     CRON_SECRET only; SEED_SECRET rejected; timing-safe
  api/generate-recipe.test.ts  auth gate (no JWT + no seed secret → 401)
  api/instacart-cart.test.ts   auth gate, rate limit, sandbox/prod base URL, affiliate params
  api/waitlist.test.ts     CORS rejection, input validation
  app/editProfile.test.ts  display name + username flows
  lib/utils.test.ts        formatTime, formatCost, capitalize, getWeekStart, getTimeOfDay
  lib/substitutions.test.ts
  lib/staples.test.ts      isStaple — exact matches, false-positive guards, vinegars
  lib/dietaryFilter.test.ts    vegetarian/vegan/pescatarian hard filter on fetchDiscoverRecipes
  lib/dislikeFilter.test.ts    ingredient-dislike retroactivity in fetchScoredDeck
  lib/dietaryClassifier.test.ts  client-side dietary tag inference
  lib/scoreRecipe.test.ts  leftover bonus (+2/match, cap +10, substring, no double-count)
  lib/urgentLeftover.test.ts   date window, dismiss filter, NaN guard
  lib/instacartUtils.test.ts   parse/format/convert measurement
  lib/partitionForInstacart.test.ts  staples auto-skip; pantry items go into sendable + named in pantryHints
  lib/badges.test.ts       milestone unlock + streak math
  lib/communityVisibility.test.ts  is_public + moderation_status filtering
  lib/enrichCommunityRecipe.test.ts  Haiku post-processing
  lib/insertCommunityRecipe.test.ts  RLS-respecting insert path
  lib/reviews.test.ts      submit/update/delete + cooked-required gate
  lib/deepLink.test.ts     strict scheme/host; phishing payload rejection
  lib/imageUpload.test.ts  size cap, MIME allowlist, empty blob, video/HTML rejection
  lib/macrosOwnership.test.ts  curated backfill / own submission / IDOR rejection
  lib/macroUtils.test.ts   scaleMacros + aggregateWeeklyMacros (per-day/per-week, rounding, null-skipping)
  lib/pickerFilters.test.ts  search / cuisine / chips / time / skill / combined filters
  api/macros.test.ts        sparse-recipe gate, implausible-macro post-validator, low-confidence reject
  stores/collectionsStore.test.ts
  stores/mealPlanStore.test.ts
  stores/groceryStore.test.ts
  stores/savedStore.test.ts
  stores/savedStorePersist.test.ts  partialize writes + AsyncStorage rehydrate
  stores/discoverStore.test.ts
  stores/leftoversStore.test.ts  load, add (optimistic + rollback), dismiss, extend
  stores/signOut.test.ts   data isolation — leftoversStore.reset + groceryStore.clearAll
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
EXPO_PUBLIC_API_URL=https://getmori.app

# Vercel only — never in client
ANTHROPIC_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=           # gpt-image-1 for generate-images.mjs
UNSPLASH_ACCESS_KEY=      # registered
SEED_SECRET=              # Admin-only seed-recipes endpoint (generate: openssl rand -hex 32)
INSTACART_PARTNER_ID=7220009  # Impact affiliate ID — already live in Vercel
INSTACART_API_KEY=        # Phase 4
RESEND_API_KEY=           # Welcome email at signup (api/send-welcome-email)
```

**Resend setup:** the `from` address (`Mori <hello@getmori.app>`) requires `getmori.app` to be a verified sending domain in the Resend dashboard. Until that DNS is verified, the welcome email will 4xx — but the signup flow continues regardless (fire-and-forget).

---

## 8. Out of Scope
DoorDash, Uber Eats, Amazon Fresh, push notifications, Android, web app, barcode scanning, fridge vision, baking tab, weather-aware recs, budget tracking, Pexels/Unsplash for generated images (replaced by gpt-image-1).

---

## 9. Audit Findings
Open items only. Resolved fixes are logged in `.claude/bugfixes.md`.

### 🔴 Open Security
- [ ] No CSRF protection on public endpoints (`/api/waitlist`).
- [ ] `kroger_tokens` Supabase table still exists (Kroger code removed 2026-04-28) — drop manually with `DROP TABLE kroger_tokens;` to clear the plaintext-token rows.
- [ ] **Review-cooked-required gate is RLS-only** — any signed-in user can self-INSERT a `recipe_interactions` row of type `'cooked'` via the anon key (schema.sql allows this), then submit a review. RLS gate on `recipe_reviews` trusts that row. **Cook-funnel trigger was planned (2026-04-28) but deferred** — production data shows only ~3% of cook interactions have a prior `'view'` row (legacy data + view logging gap), so the trigger would block legitimate cooks. Revisit in Phase 5 with a moderation queue or CAPTCHA-on-account-create approach.
- [ ] **No moderation queue UI** — community recipe submissions now default to `moderation_status: 'pending'` (2026-04-28) and stay invisible until manually flipped via Supabase Studio. Build a simple admin screen + endpoint for approve/reject before submission volume grows.

### 🟡 Open Edge Cases
- [ ] **Rapid swiping** — concurrent `logSwipeBackground()` calls can log swipes out of order; recommendation signal degrades.
- [ ] **Budget field unused** — collected in onboarding, stored in profile, never used for filtering.
- [ ] **Adventure card pause not persisted** — session-only; resets on app relaunch.

### Closed audit batches (see bugfixes.md)
- 2026-04-28 — second audit batch: PAT removed from `.git/config` (was committed in remote URL); `.gitignore` tightened (`.env.*`, `ios/`, `android/`, `GoogleService-Info.plist`, `google-services.json`); stray prod log in `app/reset-password.tsx` wrapped in `__DEV__`; Instacart partner-ID UTM URL-encoded; rate-limit on `/api/admin-recipes` (defense-in-depth before secret check); community recipes default to `moderation_status: 'pending'` (was `'approved'` — auto-approval vector); **production RLS regression fixed**: `recipes` INSERT/UPDATE policies were still allowing `submitted_by IS NULL` (the `fix-recipes-rls.sql` one-shot migration was never applied) — `add-security-hardening-202604.sql` migration applied + folded into `schema.sql`; `recipe_flags` unique index `(flagged_by, recipe_id)` prevents flag-spam.
- 2026-04-27 — high-severity batch: waitlist/recipe_reviews/recipe_flags RLS migrations, profiles_public view (anti-PII-leak), `/api/macros` IDOR gate (`canWriteMacros`), CRON_SECRET-only auth (no SEED_SECRET fallback, timing-safe), Sentry PII + Replay disabled with `beforeSend` redaction, deep-link substring → strict scheme/host (`isResetPasswordUrl`), `savedStore` partialize persists savedRecipes + _removedPositions, `validateImageForUpload` size + MIME (5 MB / 2 MB).
- 2026-04-23 — offline banner, dislike retroactivity, Sentry init, deck exhaustion, InstacartButton dark icon, multi-unit combined qty, Instacart quantity normalization, leftover expiration on shelf-stable items, leftovers feature.
- April 2026 — initial security hardening: JWT auth on all endpoints, Zod validation, rate limiting (fail-closed), timing-safe seed secret, waitlist CORS, security headers in `vercel.json`.

---
*v9.6 — Phases 1–3 complete + reviews + badges + edit profile + Plan-tab calendar overhaul (week strip, picker filter sheet, hot-meal suggestions, weekly + per-day macros, copy/clear week). Phase 4 grocery: Instacart only (Kroger deprioritized 2026-04-27). Second audit batch shipped 2026-04-28 (PAT removed, gitignore tightened, recipes RLS regression fixed, community recipes default `pending`, recipe_flags unique index, partner-ID encoding, admin-recipes rate limit). RLS fix shipped 2026-04-28: client-side `upsertRecipeByExternalId` removed from save/swipe paths — saves now persist via `supabase_id` only. Cook-funnel trigger deferred — see §9. Jest: 36 suites, 471 tests.*
