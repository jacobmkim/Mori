# Mori+ Flagship — Test Log

Living QA record for the Track B flagship build (Auto Plan + Sunday Drop), branch `mori-plus`.
One entry per increment: automated tests, manual device checklist, adversarial-review findings,
and pass status. Maintained as **step 6 of the per-increment loop**:

> code → write Jest tests → adversarial agent review → full-suite gate → device checklist → commit + log

Build plan: [`.claude/plans/mori-plus-flagship-build-plan-2026-06-16.md`](plans/mori-plus-flagship-build-plan-2026-06-16.md)

---

## Increment status

| # | Increment | Code | Jest | Agent review | Suite | Committed | Device-tested |
|---|---|---|---|---|---|---|---|
| I1 | flavourDna → scoreRecipe | ✅ | ✅ 8 | ✅ 3-agent | 933/933 | ✅ `7c40b47` | ⏳ pending user |
| I2 | profiles.timezone capture | ✅ | ✅ 9 | ✅ 3-agent | 942/942 | ✅ `f0a02de` | ⏳ Hermes-Intl gate |
| I3 | lib/autoPlan.ts optimizer | ✅ | ✅ 12 | ✅ 3-agent | 954/954 | ✅ `9703622` | N/A (pure lib) |
| I4 | generateWeekPlan (client) + meal_types | ✅ | deferred→I5 | ✅ 3-agent | 954/954 | ✅ `57a8393` | N/A (no UI) |
| I5 | "Build my week" UI + paywall | ⬜ | | | | | |
| I6 | checkAiBudget wiring | ⬜ | | | | | |
| I7 | Sunday Drop cron + push | ⬜ | | | | | |
| I8 | SundayDropSection reveal UI | ⬜ | | | | | |
| I9 | dogfood-gate instrumentation | ⬜ | | | | | |

Legend: ✅ done · ⏳ in progress / pending · ⬜ not started

---

## I1 — Wire flavourDna (Cook DNA) into `scoreRecipe`
**Commit:** `7c40b47` · **Suite:** 933/933 · **Status:** code done + reviewed; device test pending

### What it does
`scoreRecipe` reads the taste-profile Cook DNA (`explorer / devoted / speed / planner`, each 0–100)
as soft bonuses after the dietary cap. Clean no-op for the ~61/85 profiles without `flavourDna`.
`committed` intentionally omitted (no clean per-recipe signal). Effects ≤ ~3.5 total — break ties,
never dominate (no binary scoring).

### Automated tests — `__tests__/lib/scoreRecipe.test.ts` (8 new)
1. `null` flavourDna is a no-op — **regression guard** (byte-identical to the pre-DNA signature)
2. explorer >65 rewards a non-preferred cuisine (+1.5)
3. explorer does not fire for a cuisine the user already prefers
4. devoted >65 penalizes a non-preferred cuisine (−1.5); **no double-count** on a preferred one
5. speed >65: +1 for ≤25 min, −1.5 for >50 min
6. planner >65: +1 for meal-prep-friendly
7. missing dimension defaults to neutral (no throw, no effect)
8. all bonuses combined stay ≤ the +20 dietary cap (never dominating)

### Adversarial review — 3 agents (correctness / integration-regression / design-commandments)
- 🔴 **FIXED pre-commit (MEDIUM) — devoted double-count.** `devoted` rewarded a *preferred* cuisine
  (+1.5) on top of the existing +3 cuisine match → +4.5 for one signal, over budget. Fix: devoted
  now *penalizes* a non-preferred cuisine (true inverse of explorer); preferred-cuisine loyalty
  stays with the +3. Test #4 updated to assert the new behavior + no-double-count.
- ✅ **Confirmed:** integration clean (all 4 `fetchScoredDeck` call sites wired), backward-compatible
  (optional trailing param), no-op for legacy profiles, purely additive (meal-prep filter / diversity
  pass / saved-cap / dislike+skill filters / adventure injection untouched), no-binary-scoring
  compliant, explorer cannot surface a disliked cuisine (hard dislike filter runs upstream),
  `committed` omission deliberate, field access null-safe.
