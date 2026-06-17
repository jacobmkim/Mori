# Mori+ Flagship Build Plan — Auto Plan + Sunday Drop

*Branch: `mori-plus`. Generated 2026-06-16 from 5 parallel deep-reads of the actual scorer / Plan-tab / schema / taste code. Status: FOR USER REVIEW before any code. Contradictions resolved in favor of the analysis that read the actual code + the locked strategy spec.*

---

## 1. OVERVIEW

**The flagship** is the taste-personalized closed loop: **Auto Plan** ("Build my week" — one tap fills the week's empty dinner slots from the user's saved library + scored catalog, taste-matched, leftover-aware, budget-aware) and **Sunday Drop** (7 *curated catalog* picks pushed every Sunday morning local time — the retention ritual). Both are **catalog-first**: Auto Plan scores existing recipes; Sunday Drop is **0 AI generations** (locked decision — "Sunday Drop = curated, NOT generated"). Auto Plan permits **≤1 Claude gen** as a last-resort fallback only. The paywall gates the **new AI auto-generation surfaces only**; every existing free feature (swipe/save/manual plan/copy-week/clear-week/grocery/Instacart/dietary filters) stays free.

**Dependency graph** (→ = must-come-before):

```
I1 flavourDna→scorer ──┐
I2 timezone capture ───┼──→ I3 lib/autoPlan.ts (pure optimizer) ──→ I4 /api/auto-plan-week ──→ I5 "Build my week" UI + paywall
                       │
I6 checkAiBudget wiring (independent — land any time after I4 establishes the pattern)
                       │
I2 timezone ───────────┴──→ I7 Sunday Drop cron + persistence + push ──→ I8 SundayDropSection reveal UI

I9 dogfood-gate instrumentation ── depends on I5 (provenance written) ── runs the launch-gate measurement
```

- **I1 and I2 are independent leaves** — either first. Recommend I1 first (smallest, de-risks the scorer signal the optimizer reuses).
- **I3 depends on I1** (optimizer wraps `scoreRecipe`, which must already read flavourDna so Auto Plan and Discover rank consistently).
- **I7 depends on I2** (timezone for local-Sunday firing) but NOT on I3/I4 — Sunday Drop is pure catalog scoring via `fetchScoredDeck`.
- **I6 is independent** but parked after I4 so the budget-gate pattern is established once.

---

## 2. INCREMENTS

Each is self-contained, ends at a STOP-and-test checkpoint, ships its own Jest pass. Cadence: one increment → full `npm test` green → STOP for device test → next.

### I1 — Wire flavourDna into `scoreRecipe` — **Size: S**
**Goal:** scorer reads the computed-but-unused `flavourDna` so taste palate influences ranking everywhere (Discover + Auto Plan), as soft bonuses only.
- `lib/api.ts` — extend `scoreRecipe` (currently `lib/api.ts:721-732`, 10 params) with an 11th optional `flavourDna` param. Insert DNA block after the dietary-goal cap (`lib/api.ts:795`), before eating-style. Bonuses small (±~3 total, under the +20 dietary cap). All guarded by `if (flavourDna)` — legacy profiles are a clean no-op.
- **ACTION before coding:** read `api/taste-profile.ts:139-154` to pin the live dimension key names (the two analyses disagreed: `explorer/committed/speed/...` vs `bold_spiced/umami_savory/...`). Key bonuses off the real shape; use `?? 50` default so a key mismatch degrades to neutral, never throws.
- Caller wiring: in `fetchScoredDeck` (`lib/api.ts:939`), extract `const flavourDna = (profile?.taste_profile as any)?.flavourDna ?? null;` once, pass to all four `scoreRecipe` call sites (1025, 1074, 1084, 1102).
- **Jest** (`__tests__/lib/scoreRecipe.test.ts`, extend): high-explorer+non-native cuisine → strictly greater; null DNA → identical to pre-change (regression); unknown keys → no throw. Assert relative ordering, not absolute (scorer uses `Math.random()` at `lib/api.ts:737`).
- **Device check:** Discover with a taste profile → swipes load, no crash; account with no profile → identical to before.

