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
| I1 | flavourDna → scoreRecipe | ✅ | ✅ 8 | ✅ 3-agent | 933/933 | ✅ `7c40b47` | ✅ deck OK on device |
| I2 | profiles.timezone capture | ✅ | ✅ 9 | ✅ 3-agent | 942/942 | ✅ `f0a02de` | ✅ real zone (Chicago) |
| I3 | lib/autoPlan.ts optimizer | ✅ | ✅ 12 | ✅ 3-agent | 954/954 | ✅ `9703622` | N/A (pure lib) |
| I4 | generateWeekPlan (client) + meal_types | ✅ | deferred→I5 | ✅ 3-agent | 954/954 | ✅ `57a8393` | N/A (no UI) |
| I5 | "Build my week" UI + paywall | ✅ | ✅ 12 | ✅ 3-agent | 966/966 | ✅ `4cdf8cf` | ✅ user OK 6-22 |
| I5.1 | swap→next-best + learn + readability + modal fix | ✅ | ✅ 8 | ✅ 3-agent | 974/974 | ✅ `c033d37` | ✅ user OK 6-22 |
| I5.2 | whole-week tuning toggles + persist prefs | ✅ | ✅ 7 | ✅ 3-agent | 981/981 | ⬜ pending | ⬜ pending |
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

## I5 — "Build my week" UI + paywall gate + persistence
**Suite:** 966/966 · **Status:** code done + reviewed (ship-with-fixes; all applied); commit + device-test pending

### What it does
Surfaces the Auto Plan engine in the Plan tab. A "Build my week" button (visible only when the
kill switch is on AND viewing the current week) gates free users through the paywall, then runs the
client-side `generateWeekPlan` → `autoPlanWeek` and shows the result in a new `AutoPlanSheet`
(per-day dinner cards + "why this" explanations + over-budget warning + Shuffle/Use-this-plan).
Accepting maps the optimizer slots → `MealSlot[]` (`autoSlotsToStoreSlots`) and **replaces** the
week (confirm alert if filled), persisting via the existing `savePlan`. Pre-hydrates `slotRecipes`
so the plan renders with no "Recipe removed" flash.

### Files
- `types/index.ts` — `MealSlot.provenance?` + `MealSlot.auto_explanation?` (additive, ride the JSONB)
- `lib/autoPlan.ts` — new pure `autoSlotsToStoreSlots()` (maps to real `supabase_id`, drops null /
  unhydratable slots, defaults `servings_multiplier:1`, carries provenance + explanation)
- `components/AutoPlanSheet.tsx` — new, presentation-only (no I/O; plan.tsx owns generate + persist)
- `app/(tabs)/plan.tsx` — button + `runGenerate`/`handleBuildMyWeek`/`handleAcceptAutoPlan` + sheet mount
- `lib/api.ts` — `scoreRecipe` `forPlanning` param (C1 fix); `saveMealPlan` → upsert + `user_id` guard
- `supabase/schema.sql` + prod migration `add_meal_plans_user_week_unique`

### Automated tests (12 new) — 966/966
- `__tests__/lib/autoPlanSlots.test.ts` (8): supabase_id→recipe_id mapping (never external id);
  day/meal_type/provenance/explanation carry-through; default servings; drops null-recipe slots;
  drops missing-supabase_id; empty explanation→null; empty input; JSONB round-trip.
- `__tests__/lib/scoreRecipe.test.ts` (4): `forPlanning` relaxes the session-shown exclusion but
  keeps the active left-swipe exclusion (C1 regression guard).

### Adversarial review — 3 agents (correctness-integration / security-abuse / state-regression)
- 🔴 **C1 CRITICAL — FIXED.** `generateWeekPlan` reuses `scoreRecipe`, which hard-returns `-999` for any
  recipe in `sessionShownIds` (every card shown in Discover this session). An engaged user who browsed
  before tapping "Build my week" got an empty/degraded plan — invisible (session-only, passes cold-launch
  test) and straight at the flagship promise + the I9 cooked-rate gate. Fix: `forPlanning` flag skips the
  *merely-shown* exclusion (a deck-dedup concern, not taste) while keeping the *active left-swipe* one.
- 🟠 **H1 HIGH — FIXED.** `meal_plans` had no `UNIQUE(user_id, week_start_date)`; the replace-all/Shuffle
  loop could create duplicate week rows that later break `getMealPlanForWeek`'s `.maybeSingle()`. Verified
  0 existing dupes → added the constraint (prod migration + schema.sql) → `saveMealPlan` now upserts.