- 🟡 **Non-blocking (deferred):** speed-DNA + `quick_simple` eating-style reinforcement (intended);
  could shape-validate `flavourDna` and `console.warn` on non-numeric scores instead of silent
  coercion to 50.

### Manual device checklist (STOP-and-test)
- [ ] Account **with** a taste profile → reload Discover, swipe ~10 → loads, no crash, ordering feels taste-consistent
- [ ] Account **without** a taste profile → loads identically (no regression)

> Note: the effect is intentionally subtle (small nudges), so "still works + feels right" is the bar.
> `lib/api.ts` hot-reloads via Fast Refresh; reload the Discover deck to pick up the new scoring.

---

## I2 — `profiles.timezone` capture
**Commit:** `f0a02de` · **Suite:** 942/942 · **Status:** code done + reviewed; migration applied to prod; device test (Hermes-Intl gate) pending

### What it does
Adds `profiles.timezone` (IANA, default `'UTC'`) so Sunday Drop can fire at each user's LOCAL
Sunday morning. Client captures the device zone once per user in `_layout.tsx`; existing users
backfill from `'UTC'` organically. Pure `lib/timezone.ts` (`isValidTimeZone`, `localSundayFor`)
is the seam the Sunday Drop cron (I7) reuses — DST-safe, import-free.

### Automated tests — `__tests__/lib/timezone.test.ts` (9 new)
- `isValidTimeZone`: accepts real IANA zones; rejects junk / empty / null / undefined
- `localSundayFor`: Sunday 08:00 local → that Sunday · local-not-UTC across midnight (west: LA) ·
  local-not-UTC east of UTC (Tokyo: UTC Sat → local Sun) · midweek → prior local Sunday ·
  DST-safe across the spring-forward week · UTC passthrough · invalid-zone → UTC fallback (no throw)

### Adversarial review — 3 agents (date-correctness / RN-runtime-integration / migration-safety)
- ✅ **FIXED with I2 (R2, MEDIUM):** `timezone` was missing from the `Profile` TS interface →
  added `timezone?: string | null` to `types/index.ts` (I7 reads it without a cast).
- ✅ **DONE (R3, MEDIUM):** migration applied to prod + verified (`text default 'UTC'` +
  `profiles_timezone_idx` live) + folded into `schema.sql`.
- 🟠 **R1 (HIGH — device gate for I7, NOT the binary):** `Intl.DateTimeFormat().resolvedOptions()
  .timeZone` on Hermes (Expo SDK 54) may return `"UTC"` instead of the real zone. Degrades safely
  (UTC default → mistimed Drops, no breakage). **Must verify on-device before I7;** if it returns
  `UTC`, layer `react-native-localize.getTimeZone()` ahead of the Intl read.
- ✅ Confirmed: `localSundayFor` DST-safe; migration idempotent + metadata-only (no lock); RLS fine
  (normal user-writable column, not gated by `protect_premium_columns`); errors swallowed; additive
  (no interference with RC identity / dev-premium in the same effect).
- Dropped non-issues: en-US weekday locale (hard-coded both places — safe); fire-and-forget no
  error-check (intentional, matches `touchLastActive` / `updatePushToken`).

### Manual device checklist (STOP-and-test) — **this is the I7 gate**
- [ ] Cold-launch the dev build signed in → `SELECT timezone FROM profiles WHERE id=<you>` →
  shows your **real IANA zone** (e.g. `America/Chicago`) → Hermes Intl works ✅
- [ ] If it shows **`UTC`** → swap to `react-native-localize.getTimeZone()` before building I7

---

