# Mori+ — Branch Working Doc

Living doc for the `mori-plus` feature branch. Lean by design — full spec lives at [`.claude/plans/i-want-you-to-harmonic-galaxy.md`](.claude/plans/i-want-you-to-harmonic-galaxy.md) (vendored into the branch 2026-06-01, commit `a096fd6` — no longer a machine-local `~/.claude` path). When in doubt, that file is canonical.

This file is for: progress tracking · branch-specific commandments · env vars · open decisions. Update as work lands.

---

## Status

Branch: `mori-plus` · main @ `872d5e8` (the 6.0.1 base) **merged 2026-06-10 (`e996362`); full Jest suite green post-merge.** Free v2.0.0 is LIVE (2026-06-01); **6.0.1 submitted to App Review 2026-06-10**; Mori+ ships as **6.1.0** (new native module `react-native-purchases` ⇒ new binary + runtimeVersion, can't OTA). `lib/revenueCat.ts` full wrapper supersedes main's stub cleanly.

> 🚀 **State (2026-07-13 — SHIP PREP): everything is COMMITTED + PUSHED and the repo is release-shaped.** Flagship safeguarded into 7 logical commits (`b27b83e..ee25597`), `main` merged in (`bb11a48` — landing redesign kept, 6.0.1 client fixes verified present in `weekPlanCore`), release config flipped (`b062e99`: **eas.json production `EXPO_PUBLIC_MORI_PLUS_ENABLED="true"`** — the reviewed binary must expose the paywall or the IAP is rejected; "ship dark + OTA flip" is dead for the submission build). Suite re-verified post-merge: **81 suites / 1251 tests, tsc clean.** Prod DB re-verified against `pg_policies`: **all contested migrations APPLIED** (harden-recipes-select live — the bugfixes "NOT yet applied" line was stale; both Sunday Drop migrations + timezone + claim_push_token live). Terms (+ pricing + EULA language) + Privacy live at getmori.app. `RC_WEBHOOK_SECRET` already in Vercel prod; `/api/rc-webhook` already deployed (401 unauth). **Remaining sequence lives in [`.claude/plans/mori-plus-submission-runbook-2026-07-13.md`](.claude/plans/mori-plus-submission-runbook-2026-07-13.md) (canonical): prod Vercel deploy (user go) → RC dashboard webhook registration (`Bearer <secret>` verbatim) + paywall footer links → fresh drop + kimmy_eatz on-device pass + sandbox purchase → 1-week dogfood gate (≥40%) → ASC admin (real IAP screenshots, disclosure strings, App Privacy, attach IAPs) → merge to main → build + submit.** NB the pending kimmy_eatz drop (week 2026-07-05) is now PAST — the review card's past-week gate hides it; regenerate before the device pass.
>
> ✅ **State (2026-06-16, full-suite debug):** **Track A commerce is code-complete** — RC SDK installed (10.2.2) + key pinned, init/identity wired, webhook (sole `is_premium` writer) + `requirePremium` + AI-budget gate, paywall (Paywalls v2) + Customer Center (manage/cancel/restore/win-back). **925/925 tests; repo == live prod DB (verified, no drift); pre-launch DB pristine.** Running dark behind the kill switch (default OFF). **Remaining: ~~Track B engine~~ ✅ built (see 2026-07-02 banner), ~~wire the AI-budget gate~~ ✅ wired 2026-07-03 (M4 row), EULA/Terms, deploy webhook + set `RC_WEBHOOK_SECRET`, bump done (app.json now 6.1.0). Next feature: M8 "Cook with what I have" — plan at [`.claude/plans/cook-with-what-i-have-m8.md`](.claude/plans/cook-with-what-i-have-m8.md).** The 2026-06-01 audit block below is SUPERSEDED — see the M-table.

> ⚠️ **State (2026-07-02): Track B engine is BUILT on-branch — UNCOMMITTED — and NEEDS ON-DEVICE DEBUG before anything else ships.** Auto Plan ("Build my week": `lib/autoPlan.ts` + `AutoPlanSheet`, client-side — no `api/auto-plan-week.ts` needed) landed earlier. **Sunday Drop is code-complete under the review-then-accept model** (user decision 2026-07-01: the drop must NOT auto-apply the week): the cron (`api/cron/sunday-drop.ts` + `lib/weekPlanCore.ts`/`lib/sundayDrop.ts` server-safe extraction) stores a lean PROPOSAL on `sunday_drops.proposed_plan` + pushes; the Plan tab shows a review card → "Review & accept" hydrates into the Build-my-week sheet → accepting writes `meal_plans`; "Not this week" dismisses. Migrations `add-sunday-drop-prefs-202606.sql` + `add-sunday-drop-proposal-202606.sql` **applied to prod**. 73 suites / 1101 tests green; two adversarial audits passed (1 real client bug fixed: stale `reviewingDropWeek`).
> **REQUIRED DEBUG PASS (open):** test account **kimmy_eatz** has a live pending proposal (drop week 2026-06-28 → plan week Mon 2026-06-29, 7 slots, push sent). On the dev build verify: push tap → `mori://plan?week=2026-06-29` lands on the right week → review card renders → Review & accept opens the sheet with 7 dinners → accept writes the week + flips the card to confirmation → "Not this week" now confirms first, then dismisses → re-open shows nothing. Gotcha: the RC webhook resets manual `is_premium` comps — re-set premium right before any cron re-run (the review card itself is NOT premium-gated, so the existing pending drop stays testable). **All follow-on phases (next: citrus juice → fresh-fruit grocery fix) go through adversarial audit agents by default** (user re-confirmed 2026-07-02).
>
> **2026-07-03 — user-edge-case audit (26-agent workflow, refuter-verified) + fix batch, all landed:** ① mid-week accept no longer rewrites already-eaten past days (`applyPlanToWeek` filters `day >= planStartDay()`; same-recipe slots keep `cooked_at` + `servings_multiplier`); ② drop review now derives + locks the user's current dinners (`currentLockedDinners` overlay in `handleReviewDrop`, `lockedSlotsRef` set for Shuffle, cleared on accept) so Shuffle can't drop pre-placed meals or resurrect a stale lock set; ③ hydration re-validates against CURRENT dietary goals + dislikes (`violatesCurrentPrefs` in lib/sundayDrop.ts) — a pick that violates a post-Sunday pref change is nulled, alternates pruned; ④ review card never shows on past weeks (`weekOffset < 0` gate); ⑤ "Next week is planned" pointer banner on the current-week view for users who missed the push; ⑥ "Not this week" asks for confirmation (irreversible); ⑦ cold-start push tap defers `mori://plan` until `authResolved` (was only deferring recipe links — plan push landed on Discover).
> **Deliberately NOT fixed (accepted / on-device checklist):** multi-device double-accept (second device's accept no-ops on the drop row but still rewrites the week — rare, needs realtime or refetch-on-accept); `accepted_at` fires after `applyPlanToWeek` but doesn't await `savePlan` (transient save failure → accepted drop w/ unsaved week; store retries on next save); lapsed-premium users can Shuffle inside a delivered drop review (product call: delivered proposal is honored, regen is technically ungated there); opt-out toggle doesn't retract an already-generated proposal (fine — it was generated while opted in).
>
> **2026-07-07 — CROSS-WEEK VARIETY FIX (dogfood-gate-critical): the planner gave the SAME recipes every week.** Root cause (3-agent audit): the week engine was a memoryless greedy argmax over a frozen pool — every past drop/plan is persisted (`sunday_drops`/`meal_plans`) but never read back; per-slot pick was strict argmax with jitter ≪ the stable score stack; the catalog query was `.limit(2000)` no-ORDER-BY over ~2,619 recipes (~600 never eligible). This directly endangered the ≥40% cooked-rate gate — a plan that never changes doesn't get cooked. Fix (three composing layers in the shared ranking core, so Sunday Drop AND Plan-tab/deck staleness are both addressed): ① **cross-week memory** — new [lib/planHistory.ts](lib/planHistory.ts) reads the last 3 weeks of plans + drops into a graded `scoreRecipe` penalty (−12/−8/−4 by week; ½ for proposed-only; fires even without "Mark Cooked", which is what made every drop identical); ② **1–2 anchors + hard cap** — `pickAnchorIds` waives the penalty for ≤2 proven favourites, `autoPlanWeek` caps TOTAL history repeats at 2 (thin-pool fallback never empties a slot); ③ **top-K sampling** — weekly fill samples the top-3 (seedable) instead of argmax; ④ **pool fix** — `fetchAllCatalogRows` paginates the whole catalog. No migration (history already persisted). Proof test: 3 consecutive seeded builds, per-week overlap ≤2 under strong static prefs. 81 suites / 1251 tests, tsc clean; adversarial review (1 independent agent + inline 5-lens trace after the workflow hit the session limit) found no blocking bugs. Detail in `.claude/bugfixes.md` 2026-07-07. **NB line 30's "no variety / no-repeat logic" is now STALE** (that engine shipped; this batch adds the cross-week dimension). Still open follow-up: the spec'd ≤4 AI-generated net-new recipes per drop (line 90) remains unimplemented.

> ★ **Execution plan (approved 2026-06-10):** `~/.claude/plans/review-the-mori-implementation-synthetic-lampson.md` — competitive gap, per-competitor kill matrix, measurable gates, compressed calendar (code ~1 wk → submit end of wk 2). **Decisions locked (final, 2026-06-10):** pricing **$6.99/mo · $59.99/yr lead ("Save 28%") · Family Sharing ON both SKUs (irreversible — household included at one price, matches Samsung Food+ pricing with family in) · 30-day trial · lifetime SKU CUT**; hold the paywall until Auto Plan + Sunday Drop are real (no thin launch); **1-week dogfood gate (supersedes the 2-week gate): cooked-rate ≥40% on auto-planned slots or no submission**; Macro Coach first to cut if slipping; **household family vote ships at launch as a CUTTABLE stretch inside Sunday Drop (decided 2026-06-10)** — members swipe-vote the drop candidates, majority fills the week; full taste-merge stays v1.2 (M16). Market correction: **PlateJoy is DEAD (Jul 2025)** — closest-comp white space is open; Samsung Food ($6.99) is the 12–24mo threat.

### ★ Converged scope (2026-05-28) — read the plan file's value-prop + CPO/GTM sections first
- **Flagship:** Auto Plan + Sunday Drop (taste-personalized weekly planning that auto-shops) — the only thing no competitor can copy.
- **Planner modes (same engine):** food-waste · multi-diet household · budget.
- **Supporting inputs:** "what do you feel like tonight?" (one-shot, catalog-ranked) · Fridge Cam (utility, demoted) · swipe (free).
- **Macro Coach:** auto-logs from cooked Mori meals (NO photo).
- **CUT:** Snap-your-plate, AI image generation (placeholder for rare net-new), condition/GERD vertical, richer dietary handling, ads.
- **Prereqs before charging (the whole bet = plan quality) — STATUS per 2026-06-01 audit:**
  - week-level optimizer — ❌ **not started.** Scorer ranks single cards; Plan tab is 100% manual (`filterPickerRecipes` + "copy last week"). No variety / no-repeat / macro-balance / leftover-chaining logic anywhere.
  - `cost_per_serving` — ✅ **already 100% filled** (2,617/2,618 live recipes). The "40%→90%" worry is RETIRED — the real gap is that **nothing consumes it** (and `weekly_budget` is likewise collected-but-unused).
  - meal-type tags — ✅ **DONE 2026-06-10 (was the hard blocker).** `recipes.meal_types text[]` added (CHECK-pinned enum + GIN index, `supabase/add-meal-types-202606.sql`, applied to prod) and backfilled via `scripts/backfill-meal-types.mjs` (Haiku): **2,618/2,618 classified, 0 failures**. Distribution: lunch 2,495 · dinner 2,367 · breakfast 201 · snack 110 · dessert 59. Catalog is dinner-deep, breakfast-thin (7.7%) → Auto Plan v1 leads with dinners; breakfast slots possible but from a small pool.
  - feed `flavourDna` into ranking — ❌ computed in `api/taste-profile.ts` but **never read by `scoreRecipe`** (only 24/85 profiles even have it). Decide deliberately: wire it in, or stop marketing "taste-personalized" as the hook.
  - `profiles.timezone` — ❌ column does not exist and is not captured at onboarding. `api/cron/cook-reminders.ts` already documents the gap. Required before any per-user Sunday Drop cron.

### ★ Build cadence (2026-05-28, user directive)
**One feature at a time → full test cases → STOP for user to test → next.** Don't batch features. Every unit gets Jest coverage; UI features get a manual test checklist. Hand off at each checkpoint.

| M | Scope | Status |
|---|---|---|
| M0 | Pre-work — schema migration, RC dashboard, EAS env | ✅ **Migration APPLIED to prod 2026-06-10** (`add_mori_plus_202606`) — all 9 tables + RLS live; trigger verified behaviorally. EAS env ✅ (RC key pinned, A1). **RC dashboard:** entitlement `mori_plus` + both products attached + `default` offering (monthly/annual) — user-confirmed 2026-06-10. **ASC products:** both `mori_plus_monthly` ($6.99) + `mori_plus_annual` ($59.99) at **"Ready to Submit" 2026-06-10** — ⚠️ using DUMMY review screenshots (see Open Questions; replace before 6.1.0 submit). Remaining manual: sandbox tester, grace-period (Production+Sandbox) + Family-Sharing-per-SKU confirmations, SBP "Enrolled" |
| M1 | RevenueCat client (`lib/revenueCat.ts`, init, userStore) | ✅ **DONE (A1, `b79b796`)** — `react-native-purchases`@10.2.2 + `-ui` installed; init/identity wired (`be0e55e`); iOS key pinned in `eas.json` (dev/preview/prod). Runs dark until paywall + launch flag flip. |
| M2 | Webhook + entitlement sync (`api/rc-webhook.ts`) | ✅ **DONE (A3, `c483dc6`)** — sole `is_premium` writer; timing-safe auth, apply-then-mark idempotency, TRANSFER/grace/expiry handled. + `api/_requirePremium.ts` gate. **Adversarially reviewed (3 agents) → ~8 real bugs fixed pre-merge.** 86 tests. ❌ Not deployed; `RC_WEBHOOK_SECRET` not set (handoff pending). |
| M3 | Paywall (RevenueCat Paywalls v2) | ✅ **DONE (A4, `61183d1`)** — `lib/paywall.ts` (present/gate/Customer Center) + ProfileSheet wiring + dev `app/rc-debug.tsx` offerings readout. ⚠️ paywall Terms/Privacy + Restore configured in RC dashboard (not code). |
| M4 | Free-tier monthly budgets (`api/_aiUsage.ts`) | ✅ **DONE + WIRED + 2× ADVERSARIALLY AUDITED (2026-07-04)** — `checkAiBudget` pre-Claude in `generate-recipe`/`taste-profile`/`substitutions` (402 `ai_budget_exhausted`); `incrementAiUsage` only on success **and only once saved**; premium usage in a separate `:premium` bucket (downgrader's free bucket stays clean); `isPremiumUserId` tri-state (null = lookup failed → skip gate+count, Sentry-flushed — never 402 a payer, never silently disable the gate); client auto-refresh policy in `lib/tasteProfileRefresh.ts` reads the SERVER-view `profiles.is_premium` (free tier never background-burns its credit); substitutions AI tier made REACHABLE (icon no longer static-gated) w/ honest 402/failure copy + empty-answer caching. 8 refuter-confirmed audit findings fixed across 2 rounds — detail in `.claude/bugfixes.md` 2026-07-04. **Deliberately ungated:** `macros.ts` + `storage-tip.ts` (free core flows) + crons. |
| M5 | Push pipeline | ✅ **DONE earlier** via `api/_pushUtils.ts` (token claim + 6 crons); the planned `lib/push.ts` was never needed. |
| M6 | Auto Plan (`api/auto-plan-week.ts`) | ✅ **DONE (client-side)** — shipped as "Build my week" (`lib/autoPlan.ts` week optimizer + `AutoPlanSheet`); no server endpoint needed. `flavourDna` wired into `scoreRecipe`; `profiles.timezone` captured. |
| M7 | Sunday Drop (cron + section) **+ household family vote (stretch, CUT-FIRST if slipping)** — `households`/`household_members` tables, owner invite link (`mori://household/join/{code}` — Apple never exposes the family graph, linking is ours), members swipe-vote drop candidates, majority fills week, ties → cook decides | 🟡 **CODE-COMPLETE, UNCOMMITTED — review-then-accept model (2026-07-01 redesign)**: cron proposes (`sunday_drops.proposed_plan`) + pushes; Plan-tab review card → sheet → accept writes the week. Both migrations applied to prod. **⚠️ Open: on-device debug pass with kimmy_eatz (see 2026-07-02 State banner), then commit.** Household vote NOT built (stretch stands). |
| M8 | Generate from Pantry (`api/generate-from-pantry.ts`) | ✅ **COMPLETE (2026-07-05, stages 1–3, 3 audit rounds)** — `lib/pantryMatch.ts` (pure ranking, 18 tests) + `CookWhatIHaveSheet` (Discover pill → free catalog-ranked sheet w/ add-gap-to-grocery) + premium `api/generate-from-pantry.ts` (≤3 recipes constrained to on-hand; budget gate BEFORE tiered rate limit — free 1/mo → 402 = paywall trigger w/ one honest post-purchase retry, premium 20/day; dietary hard-drop at delivery; injection-hardened prompt) + private save path (`is_public:false` → Recipes ▸ Mine). Audits fixed 2 CRITICAL pre-existing bugs along the way: groceryStore custom-item wipe + the **non-atomic rate limiter** (now atomic `incrWithTtl`). **⚠️ Open admin/deploy items:** `@vercel/kv` NOT installed (prod rate limiting = per-instance memory — provision Vercel KV + install, or accept); apply `harden-recipes-select-202607.sql` after its data check; deploy + curl smoke-test per pre-ship commandments. Plan: `.claude/plans/cook-with-what-i-have-m8.md`. |
| M9 | Macro Coach (manual logging only in v1.1) | ⬜ |
| M10 | Saved Decks | ⬜ |
| M11 | Substitution AI extension | ⬜ |
| M12 | Policy + manifest updates | ⬜ |
| M13 | Submit v1.1 | ⬜ |
| M14 | Phased rollout 1% → 100% | ⬜ |

v1.2 (after v1.1 ships): M15 Apple Health · M16 Household taste-merge (everyone's swipes → one family week plan; entitlement sharing already live day-1 via Apple Family Sharing, so M16 is the data layer — the natural v1.2 flagship) · M17 Win-back.

### In-app layout (IA) — premium DEEPENS existing tabs, no new "Mori+" tab
Cardinal-rule-safe: every paid feature lives where its free equivalent already does; manual flows stay free. Paywall = contextual trigger (RC Paywalls v2 modal) at each gate, plus the ProfileSheet "Mori+" entry. Premium identity = avatar ring (built).
- **Plan tab** → Auto Plan home. "Build my week" button (free tap → paywall; paid → generates). Manual grid untouched. *Primary conversion surface ("your week is ready").*
- **Sunday Drop** → weekend ritual. Sunday-morning push → full-screen reveal (7 picks + "why these" + "Add all to plan" + "Send groceries"); weekend hero card in Discover as fallback. Household family vote lives in this flow.
- **Discover** → Saved Decks picker row at top + "Cook with what I have" (pantry-gen) entry. Creating/saving custom decks + unlimited pantry-gen are gated.
- **Profile** → Macro Coach (goals · daily gaps · weekly review) + Household setup (invite link) + Mori+ manage/paywall entry.
- **Recipe detail** → Substitution AI upgrades the existing static table in-place.

---

## Branch-Specific Commandments

These extend Mori's main commandments in `CLAUDE.md`. Don't violate.

### Subscription gating
- **Server-side authoritative** — every premium-only API endpoint MUST check `profiles.is_premium` (or grace period equivalent) via `lib/aiUsage.ts` `checkAiBudget()` or direct query. NEVER trust the client header alone.
- **Client-side authoritative for UX** — gate UI off `useUserStore().isPremium` (synced from `Purchases.getCustomerInfo()`). NEVER round-trip to the server just to show/hide a button.
- **Free features never gated.** Swipe, save, plan, grocery list, Instacart send — all stay unlimited and unaffected. If you find yourself adding a paywall to one of these, stop and re-read the plan.
- **Paywall triggers must be additive.** Build my week → paywall is fine; existing flows that worked free pre-Mori+ must continue to work free.
- **Grace period = full access.** `premium_in_grace_period = TRUE` AND `premium_expires_at > now()` counts as premium for all gating decisions. Apple gives users 16 days to fix billing; we don't punish them for it.
- **Family-shared members are premium.** Family Sharing is ON (2026-06-10, irreversible). RC reports them as `ownershipType: FAMILY_SHARED` inside `entitlements.active` — `isPremium()` already counts them; the RC webhook fires for family members too, so `profiles.is_premium` syncs per-account. Never gate differently for family-shared vs purchaser.

### Apple compliance (non-negotiable)
- **No toggle paywalls** (Apple banned them Jan 2026). Stacked SKU cards only.
- **Restore Purchases visible on paywall AND in Settings.** Two locations is intentional — Apple checks both.
- **Privacy Policy + Terms of Use links visible on paywall**, must open in-app webview, must load successfully when reviewer taps them.
- **Trial disclosure copy is verbatim** per plan §9.2 — don't paraphrase. **"30 days free, then $59.99/year. Auto-renews unless cancelled at least 24 hours before period end. Cancel anytime in Settings."** (Monthly card: "30 days free, then $6.99/month." — final prices locked 2026-06-10 after the family-sharing decision.) ⚠️ **Corrected 2026-06-01 — trial is 30-day, decided by user.** The plan body §9.1/§9.2/§12 still showed a stale "7 days" (now also corrected in the spec). The disclosed string MUST exactly match the StoreKit Introductory Offer configured in App Store Connect, or it is an automatic Guideline 3.1.2 rejection.
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
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_XXX        # ONE public iOS SDK key for the single RC project, same in all eas.json profiles + local .env. RC auto-detects sandbox vs prod from the StoreKit receipt — there is NO separate "sandbox key" (the old two-project note was wrong).
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
| `mori_plus_monthly` | Mori+ Monthly | **$6.99/mo (LOCKED 2026-06-10)** | **30-day free** | `monthly` in `default` offering |
| `mori_plus_annual` | Mori+ Yearly | **$59.99/yr (lead, "Save 28%" — LOCKED 2026-06-10)** | **30-day free** | `annual` |

**Family Sharing ON — both SKUs, 2026-06-10, user decision (IRREVERSIBLE — Apple never allows turning it off).** Rationale: price-match Samsung Food+ ($6.99/$59.99) but include the household — one sub covers up to 5 family members' premium access. Entitlement only, NOT data: each family member keeps their own taste profile/plans/saves; merged household planning is v1.2 (M16 taste-merge — now the natural v1.2 flagship since family members already have premium accounts). Server-side fair-use guard: per-account `ai_usage` budgets stay enforceable under "unlimited." ⚠️ **Paywall copy guardrail:** "Share Mori+ with your family" is fine; if the launch family vote ships, "your family votes on the week" is also claimable; "plans for the whole family's tastes" (taste-merge) stays barred until v1.2. RC note: family members surface as `ownershipType: FAMILY_SHARED` in `entitlements.active` — our `isPremium()` check already counts them.

**Lifetime SKU CUT — 2026-06-10, user decision.** Mori+ carries ongoing per-user AI cost (Auto Plan / Sunday Drop / pantry-gen), so a one-time $99.99 funding unlimited usage forever is structurally bad for an AI product; also simplifies the paywall to two SKU cards. One-way door in the right direction: a non-consumable can be added later, but can't be gracefully removed after sale. If launch urgency is wanted later: limited-time annual pricing, NOT lifetime. NB: the founders-waitlist perk was implicitly the lifetime window — needs redefining (e.g. early access).

Entitlement: `mori_plus` (single boolean — drives all gating). ⚠️ ASC products + paywall copy + disclosure strings must all carry these EXACT prices — any drift = automatic 3.1.2 rejection.

Apple cut: 15% via Small Business Program. Net per sub: ~$5.94/mo · ~$50.99/yr. RevenueCat cut: 0% until $2,500 MTR, then 1% of gross.

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
- `app/_layout.tsx` — ✅ RC init/identity wired (`be0e55e`): `syncRevenueCatIdentity(prev, uid)` driven off `profile?.id` covers cold boot, account switch, and every sign-out path (token expiry + delete-account included). Runs dark until the SDK is installed + RC key pinned. Push token registration also wired.
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

## Audit Findings & Open Blockers (2026-06-01) — ⚠️ SUPERSEDED 2026-06-16

> A3/A4/A5/B1 shipped since this 2026-06-01 audit: webhook + `requirePremium` + AI-budget gate, paywall + Customer Center, and the `meal_types` backfill (**2,618/2,618**) are all DONE. The 🔴/🟠 "unbuilt / not installed / 8-of-2,618 / no paywall / no endpoint reads is_premium" items below are RESOLVED — kept only for history. Live state is the ✅ banner at the top + the M-table. Still genuinely open: Track B engine (Auto Plan/Sunday Drop), wiring the AI-budget gate into existing AI endpoints, EULA/Terms, webhook deploy + `RC_WEBHOOK_SECRET`.

Full multi-agent audit of the branch scaffold, the Supabase migration, the plan-quality prereqs (live DB), the M-roadmap, branch hygiene, and Apple/GTM readiness. Ranked. Items below are captured so the next builder doesn't trust a stale ✅; fixed items live under ✅ Resolved.

### ✅ Resolved
- **Cross-user entitlement bleed — FIXED 2026-06-09 (`be0e55e`).** `syncRevenueCatIdentity(prev, uid)` is wired in `_layout.tsx` driven off `profile?.id`, so it covers cold boot, account switch, and every sign-out path (both handlers, token expiry, delete-account). `logoutRevenueCat()` clears `isPremium` unconditionally. Tests cover the no-op-before-init and switch sequences.
- **`increment_ai_usage` budget bypass — FIXED 2026-06-09 (`be0e55e`).** `REVOKE EXECUTE` from PUBLIC/anon/authenticated + `GRANT` to service_role only; server calls it after `requireAuth` with the verified user id.
- **Premium-column trigger INSERT gap (bug-scan #6) — FIXED 2026-06-09.** `protect_premium_columns` is now `BEFORE INSERT OR UPDATE`, so the missing-profile-row edge can't self-grant via INSERT either.
- **Entitlement-forgery RLS hole — FIXED 2026-06-02 (this branch).** The `profiles` UPDATE policy is a full-row `USING (auth.uid() = id)` and Postgres RLS can't gate per-column, so it would otherwise let any signed-in user self-set `is_premium = true` via the anon key (free-Mori+ exploit). `add-mori-plus.sql` now installs a `protect_premium_columns()` `BEFORE UPDATE` trigger that blocks the user-facing roles (`current_user IN ('authenticated','anon')`) from changing ANY entitlement column (`is_premium / premium_product_id / premium_expires_at / premium_will_renew / premium_in_grace_period / premium_started_at / revenuecat_user_id`). Service-role writes (the RC webhook) and Supabase Studio dev-comps still pass; normal profile edits (display_name, push_token, …) are untouched; only a *change* to an entitlement column is blocked. Migration is **safe-by-default** now — the hole never exists in prod, even before the webhook ships. NB: this is NOT a "remove before launch" toggle — there was no dev-only grant policy; the lockdown is permanent and dev comps go through the service role.

### 🔴 Critical (block charging)
- **Plan-quality engine ≈ 0%** — i.e. the thing being priced. No week optimizer, no `meal_type` tags (8/2,618), `flavourDna` unused in scoring, no `profiles.timezone`. See the corrected prereq list above. Auto Plan + Sunday Drop should NOT be the v1 paywall headline until this exists.
- **No paywall (M3) + 18/18 M2–M14 deliverable files absent.** PaywallModal is the single hard Apple-review blocker. Webhook, AI-budget gate, push pipeline, Auto Plan, Sunday Drop, Generate-from-Pantry, Macro Coach, Saved Decks — none exist.
- **`react-native-purchases` not installed.** Binary literally cannot transact. (Init wiring is done — see ✅ Resolved; this is now a one-line `npm install --legacy-peer-deps` + RC key.)

### 🟠 High
- **Zero server-side entitlement enforcement.** No endpoint reads `is_premium`; M2 webhook + M4 budget gate unbuilt. Build `api/rc-webhook.ts` as the sole `is_premium` writer (insert-first into `rc_webhook_events`, `23505 → 200` noop, `timingSafeEqual` auth, `Sentry.flush(2000)` in `finally`) and a `requirePremium(req)` server helper — gate every premium endpoint from line one.
- **No Terms of Use / EULA exists** anywhere (repo, in-app, or landing — only a Privacy Policy). Apple requires a functional EULA link on the paywall + ASC listing for auto-renewable subs. Code-independent hard 3.1.2 gate — author/designate one (Apple standard EULA or hosted custom) and wire both Privacy + Terms into the paywall (in-app webview).

### 🟡 Medium
- **Migration not folded into `schema.sql` and not applied to the live DB.** (The `protect_premium_columns` trigger is now IN the migration, so it's safe to apply — then fold into `schema.sql`.)
- **Small Business Program shows "submitted," not confirmed "Enrolled."** All net-revenue math (15% cut) depends on it; the rate applies the month AFTER approval, never retroactively. Confirm "Enrolled" + banking "verified" in ASC before first sale.
- **Guideline 3.1.2 boundary.** Keep manual week-planning, swipe, save, grocery, Instacart, dietary filters FREE forever; only AI auto-generation/auto-shop gets gated. QA that gating "Build my week" never degrades the free manual Plan flow.
- **Thin-v1.1 vs advertised value prop — DECIDED 2026-06-09/10: hold the paywall until the engine ships.** Auto Plan + Sunday Drop ARE the launch headline, gated on the 1-week dogfood (cooked-rate ≥40%). Pre-committed fallback if the gate fails twice: thin honest paywall (pantry-gen + Decks + budget view), never advertising Auto Plan.
- **Three external secrets unobtained:** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (RC dashboard), `RC_WEBHOOK_SECRET` (`openssl rand -hex 32`), `EXPO_ACCESS_TOKEN` (Expo dashboard). Pin the RC key in `eas.json` per-profile once created (project's invisible-state commandment).
- **App Privacy form** not updated (Purchases → Purchase History Linked; User ID via RevenueCat); RC `PrivacyInfo.xcprivacy` bundling unverified (pod-install pre-flight).

### ✅ Confirmed good
- Client scaffold is security-conscious: `isPremium` sourced only from RC `customerInfo`; kill switch supersedes any entitlement; dev-premium hard-`__DEV__`-guarded; premium UI double-gated; EAS pins the flag OFF for prod/preview. Tests assert real behavior.
- Merge into `main` is mechanically clean (0 conflicts; cook-photos batch disjoint; main's stub hasn't diverged).
- Schema design sound: idempotency table correct; owner-scoped RLS; no plaintext secrets; premium-column hole now closed by the `protect_premium_columns` trigger.

### Critical path (per the approved 2026-06-10 plan — full engine, parallel tracks)
1. ✅ RLS protection trigger (2026-06-02, extended 06-09) · ✅ logout-bleed + ai_usage fixes (`be0e55e`) · ✅ `main` @ `872d5e8` re-merged (`e996362`) → next: apply `add-mori-plus.sql` to prod → fold into `schema.sql`.
2. **Track A (commerce, days 1–3):** install `react-native-purchases` + RC key → M2 webhook + `requirePremium()` → M3 paywall via **RevenueCat Paywalls v2** + `manage-subscription.tsx` (Restore ×2) + EULA → M4 budget gate → minimal churn kit (cancel survey, exit offer, grace push).
3. **Track B (engine, days 2–5):** `recipes.meal_types` Haiku backfill (THE blocker) → `profiles.timezone` + `flavourDna` into `scoreRecipe` → week optimizer `lib/autoPlan.ts` (budget-aware, slot provenance) + `api/auto-plan-week.ts` → Sunday Drop cron + UI + explanations.
4. **Days 5–7:** M8 pantry-gen · M10 Saved Decks · M11 substitution AI · M9 Macro Coach (first to cut).
5. **Week 2:** dev build on device → 1-week dogfood gate (cooked-rate ≥40%) + sandbox IAP pass → M12 policy/manifest → M13 submit as 6.1.0 → M14 phased rollout.

---

## Open Questions

- [ ] **Premium visual cue — avatar ring (deferred 2026-05-29).** Add a subtle moss/gold gradient ring on `AvatarButton` when `isPremium`. Pure client-side off the `isPremium` flag → testable now via the dev toggle, no RevenueCat. Chosen over an alternate Mori+ logo (brand-asset risk — assets locked, PNG-only) and Discover-deck badges (clutter on the editorial surface; Mori is single-player so no social signal). Build after the dev build lands.
- [x] **Sandbox tester created (2026-06-10): `morisandbox1@gmail.com`** (US region). Password is NOT stored here — it's in the user's password manager. Sign it into the device's Sandbox Account slot at purchase time for Layer-3 sandbox purchase testing.
- [ ] Demo video — record after M3 paywall is final
- [ ] App Store screenshots — need 6.7" iPhone screens for Mori+ features (5 screens), reuse existing 4 free-tier screens
- [ ] ⚠️ **IAP review screenshots are DUMMY placeholders (2026-06-10).** Both `mori_plus_monthly` + `mori_plus_annual` reached "Ready to Submit" using placeholder images in the Review Information → Screenshot field (just to clear "Missing Metadata"). **MUST replace both with real paywall screenshots before submitting 6.1.0** — capture from the finished RevenueCat Paywalls v2 screen (M3/A4). A placeholder/irrelevant IAP review screenshot is a Guideline 2.3.3 rejection risk. Pre-submit checklist gate.
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