### I2 — `profiles.timezone` capture + migration — **Size: S**
**Goal:** store IANA timezone so Sunday Drop fires at local Sunday morning.
- `supabase/add-profiles-timezone-202606.sql` (new): `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';` + index. **NOT applied to prod yet — this increment applies it.** Fold into `schema.sql` post-apply.
- `lib/api.ts` — `updateProfileTimezone(userId, tz)` (fire-and-forget `.update`).
- `app/_layout.tsx` — on auth ready, call `updateProfileTimezone(userId, Intl.DateTimeFormat().resolvedOptions().timeZone)`. Backfills existing users organically.
- **Jest** (`__tests__/lib/timezone.test.ts`, new): extract pure `localSundayFor(tz, now)` helper (reused by I7); test LA Sunday 08:00 → correct week_start; DST boundary; UTC passthrough.
- **Device check:** cold-launch signed in → `profiles.timezone` is your real zone, not `UTC`. (No visible UI.)

### I3 — `lib/autoPlan.ts` pure optimizer + tests — **Size: L (the risk)**
**Goal:** deterministic, injectable, fully-unit-tested week optimizer — catalog + scoreFn → filled dinner slots. Zero side effects. Full spec in §3.
- Create `lib/autoPlan.ts` exporting `autoPlanWeek(input): AutoPlanResult` (synchronous, pure). Add `AutoPlanInput/Result/Slot` types to `types/index.ts`.
- **Jest** (`__tests__/lib/autoPlan.test.ts`, ~70-100 assertions): fills 7 dinners no-repeat; respects budget cap; prefers saved; cuisine-variety (not all-pasta); leftover chaining w/ explanation; **seedable** (same input+seed = byte-identical); thin catalog → flags `generateNeeded`; dietary pre-filter respected; null-macros don't crash.
- **Device check: NONE** (pure lib). STOP = all tests green + review console-dumped sample-catalog output.

### I4 — `api/auto-plan-week.ts` endpoint (`requirePremium` + 1-gen cap) — **Size: M**
**Goal:** the server gate. Auth → enforce premium → gather scoring inputs → call pure `autoPlanWeek` → fill ≤1 leftover-empty slot with one budgeted Claude gen → return slots + explanation.
- Create `api/auto-plan-week.ts`: `requirePremium(req)` (`api/_requirePremium.ts:50`, throws 402) — **THE SERVER PAYWALL GATE**. `rateLimitUser`. Generate AT MOST 1 recipe for the highest-priority empty slot; `incrementAiUsage` ONLY after a successful persisted gen; gen failure → leave slot empty, never 500 the week.
- `lib/api.ts` — `callAutoPlanWeek(weekStart, dietaryGoals)` client wrapper (throws typed error on 402).
- Add `'auto-plan-week'` to `FREE_AI_LIMITS` (`api/_aiUsage.ts:21`).
- **Persistence decision:** write to `meal_plans.slots` JSONB (NOT a new `auto_plans` table) — reuses the manual flow's existing round-trip (`saveMealPlan` `lib/api.ts:1909`); provenance rides on the slot.
- **Jest** (`__tests__/api/auto-plan-week.test.ts`): no JWT→401; `is_premium=false`→402; premium+full catalog→200, no gen, no increment; thin catalog→≤1 gen, failure→slot empty + no increment + still 200; GET→405.
- **Device check: NONE.** Curl the deployed preview: 401 unauth, 402 free account, 200 premium sandbox.

