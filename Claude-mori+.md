# Mori+ — Branch Working Doc

Living doc for the `mori-plus` feature branch. Lean by design — full spec lives at [`.claude/plans/i-want-you-to-harmonic-galaxy.md`](.claude/plans/i-want-you-to-harmonic-galaxy.md) (vendored into the branch 2026-06-01, commit `a096fd6` — no longer a machine-local `~/.claude` path). When in doubt, that file is canonical.

This file is for: progress tracking · branch-specific commandments · env vars · open decisions. Update as work lands.

---

## Status

Branch: `mori-plus` · HEAD `a096fd6` · **3 behind / 8 ahead of `main`** — the cook-photos batch landed on `main` after the 2026-05-28 rebase, so re-merge `main` before resuming (`git merge-tree` confirms 0 conflicts; disjoint file sets). Ships as a paid release AFTER free **v2.0.0 — which is now LIVE on the App Store (2026-06-01), so the "ship after v2.0.0" precondition is satisfied and Mori+ is unblocked.** `lib/revenueCat.ts` full wrapper supersedes main's stub cleanly.

> ⚠️ **Reality check (2026-06-01 full audit):** what shipped is a **client-only scaffold — roughly 13% of a chargeable product.** Solid: RC wrapper, kill switch, premium UI, schema SQL, strong tests. Missing: **no paywall, no server-side entitlement enforcement, `react-native-purchases` not installed, `initRevenueCat()` never called, and the flagship plan-quality engine is at ~0%.** Mori+ tests (6 suites) pass; full `main` suite is **54 suites / 701 tests green** after `npm install --legacy-peer-deps`. See **"Audit Findings & Open Blockers (2026-06-01)"** below before resuming build.

### ★ Converged scope (2026-05-28) — read the plan file's value-prop + CPO/GTM sections first
- **Flagship:** Auto Plan + Sunday Drop (taste-personalized weekly planning that auto-shops) — the only thing no competitor can copy.
- **Planner modes (same engine):** food-waste · multi-diet household · budget.
- **Supporting inputs:** "what do you feel like tonight?" (one-shot, catalog-ranked) · Fridge Cam (utility, demoted) · swipe (free).
- **Macro Coach:** auto-logs from cooked Mori meals (NO photo).
- **CUT:** Snap-your-plate, AI image generation (placeholder for rare net-new), condition/GERD vertical, richer dietary handling, ads.
- **Prereqs before charging (the whole bet = plan quality) — STATUS per 2026-06-01 audit:**
  - week-level optimizer — ❌ **not started.** Scorer ranks single cards; Plan tab is 100% manual (`filterPickerRecipes` + "copy last week"). No variety / no-repeat / macro-balance / leftover-chaining logic anywhere.
  - `cost_per_serving` — ✅ **already 100% filled** (2,617/2,618 live recipes). The "40%→90%" worry is RETIRED — the real gap is that **nothing consumes it** (and `weekly_budget` is likewise collected-but-unused).
  - meal-type tags — ❌ **the hard blocker.** Only 8 of 2,618 recipes carry any meal-slot-ish tag (scraped MealDB noise in `dietary_tags`). There is no `recipes.meal_type` column. You cannot auto-fill a breakfast/lunch/dinner grid without this → add the column + run a Haiku classifier backfill (reuse the `scripts/audit-recipes-full.mjs` harness pattern).
  - feed `flavourDna` into ranking — ❌ computed in `api/taste-profile.ts` but **never read by `scoreRecipe`** (only 24/85 profiles even have it). Decide deliberately: wire it in, or stop marketing "taste-personalized" as the hook.
  - `profiles.timezone` — ❌ column does not exist and is not captured at onboarding. `api/cron/cook-reminders.ts` already documents the gap. Required before any per-user Sunday Drop cron.

### ★ Build cadence (2026-05-28, user directive)
**One feature at a time → full test cases → STOP for user to test → next.** Don't batch features. Every unit gets Jest coverage; UI features get a manual test checklist. Hand off at each checkpoint.