- 🟠 **MEDIUM (state) — FIXED.** Auto Plan is "now"-grounded (leftovers, taste); writing it to a future/past
  week chained spoiled leftovers + lied in explanations. Locked "Build my week" to `weekOffset === 0` —
  also neutralizes the week-change-under-sheet write + the "this week" alert-copy mismatch.
- 🟡 **M1 / M2 / LOW-1 / LOW-2 — FIXED.** Shuffle failure no longer discards a good plan; the Accept
  button's enabled-state uses the same `supabase_id` predicate as the persist mapping; `handleCopyLastWeek`
  now strips `cooked_at` (pre-existing bug: copied weeks were marked cooked) + provenance/auto_explanation
  (keeps the I9 metric clean).
- 🟢 **Security audit — SHIP-SAFE, no CRITICAL/HIGH.** Gate boundary correct (Auto Plan is catalog-only,
  zero AI/server cost → client gating is the right layer; I6 server-gates the AI endpoints). Kill switch
  fully darkens (button hidden + handler no-op + gate no-op + entitlement-false). Cardinal rule intact
  (all existing free flows ungated). Dev-premium `__DEV__`-DCE'd. No IDOR (RLS `auth.uid()=user_id`
  backstops the `existingId` UPDATE; added `.eq('user_id')` defense-in-depth). No JSONB injection.
- ✅ Verified clean by the auditors (not assumed): day-index Mon-first alignment, the `clearSlots →
  addSlot → savePlan` ordering (no zustand race), saved-key consistency, modal layering.

### Manual device checklist (STOP-and-test) — needs the kill switch ON (`EXPO_PUBLIC_MORI_PLUS_ENABLED=true`)
- [ ] **Premium user, current week:** tap "Build my week" → sheet builds 7 dinners + explanations →
  "Use this plan" → week fills, slots hydrate (no "Recipe removed" flash), macros update.
- [ ] **Shuffle** produces a different plan; a Shuffle while a good plan is shown never loses it.
- [ ] **Replace confirm:** with a filled week, accepting prompts "Replace this week?"; Cancel keeps the old plan.
- [ ] **C1 real-world:** browse/swipe Discover first, THEN Build my week in the SAME session → still a full
  7-dinner plan (not empty/thin). This is the core regression — exercise it deliberately.
- [ ] **Free user (toggle dev-premium OFF):** tap "Build my week" → paywall appears; dismiss → no plan built;
  manual planning / Copy last week / picker all still work.
- [ ] **Other weeks:** navigate to next/prev week → "Build my week" button is hidden (manual flows remain).
- [ ] **Persistence:** accept a plan, kill + relaunch → the week reloads with the same dinners + provenance.

### Deferred (flagged)
- A live sandbox-user integration test (generateWeekPlan over real Supabase) stays a DEVICE check — jest
  can't auth/network it. Pure mapping + JSONB round-trip ARE unit-tested; the end-to-end is the checklist above.
- Per-slot "why this" rendering in the Plan-tab slot rows (the data now persists in `auto_explanation`) —
  small follow-up; the sheet already shows explanations.

---

## I5.1 — Swap→next-best + learn-from-choices + readability + the modal regression fix
**Commits:** `c685672` (regression fix) + this one · **Suite:** 974/974 · **Status:** code done + reviewed (all fixes applied); commit + device-test pending

### Context (user feedback this session)
"Let me click recipes when planned to see them" · "make the week easier to read" · "let me alter it —
click to change out the recipe / specify more protein, fewer calories" · "the planning screen is broken,
can't scroll or touch" · "account for dark + light mode" · "learn from the choices the user makes."
User chose (AskUserQuestion): swap = **next-best 1-tap**, tuning = **whole-week toggles**, learning = **yes,
update my taste**.

### Shipped this increment
1. 🔴 **Regression fix (`c685672`):** the Plan screen was frozen — I5 had mounted a 2nd `pageSheet` Modal
   (AutoPlanSheet) on a screen that already had one (the picker); two mounted pageSheet modals freeze iOS
   touches. Fixed: AutoPlanSheet → `fullScreen` + mount-only-when-open, restoring the pre-I5 at-rest modal
   topology. (The codebase already documents this iOS modal class — the filter sheet uses an inline overlay.)