### I5 — "Build my week" UI + `AutoPlanSheet` + paywall gate — **Size: L**
**Goal:** the visible flagship moment. Plan tab CTA gates on `gateMoriPlus()`, calls the endpoint, shows a preview sheet, writes slots via the existing manual store path.
- `components/AutoPlanSheet.tsx` (new) — loading/preview/error states. Absolute-positioned `Animated.View` overlay (NOT nested `<Modal>` — iOS bug; mirror RecipeDetailModal servings-sheet). Reuse `RecipeCards.tsx`. Buttons: Add all to plan / Send groceries / Regenerate. Colors via `useTheme()`.
- `app/(tabs)/plan.tsx` — CTA in the week-actions row beside free "Copy last week" / "Clear week". `handleBuildWeek`: if slots exist → Alert confirm (replace); else `gateMoriPlus()` (`lib/paywall.ts:80`) → if access → `runAutoPlan`.
- **Write path (Cardinal-rule-safe):** "Add all" calls existing `addSlot()` per slot + `savePlan()` — identical to "Copy last week" (`plan.tsx:351-371`). Auto slots carry `provenance: 'auto_plan'`. Manual flows untouched.
- **TWO GATES, both required:** `gateMoriPlus()` client-side + `requirePremium` server-side. CTA always visible (upsell surface); the *action* gates.
- **Jest:** extend `mealPlanStore.test.ts` (7 auto slots upsert by (day, meal_type), provenance survives serialization); pure `autoSlotsToStoreSlots` mapping.
- **Device check (the big one):** free → tap → paywall → dismiss → plan unchanged (Cardinal rule); premium empty week → loading → preview 7 dinners + explanation → Add all → slots persist; partially-filled → Alert warns → replace/cancel; Regenerate → different; Send groceries → grocery list → Instacart works (free); offline → graceful.

### I6 — Wire `checkAiBudget` into existing AI endpoints — **Size: M**
**Goal:** close the cost hole — free-tier AI is currently unlimited.
- `api/taste-profile.ts`, `api/substitutions.ts`, `api/generate-recipe.ts` — after `requireAuth`, before gen: load profile premium cols → `checkAiBudget(userId, endpoint, isPremiumActive(profile))` → if `!allowed` → 429; after success → `incrementAiUsage`. Use `isPremiumActive` (`_requirePremium.ts:33`).
- `generate-recipe.ts` is admin-seed-only today, so gating removes nothing from users now but makes the future pantry-gen path safe.
- **Jest** (`__tests__/api/aiBudget.test.ts`): free at limit→429, no gen, no increment; free under limit→200 + 1 increment; premium→unlimited; gen throws→no increment.
- **Device check:** free → regen taste profile twice/month → 2nd blocked (limit 1); premium → never blocked.

### I7 — Sunday Drop cron + `sunday_drops` persistence + push — **Size: M**
**Goal:** every Sunday morning local time, a curated (0-AI-gen) 7-recipe pack per premium user, persisted + pushed.
- `api/cron/sunday-drop.ts` (new): `verifyCronAuth` (`api/cron/_auth.ts:12`); fetch premium users w/ push_token + timezone; fire only when `localSundayFor(tz, now)` is Sun 08:00–08:59 their zone; idempotent via `UNIQUE(user_id, week_start)`; **selection = `fetchScoredDeck` top 7, ZERO Claude calls**; `await sendExpoPush` (`api/_pushUtils.ts`); `await flushSentry(2000)` before response.
- `vercel.json` — cron `{ "path": "/api/cron/sunday-drop", "schedule": "0 * * * 0,6" }` (hourly Sat/Sun UTC; per-user local gating inside).
- `lib/api.ts` — `getLatestSundayDrop(userId)` + `markSundayDropOpened(dropId)`.
- **Schema: none** — `sunday_drops` is **already LIVE in prod** (`add-mori-plus.sql:179-203`, applied 2026-06-10). Depends on I2's timezone.
- **Jest** (`__tests__/api/sundayDropCron.test.ts`): top-7 selection; idempotency skip; non-premium/no-token/no-tz skipped; per-user failure caught; cron auth 401; **zero-AI-gen assertion** (no generation client constructed).
- **Device check:** curl the cron w/ CRON_SECRET for a premium sandbox account at its local Sunday 8am → `sunday_drops` row w/ 7 recipe_ids + push arrives; re-invoke → no dup; free account → nothing.

