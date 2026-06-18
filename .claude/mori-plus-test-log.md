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
| I3 | lib/autoPlan.ts optimizer | ⬜ | | | | | |
| I4 | api/auto-plan-week.ts | ⬜ | | | | | |
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