| M | Scope | Status |
|---|---|---|
| M0 | Pre-work — schema migration, RC dashboard, EAS env | 🟡 SQL written + ✅ **self-grant-premium RLS hole closed** (service-role-only `protect_premium_columns` trigger added 2026-06-02) — migration is now safe to apply. Still ❌ NOT applied to live DB and NOT folded into `schema.sql`. RC dashboard + ASC products + grace period still manual-pending |
| M1 | RevenueCat client (`lib/revenueCat.ts`, init, userStore) | 🟡 Wrapper + tests shipped, but ❌ `react-native-purchases` is NOT in `package.json` (only `expo-dev-client` was added) AND ❌ `initRevenueCat()` is never called in `_layout.tsx` (only the dev override). SDK can't load; binary can't transact until both are fixed + RC key obtained |
| M2 | Webhook + entitlement sync (`api/rc-webhook.ts`) | ⬜ |
| M3 | Paywall (`components/paywall/PaywallModal.tsx`) | ⬜ |
| M4 | Free-tier monthly budgets (`lib/aiUsage.ts`) | ⬜ |
| M5 | Push pipeline (`lib/push.ts`, token registration) | ⬜ |
| M6 | Auto Plan (`api/auto-plan-week.ts`) | ⬜ |
| M7 | Sunday Drop (cron + section) | ⬜ |
| M8 | Generate from Pantry (`api/generate-from-pantry.ts`) | ⬜ |
| M9 | Macro Coach (manual logging only in v1.1) | ⬜ |
| M10 | Saved Decks | ⬜ |
| M11 | Substitution AI extension | ⬜ |
| M12 | Policy + manifest updates | ⬜ |
| M13 | Submit v1.1 | ⬜ |
| M14 | Phased rollout 1% → 100% | ⬜ |

v1.2 (after v1.1 ships): M15 Apple Health · M16 Family Share · M17 Win-back.

---

## Branch-Specific Commandments

These extend Mori's main commandments in `CLAUDE.md`. Don't violate.

### Subscription gating
- **Server-side authoritative** — every premium-only API endpoint MUST check `profiles.is_premium` (or grace period equivalent) via `lib/aiUsage.ts` `checkAiBudget()` or direct query. NEVER trust the client header alone.
- **Client-side authoritative for UX** — gate UI off `useUserStore().isPremium` (synced from `Purchases.getCustomerInfo()`). NEVER round-trip to the server just to show/hide a button.
- **Free features never gated.** Swipe, save, plan, grocery list, Instacart send — all stay unlimited and unaffected. If you find yourself adding a paywall to one of these, stop and re-read the plan.
- **Paywall triggers must be additive.** Build my week → paywall is fine; existing flows that worked free pre-Mori+ must continue to work free.
- **Grace period = full access.** `premium_in_grace_period = TRUE` AND `premium_expires_at > now()` counts as premium for all gating decisions. Apple gives users 16 days to fix billing; we don't punish them for it.