### I8 — `SundayDropSection` reveal UI — **Size: M**
**Goal:** surface the drop. Hero card on Discover for an unopened drop → full-screen reveal of the 7 recipes.
- `components/SundayDropSection.tsx` (new) — hero above Discover deck; shown only if premium AND current-week drop exists AND `opened_at IS NULL`. Loading/empty/error states.
- `app/sunday-drop-reveal.tsx` (new route) — hydrate `recipe_ids` → carousel (reuse `RecipeCards.tsx`) w/ save/cook/cart; "Add all to next week's plan" → existing `addSlot`+`savePlan` (provenance `'sunday_drop'`); mark `opened_at` on first view.
- `app/(tabs)/discover.tsx` — mount `<SundayDropSection />` above the deck.
- **Jest:** pure `shouldShowDropHero(drop, isPremium)`; `dropRecipesToStoreSlots` mapping (provenance `'sunday_drop'`).
- **Device check:** premium w/ unopened drop → hero → tap → reveal 7 → Add all → slots in next week → hero disappears; free → no hero; tap recipe → detail save/cook/cart work.

### I9 — Dogfood-gate instrumentation — **Size: S**
**Goal:** make the launch gate measurable (cooked-rate ≥40% on auto-planned slots over 1-week dogfood).
- Provenance already on the slot (set I5/I8, serialized into `meal_plans.slots`); existing per-slot `cooked_at` (`mealPlanStore.ts:54`) is the cooked signal. **No new table.**
- `scripts/measure-autoplan-cooked-rate.mjs` (new): `cooked_rate = |auto_plan slots w/ cooked_at| / |auto_plan slots|` over the window, per-user + aggregate, broken out by provenance.
- **Jest** (`__tests__/lib/cookedRate.test.ts`): pure `cookedRate(slots)` — all cooked→1.0; none→0.0; mixed provenance; div-by-zero guard→null not NaN.
- **Device check:** over the dogfood week, build a week + cook some planned dinners → run the script → number matches what you actually cooked.

---

## 3. THE OPTIMIZER ALGORITHM (`lib/autoPlan.ts`)

Pure, synchronous, seedable, no I/O.

```ts
export interface AutoPlanInput {
  catalog: Recipe[];               // ALREADY dietary-filtered by caller (I4)
  savedExternalIds: Set<string>;
  scoreFn: (r: Recipe) => number;  // injected: scoreRecipe bound to user's maps + flavourDna (I1)
  mealTypes: MealType[];           // v1 = ['dinner'] only (see Open Decisions)
  days: number;                    // 7
  weeklyBudgetUsd?: number;        // from profiles.weekly_budget; undefined = ignore cost
  leftoversSet?: Set<string>;
  random: () => number;            // injected RNG — Math.random in prod, seeded Mulberry32 in tests
}
export interface AutoPlanResult {
  slots: AutoPlanSlot[]; generateNeeded: number; totalCost: number; explanation: string;
}
```

**Objective:** maximize summed taste score across the week, subject to constraints, with variety/leftover/budget shaping.

**HARD (never relax):** dietary (pre-filtered); meal-type fit (`recipe.meal_types` includes slot type); **no-repeat** (≤once/week); **budget** (running Σ cost_per_serving ≤ budget when set, +5% soft tolerance, warn if over base).

**SOFT (score modifiers — honors "no binary scoring"):** cuisine variety (−2/recipe beyond 2 same cuisine); protein variety (−3 beyond 2 same protein); macro balance (penalize day kcal > weekly-mean×1.3); leftover chaining (+2 if uses an active leftover, cap +6/week).

**Greedy with single-step lookahead** for leftover chaining, NOT full backtracking (7 slots × ~2,400 pool; greedy-by-descending-score is near-optimal + trivially testable). Fill order: dinners first, hardest-to-fill meal-type last.

