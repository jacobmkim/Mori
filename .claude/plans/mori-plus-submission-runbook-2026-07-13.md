# Mori+ 6.1.0 — App Store Submission Runbook

*Created 2026-07-13. Canonical ordered checklist for taking the mori-plus branch to App Review. Free tier stays free forever (cardinal rule) — 6.1.0 ADDS the Mori+ subscription; nothing existing moves behind the paywall.*

**Legend:** ✅ done · 🤖 Claude runs it (say the word) · 👤 you (dashboard / device / Apple)

---

## Phase 0 — Cleared 2026-07-13 (this session)

- ✅ **Flagship committed + pushed.** 7 logical commits (`b27b83e..ee25597`) + merge of main (`bb11a48`) + release-config commit (`b062e99`). Working tree clean, `origin/mori-plus` in sync.
- ✅ **main merged into mori-plus** — landing-page redesign preserved (founders form intact), push-token exclusive-claim + scorer repeat-boost fixes verified already present in `lib/weekPlanCore.ts`. The 6.1.0 binary now contains everything 6.0.1 shipped.
- ✅ **Suite green post-merge: 81 suites / 1251 tests, tsc clean** (run fresh, not doc-claimed).
- ✅ **Prod DB verified via pg_policies/information_schema — ALL contested migrations are applied:** `harden-recipes-select` (policy "Public recipes, or own private ones" live; the "NOT yet applied" bugfixes line was stale), both Sunday Drop migrations (proposal columns + v2 trigger), `profiles.timezone`/`notify_sunday_drop`, `claim_push_token`, `rc_webhook_events` + `ai_usage` tables. 2,618 recipes all public. **Nothing left to apply.**
- ✅ **Kill switch flipped for release builds:** `eas.json` production profile now `EXPO_PUBLIC_MORI_PLUS_ENABLED="true"` (`b062e99`). Required: Apple must be able to reach the paywall in the reviewed binary — a dark build = IAP rejected as unlocatable. Dev profile was already true.
- ✅ **Legal pages live:** getmori.app/terms (Standard EULA + $6.99/$59.99 + auto-renew language) and /privacy both 200.
- ✅ **`RC_WEBHOOK_SECRET` already set in Vercel prod** (26 days ago) and **`/api/rc-webhook` already deployed** (returns 401 unauthenticated = live, fail-closed).
- ✅ Preview deploy builds clean (all functions compile; preview URLs are behind Vercel SSO so endpoint smoke happens post-prod-deploy).

## Phase 1 — Deploy server (one command, needs your explicit go)

1. 👤→🤖 **Prod deploy:** say "deploy to production" and I run `vercel deploy --prod` + immediately smoke-test:
   - `POST /api/generate-from-pantry` → expect **401** (JWT required), not 404
   - `GET /api/cron/sunday-drop` → expect **401** (cron secret), not 404
   - `POST /api/rc-webhook` → expect **401**
   - `GET /terms`, `/privacy`, `/` (landing) → **200**, landing shows the redesign
   - taste-profile/generate-recipe/substitutions → 401 unauth (budget gate goes live server-side; old 6.0.x clients: only impact is manual taste-profile refresh >1/mo gets a generic error — accepted)
2. ⚠️ **Do not push anything to `main` until mori-plus merges back** — if Vercel git auto-deploy is connected to main, a main push would redeploy old code and remove the Mori+ endpoints. (Merge-back to main happens at submission time, after the dogfood gate.)

## Phase 2 — RevenueCat dashboard (👤 ~10 min, I supply exact strings)

3. ✅ **Webhook registration — ALREADY DONE + VERIFIED WORKING (2026-07-13 check):** `rc_webhook_events` holds **77 processed events** including a full sandbox lifecycle (RENEWAL ×3 → CANCELLATION → EXPIRATION on 2026-06-30), and 1 profile carries a `revenuecat_user_id`. Registration, `Bearer` auth, and end-to-end processing are all confirmed — no action needed.
4. 👤 **Paywall footer links** (RC Paywalls v2 editor): Terms of Use → `https://getmori.app/terms` · Privacy → `https://getmori.app/privacy`. Confirm the paywall + `default` offering (monthly + annual only) is **published**.
5. 👤 Confirm Customer Center is enabled (manage/cancel/restore) — code already calls it.

## Phase 3 — On-device debug pass (the kimmy_eatz checklist)