## Locked product decisions (2026-06-18, drive I3–I7)
1. **Meals/day v1:** dinners only (catalog dinner-deep; breakfast too thin)
2. **Budget:** soft +5% overage with a warning
3. **Overwrite a filled week:** replace-all with a confirm alert
4. **"Build my week" for free users:** always visible → tap opens paywall (Cardinal-rule-safe)
5. **Sunday Drop count:** deferred to I7 (default 7)

---

## I3 — `lib/autoPlan.ts` pure week optimizer
**Commit:** `9703622` · **Suite:** 954/954 · **Status:** code done + reviewed (ships as-is); no device test (pure lib)

### What it does
`autoPlanWeek(input)` greedily fills the week's slots to maximise taste score under HARD
constraints (meal-type fit, no-repeat, soft +5% budget cap) + SOFT shaping (cuisine/protein
variety, macro balance, leftover chaining, saved-library preference). Pure, synchronous,
seedable (entropy via `input.random`). Honors the 1-gen rule — never generates; flags
`generateNeeded` for the I4 endpoint. Built to the locked decisions above.

### Automated tests — `__tests__/lib/autoPlan.test.ts` (12)
no-repeat fill · thin-catalog → generateNeeded · meal-type fit (lunch-only never fills dinner) ·
budget hard-stops at +5% + `overBudget` flag · no-budget ignores cost · saved +2 preference ·
leftover chaining (used once) + explanation · cuisine variety (not all one cuisine) · protein
variety · seeded determinism (twin-seed byte-identical) · null-macros no-crash · empty catalog.

### Adversarial review — 3 agents (algorithm-correctness / purity-spec / I4-I5-integration)
- ✅ **Optimizer ships as-is.** Positively verified: pure/deterministic/seedable, no input mutation,
  budget no off-by-one, variety penalties correct (count-before-place), macro guard (no div-by-zero),
  leftover used-once, hard gates = exactly the spec'd three, 1-gen rule honored, all edges guarded.
- 🟡 **LOW (deferred to v1.1):** protein heuristic is substring/order-dependent ("chicken stock" in a
  beef dish → 'chicken'). Bounded — soft −3 nudge only, never a gate. Fix = `\b`-boundary regex later.

### ⚠️ Carry-forward TODOs for I4 / I5 (integration — NOT I3 bugs)
- 🔴 **I4 CRITICAL:** the catalog fetch (`lib/api.ts:232` `fetchDiscoverRecipes` SELECT + its map at
  `:262`) omits `meal_types` → at runtime `recipe.meal_types` is `undefined` → meal-type filter
  empties the whole week (`generateNeeded=7`). **Backfill verified live: 2,618/2,618 (2,367 dinners).**
  Fix in I4: add `meal_types` to the SELECT used by the catalog loader + `meal_types: r.meal_types ?? null`
  in the projection.
- 🟠 **I5 HIGH:** `AutoPlanSlot.provenance`/`explanation` don't exist on `MealSlot` (`types/index.ts`).
  Add `provenance?: SlotProvenance` to `MealSlot` (JSONB `slots` needs no migration) — load-bearing for
  the I9 dogfood-gate (cooked-rate by `auto_plan` slot).
- 🟠 **I5 MEDIUM:** map `AutoPlanSlot.recipe` (full `Recipe`) → `MealSlot.recipe_id` + default
  `servings_multiplier: 1`.
- 🟢 **I4 LOW:** bind the 11-arg `scoreRecipe` into the single-arg `scoreFn` closure (by design).

---

## I4 — `generateWeekPlan` (client wiring) + `meal_types` across all fetchers
**Commit:** `57a8393` · **Suite:** 954/954 · **Status:** code done + reviewed (ship-with-fixes; fixes applied)

### Architecture decision
Optimizer runs **client-side** (no server endpoint), per the "local weighted scorer — do NOT replace
with an API call" commandment. `generateWeekPlan()` reuses the deck's scorer + signals; Auto Plan is
catalog-only (no AI, no Mori cost) and premium-gated client-side (I5 paywall). The build plan's
server-endpoint sketch is superseded.

