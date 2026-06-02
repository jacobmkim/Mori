# Mori+ — Branch Working Doc

Living doc for the `mori-plus` feature branch. Lean by design — full spec lives at [`~/.claude/plans/i-want-you-to-harmonic-galaxy.md`](../../.claude/plans/i-want-you-to-harmonic-galaxy.md). When in doubt, that file is canonical.

This file is for: progress tracking · branch-specific commandments · env vars · open decisions. Update as work lands.

---

## Status

Branch: `mori-plus` · **rebased onto `main` 2026-05-28 (now main + scaffold, 0 behind)** · Ships as a paid release AFTER free v2.0.0 is live (NOT "v1.1"). `lib/revenueCat.ts` full wrapper reconciled over main's stub during the rebase. **68 Mori+ tests green post-rebase.**

### ★ Converged scope (2026-05-28) — read the plan file's value-prop + CPO/GTM sections first
- **Flagship:** Auto Plan + Sunday Drop (taste-personalized weekly planning that auto-shops) — the only thing no competitor can copy.
- **Planner modes (same engine):** food-waste · multi-diet household · budget.
- **Supporting inputs:** "what do you feel like tonight?" (one-shot, catalog-ranked) · Fridge Cam (utility, demoted) · swipe (free).
- **Macro Coach:** auto-logs from cooked Mori meals (NO photo).
- **CUT:** Snap-your-plate, AI image generation (placeholder for rare net-new), condition/GERD vertical, richer dietary handling, ads.
- **Prereqs before charging (the whole bet = plan quality):** week-level optimizer, `cost_per_serving` 40%→90%, meal-type tags, feed `flavourDna` into ranking, capture `profiles.timezone`.

### ★ Build cadence (2026-05-28, user directive)
**One feature at a time → full test cases → STOP for user to test → next.** Don't batch features. Every unit gets Jest coverage; UI features get a manual test checklist. Hand off at each checkpoint.

| M | Scope | Status |
|---|---|---|
| M0 | Pre-work — schema migration, RC dashboard, EAS env | 🟡 Code shipped (SQL + EAS env pin). Manual steps pending — see below |
| M1 | RevenueCat client (`lib/revenueCat.ts`, init, userStore) | 🟡 Code shipped. Needs `npm install react-native-purchases` + RC API key |
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
- **Trial disclosure copy is verbatim** per plan §9.2 — don't paraphrase. "7 days free, then $39.99/year. Auto-renews unless cancelled at least 24 hours before period end. Cancel anytime in Settings."
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
- `app/_layout.tsx` — RC init ✅ (push token registration was already wired)
- `stores/userStore.ts` — `isPremium` field ✅
- `eas.json` — `EXPO_PUBLIC_MORI_PLUS_ENABLED` pinned to `"false"` ✅ (RC key still TBA)
- `public/index.html` — Mori+ founders section + nav link + meta description ✅
- `app/(tabs)/plan.tsx` — "Build my week" header button
- `app/(tabs)/discover.tsx` — Sunday Drop section + "Cook what I have" entry
- `app/(tabs)/profile.tsx` — Coach + Upgrade rows
- `components/ProfileSheet.tsx` — Manage Subscription row
- `api/generate-recipe.ts` — `checkAiBudget` + `incrementAiUsage` calls
- `vercel.json` — Sunday Drop cron schedule
- `package.json` — `react-native-purchases`, `react-native-purchases-ui`, `expo-server-sdk`
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

---

## Open Questions

- [ ] **Premium visual cue — avatar ring (deferred 2026-05-29).** Add a subtle moss/gold gradient ring on `AvatarButton` when `isPremium`. Pure client-side off the `isPremium` flag → testable now via the dev toggle, no RevenueCat. Chosen over an alternate Mori+ logo (brand-asset risk — assets locked, PNG-only) and Discover-deck badges (clutter on the editorial surface; Mori is single-player so no social signal). Build after the dev build lands.
- [ ] Sandbox tester Apple account credentials — generate + log to 1Password before M13
- [ ] Demo video — record after M3 paywall is final
- [ ] App Store screenshots — need 6.7" iPhone screens for Mori+ features (5 screens), reuse existing 4 free-tier screens
- [x] ~~Founders waitlist landing — separate page on getmori.app or inline modal?~~ Decided 2026-05-03: inline section on `public/index.html` posting to `/api/waitlist` with `name: 'mori-plus-founders'` cohort tag.
- [ ] Apple Privacy Manifest — verify RC's PrivacyInfo.xcprivacy bundles correctly after `npx pod-install` (M13 pre-flight)

---

## See Also

- Full implementation spec: [`~/.claude/plans/i-want-you-to-harmonic-galaxy.md`](../../.claude/plans/i-want-you-to-harmonic-galaxy.md)
- Main project commandments: [`CLAUDE.md`](CLAUDE.md)
- Bug fix log: [`.claude/bugfixes.md`](.claude/bugfixes.md)
- Security hardening reference: [`.claude/SECURITY_HARDENING_IMPLEMENTATION.md`](.claude/SECURITY_HARDENING_IMPLEMENTATION.md)
