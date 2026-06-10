# Mori — CLAUDE.md

## Current Priority — Mori+ build-out (6.0.1 submitted to App Review 2026-06-10)

**"Mori 2.0" (technical app version `6.0.0`) is LIVE in the US + CA App Store** (confirmed 2026-06-10; free tier only; v1 had been live since 2026-05-05). **`6.0.1` (bug-fix release, cut from `872d5e8`) was submitted to App Review 2026-06-10** — it carries the 2026-06-09 bug-scan batch + cook-photos work. **The next submission after that is `6.1.0`: the Mori+ paid binary** (new native module `react-native-purchases` ⇒ new binary + runtimeVersion, can't OTA). Versioning history: the "2.0" is marketing/listing copy only, NOT the version number — the store train went 5.0.2 → 6.0.0 because CFBundleShortVersionString must always exceed the last released version. Build number auto-increments on EAS (`appVersionSource: remote` + `autoIncrement`). Mori+ work happens on the `mori-plus` branch (kill-switched via `EXPO_PUBLIC_MORI_PLUS_ENABLED`, default OFF); `main` carries only the no-op stub ([lib/revenueCat.ts](lib/revenueCat.ts)).

Bug-fixes and v2.0.0 feature work both land on `main` and ship via normal `eas build` + `eas submit` cadence. Each submission triggers a fresh App Store Review — keep the `apple-review@getmori.app` demo account intact.

### v2.0.0 scope — shipped on `main`
- **Shareable recipes** — system share sheet from `RecipeDetailModal` → links to `getmori.app/r/{id}` (Vercel function [api/recipe-page.ts](api/recipe-page.ts) renders public HTML with OG meta + "Open in Mori" CTA). `mori://r/{id}` deep link + Universal Links (AASA file at `public/.well-known/apple-app-site-association`, team `66667M8C34`) → opens [app/recipe/[id].tsx](app/recipe/%5Bid%5D.tsx) → reuses `RecipeDetailModal`. Deep-link validator pins HTTPS hostname to `getmori.app` (phishing guard).
- **Save / cook counters** — `recipes.save_count` + new `recipes.cook_count` columns auto-maintained by Postgres triggers (`supabase/add-recipe-counters.sql`). Same-day repeat cooks now bump the counter (fix).
- **Creator outcome badges + push** — 8 new badges (`saves_earned_1/10/50/100`, `cooks_earned_1/10/50/100`) in [components/badges/badgeData.ts](components/badges/badgeData.ts). Daily [api/cron/creator-milestones.ts](api/cron/creator-milestones.ts) (18:00 UTC) pushes a tier-crossing notification; `profiles.last_saves_earned_milestone_notified` + `last_cooks_earned_milestone_notified` make re-runs idempotent (`supabase/add-creator-milestone-tracking.sql`). NB: this is about recipe submitters celebrating their own activity — separate from the v2.0.0 TikTok-creator referral program below.
- **Drop community audit gate** — community submissions now default to `moderation_status='approved'` and are immediately visible. `moderation_status` column is retained for future moderation, but the `audit-pending-community` cron has been deleted. Replaced by [api/cron/community-enrichment.ts](api/cron/community-enrichment.ts) (03:00 UTC) — backfills macros on community recipes that landed with `macros = NULL`, limited to the last 14 days, sparse-recipe gate respected.
- **Post-cook review prompt** — `PostCookReviewModal` after leftovers modal. Review stars surfaced on swipe deck, recipes-tab, explore HorizontalCard/GridCard (gated `rating_count >= 3`).
- **Recipe quality overhaul** — USDA-based macros pipeline (`scripts/compute-macros-from-usda.mjs` + `scripts/apply-computed-macros.mjs`), portion/step audits (`scripts/audit-recipe-portions.mjs`, `scripts/audit-recipe-steps.mjs`, `scripts/propose-step-fixes.mjs`, `scripts/apply-step-fixes.mjs`), meal-prep tag re-evaluation (`scripts/audit-meal-prep-tag.mjs` + `scripts/apply-meal-prep-decisions.mjs`). Full pipeline doc: `.claude/recipe-quality-overhaul-2026-05-07.md`.
- **Instacart polish** — Quick-add toggle on "Leaving these out" sheet (parity with staples sheet). Auto-remove recipe from grocery list when cooked (idempotent). Fragment-unit parser fix (sprig/clove/slice/stalk/piece) — drops measurement so Instacart doesn't order N bunches.
- **Plan Tab v2** — per-slot cooked checkmark (dim/strikethrough, `MealSlot.cooked_at` JSONB, no migration), add-time servings via `ServingsAdjuster` (stored as `servings_multiplier`, shown as "{n} servings"), batch-cook opt-in prompt (`lib/mealPlanCooked.ts` — "mark other slots with this recipe too?"), and Explore-style picker carousels (shared `components/RecipeCards.tsx`, derived client-side). Cooked state is visual-only — macros unchanged. Decisions: per-slot manual is source of truth, cooking elsewhere doesn't touch slots.
- **Reminder crons + review push** — `api/cron/cook-reminders.ts` (22:00 UTC, pushes tonight's planned recipe), `api/cron/leftover-reminders.ts` (16:00 UTC, spoil-date warnings), `api/notify-review.ts` (pushes the recipe creator when reviewed, fired from `submitReview`), `lib/appReviewPrompt.ts` (native store-review gate via expo-store-review). Requires `supabase/add-notification-prefs-202605.sql` — applied to prod 2026-05-28.
- **Image + Explore perf** — Supabase Image Transformations (`lib/recipeImage.ts`, width+height+resize=cover → ~30 KB WebP), Explore `SELECT *` → thin column list (~8× faster), 4 horizontal sections converted to `FlatList` lazy-render. Details in Applied Learning.

### 6.0.1 scope — submitted to App Review 2026-06-10 (not in the released 6.0.0 binary)
- **Cook photos + review-flow polish + "Cook it" CTA** — merged to `main` (`1f61d62`, `ddb9949`). User cook photos on reviews (`ReviewComposer` → `cook-photos` bucket → `recipe_reviews.photo_url`; `CookPhotoStrip` on detail); post-cook prompt collapsed to one composer w/ `KeyboardAvoidingView` + photo above notes; `RecipeDetailModal` Save→heart on hero + footer "Cook it"→`CookingMode`; fixed the post-cook share sheet (present after dismiss via `onDismiss`); review flags (`review_flags`). **Migrations `add-cook-photos-202605.sql` + `add-review-flags-202605.sql` applied to prod.** Full detail in `.claude/bugfixes.md` (2026-05-29).
- **2026-06-09 deep bug-scan batch** (`3b6a709`) + cook-reminder current-week fix (`2fcab71`) — client-side fixes (scorer `interacted_at`, image sniffing, deep-link auth gate, share race, macro guards) reach users only via this build; server/DB layers already live (deep-verified 2026-06-10, see `.claude/bugfixes.md`).
- **Prod-hardening repatriation** (`9ff2845`) — `eas.json` now pins `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SENTRY_DSN` for production + preview profiles.

### Deferred to v2.1
- **Creator referral codes / links (TikTok partner program)** — track new-user signups attributed to TikTok creators so we can revenue-share when those users buy Mori+. **Deferred 2026-05-26 to v2.1** to keep v2.0.0 scope tight. Tradeoff: any TikTok-driven signups during the v2.0.0 window are NOT attributed — that data is permanently lost for early adopters. Acceptable because payout doesn't exist yet (Mori+ not live), so the attribution would have no immediate use.
  - When picked up in v2.1: `getmori.app/?ref=<CODE>` URL param. Universal Link → app deferred-attribution (stash in AsyncStorage if pre-signup) → on signup, write `profiles.referred_by_code`. Opaque codes (e.g. `JANE10`); lookup table in a new `creators` table.
  - Creators are external TikTok personalities, not Mori submitters. Codes issued by us (admin-managed). Not automatic for recipe submitters — that's the separate creator-outcome badge ladder above.
  - Required for v2.1: `creators` table + RLS (read-public for code resolution, admin-only writes), `profiles.referred_by_code` column, signup-attribution code path, admin endpoint. Admin dashboard can stay as a Supabase Studio query.
  - Out of scope until Mori+: payout calculation, creator-facing dashboard, public creator profile page, percentage tiers, fraud detection.
  - Marketing framing locked in [design.md](design.md) — never overclaim "earn money" until Mori+ subscriptions are live.

### Mori+ paid IAP — ACTIVE (build started 2026-06-10; ships as 6.1.0 after 6.0.1)
Work happens on the `mori-plus` branch (main @ `872d5e8` merged in 2026-06-10). Live build status + ranked blockers: [`Claude-mori+.md`](Claude-mori+.md) (on the branch — canonical). Strategy spec vendored on the branch: [`.claude/plans/i-want-you-to-harmonic-galaxy.md`](.claude/plans/i-want-you-to-harmonic-galaxy.md). **Kill-strategy review + execution plan (2026-06-09): `~/.claude/plans/review-the-mori-implementation-synthetic-lampson.md`** — competitive gap, per-competitor kill matrix, measurable launch gates, compressed calendar (code ~1 wk; 1-week dogfood gate; submit end of wk 2). Scaffold state (verified 2026-06-10): RC wrapper + identity wiring **complete, running dark** (SDK not installed, no RC key); the self-grant-premium RLS hole in `add-mori-plus.sql` closed 2026-06-02 and extended 2026-06-09 to `BEFORE INSERT OR UPDATE` (closes bug-scan #6) — file-only, not yet applied to prod.

**Value prop (the spine):** *"You never decide what's for dinner again — Mori learns your taste, plans your week, and ships the groceries."* It's worth $5.99 as ONE promise, not a feature pile. Market check (2026-06-09): **PlateJoy is DEAD (July 2025)** — the white space is open; eMeals $4.99 (fixed menus), Mealime ≤$5.99 (no delivery handoff), Samsung Food $6.99 (the 12–24mo threat). No active product combines swipe-learned taste × audited catalog × Instacart handoff.

**Flagship = the taste-personalized closed loop (Auto Plan + Sunday Drop)** — the only thing no competitor can copy (swipe taste × 2,600 tested catalog × Instacart). Everything else serves it or waits.

**Business/legal prerequisites — DONE (2026-05-28):**
- ✅ **Paid Applications Agreement signed.** (Near-irreversible — no clean revert to free-only. Does NOT change the live free app; just enables paid sales.)
- ✅ **Tax form (W-9)** submitted — Non-Exempt Payee, Individual/Sole proprietor.
- ✅ **Banking** added for payouts. (Verify it shows linked + verified; micro-deposit confirmation can lag 1–2 days.)
- ✅ **App Store Small Business Program** enrollment submitted. NB: not "automatic" — it's an enrollment request; the **15% rate applies the month AFTER approval, not retroactively**. Confirm it flips to "Enrolled."
- Entity: shipping as **individual / sole proprietor**. LLC deferred (tax-neutral by default; the lever is an S-corp election, only worth it above ~$60k net profit). Apps with live subscriptions CAN still be transferred to an LLC org account later (shared-secret handoff, RevenueCat-assisted), so the LLC is not a hard pre-launch deadline.

**Still ahead before submission (full sequencing in the 2026-06-09 plan):**
- **Day-1 admin (user, manual):** ASC SKUs `mori_plus_monthly` $5.99 / `mori_plus_annual` $49.99 (30-day free trial on both; 16-day grace; **lifetime SKU CUT 2026-06-10** — ongoing AI cost vs one-time payment); RC dashboard (project, `mori_plus` entitlement, iOS key → pin in `eas.json`, webhook secret); EULA/Terms; confirm SBP "Enrolled" + banking verified; App Privacy form (Purchase History + User ID via RevenueCat).
- **Track A — commerce:** install `react-native-purchases` (identity wiring already complete in `_layout.tsx`, runs dark); apply `add-mori-plus.sql` to prod (file already includes the #6 INSERT-hardening); `api/rc-webhook.ts` sole `is_premium` writer + `requirePremium()` + AI budget gate; paywall via RevenueCat Paywalls v2 (no toggle paywalls — banned Jan 2026); minimal churn kit (cancel survey, exit offer, grace push).
- **Track B — engine (the bet):** `recipes.meal_types` backfill (8/2,618 tagged — THE hard blocker, ~$2 Haiku); `profiles.timezone` capture; wire `flavourDna` into `scoreRecipe`; week-level optimizer (`lib/autoPlan.ts`, budget-aware, slot provenance); Sunday Drop cron + UI + explanations.
- **Launch gate (decided 2026-06-10, supersedes 2-week):** 1-week dogfood — cooked-rate on auto-planned slots **≥40%** or no submission; fallback = thin honest paywall (pantry-gen/Decks/budget), never Auto Plan as headline.
- **No ads** — decided 2026-05-28. Free tier monetizes via Instacart affiliate only; all paid value goes into Mori+.

**Converged scope (2026-05-28):**
- **Flagship:** Auto Plan + Sunday Drop (taste-personalized weekly planning that auto-shops).
- **Planner modes (same engine, not separate products):** food-waste ("use what's spoiling"), multi-diet household ("one cart, everyone fed"), budget ("a week for $X").
- **Supporting inputs:** "what do you feel like tonight?" (one-shot, catalog-ranked), Fridge Cam (utility, demoted — commoditized), swipe (free).
- **Macro Coach:** auto-logs from cooked Mori meals (NO photo), coaches your cooking not your whole diet.
- **CUT:** Snap-your-plate (redundant — Mori knows cooked macros), AI image generation (catalog has images; placeholder for rare net-new), condition-specific/GERD vertical (medical liability — serve via existing filters only), richer dietary handling (current filters stay as-is), ads.
- **Prereqs before charging (the whole bet = plan quality):** week-level optimizer (scorer only ranks single cards today), meal-type tags (8/2,618 — hard blocker), feed `flavourDna` into ranking (computed, never read by scorer), capture `profiles.timezone`. ~~`cost_per_serving` backfill~~ — already 100% (2,617/2,618); real gap is nothing consumes it yet.
- **Pricing (LOCKED 2026-06-10):** **$5.99/mo, $49.99/yr lead ("Save 30%"), 30-day free trial on both. Lifetime CUT** — AI-cost-forever vs one-time payment; paywall = two SKU cards. Verbatim ASC disclosure strings must match exactly (3.1.2). Free tier is revenue-positive via Instacart affiliate → grow the free funnel; subscription is the power-user margin layer.

**Rules that still hold:**
- Cardinal rule: **paywall NEW features only, never existing free ones**. Swipe / save / plan / grocery / Instacart / dietary filters stay free forever. Drift = Guideline 3.1.2 rejection.
- IAP review is **separate** from binary review. Both must pass; both submitted together (first IAPs must ship with a binary).
- Creator revenue-share payout is **DECOUPLED** from Mori+ launch (decided 2026-05-28). Mori+ ships with `referred_by_code` attribution-only; payout flow deferred to v2.1+. Launching the paywall does NOT trigger a payout obligation.

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
- **2026-05-27 — Recipe thumbnails looked "zoomed in" after the image transform fix.** Supabase Image Transformations does NOT scale height proportionally when you pass `width` alone — it returns `width × original_height`. Our gpt-image-1 source images are 1024×1024, so `?width=400` returned a 400×1024 skinny strip. `contentFit="cover"` then cropped a tiny middle band of that strip into the thumbnail frame, looking dramatically zoomed in. Detail view (1200×800 frame) wasn't affected because the wide target frame doesn't crop the strip as aggressively. Fix in `lib/recipeImage.ts` = pass `width` + `height` + `resize=cover` together so imgproxy does a true aspect-preserving crop. Presets are now: thumb 160×160 (square), card 400×300 (4:3), hero 800×600 (4:3), detail 1200×800 (3:2). Verified by parsing WebP VP8X headers from the rendered output: now returns the requested dimensions instead of a stretched canvas.
- **2026-05-27 — Phantom 'cooked' interactions polluted Explore "Cooked Again" section.** User account `7a3b9113…` had 108 rows in `recipe_interactions` (type='cooked'), all stamped at the exact same instant `2026-04-27T20:00:17.760259+00:00` — a one-off bulk insert from early dev (no script found in repo; likely manual Supabase Studio batch). The profile counters (`meals_cooked_count`, streaks) were also manually written and did NOT auto-recompute from the interaction rows. Fix = `scripts/clean-phantom-cooks.mjs` (delete by exact timestamp + reset profile fields). Takeaway: **do NOT bulk-insert into `recipe_interactions` via Studio for testing or demo seeding.** The triggers (`save_count`/`cook_count`) fire fine, but profile fields (`meals_cooked_count`, `last_cooked_date`, `current_streak`, `longest_streak`, `last_cooks_earned_milestone_notified`) are not auto-synced from raw inserts, so manual seeds drift from the app's view. If reviewer seeding is needed, cook recipes through the actual app flow (Mark Cooked button) or write a script that updates profile fields in the same transaction.
- **2026-05-27 — Explore tab images still loaded slow even after image transforms + SELECT * slim-down.** Each of the 5 horizontal sections rendered as `<ScrollView horizontal>`, which materializes ALL children on mount. With ~10 cards per section, that's ~50 simultaneous image requests at first paint; iOS HTTP/2's ~6-concurrent-stream cap per host queued the rest behind several round trips. Fix = converted the 4 image-bearing sections to `<FlatList horizontal>` with `initialNumToRender={3}`, `windowSize={2}`, `removeClippedSubviews` in `app/(tabs)/explore.tsx`. Worst-case simultaneous requests drop to ~15. The cuisine row (no images) and Under-30-min grid (different layout, 6 items) stay as-is.
- **2026-05-13 — Recipe images were ~1.6 MB each AND served `Cache-Control: no-cache`.** gpt-image-1 originals were uploaded full-size via `scripts/generate-images.mjs` with no `cacheControl` option, so Supabase Storage defaulted to `no-cache`. Every card pulled 1.5–1.7 MB and re-validated on every render. Fix = [lib/recipeImage.ts](lib/recipeImage.ts) rewrites public URLs to `/storage/v1/render/image/public/` with `width` + `quality` params; Supabase's transform endpoint returns WebP at `max-age=3600`. Sample: 1.59 MB PNG → 29 KB WebP at `width=400&quality=70` (54× smaller). All `<Image>` call sites for `recipe.image_url` route through `getRecipeImageUrl(url, size)` with size presets (thumb/card/hero/detail). Upload sites (`AddRecipeWizard`, `edit-profile`, `scripts/generate-images.mjs`, `scripts/regenerate-specific-images.mjs`) now pass `cacheControl: '31536000'` so future originals are immutable-cacheable. Discover deck additionally prefetches the next 2 hero images via `Image.prefetch()` to warm the disk cache before the user swipes.

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
- Plan tab: calendar-style week view (week strip + selected-day detail), per-day macro line, weekly macro totals card, "Copy last week" / "Clear week" actions, "Hot meals" suggestions row when day has empty slots; Supabase-backed. **Plan Tab v2 (2.0.0):** per-slot cooked checkmark (visual-only), add-time servings stepper, batch-cook prompt, Explore-style picker carousels.
- Grocery List: grouped categories, checkboxes, copy-to-clipboard
- Profile: AvatarButton → ProfileSheet, taste profile (monthly cron + update modal), pantry, preferences, editable display name, appearance toggle
- 2,600+ curated recipes (live count: 2,619 as of 2026-05-04 — verify with `node scripts/count-recipes.mjs`); all have steps, macros, dietary_tags, meal_prep_friendly, gpt-image-1 images
- Vercel functions: /api/macros, /api/taste-profile, /api/generate-recipe, /api/storage-tip, /api/send-welcome-email, /api/sentry-test, /api/instacart-cart, /api/waitlist, /api/admin-recipes, /api/substitutions, /api/recipe-page, /api/notify-review (user-facing) + 6 cron (taste-notifications, streak-reminders, creator-milestones, community-enrichment, cook-reminders, leftover-reminders). Kroger functions removed 2026-04-28. `audit-pending-community` cron deleted 2026-05-12 (audit gate dropped). `_`-prefixed files are helpers, don't count as endpoints.
- app.json: name Mori, bundle ID app.getmori.mori
- Landing page: getmori.app (Vercel), hello@getmori.app email routing. Screenshots + taste profile section updated. **Served from `public/index.html` — `landing/index.html` is a stale copy, do not edit it.**
- App icon: italic m + spatula, linen #F8F3EC, 1024×1024
- TestFlight internal live; external submitted for Beta App Review
- Add Recipe wizard (4-step): basics, ingredients w/ autocomplete, steps w/ timer hints, review + submit → community recipes. Public recipes appear in all Discover decks the moment `is_public` flips true. **Submission flow:** `insertCommunityRecipe()` → `recipes` row with `moderation_status='approved'` (audit gate dropped 2026-05-12 — column retained for future moderation, not actively gating). `enrichCommunityRecipe()` (fire-and-forget) infers dietary tags + calls `/api/macros` for AI-estimated macros. Daily `community-enrichment.ts` cron retries macros backfill for the last 14 days of NULL-macros submissions. For calculator-grade macros on community recipes, run `node scripts/compute-macros-from-usda.mjs --id <id>` then `node scripts/apply-computed-macros.mjs --apply` periodically (full pipeline in `.claude/recipe-quality-overhaul-2026-05-07.md`).
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
- **Shareable recipes (v2.0.0)** — system share sheet on `RecipeDetailModal` → `getmori.app/r/{id}` (Vercel-rendered HTML with OG meta + Smart App Banner) + `mori://r/{id}` Universal Links (AASA file pinned to team `66667M8C34`). Recipient lands in `RecipeDetailModal` with full save/cook/cart flow.
- **Save / cook counters (v2.0.0)** — `recipes.save_count` + `recipes.cook_count` auto-maintained by Postgres triggers. Powers creator outcome badges + push milestones.
- **Creator outcome badges + push (v2.0.0)** — 8 new badges (`saves_earned_*` / `cooks_earned_*` at 1/10/50/100). Daily `creator-milestones` cron pushes tier-crossing notifications (idempotent via `last_*_milestone_notified` columns).
- **Post-cook review prompt (v2.0.0)** — `PostCookReviewModal` after leftovers modal. Review stars on swipe-deck + recipes-tab + explore cards (gated `rating_count >= 3`).
- **Community audit gate dropped (v2.0.0)** — submissions go live immediately at `moderation_status='approved'`. Replaced by `community-enrichment` cron that backfills NULL macros for the last 14 days.

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
  RecipeDetailModal.tsx   ✅ full-screen, step cards, My Notes; slotContext + slotExtra (Plan picker add CTA)
  CookingMode.tsx         ✅ dark full-screen cooking
  AvatarButton.tsx        ✅ initials circle → ProfileSheet
  RecipeCards.tsx         ✅ shared HorizontalCard/GridCard/SectionHeader (Explore + Plan picker carousels)
  ServingsAdjuster.tsx    ✅ shared servings stepper (Discover deck + Plan picker)
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

api/ (Vercel functions — Pro plan, plenty of headroom)
  macros.ts, taste-profile.ts, generate-recipe.ts, storage-tip.ts,
  instacart-cart.ts, waitlist.ts, admin-recipes.ts, substitutions.ts,
  send-welcome-email.ts, sentry-test.ts,
  recipe-page.ts (public HTML preview at getmori.app/r/{id} via /r/:id rewrite),
  notify-review.ts (push recipe creator when reviewed; fired from submitReview),
  cron/streak-reminders.ts, cron/taste-notifications.ts,
  cron/creator-milestones.ts (daily 18:00 UTC; pushes saves/cooks-earned tier crossings),
  cron/community-enrichment.ts (daily 03:00 UTC; macros backfill for NULL-macro community recipes ≤14 days old),
  cron/cook-reminders.ts (daily 22:00 UTC; pushes tonight's planned recipe), cron/leftover-reminders.ts (daily 16:00 UTC; spoil-date warnings),
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
  audit-recipes-full.mjs (full pass: ingredients + steps; same 85 threshold; --id, --offset, --limit, --verbose, --dry-run),
  compute-macros-from-usda.mjs + apply-computed-macros.mjs (USDA-grounded macros; --id, --apply, --limit),
  audit-recipe-portions.mjs + fix-recipe-portions.mjs (serving-size / portion sanity pass),
  audit-recipe-steps.mjs + propose-step-fixes.mjs + apply-step-fixes.mjs (step-quality audit + Haiku rewrite + apply),
  audit-meal-prep-tag.mjs + apply-meal-prep-decisions.mjs + apply-meal-prep-rules.mjs (meal_prep_friendly re-evaluation),
  gap-fill-ingredients.mjs + sanity-check-macros.mjs (USDA gap-fill cache + macro sanity)

__tests__/                 ✅ Jest 29 + jest-expo@54 — 654 tests (after Plan Tab v2 batch)
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
- [ ] **No moderation queue UI** — community recipe submissions default to `moderation_status: 'approved'` (audit gate dropped 2026-05-12) and go live immediately. Build a reactive moderation tool — flag-driven takedown or post-hoc review queue — before submission volume grows or a problematic recipe ships. Flag *storage* now exists for both recipes (`recipe_flags`) and reviews (`review_flags`, added 2026-05-29 on `feat/cook-photos`) — collect-only, still no admin takedown UI.
- [ ] **Creator-code attribution surface (v2.0.0, in progress)** — `profiles.referred_by_code` + `creators` table not yet built. No fraud detection / rate-limit on code-redemption signups; design must include a guard against self-referral and bulk-burner-account attribution before any payout flow goes live with Mori+.

### 🟡 Open Edge Cases
- [ ] **Rapid swiping** — concurrent `logSwipeBackground()` calls can log swipes out of order; recommendation signal degrades.
- [ ] **Budget field unused** — collected in onboarding, stored in profile, never used for filtering.
- [ ] **Adventure card pause not persisted** — session-only; resets on app relaunch.

### Closed audit batches (see bugfixes.md)
- 2026-06-09 — deep bug-scan batch (all 24 of `bug-scan-2026-06-09.md`): scorer `created_at`→`interacted_at` drift; review-rating trigger `SECURITY DEFINER` + backfill; `'unsave'` CHECK; cook-reminders dedupe; `await saveMacrosToDB`; #6 premium-trigger INSERT hardening (mori-plus only); counter DELETE trigger + FK `ON DELETE CASCADE`; rate-limiter fail-closed; cron double-push guard; seed-path IP cap; image magic-number sniffing; deep-link auth-gating; + lows. 2 prod migrations applied; schema/add-recipe-reviews drift captured. Shipped to `main` as `3b6a709` (all except #6); #12 UTC-skew deferred to `profiles.timezone`. Jest 800/800.
- 2026-04-28 — second audit batch: PAT removed from `.git/config` (was committed in remote URL); `.gitignore` tightened (`.env.*`, `ios/`, `android/`, `GoogleService-Info.plist`, `google-services.json`); stray prod log in `app/reset-password.tsx` wrapped in `__DEV__`; Instacart partner-ID UTM URL-encoded; rate-limit on `/api/admin-recipes` (defense-in-depth before secret check); community recipes default to `moderation_status: 'pending'` (was `'approved'` — auto-approval vector); **production RLS regression fixed**: `recipes` INSERT/UPDATE policies were still allowing `submitted_by IS NULL` (the `fix-recipes-rls.sql` one-shot migration was never applied) — `add-security-hardening-202604.sql` migration applied + folded into `schema.sql`; `recipe_flags` unique index `(flagged_by, recipe_id)` prevents flag-spam.
- 2026-04-27 — high-severity batch: waitlist/recipe_reviews/recipe_flags RLS migrations, profiles_public view (anti-PII-leak), `/api/macros` IDOR gate (`canWriteMacros`), CRON_SECRET-only auth (no SEED_SECRET fallback, timing-safe), Sentry PII + Replay disabled with `beforeSend` redaction, deep-link substring → strict scheme/host (`isResetPasswordUrl`), `savedStore` partialize persists savedRecipes + _removedPositions, `validateImageForUpload` size + MIME (5 MB / 2 MB).
- 2026-04-23 — offline banner, dislike retroactivity, Sentry init, deck exhaustion, InstacartButton dark icon, multi-unit combined qty, Instacart quantity normalization, leftover expiration on shelf-stable items, leftovers feature.
- April 2026 — initial security hardening: JWT auth on all endpoints, Zod validation, rate limiting (fail-closed), timing-safe seed secret, waitlist CORS, security headers in `vercel.json`.

---
*v11.0 (2026-05-28) — v1 live in US+CA App Store; **"Mori 2.0" building for TestFlight as app version 6.0.0** (continues the live 5.0.2 train — App Store rejects a version ≤ 5.0.2, so "2.0" is marketing only). v2.0.0 shipped via `2d4591b` (recipe quality overhaul) + `a44c00e` (shareable recipes, drop audit gate, save/cook counters, creator badges + post-cook review) + image/Explore perf (transforms, SELECT slim-down, FlatList) + `f485d03` (cook/leftover reminder crons, review-received push, app-review prompt) + Plan Tab v2 `536720b` (cooked slots, add-time servings, batch prompt, Explore-style picker). RevenueCat stub on `main` via `11b0d70`; real wrapper stays on `mori-plus`. **Creator referral codes deferred to v2.1.** Jest: 654 tests.*