2. **Readability + dark/light:** 72px images, Georgia-italic titles, cuisine·time, the "why this" line,
   calorie/protein chips, day headers — all `useTheme()`-driven (audited: no hardcoded hex on theme surfaces).
3. **Tap-to-view:** tapping a dinner opens RecipeDetailModal (now fullScreen-on-fullScreen → clean stacking).
4. **Swap → next best (1 tap):** optimizer now keeps ranked `alternates` per slot (cap 8); a "Swap" button
   cycles to the next-ranked unused dinner. Pure `nextSlotAlternate` helper. Swapped slots marked `'manual'`.
5. **Learn from choices:** a manually swapped-in dinner logs a Discover-style right-swipe (recordSessionSwipe
   + logSwipe) — fired ONLY on accept, only for distinct swapped-in recipes (≤7 rows/accept, no per-swap spam)
   — so future Auto Plans AND the Discover deck adapt.

### Automated tests (8 new) — 974/974
`autoPlan.test.ts`: alternates populated/capped-8/exclude-pick/meal-type-fit/thin-catalog (3).
`autoPlanSlots.test.ts`: `nextSlotAlternate` first-unused / skip-used / null-when-exhausted / empty+undefined /
ignores-no-supabase_id (5).

### Adversarial review — 3 agents (correctness / security / state-regression). Security: **SHIP-SAFE.**
- 🟠 **HIGH (state) — FIXED.** `swappedInIds` survived a Shuffle → a fresh plan that coincidentally re-picked a
  swapped recipe logged a phantom taste signal. Now reset on Shuffle.
- 🟠 **M1 (correctness) — FIXED.** Optimizer no-repeat keyed on `supabase_id ?? external_id ?? id` but
  swap/persist keyed strictly on `supabase_id` → a card you can't swap that vanishes on accept. Now the pool
  is filtered to `supabase_id`-bearing recipes (displayed == persistable). Latent today (catalog always has it).
- 🟡 **LOW-1 (security) — FIXED.** Swapped slots kept `provenance:'auto_plan'`, inflating the I9 cooked-rate
  gate with user overrides. Swaps now persist as `'manual'`.
- 🟡 **H1 (correctness) — FIXED (comment).** Sort preserves the old pick; softened the overstated comment.
- 🟢 Verified clean by the auditors: RLS scopes the swipe insert (`auth.uid()=user_id`); recipe_id is
  catalog-sourced + FK-guarded; write volume bounded (Set-dedup, accept-time); alternates never persist;
  rotation is length-stable + immutable; nested Swap Pressable doesn't bubble; fullScreen-on-fullScreen
  preview stacking works; dark/light clean.