**Breakfast-thin:** v1 = **dinners-only** (201 breakfast recipes / 7.7% can't fill 7 slots catalog-first). When added (v1.1): fill last; if pool < 3 remaining, shift slot to lunch + note in explanation rather than forcing a gen.

**1-gen rule:** the **pure optimizer never generates** — fills from catalog, reports `generateNeeded`. The **endpoint (I4)** decides whether to spend ≤1 gen. Keeps `autoPlanWeek` pure/testable; centralizes cost discipline server-side.

**Why-explanation:** built from dominant provenance — e.g. *"Built around 4 of your saved favorites, kept dinners varied across 4 cuisines, used your leftover spinach Tuesday. Fits your $50 week."*

**Test seam:** inject `random: () => number` (seeded Mulberry32 in tests → byte-deterministic); pass any "now" as a parameter. Never call `Math.random()`/`Date.now()` directly. For the optimizer's own determinism, inject a **fixture `scoreFn`** in tests (not real `scoreRecipe`, which has its own jitter).

---

## 4. SCHEMA DELTA

| Change | Status | Increment |
|---|---|---|
| `profiles.timezone TEXT DEFAULT 'UTC'` + index | **NOT applied — apply in I2** | I2 |
| `sunday_drops` table (`UNIQUE(user_id, week_start)`, RLS) | **LIVE in prod** (2026-06-10), no change | I7 (consume) |
| `ai_usage` + `increment_ai_usage` RPC | **LIVE in prod** | I4, I6 (consume) |
| `meal_plans.slots` JSONB (+ in-slot `provenance`/`explanation` — no DDL) | **LIVE** | I5, I8, I9 |
| `profiles.is_premium` + premium cols + protect trigger | **LIVE in prod** | I4, I6 (consume) |
| **NO new `auto_plans` table** — reuse `meal_plans.slots` | decision | I4 |
| `weekly_budget` (already `text`, parsed at runtime) | **LIVE**, no migration | I3/I4 |

**Net new DDL for the whole flagship: exactly one migration** (`add-profiles-timezone-202606.sql`).

---

## 5. THE DOGFOOD GATE

**Gate:** cooked-rate on auto-planned slots **≥40%** over a 1-week dogfood, or no submission (decided 2026-06-10).
**Measurement:** every auto-written slot carries `provenance` in `meal_plans.slots`; existing `cooked_at` is the cooked signal. `scripts/measure-autoplan-cooked-rate.mjs` computes `|auto_plan slots w/ cooked_at| / |auto_plan slots|`. Pure `cookedRate(slots)` (unit-tested) so the number is trustworthy.
**If it fails (<40%):** do NOT submit Auto Plan as the headline. Fall back to the **thin honest paywall** (pantry-gen / Decks / budget mode); demote Auto Plan to "beta." Flagship paused, not the launch.

---

## 6. OPEN DECISIONS (need a ruling before building)

1. **Meals/day in v1.** Recommend **dinners-only** (catalog dinner-rich 2,367; breakfast 201/7.7%). Lunch viable (2,495) if wanted. → *dinners-only, or dinners + lunch?*
2. **Overwrite-filled-slots.** Recommend **replace-all on Alert-confirm** (matches Copy-last-week). Alt: merge-empty-only (graceful but complex). → *replace-all, or merge-empty-only?*
3. **Budget hardness.** Recommend **soft +5% overage + warning** (strict caps block too many early weeks). → *soft, or hard cap?*
4. **Sunday Drop count.** Spec says 7. → *confirm 7, or 5?*
5. **Free-tier "Build my week" visibility.** Recommend **always visible** (upsell; tap → paywall; Cardinal-rule-safe — the action gates). → *visible-with-paywall, or hidden?*
6. **flavourDna dimension keys.** Pin by reading `api/taste-profile.ts` before I1 — no ruling needed, just flagged.

---

## 7. SEQUENCE

I1 → I2 (both S, fast wins) → **I3 (the bet — de-risk early)** → I4 → I5 (first chargeable moment, full device test) → I6 → I7 → I8 → I9.
Sizes: 3×S, 4×M, 2×L. The two L's (I3, I5) are the gravity; everything else is plumbing around them.

**Key refs:** scorer `lib/api.ts:721-898`; `fetchScoredDeck` `lib/api.ts:939`; meal-plan persistence `lib/api.ts:1898`/`:1909`; store `stores/mealPlanStore.ts:32-65`; premium gate `api/_requirePremium.ts:50`; AI budget `api/_aiUsage.ts:56,79`; paywall `lib/paywall.ts:80`; live `sunday_drops` `supabase/add-mori-plus.sql:179-203`.