6. 🤖 **Generate a fresh Sunday Drop proposal** for the upcoming week (the pending one is for week 2026-07-05 — past, so the review card's past-week gate hides it). I run `scripts/run-sunday-drop.mts` for kimmy_eatz on your word, after Phase 1.
   - Gotcha (now sharper with the webhook live): **any RC event for a user resets manual `is_premium` comps** — re-comp kimmy_eatz in Studio right before generating if it flipped.
7. 👤 **On-device (dev client + `npx expo start`; no new native build needed — RC SDK unchanged since the last dev build):**
   - Push arrives → tap → lands on the right Plan week (`mori://plan?week=`) — including from cold start
   - Review card renders → "Review & accept" opens the sheet with 7 dinners → Shuffle respects locked slots → accept writes the week + confirmation state
   - "Not this week" asks to confirm, then dismisses; re-open shows nothing
   - "Build my week" (Plan) and "Cook with what I have" (Discover) both work; free-account paywall appears on gated taps (flip the dev premium toggle off to see it)
   - **Sandbox purchase:** sign the device's Sandbox Account (`morisandbox1@gmail.com`) → buy monthly through the paywall → entitlement activates in-app → check `profiles.is_premium` flips via the webhook (I verify DB-side) → Restore Purchases works from BOTH the paywall and ProfileSheet
8. 🤖 I watch Sentry + the webhook delivery log during the pass and debug anything that breaks.

## Phase 4 — Dogfood gate (1 week, pre-committed 2026-06-10)

9. 👤 Accept the drop / Build your week and live it for 1 week. **Gate: cooked-rate on auto-planned slots ≥ 40%, or no submission** (fallback = thin honest paywall: pantry-gen + Decks + budget — never Auto Plan as headline).
10. 🤖 I run the measurement daily: cooked ÷ total for slots with `provenance IN ('auto_plan','sunday_drop')` for the week, and tell you pass/fail trajectory.

## Phase 5 — App Store Connect (👤, I draft every string)

11. 👤 **Replace the DUMMY IAP review screenshots** on BOTH `mori_plus_monthly` + `mori_plus_annual` with a real paywall capture from the device (Guideline 2.3.3 risk otherwise).
12. 👤 **Verbatim disclosure strings** (must exactly match the StoreKit intro offers — 3.1.2 auto-rejection if they drift):
    - Annual: "30 days free, then $59.99/year. Auto-renews unless cancelled at least 24 hours before period end. Cancel anytime in Settings."
    - Monthly: "30 days free, then $6.99/month."
13. 👤 **App Privacy form:** add Purchase History (linked to identity) + User ID (RevenueCat) — everything else unchanged.
14. 👤 **Version page:** create 6.1.0 in ASC, **attach both IAPs to the version** (first IAPs must ship with a binary), Terms of Use URL field → `https://getmori.app/terms`.
15. 👤 Confirm: Small Business Program shows **"Enrolled"** (15% applies the month AFTER approval), banking **verified**, Family Sharing ON both SKUs, 16-day grace (Production + Sandbox), sandbox tester active.
16. 👤 App screenshots: reuse the 4 free-tier screens + capture up to 5 Mori+ screens (6.7"). Use `scripts/resize-screenshots.ps1` — 24-bit RGB, no alpha, exact pixels (Apple rejects otherwise; see Applied Learning 2026-05-04).
17. 👤 **Review notes:** demo account `apple-review@getmori.app` (keep intact) + "Mori+ paywall: Profile → Mori+, or Plan → Build my week. Restore Purchases: on the paywall and in Profile → Settings. Subscriptions purchasable via sandbox."

## Phase 6 — Build + submit (after the gate passes)

18. 🤖 Merge `mori-plus` → `main` (final adversarial review pass per the standing commandment runs before this).
19. 🤖 Pre-build check: `eas env:list --environment production` cross-checked against every `EXPO_PUBLIC_*` reference (pre-ship commandment) — eas.json pins are source-controlled, but confirm dashboard env doesn't override with stale values.
20. 🤖 `eas build --profile production --platform ios` → 👤 TestFlight install → final sandbox IAP sanity → 🤖 `eas submit`.
21. 👤 Submit for review in ASC (binary + both IAPs together). Phased release ON (M14: 1% → 100%).

## Parked (non-blocking, decide anytime)

- **@vercel/kv** not installed → prod rate limiting is per-warm-instance memory. Fine at current scale; provision KV + `npm i @vercel/kv --legacy-peer-deps` when traffic justifies. (AI *budgets* are Supabase-backed and unaffected.)
- **EXPO_ACCESS_TOKEN** not in Vercel env — pushes work without it; add later to lift Expo rate limits.
- `requirePremium()` has no endpoint callers yet (Auto Plan is client-side; pantry-gen uses the budget gate's premium tier). Post-launch hardening, not an Apple gate.
- Spec'd "≤4 AI-generated net-new recipes per drop" unimplemented — separate freshness lever, catalog fill covers v1.
- Stale `KROGER_*` Vercel env vars + `kroger_tokens` table — cleanup whenever.
- Emergency kill: set `EXPO_PUBLIC_MORI_PLUS_ENABLED=false` in local `.env` → `eas update --channel production` (OTA hides all Mori+ surfaces; entitlements unaffected).