- 🟢 Accepted-as-is: recordSessionSwipe suppresses a swapped-in recipe from the *spontaneous* Discover deck
  this session (it's now planned — desirable); swap doesn't re-check budget (moot — no budget passed yet).

### Manual device checklist (STOP-and-test) — adds to the I5 list
- [ ] **Dead-screen gone:** open Plan tab → scroll + tap normally (the reported freeze).
- [ ] **Readability:** Build my week → cards are legible (serif titles, images, macro chips) in BOTH light + dark.
- [ ] **Tap-to-view:** tap a dinner → full recipe opens → close → back on the sheet (not dismissed).
- [ ] **Swap:** tap "Swap" → recipe changes to a different dinner, no dupes across the week; repeat until
  "No other match"; tap card still previews (Swap button doesn't open preview).
- [ ] **Learn:** swap a couple dinners → Accept → (optional) confirm a right-swipe row landed for the
  swapped-in recipes; Shuffle-then-Accept does NOT log swaps you didn't make.

### Deferred to I5.2 (next increment)
- **Whole-week tuning toggles** (More protein / Fewer calories / Quicker / Cheaper) — re-bias the optimizer
  + persist last-used so future plans default to them. ✅ DONE below.

---

## I5.2 — Whole-week tuning toggles + persisted preferences
**Suite:** 981/981 · **Status:** code done + reviewed (all fixes applied); commit + device-test pending

### What it does
A "Tune the week" row of 4 toggle chips on the review sheet (More protein / Fewer calories / Quicker /
Cheaper). Tapping one rebuilds the week biased toward it (bounded ≈±4 per toggle — shapes, never dominates
taste). On accept the active toggles persist to `profiles.plan_preferences`, and the next Build defaults to
them ("learn my taste"). Shuffle keeps the active toggles.

### Files
- `types/index.ts` — `PlanTunings`; `AutoPlanInput.tunings`; `Profile.plan_preferences`.
- `lib/autoPlan.ts` — `tuningBias(recipe, tunings)` (NaN-safe via Number.isFinite) applied in the candidate loop.
- `lib/api.ts` — `generateWeekPlan` threads `tunings`; `updatePlanPreferences` (atomic single-column write).
- `components/AutoPlanSheet.tsx` — toggle row + inline re-tune state (no full-screen flicker).
- `app/(tabs)/plan.tsx` — tunings state, default-from-profile, `handleToggleTuning`, req-id-guarded rebuild,
  persist-on-accept.
- Prod migration `add_profiles_plan_preferences` + schema.sql.

### Automated tests (7 new) — 981/981
`autoPlan.test.ts`: each toggle surfaces the right recipe (protein/cal/time/cost); undefined===empty (neutral);
bias is bounded (a +10 taste lead beats a mega-protein recipe); no crash on missing macros/cost/time.

### Adversarial review — 3 agents (correctness / security / UX-state). All findings fixed.
- 🟠 **HIGH (security) — FIXED.** `planPreferences` was nested in `taste_profile`, which the server-side
  taste-profile writers (`api/taste-profile.ts`, `taste-notifications` cron, `ProfileSheet`) WHOLESALE
  overwrite → every taste-profile refresh silently wiped the user's tuning defaults (and a stale-read merge
  could drop `flavourDna`, the scorer's input). Fix: moved to its OWN column `profiles.plan_preferences`
  (atomic write, no read-modify-write, no shared cell with the taste-profile blob).
- 🟠 **HIGH (correctness) — FIXED.** `tuningBias` guarded with `!= null`, which admits NaN/strings from raw
  JSONB → `clamp(NaN)=NaN` → poisoned the candidate score + undefined sort order. Now `Number.isFinite`
  (matches the macro-balance term's `>0` guard).
- 🟠 **HIGH (UX) — FIXED.** Tapping a toggle triggered the full-screen "Building your week…" takeover — the
  chip vanished under the finger ("feels broken"). Now the full-screen state is initial-build-only; a re-tune
  keeps the toggles interactive, shows an inline "Updating your week…" spinner, and dims the day cards.
- 🟡 **MEDIUM (UX) — FIXED.** With toggles now interactive during rebuild, the old `if(autoPlanLoading)return`
  silently dropped taps + had no request sequencing. Replaced with a `genReqId` ref guard so the latest tap
  always wins (stale rebuilds drop their result); footer Shuffle/Accept disabled during a rebuild.
- 🟢 Verified clean: IDOR (RLS `auth.uid()=id` scopes the write; userId from session), no write-amplification
  (persist once per accept, not per toggle), tunings never reach `meal_plans.slots`, determinism preserved
  (bias is pure, pre-jitter), default-from-profile has no wrong-state flash, Shuffle keeps tunings, theming
  clean in light + dark, toggles render even on a thin/empty plan.
- 🟡 Accepted LOW: `plan_preferences` write is untyped JSONB (no Zod) — fail-safe (default-read coerces to
  4 booleans; tuningBias reads literal keys + clamps); a failed re-tune briefly leaves a chip active ahead of
  the unchanged plan (self-heals on next action).

### Manual device checklist (STOP-and-test)
- [ ] Build my week → tap **More protein** → toggles stay put, "Updating…" spinner, week re-ranks higher-protein
  (no full-screen flash). Same for Fewer calories / Quicker / Cheaper.
- [ ] Toggle a couple rapidly → no jank, final plan matches the lit chips (req-id guard).
- [ ] Accept with toggles on → close → Build again → the same toggles are pre-lit (persisted defaults).
- [ ] Shuffle keeps the lit toggles. Toggles legible in light + dark.

### Deferred (flagged)
- Tunings bias Auto Plan only; they do NOT yet re-rank the Discover deck (would need the core scorer to read
  `plan_preferences` — its own change with broad blast radius). Swaps already feed Discover via right-swipes.
- Optional: a Zod schema for `plan_preferences` + making the server taste-profile writers merge-preserving
  (now moot for prefs since it's a separate column, but `flavourDna` clobber-on-stale-read still theoretically
  exists for the taste-profile pipeline itself — pre-existing, out of this increment's scope).

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