### What it does
`generateWeekPlan({userId, profile, dietaryGoals, savedExternalIds, weeklyBudgetUsd?, mealTypes?, days?})`
gathers swipes/affinity/interactions/pantry/leftovers/ratings/flavourDna (same as `fetchScoredDeck`),
applies dislike + skill hard filters, keeps saved recipes in the pool, binds `scoreRecipe` into `scoreFn`,
and runs `autoPlanWeek`. Returns `AutoPlanResult`.

### `meal_types` made universal (the audit's I4 fix)
All 5 recipe fetchers now SELECT + project `meal_types` (`fetchDiscoverRecipes`, `fetchAdventureRecipe`,
`fetchRecommendedDeck`, `getSavedRecipesWithDetails`, `getRecipesBySupabaseIds`). The audit caught 4
fetchers omitting it — would have silently dropped candidates in I5 hydration / plan-from-saved. Backfill
verified live: 2,618/2,618 (2,367 dinners).

### Adversarial review — 3 agents (correctness-integration / regression-data / architecture-completeness)
- ✅ Verified: scoreFn binds 11 args correctly; dislike + skill filters mirror the deck line-for-line;
  meal_types flows SELECT→projection→fetchDiscoverRecipes→autoPlanWeek; client-side architecture sound
  (zero abuse/cost — local computation over already-fetched recipes); intentional divergences (saved
  stay in pool; recently-cooked uses the soft penalty not the hard exclusion) match design.
- ✅ Applied the must-fixes (meal_types on the 4 other fetchers).
- One lens's "fetchDiscoverRecipes omits meal_types — CRITICAL" was a STALE snapshot — confirmed fixed.

### Test coverage (deliberate)
No `generateWeekPlan` unit test — orchestration over already-tested `autoPlanWeek` (12) + `scoreRecipe`
(tested via Discover) + per-module fetchers. A focused **integration test lands at I5** with persistence
(sandbox user → generateWeekPlan → assert N slots, sensible cost, non-empty explanation, provenance
round-trips through `meal_plans.slots`).

### Deferred (flagged, not forgotten)
- **AI ≤1-gen fallback** — `autoPlanWeek` flags `generateNeeded`; ≈0 with 2,367 dinners. Build when needed.
- **`weekly_budget` is a category** (not USD). No budget enforced unless `weeklyBudgetUsd` is passed. Add
  `weeklyBudgetFromProfile(category)` when budget mode surfaces — do NOT silently invent a mapping.

### What I5 needs (from the review)
1. `provenance?: SlotProvenance` on `MealSlot` (additive, no migration — rides the JSONB `slots`).
2. `autoSlotsToStoreSlots`: map `AutoPlanSlot.recipe.supabase_id` (real UUID, NOT `recipe.id` = external_id)
   → `MealSlot.recipe_id`; default `servings_multiplier: 1`; carry provenance + explanation.
3. `AutoPlanSheet.tsx` (reuse `RecipeCards.tsx`); render partial weeks (null slots → "needs a fresh recipe").
4. The integration test above.

---

## Holistic scrutiny audit (2026-06-21)
Full 4-lens adversarial audit (debug / cybersecurity / integration-regression / completeness) of all
Track B work + prod deploys. **Verdict: solid / ship-safe.** Found + fixed one real bug — duplicate
`MealType` type (`tsc`-breaking, jest-invisible), commit `3920abb`. Security **clean**: deployed webhook
(timing-safe auth, idempotent, IDOR-safe, 401-not-404), timezone migration (non-sensitive, RLS-correct,
premium trigger intact), and the optimizer/scorer (no ReDoS / prototype-pollution) all verified secure.
One standing **launch-blocker** (NOT a session regression): `checkAiBudget` / `requirePremium` are wired
to ZERO endpoints → free tier uncapped + no server-side premium enforcement. Must wire before charging
(I6). Two pre-existing tsc errors remain in unrelated test files (`delete-account.test.ts`,
`pushToken.test.ts`) — out of scope.