### Apple compliance (non-negotiable)
- **No toggle paywalls** (Apple banned them Jan 2026). Stacked SKU cards only.
- **Restore Purchases visible on paywall AND in Settings.** Two locations is intentional — Apple checks both.
- **Privacy Policy + Terms of Use links visible on paywall**, must open in-app webview, must load successfully when reviewer taps them.
- **Trial disclosure copy is verbatim** per plan §9.2 — don't paraphrase. **"30 days free, then $39.99/year. Auto-renews unless cancelled at least 24 hours before period end. Cancel anytime in Settings."** (Monthly card: "30 days free, then $4.99/month.") ⚠️ **Corrected 2026-06-01 — trial is 30-day, decided by user.** The plan body §9.1/§9.2/§12 still showed a stale "7 days" (now also corrected in the spec). The disclosed string MUST exactly match the StoreKit Introductory Offer configured in App Store Connect, or it is an automatic Guideline 3.1.2 rejection.
- **`Sentry.flush(2000)` in `finally`** on every new Vercel function (per Mori's pre-ship commandments).

### Cost discipline
- **Auto Plan caps at 1 generation per call.** Reuse existing recipes from saved + catalog before generating new ones.
- **Sunday Drop caps at 4 generations per user per week.** Other 3 recipes come from catalog scoring.
- **Generate-from-Pantry caps at 3 recipes per call** (5 for premium, never more).
- **Never increment `ai_usage` on a failed gen.** Idempotency: failed calls don't burn the user's monthly budget.

### Webhook safety
- **Idempotent always.** Insert into `rc_webhook_events` first; `23505` (duplicate key) → return 200 noop.
- **Timing-safe auth compare.** Use `crypto.timingSafeEqual(...)`, not `===`. Matches the cron auth pattern in `api/cron/_auth.ts`.
- **Never trust event payload alone.** Always cross-reference `app_user_id` with our `profiles` row before mutating state.

### Premium feature flag — kill switch
- All Mori+ surfaces wrap in `flags.moriPlusEnabled` (`lib/featureFlags.ts`). Read from `EXPO_PUBLIC_MORI_PLUS_ENABLED`. Default OFF until launch day; flip via EAS env update + OTA push.

---

## Env Vars (full list)

### Client (EAS — pin in `eas.json`, mirror in EAS dashboard)
```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_XXX        # production key in production profile, sandbox key elsewhere
EXPO_PUBLIC_MORI_PLUS_ENABLED=false            # kill switch; flip to true on launch day
```

### Server (Vercel — dashboard only, never client-exposed)
```
RC_WEBHOOK_SECRET=<openssl rand -hex 32>       # shared secret for /api/rc-webhook
EXPO_ACCESS_TOKEN=<from expo dashboard>        # server-side push, bypasses per-app rate limits
```

Existing vars unchanged: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INSTACART_API_KEY`, `INSTACART_PARTNER_ID`, `RESEND_API_KEY`, `SEED_SECRET`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN`.

---

## SKU Reference Card

| Apple product ID | Display | Price | Trial | RC package |
|---|---|---|---|---|
| `mori_plus_monthly` | Mori+ Monthly | $4.99–6.99/mo (test) | **30-day free** | `monthly` in `default` offering |
| `mori_plus_annual` | Mori+ Yearly | $39.99/yr (lead) | **30-day free** | `annual` |
| `mori_plus_lifetime` | Mori+ Lifetime | $79.99 once | none | `lifetime` (founders, first 60 days only) |

Entitlement: `mori_plus` (single boolean — drives all gating).

Apple cut: 15% via Small Business Program. Net per sub: ~$3.39/mo · ~$33.99/yr · ~$67.99 lifetime. RevenueCat cut: 0% until $2,500 MTR, then 1% of gross.

Billing Grace Period: 16 days (set in App Store Connect).

---

## File Map (Mori+ surface)

Files this branch will create or modify. Update as you ship.

### New
- `supabase/add-mori-plus.sql` — schema migration ✅
- `lib/revenueCat.ts` — SDK wrapper ✅
- `lib/featureFlags.ts` — kill switch ✅
- `lib/aiUsage.ts` — monthly budget gate
- `lib/push.ts` — server-side Expo push helper
- `lib/macroCoach.ts` — Mifflin-St Jeor target math
- `api/rc-webhook.ts` — RevenueCat webhook receiver
- `api/auto-plan-week.ts` — weekly meal-plan generation
- `api/generate-from-pantry.ts` — pantry-constrained recipe gen
- `api/macro-coach.ts` — coach actions (compute-targets, gap-suggest, weekly-review)
- `api/cron/sunday-drop.ts` — hourly Saturday/Sunday cron
- `components/paywall/PaywallModal.tsx`
- `components/plan/AutoPlanSheet.tsx`
- `components/discover/SundayDropSection.tsx`
- `components/discover/CookWhatIHaveSheet.tsx`
- `components/macro-coach/*`
- `app/macro-coach.tsx` + `app/macro-coach-setup.tsx`
- `app/sunday-drop-archive.tsx`
- `app/decks.tsx`
- `app/manage-subscription.tsx` (Settings entry)
- `stores/decksStore.ts`

### Modified
- `app/_layout.tsx` — ⚠️ **RC init NOT wired** (the prior "✅" was inaccurate): only `applyDevPremiumOverride()` is called; `initRevenueCat(userId)` is never invoked. `loginRevenueCat`/`logoutRevenueCat` are also never wired into sign-in/sign-out → cross-user entitlement bleed (see blockers). Push token registration was already wired.
- `stores/userStore.ts` — `isPremium` field ✅
- `eas.json` — `EXPO_PUBLIC_MORI_PLUS_ENABLED` pinned to `"false"` ✅ (RC key still TBA)
- `public/index.html` — Mori+ founders section + nav link + meta description ✅
- `app/(tabs)/plan.tsx` — "Build my week" header button
- `app/(tabs)/discover.tsx` — Sunday Drop section + "Cook what I have" entry
- `app/(tabs)/profile.tsx` — Coach + Upgrade rows
- `components/ProfileSheet.tsx` — Manage Subscription row
- `api/generate-recipe.ts` — `checkAiBudget` + `incrementAiUsage` calls
- `vercel.json` — Sunday Drop cron schedule
- `package.json` — ❌ **NOT DONE.** Only `expo-dev-client` was added. `react-native-purchases`, `react-native-purchases-ui`, `expo-server-sdk` are still MISSING and must be installed (`--legacy-peer-deps`).
- `supabase/schema.sql` — fold migration in after applying

---

## Decisions Log (date-stamped, append-only)

- **2026-05-02** — Branch created from `main`. v1.0 already in TestFlight Beta App Review; no Mori+ code on `main`.
- **2026-05-02** — All-at-once v1.1 (not phased v1.1/v1.2/v1.3). Reasoning in plan §2: phasing multiplies Apple review touches without reducing risk; feature-density drives conversion.
- **2026-05-02** — Apple Health and Family Share deferred to v1.2 (not v1.1) to keep first-IAP review surface manageable while still shipping a feature-rich paywall.
- **2026-05-02** — Single entitlement (`mori_plus`) over per-feature entitlements. Simpler messaging, simpler gating.
- **2026-05-02** — Apple Family Sharing OPT-OUT. Mori+ has its own (richer) Family Share feature in v1.2; enabling Apple's would dilute it.
- **2026-05-02** — RC SDK lazy-loaded via `await import('react-native-purchases')` in `lib/revenueCat.ts`. Lets Jest tests + Expo Go (no native module) avoid a hard crash; safe-loop returns null on missing module.
- **2026-05-03** — `lib/revenueCat.ts` switched from `await import` to `require()` after Jest tests showed dynamic-import bypassed jest.mock virtual mocks under jest-expo's transform. Same module resolution at runtime, mockable in tests. Sentry usage funnels through a `reportError(err, area)` helper that does the same require-then-call pattern, sidestepping a `(0, _reactNative.captureException) is not a function` Babel CJS-interop bug. Test suite: 68 tests across 3 suites, all green.
- **2026-05-03** — `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is read inside `initRevenueCat()` (not at module load). EAS env updates that arrive via OTA take effect on the next foreground init without a rebuild. Production logic unchanged in steady state; only the timing of the env read differs.
- **2026-05-03** — Founders waitlist landing: inline section on `public/index.html`, NOT a separate page. Posts to existing `/api/waitlist` endpoint with `name: 'mori-plus-founders'` as the cohort tag. Trade-off: avoids burning a Vercel function slot pre-launch (Hobby plan capped at 12). Migrate to a dedicated `/api/founders-waitlist` + `founders_waitlist` table when (a) Vercel plan upgrades or (b) we drop a different function. Until then, query the founders cohort via `SELECT email FROM waitlist WHERE name = 'mori-plus-founders'`.
- **2026-05-28** — **Converged on value-prop-first plan** (flagship = taste-personalized closed loop; cuts: Snap-your-plate, image-gen, condition vertical, ads). Full CPO/GTM strategy + market data in the plan file. **Rebased `mori-plus` onto `main`** (21 commits; reconciled `lib/revenueCat.ts` full wrapper over main's stub, merged `eas.json` channels + kill-switch env, kept main's app.json version 6.0.0). 68 tests green.
- **2026-05-28** — **Trial = 30-day base; NOT 3 months.** Long trials (17–32d) convert best (~42.5%); 90-day burns compute + kills urgency + raises refunds. Generosity comes via referral *rewards* (+1 month promo offers), not a longer base trial.
- **2026-05-28** — **Referral (give-a-month / get-a-month) = post-launch growth loop**, via RevenueCat **Offer Codes** + attribution. Not a launch blocker; rides in after the core. Reuses the same Offer Code machinery as comping.
- **2026-05-28** — **Dev testing without RC:** (1) client dev-only "force premium" override (`lib/devPremium.ts`, `__DEV__`-guarded), (2) `profiles.is_premium=true` comp in Supabase Studio for server-side gating, (3) `EXPO_PUBLIC_MORI_PLUS_ENABLED=true` in local `.env` to surface Mori+. No RevenueCat/App Store setup needed. Offer Codes are the clean comp once RC is live.
- **2026-05-28** — **Build cadence: one feature → full tests → user-test checkpoint → next.** Increment #1 = the dev premium override (unblocks testing everything else).
- **2026-06-01** — **v2.0.0 is LIVE on the App Store.** The "Mori+ ships after v2.0.0" precondition is satisfied; Mori+ is the active next release.
- **2026-06-01** — **Trial = 30-day, locked by user.** Resolves the 7-day-vs-30-day contradiction that was sitting inside the plan body (§9.1/§9.2/§12 said "7 days"; strategy + SKU card said 30). All paywall copy, ASC Introductory Offers, and the §9.2 verbatim string are now 30-day. Reconciled in this doc + the spec.
- **2026-06-01** — **Vercel function cap is a NON-ISSUE.** The "Hobby plan capped at 12" note in older entries is stale — the project is on **Vercel Pro** (~20 of 100 functions used; see `bugfixes.md`). Adding the ~5 Mori+ endpoints (`rc-webhook`, `auto-plan-week`, `generate-from-pantry`, `macro-coach`, `cron/sunday-drop`) reaches ~25. No function-budget action needed.
- **2026-06-01** — **Full audit run** (6-agent sweep of branch scaffold + live DB + docs). Findings folded into the "Audit Findings & Open Blockers" section below; this Status header + File Map + prereq list corrected against actual code/DB state.
- **2026-06-02** — **Closed the self-grant-premium RLS hole.** Added a `protect_premium_columns()` `BEFORE UPDATE` trigger to `add-mori-plus.sql` that blocks `current_user IN ('authenticated','anon')` from changing any entitlement column. Decided AGAINST a "leave it open for dev, remove before launch" approach: dev and prod share one Supabase project, so the self-grant can't be scoped to dev, and a manual "remove before launch" step is the invisible-state failure mode the commandments warn against. Dev premium comps continue via the **service role** (Supabase Studio) + the `__DEV__` client `devPremium` toggle — neither is affected by the trigger. Migration is now safe-by-default.

---

## Audit Findings & Open Blockers (2026-06-01)

Full multi-agent audit of the branch scaffold, the Supabase migration, the plan-quality prereqs (live DB), the M-roadmap, branch hygiene, and Apple/GTM readiness. Ranked. Items below are captured so the next builder doesn't trust a stale ✅; the **one fixed so far is under ✅ Resolved**.

### ✅ Resolved
- **Entitlement-forgery RLS hole — FIXED 2026-06-02 (this branch).** The `profiles` UPDATE policy is a full-row `USING (auth.uid() = id)` and Postgres RLS can't gate per-column, so it would otherwise let any signed-in user self-set `is_premium = true` via the anon key (free-Mori+ exploit). `add-mori-plus.sql` now installs a `protect_premium_columns()` `BEFORE UPDATE` trigger that blocks the user-facing roles (`current_user IN ('authenticated','anon')`) from changing ANY entitlement column (`is_premium / premium_product_id / premium_expires_at / premium_will_renew / premium_in_grace_period / premium_started_at / revenuecat_user_id`). Service-role writes (the RC webhook) and Supabase Studio dev-comps still pass; normal profile edits (display_name, push_token, …) are untouched; only a *change* to an entitlement column is blocked. Migration is **safe-by-default** now — the hole never exists in prod, even before the webhook ships. NB: this is NOT a "remove before launch" toggle — there was no dev-only grant policy; the lockdown is permanent and dev comps go through the service role.

### 🔴 Critical (block charging)
- **Plan-quality engine ≈ 0%** — i.e. the thing being priced. No week optimizer, no `meal_type` tags (8/2,618), `flavourDna` unused in scoring, no `profiles.timezone`. See the corrected prereq list above. Auto Plan + Sunday Drop should NOT be the v1 paywall headline until this exists.
- **No paywall (M3) + 18/18 M2–M14 deliverable files absent.** PaywallModal is the single hard Apple-review blocker. Webhook, AI-budget gate, push pipeline, Auto Plan, Sunday Drop, Generate-from-Pantry, Macro Coach, Saved Decks — none exist.
- **`react-native-purchases` not installed + `initRevenueCat()` not called.** Binary literally cannot transact. (See M1 + File Map corrections above.)

### 🟠 High
- **Cross-user entitlement bleed.** `loginRevenueCat`/`logoutRevenueCat` are written + tested but never wired into sign-in/sign-out (`ProfileSheet` calls `supabase.auth.signOut()` directly). On a shared device a premium user's flag/RC identity persists into the next session. **The only real correctness bug in shipped code** — cheapest to fix now (same `_layout`/`userStore`/`ProfileSheet` surfaces as the pending re-merge). Add an integration test asserting `isPremium → false` on sign-out.
- **Zero server-side entitlement enforcement.** No endpoint reads `is_premium`; M2 webhook + M4 budget gate unbuilt. Build `api/rc-webhook.ts` as the sole `is_premium` writer (insert-first into `rc_webhook_events`, `23505 → 200` noop, `timingSafeEqual` auth, `Sentry.flush(2000)` in `finally`) and a `requirePremium(req)` server helper — gate every premium endpoint from line one.
- **`increment_ai_usage` (SECURITY DEFINER) trusts caller-supplied `p_user`** — no `auth.uid()` check. Derive the user from `auth.uid()` inside the function OR `REVOKE EXECUTE` from `authenticated`/`anon` and call only via service role.
- **No Terms of Use / EULA exists** anywhere (repo, in-app, or landing — only a Privacy Policy). Apple requires a functional EULA link on the paywall + ASC listing for auto-renewable subs. Code-independent hard 3.1.2 gate — author/designate one (Apple standard EULA or hosted custom) and wire both Privacy + Terms into the paywall (in-app webview).

### 🟡 Medium
- **Migration not folded into `schema.sql` and not applied to the live DB.** (The `protect_premium_columns` trigger is now IN the migration, so it's safe to apply — then fold into `schema.sql`.)
- **Small Business Program shows "submitted," not confirmed "Enrolled."** All net-revenue math (15% cut) depends on it; the rate applies the month AFTER approval, never retroactively. Confirm "Enrolled" + banking "verified" in ASC before first sale.
- **Guideline 3.1.2 boundary.** Keep manual week-planning, swipe, save, grocery, Instacart, dietary filters FREE forever; only AI auto-generation/auto-shop gets gated. QA that gating "Build my week" never degrades the free manual Plan flow.
- **Thin-v1.1 vs advertised value prop.** If v1.1 ships only Saved Decks / unlimited-gen (no week optimizer needed), the paywall must advertise ONLY those — not Auto Plan / Sunday Drop — or 3.1.2 "performs as advertised" + refund risk applies. Decide: hold the paywall until the engine ships, or ship a narrower honest paywall.
- **Three external secrets unobtained:** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (RC dashboard), `RC_WEBHOOK_SECRET` (`openssl rand -hex 32`), `EXPO_ACCESS_TOKEN` (Expo dashboard). Pin the RC key in `eas.json` per-profile once created (project's invisible-state commandment).
- **App Privacy form** not updated (Purchases → Purchase History Linked; User ID via RevenueCat); RC `PrivacyInfo.xcprivacy` bundling unverified (pod-install pre-flight).

### ✅ Confirmed good
- Client scaffold is security-conscious: `isPremium` sourced only from RC `customerInfo`; kill switch supersedes any entitlement; dev-premium hard-`__DEV__`-guarded; premium UI double-gated; EAS pins the flag OFF for prod/preview. Tests assert real behavior.
- Merge into `main` is mechanically clean (0 conflicts; cook-photos batch disjoint; main's stub hasn't diverged).
- Schema design sound: idempotency table correct; owner-scoped RLS; no plaintext secrets; premium-column hole now closed by the `protect_premium_columns` trigger.

### Recommended critical path (thin v1.1; engine in parallel)
1. ✅ RLS protection trigger added (2026-06-02) → next: apply `add-mori-plus.sql` → fold into `schema.sql`.
2. Install `react-native-purchases`, wire `initRevenueCat()`, obtain RC key.
3. M2 webhook (sole `is_premium` writer) + server `requirePremium()` gate.
4. M3 PaywallModal + `manage-subscription.tsx` (Restore in 2 places) + a real EULA.
5. ONE honest premium feature — Saved Decks (no AI cost, table already in schema) or M4-gated unlimited generation. **Auto Plan + Sunday Drop → v1.2**, gated behind the plan-quality prereqs.
6. Fix the logout bleed bug + re-merge `main` (do now — cheap, same surfaces).

---

## Open Questions

- [ ] **Premium visual cue — avatar ring (deferred 2026-05-29).** Add a subtle moss/gold gradient ring on `AvatarButton` when `isPremium`. Pure client-side off the `isPremium` flag → testable now via the dev toggle, no RevenueCat. Chosen over an alternate Mori+ logo (brand-asset risk — assets locked, PNG-only) and Discover-deck badges (clutter on the editorial surface; Mori is single-player so no social signal). Build after the dev build lands.
- [ ] Sandbox tester Apple account credentials — generate + log to 1Password before M13
- [ ] Demo video — record after M3 paywall is final
- [ ] App Store screenshots — need 6.7" iPhone screens for Mori+ features (5 screens), reuse existing 4 free-tier screens
- [x] ~~Founders waitlist landing — separate page on getmori.app or inline modal?~~ Decided 2026-05-03: inline section on `public/index.html` posting to `/api/waitlist` with `name: 'mori-plus-founders'` cohort tag.
- [ ] Apple Privacy Manifest — verify RC's PrivacyInfo.xcprivacy bundles correctly after `npx pod-install` (M13 pre-flight)

---

## Product Ideas / Backlog

- [ ] **Fitness-goal intake → goal-tailored food planning (added 2026-06-02).** Ask users their fitness goal up front — lose fat / build muscle / maintain / more energy / eat healthier / hit a protein target — plus a target, then make **Auto Plan + Sunday Drop + recommendations actively serve that goal *food-wise***: not just "dinners you'll like" but "dinners you'll like that move you toward your goal" (protein-forward for muscle, calorie-appropriate for fat loss, fiber/whole-food bias for "eat healthier", etc.). This is the intake/onboarding front-end for **Macro Coach (F4)** and sharpens the **"goals cook" second value prop** (diagnosis → prescription — the user who already pays Cal AI / MyFitnessPal). Open sub-decisions: (1) **where to ask** — onboarding vs Coach setup vs a Mori+ upgrade moment; (2) **gating** — capturing the goal can be **free** (an upgrade hook), with the goal-*tailored* planning as the paid value; (3) **data** — reuse existing `dietary_goals` / `macro_goals` vs a new `fitness_goal` field. **Guardrail:** frame as "we help you hit your goals through the dinners you actually cook" — never medical/clinical claims (per the condition-vertical cut + design.md's no-overclaim rule).

---

## See Also

- Full implementation spec: [`.claude/plans/i-want-you-to-harmonic-galaxy.md`](.claude/plans/i-want-you-to-harmonic-galaxy.md) (vendored into the branch 2026-06-01)
- Main project commandments: [`CLAUDE.md`](CLAUDE.md)
- Bug fix log: [`.claude/bugfixes.md`](.claude/bugfixes.md)
- Security hardening reference: [`.claude/SECURITY_HARDENING_IMPLEMENTATION.md`](.claude/SECURITY_HARDENING_IMPLEMENTATION.md)
