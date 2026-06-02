# Mori+ — Subscription Tier Implementation Plan
*v2 — full CLAUDE.md-style spec. Reading time ~25 min. Built to be executed by a future agent without re-derivation.*

---

## ★ THE VALUE PROPOSITION (the spine — every feature serves this or gets cut) — 2026-05-28

**The honest problem with the feature list below:** a subscription does not sell features. It sells *one recurring transformation* worth more than $5/mo every month, such that canceling feels like a loss. A feature pile dilutes that into mush. So: one paying person, one recurring job, one sharp promise.

### Who actually pays (it is NOT "people who like recipes")
The free tier already serves the recipe-browser — they will never pay. The payer is the **busy household cook** (working parent, couple, anyone who cooks most nights and is sick of deciding). Their recurring, daily, painful job: **"what's for dinner, and what do I need to buy?"** — the single most-repeated decision in a home.

### The one promise
> **"You never decide what's for dinner again. Every Sunday, Mori has your week planned — dinners you'll actually like, built around your schedule and what's already in your kitchen — and the groceries are one tap away."**

That is the product. Everything else is in service of it or it's noise.

### Why it's genuinely worth $5 (the value math, not vibes)
- **vs meal kits:** HelloFresh sells a *weaker* version of this (planning + ingredients you don't choose) for **$250–320/mo**. Mori+ sells the planning *brain* — taste-matched, your recipes — and you buy your own cheaper groceries via Instacart, for **$5/mo**. It's the meal-kit brain at ~1/50th the cost.
- **vs your time:** saves ~30 min/week of planning + list-building = ~2 hrs/mo. $5 for 2 hours of your life back = $2.50/hr. Trivial for anyone who values their time.
- **vs the alternative (free Mori):** free lets you plan *manually*. Paid does the planning *for* you and ships it. The lever is "Mori does the thinking," not "more recipes."

### The white space — why only Mori can credibly make this promise
Nobody combines all three:
- **Meal kits** plan + ship, but don't know your taste and lock you to their recipes.
- **Recipe apps** know recipes, but don't plan your week or shop for you.
- **Trackers (Cal AI / MyFitnessPal)** track, but don't cook or shop.
- **Mori** knows your taste (swipe data) × 2,600 tested recipes × Instacart → **taste-personalized weekly planning that auto-shops.** The moat is taste-data × catalog × Instacart — NOT the AI, which is commoditized.

### The whole bet (what makes it work vs fail)
- **WORKS if:** the plan is genuinely good (taste-matched, realistic, uses leftovers) + the Sunday ritual builds a habit + Instacart removes the last friction + personalization compounds (more you use it → better it gets → switching cost).
- **FAILS if:** plans are generic and ignored, the free tier is too close, or users don't cook often enough.
- **#1 risk = Auto Plan quality.** The entire value prop rests on it. De-risk it BEFORE scaling features.

### The disciplined build sequence (value-first, NOT feature-first)
1. **Core-promise MVP only:** Auto Plan (taste + leftovers + time + budget) + Sunday Drop (the weekly ritual) + the existing grocery/Instacart close. Ship Mori+ with *just this*.
2. **Validate the promise:** ≥5% convert? Do users actually cook the planned meals (track cooked-rate on planned slots)? Do they retain past month 1? If yes, the value is real and proven.
3. **Only then expand:** Fridge Cam (acquisition/hype), Macro Coach + Snap-your-plate (second value prop), Generate-from-Pantry, Decks, Family Share. These are expansion bets on a *proven* core, not launch scope.

### The second value prop (different person, same sub — this is EXPANSION, not the lead)
For the **goals-driven user** who already pays for Cal AI / MFP: *"Eat to your macros without the grind — snap your plate, see your gap, get tonight's dinner that closes it."* Real and proven willingness-to-pay, but it's a *second* promise to a *second* user. Leading with it drags Mori into the crowded tracker market where it has no moat. It rides along; it does not headline.

**Everything below (features, architecture, paywall, etc.) is the HOW. This section is the WHY. If a feature doesn't serve the promise above, it doesn't ship in v1.**

### ★ FOCUS GUARDRAIL (2026-05-28 — added after a "are we losing focus?" gut-check)
**Mori is ONE thing: the app that learns your taste and runs your week (discover → plan → shop → cook).** Every idea must be an expression of that or it's a distraction. Applying the test to the market-gap wedges:
- **Food waste · multi-diet household · budget** = **MODES of the one planner** ("plan my week using what's spoiling / for my divided household / under $X"). Same engine, same promise. In-focus — ship as planner constraints, NOT separate products.
- **Meal-kit-refugee** = a *marketing angle*, not a feature. Free leverage.
- **Condition-specific eating (GERD / low-FODMAP / medical diets)** = a **DIFFERENT product** (different category, different content, real medical liability). OUT of focus — do NOT build a condition vertical. Serve dietary needs (incl. GERD) via the **existing dietary-goal + ingredient-dislike + hard-filter engine** over the tested catalog. Do NOT generate condition-specific recipes (quality/liability risk). Broad diets are well-covered by the 2,600 catalog; narrow medical diets are not, and that gap should be filled by *filtering*, not *generating*.
- **Discipline:** the job now is to CONVERGE and lock scope, not add wedges. New feature ideas get measured against "learns your taste, runs your week" — if it doesn't serve that, it waits.
- **Dietary handling — DECIDED 2026-05-28: keep current filters as-is.** Existing dietary goals + ingredient dislikes + hard filters are adequate; do NOT invest in richer restriction/trigger handling now, and do NOT build a condition vertical. (GERD/etc. remain expressible via the existing dislike/filter system if a user sets them up, but it's not a focus area.) Stay on the planner flagship.

---

## ★★ CPO / GTM STRATEGY (deep, data-grounded) — 2026-05-28

### 1. Market & timing — the tailwind is real
- Meal-planning app market **$2.45B (2025) → $2.71B (2026), 10.5% CAGR**; the **AI sub-segment grows 24.6%** ($0.83B→$1.03B). We're in the fast lane of a growing market.
- 65% of category apps charge **$3–12/mo**; **41% of users upgrade within 6 months** — high category willingness-to-pay.
- **Yummly shut down Dec 2024.** Hard signal: *pure recipe discovery/search is not a defensible business.* Winners close the loop (plan→shop→cook) or own a goal (Cal AI). This validates the value-prop-first reframe — Mori must NEVER sell "better recipe search."

### 2. Competitive landscape + the white space
| Competitor | Price | What it does | Mori's edge |
|---|---|---|---|
| **PlateJoy** (closest comp) | ~$8–11/mo ($99/yr) | quiz → weekly plan → Instacart, nutritionist-built | **swipe-trained taste (continuous, behavioral) vs a one-time quiz; 2,600-recipe discovery loop they lack; cheaper** |
| **eMeals** | $10/mo | preset weekly menus → auto list | personalization + a catalog you choose, not fixed menus |
| **Mealime** | $5/mo · $50/yr | 30-min meals, dietary filters | weekly automation + Instacart close + a real taste model |
| **Samsung Food+** | $6.99/mo | group planning, AI cook mode | consumer-first, taste-personalized, not locked to Samsung |
| **Cal AI** (→ MyFitnessPal, $50M ARR) | ~$10/mo | photo → calories | **diagnosis→prescription: we tell you what to COOK + shop, not just what you ate** |

**White space:** nobody combines **swipe-trained taste × a 2,600 tested-recipe catalog × auto-grocery (Instacart)**. PlateJoy is closest but uses a static quiz and has no discovery loop. **Positioning: "PlateJoy that actually knows your taste — and is fun to use."**

### 3. ICP & segmentation
- **Primary payer — the "default cook":** runs the kitchen most nights (working parent / couple / early-career), decision-fatigued, cooks ≥4×/week. Pays for **automation** ("stop deciding").
- **Secondary — the "goals cook":** has a body-comp goal, already pays Cal AI/MFP. Pays for **diagnosis→prescription** (Snap-your-plate → Coach → tonight's dinner). Ride along; don't lead (MFP owns tracking).
- **Not a payer — the "browser":** wants ideas; free tier serves them forever. They are NOT a conversion target — they're the **affiliate + virality base** (see §5).

### 4. Pricing & packaging (benchmarked — there's headroom)
- $4.99/mo is at the **bottom** of the $3–12 band; closest value-prop comps charge **$7–11/mo**. **Test $5.99–6.99/mo**; lead **annual $39.99** (still undercuts everyone; annual = the retention play). Lifetime founders SKU ($79.99, first 60 days) = launch cash + urgency.
- **30-day trial is DATA-VALIDATED:** long trials (17–32d) convert at **42.5%** vs 25.5% (<4d); Apple opt-out trials (subscribe→free→auto-charge) convert **31.4%** vs 8.9% opt-in. The "free month" instinct is correct.

### 5. Funnel + unit economics (the honest model + the key insight)
- Mori is **freemium** (free app already live) → freemium converts ~**2.1% D35** (3–5% good, 8–12% great). Realistic target: **3–5% of MAU → paid**, driven by a strong paywall moment ("your week is ready").
- Of users who *start* the 30-day trial, **~35% convert.** Bottleneck = paywall *trigger* rate, not trial conversion.
- **★ THE KEY CPO INSIGHT — two revenue lines; the free tier is revenue-POSITIVE.** Instacart affiliate (5% of orders) scales with the *entire* base. Rough math: 100K MAU × ~$20/mo to Instacart = ~$2M GMV/mo × 5% ≈ **$100K/mo affiliate** — which *dwarfs* early subscription (100K MAU × 3% × $34 ≈ $100K/**yr**). **Implication: the free funnel IS the business early on; subscription is the margin layer on power users. So GTM should be aggressively top-of-funnel, not paywall-aggressive.** This also de-risks the low freemium conversion rate.
- Push **annual**: monthly churns ~9%/mo (fitness proxy); annual retains ~33%/yr; LTV compounds at the 24-month renewal.

### 6. Retention — where the game is actually won
- #1 churn driver = **goal abandonment (38%)**; #2 = **free alternatives (25%)** — and Mori's own free tier IS the alternative, so paid value must be unmistakably above free.
- #1 predictive signal = **session frequency in first 2 weeks** (<3 sessions/14d → 3–4× churn). **Sunday Drop is the retention weapon** — a weekly push ritual that manufactures the early-habit signal. This is why Sunday Drop matters more than any generation feature.

### 7. GTM motion — run the Cal AI playbook (tailor-made for Mori)
Cal AI hit $50M ARR primarily via **creator saturation**: 150+ micro-creators on retainer (~4 posts/mo each), native UGC (videos hit 43–73M organic views), then layered paid + affiliate. Mori's hooks are *more* demo-able:
1. **"Snap your fridge → dinner"** — the hero one-take UGC demo (video-native magic moment).
2. **"My Flavor DNA"** — already-shipped shareable card; the organic share loop.
Motion: train a fresh TikTok algo on food/cooking creators → systematic micro-creator outreach (food / college / parent / fitness) → retainer + affiliate (give-a-month/get-a-month) → layer paid on proven creatives. **#1 acquisition strategy; also feeds the affiliate revenue engine.**

### 8. North Star + guardrails
- **North Star: weekly cooked meals per active user** — captures the full loop (discover→plan→cook) and predicts BOTH retention and Instacart GMV.
- Guardrails: trial-start rate · trial→paid · **D14 session frequency** (the churn predictor) · free→paid % · Instacart GMV/MAU · blended ARPU (sub + affiliate).

### 9. Sequenced roadmap (value × evidence × build-cost, grounded in the code audit)
- **Wave 1 — the wedge (prove the promise):** Auto Plan + Sunday Drop + Instacart close. ⚠️ Requires the **week-level optimizer the scorer lacks today** (macro/budget/meal-type/variety/spacing constraints) + `cost_per_serving` backfill (40%→90%) + meal-type tagging + feeding `flavourDna` into ranking. *This is the real build; everything rests on plan quality.* Validate ≥3–5% conversion + D14 habit before expanding.
- **Wave 2 — acquisition/virality:** Fridge Cam (hero UGC) + amplify the existing Flavor DNA card → powers the creator motion + affiliate base.
- **Wave 3 — second ICP:** Macro Coach + Snap-your-plate (diagnosis→prescription) — rides proven Cal AI demand without fighting MFP on tracking.
- **Wave 4 — retention/expansion:** Family Share, Saved Decks, Substitution AI.

### 10. Risks & de-risking
| Risk | De-risk |
|---|---|
| **Auto Plan quality** (the whole bet) | Build the week-optimizer + data backfill BEFORE charging; dogfood; measure cooked-rate on planned slots |
| Low freemium conversion (2.1%) | Lean on affiliate (free tier is revenue-positive); paywall moment = "your week is ready"; push annual |
| Free tier cannibalizes paid (25% of churn) | Keep the gap sharp: free = manual; paid = automated + Sunday Drop ritual |
| Cal AI / MFP own tracking | Don't compete on tracking; own cooking + the grocery close |
| Creator CAC inflation | Start with affiliate + retainer micro-creators (Cal AI proved organic upside) before paid spend |
| Catalog gaps for planning | Backfill cost_per_serving + meal-type tags; these are prerequisites, not nice-to-haves |

---

## ★ FLAGSHIP CORRECTION — 2026-05-28

**A commoditized AI trick cannot be the flagship.** Fridge-photo→recipe apps already exist; Cal AI/MFP own photo→macros. Leading with either makes Mori a me-too. **DEMOTED:**
- **Fridge Cam** → supporting utility inside Generate-from-Pantry. NOT the headline.
- **Snap-your-plate** → supporting input to Macro Coach. NOT a flagship.

**THE FLAGSHIP = the taste-personalized closed loop (Auto Plan + Sunday Drop):** *"Mori learns your taste from swipes, plans your week from food it knows you'll like, and ships the groceries."* Defensible because only Mori has swipe-trained taste × 2,600 tested recipes × Instacart together. The flagship is the **promise**, not a trick.

**Differentiated viral hooks** (camera can't be it): (1) Flavor DNA card [shipped], (2) "watch Mori plan my whole week in one tap," (3) the swipe mechanic. All uniquely Mori + demo-able.

---

## ★ EDGE-CASE VERIFICATION — Auto Plan + Sunday Drop (the flagship) — 2026-05-28

### Auto Plan edge cases
| # | Edge case | Required handling |
|---|---|---|
| 1 | **Cold start** — new user, <5 swipes, `taste_profile = NULL` | Fall back to onboarding prefs (dietary_goals, cuisine_preferences, eating_style) + `recipe_cohort_affinities` + popularity. Must still produce a usable plan, never an empty/error state. |
| 2 | 0 saved recipes | Use catalog + scorer only; toast "save more to personalize." |
| 3 | Dietary conflict (vegan goal + saved dairy recipe) | Existing hard filter excludes (lib/api.ts ingredient/dietary gates). |
| 4 | Week already full | Offer "Replace week?" confirm OR disable with tooltip. Never silently overwrite. |
| 5 | **Budget unsatisfiable** (weekly_budget too low for any valid week) | Relax constraint + show the gap ("couldn't stay under $X — closest is $Y"). Never return empty. |
| 6 | **`cost_per_serving` missing (~60% of catalog)** | PREREQUISITE: backfill to ≥90% before budget mode ships. Until then: budget mode excludes no-cost recipes OR estimates; never silently ignore budget. |
| 7 | **No meal-type tags exist** → breakfast recipe in a dinner slot | PREREQUISITE: add meal-type tagging (title/ingredient heuristic + curation) before launch. |
| 8 | **Variety failure** (4 pasta dinners) | Week-optimizer needs cuisine-spacing + "max 1 repeat/week" constraint (scorer lacks this today). |
| 9 | Macro target unreachable from catalog | Best-effort + surface the gap; never fabricate. |
| 10 | Recipe in plan later soft-deleted from catalog | Replace silently with next-best on next load. |
| 11 | Fallback-generation API failure/timeout (>10s) | Degrade gracefully to catalog-only plan; never block the whole week on one slot. |
| 12 | User cancels Mori+ mid-week | Already-generated plan persists (it's just data); no NEW auto-plans. Server re-checks `is_premium` on generate. |
| 13 | Leftovers expired in reality but not dismissed | Use `ingredient_storage` non-expired window only. |
| 14 | Concurrent generation (double-tap / two devices) | Idempotency key (user+weekStart+inputs hash); lock or return cached. |
| 15 | Time budget too aggressive (15 min) → no matches | Loosen to next bucket + toast; never empty. |
| 16 | **Plan quality is generically bad** (the #1 risk) | Instrument cooked-rate on planned slots; treat <X% as a launch blocker; dogfood before charging. |

### Sunday Drop edge cases
| # | Edge case | Required handling |
|---|---|---|
| 1 | **Timezone for 9am-local delivery** | GAP: confirm/capture `profiles.timezone` (`Intl.DateTimeFormat().resolvedOptions().timeZone` on app open). Cron runs hourly Sat–Sun UTC, fires per user-local Sunday 9am. |
| 2 | User subscribed Saturday | First drop fires Sunday automatically. |
| 3 | User cancelled Saturday | Cron re-checks `is_premium` at fire time → skip. |
| 4 | Push permission denied | Drop still generated + visible in-app; no notification. |
| 5 | Multiple devices / push tokens | Store array; send to all; clear `DeviceNotRegistered` tokens. |
| 6 | Dormant user (no opens 30d) | Still cheap (curated, no generation) but pause the *push* to avoid annoyance; win-back cron owns re-engagement. |
| 7 | Idempotency | `UNIQUE(user_id, week_start)` blocks double drops. |
| 8 | Cold-start user (no taste data) | Curated-popular + onboarding-pref fallback. |
| 9 | **Catalog exhaustion** (power user has seen/cooked most relevant recipes) | Widen pool; allow re-surfacing past favorites with a cooldown; never ship an empty/repeat-heavy drop. |
| 10 | DST shift | Compute user-local dynamically each week (don't hardcode UTC offset). |
| 11 | Per-user generation failure in the batch | try/catch per user; continue batch; Sentry log. |
| 12 | Drop is now **curated (no generation)** | Cost ≈ $0; the earlier per-user-generation cost concern is void. |

### Confirmed prerequisites before charging (all rest on plan quality)
1. **Week-level optimizer** (macro target + budget + meal-type routing + cuisine variety + prep-time spacing) — the scorer does NOT do this today; it ranks single cards.
2. **`cost_per_serving` backfill** 40% → ≥90%.
3. **Meal-type tagging** on the catalog.
4. **Feed `flavourDna` into ranking** (today it's display-only).
5. **`profiles.timezone` capture** for Sunday Drop local delivery.

---

## CORRECTIONS & DECISIONS — 2026-05-28 (read first; supersedes stale references below)

The body of this plan was written before v1 shipped. These corrections override it:

> ### ⏩ UPDATE 2026-06-01 (read before the 2026-05-28 items below — these supersede them)
> - **Trial = 30-day, locked by user.** The body §9.1/§9.2/§12 originally said "7 days free" — those strings have now been corrected to 30-day throughout this spec. The 30-day figure is the data-backed choice (long trials convert ~42.5% vs ~25.5%). Whatever Introductory Offer is configured in App Store Connect MUST match the disclosed string exactly (Guideline 3.1.2). Do NOT reintroduce a 7-day number anywhere.
> - **v2.0.0 is LIVE on the App Store.** Item 1 below said "don't start Mori+ in earnest until v2.0.0 is in the store" — it now is. The precondition is satisfied; Mori+ is the active next release.
> - **Branch state (item 2 below is stale).** The scaffold is on `mori-plus` at HEAD `a096fd6` (not `11b0d70`, which is an orphaned pre-rebase commit), and the branch is **3 behind / 8 ahead of `main`** (not "~13 behind"). Merge into `main` is mechanically clean (0 conflicts).
> - **Live build status is at ~13% of a chargeable product** (client scaffold only; no paywall, no server gate, IAP SDK not installed, plan-quality engine ~0%). The authoritative, continuously-updated status + ranked blockers now live in [`Claude-mori+.md`](../../Claude-mori+.md) → "Audit Findings & Open Blockers (2026-06-01)". Treat that section as current truth; treat this spec as the strategy/why.

1. **Version sequencing.** This plan says "v1.1 ships Mori+." Wrong. v1 has been live (US+CA) since 2026-05-05; the next free release is **v2.0.0** (shareable recipes, counters, creator badges, Plan Tab v2, etc. — already on `main`). **Mori+ ships AFTER v2.0.0 is live**, as its own paid release. Everywhere this doc says "v1.1," read "the Mori+ release, after v2.0.0." Don't start Mori+ build in earnest until v2.0.0 is in the store.

2. **Branch state.** All Mori+ scaffolding (full `lib/revenueCat.ts` wrapper, `supabase/add-mori-plus.sql`, 68 tests, `Claude-mori+.md`, landing-page founders section) is on the **`mori-plus` branch at commit `11b0d70`**. That branch is now **~13 commits behind `main`** — rebase onto `main` and reconcile against the `lib/revenueCat.ts` stub on `main` before resuming.

3. **Creator payout is DECOUPLED from Mori+ launch.** Mori+ ships with `referred_by_code` attribution-only; the TikTok creator revenue-share payout flow is deferred to v2.1+. Launching the paywall does NOT trigger a payout obligation. Do not build payout infra as a Mori+ blocker.

4. **NEW prerequisite milestone — M(-1) Business/Legal, BEFORE M0.** The real first step isn't the schema; it's the business setup, which has lead time and (Paid Apps Agreement) is near-irreversible:
   - Confirm Apple account type (App Store Connect → Membership: Individual vs Organization).
   - Decide entity: ship as **sole proprietor** is fine to start (an LLC is tax-neutral by default — SMLLC = disregarded entity = Schedule C + full SE tax; the tax lever is an **S-corp election**, worth it only above ~$60k net profit). Form an **LLC around Mori+ launch** for the liability shield (payments + user data + health-adjacent "coach"). LLC timing is NOT a hard deadline: apps with active subscriptions CAN be transferred (shared-secret handoff; RevenueCat handles most of it), so individual→LLC can happen before or after launch.
   - Apply to **App Store Small Business Program** early (15% vs 30%; calendar-year application).
   - Sign **Paid Apps Agreement + W-9 + Banking** (personal bank account is fine for an individual) — only when committed to shipping the paid binary (near-irreversible).
   - Consult a CPA on entity + S-corp timing for the actual numbers. (This plan is not legal/tax advice.)

5. **Free-tier ad monetization — CANDIDATE (not committed).** If pursuing ads: use **rewarded video gated to the free AI limits** ("watch ad → +1 generation this month") — 5–10× banner eCPM, opt-in (no brand damage), and doubles as a Mori+ on-ramp. AVOID generic display/banner ads in editorial surfaces (low yield ~$5 iOS CPM × 27–31% ATT opt-in, high brand cost). Sponsored ingredients (Appendix A) remains the preferred native option. Mori+ removes all ads. Adds ATT prompt + privacy-label overhead.

6. **Free tier got richer (v2.0.0), so the paywall bar rose.** Re-validate willingness-to-pay with a THIN Mori+ (Auto Plan + Sunday Drop + unlimited generation) before building Macro Coach / Decks / Family Share. This strengthens the minority view in Appendix B.

---

## RUNDOWN — What Mori+ provides, how, justification, expansion (2026-05-28, grounded in current `main`)

### A. What Mori+ provides
Single `mori_plus` entitlement. 30-day free trial → $4.99/mo or $39.99/yr (+ optional $79.99 lifetime founders SKU). Eight paid features — **all confirmed net-new vs the current free app** (no overlap, verified against `main`):

1. **AI Auto Plan ("Build my week")** — fills the week's empty slots from saved library + leftovers + pantry + macro targets. (Plan tab is sophisticated but 100% manual today.)
2. **Sunday Drop** — 7 personalized recipes pushed every Sunday. (Push infra already wired; needs a new cron.)
3. **Generate from Pantry/Leftovers** — recipes from what you already have. (Leftovers feed the scorer today but there's no generation entry point.)
4. **Macro Coach** — goal setting + daily gap suggestions + weekly review. (Macros are passive-display only today; zero coaching.)
5. **Unlimited AI generation** — free is capped (see caveat B2).
6. **Saved Decks** — named filter presets. (Filters are stateless today.)
7. **Family/Shared Plan** — v1.2.
8. **Contextual Substitution AI** — beyond the static `lib/substitutions.ts` table.

(Ad-free perk is now moot — we decided no ads.)

### B. How we achieve it
- **RevenueCat** for IAP + entitlements. Scaffold (`lib/revenueCat.ts`, 68 tests, `supabase/add-mori-plus.sql`) is on `mori-plus` @ `11b0d70` — **rebase onto `main` first** (~13 behind) and reconcile vs the `lib/revenueCat.ts` stub on `main`.
- **Two-tier gate:** client UI off `Purchases.getCustomerInfo()`; server (expensive endpoints) off `profiles.is_premium` synced via `/api/rc-webhook`.
- **New endpoints:** `/api/auto-plan-week`, `/api/generate-from-pantry`, `/api/macro-coach`, `/api/cron/sunday-drop`, `/api/rc-webhook`. **Push infra already exists** (`api/_pushUtils.ts` + token registration in `_layout.tsx`) — Sunday Drop just needs a cron.
- **Schema** already written (`add-mori-plus.sql`): `is_premium` + cols, `ai_usage`, `sunday_drops`, `macro_goals`/`macro_logs`, `decks`, family tables.
- **Business/legal prereqs: DONE** (Paid Apps Agreement, W-9, banking, Small Business enrollment). Remaining: create the 3 IAP products, update App Privacy, build binary from rebased branch, submit binary + IAP together.

### C. Is it justified? Yes — with two caveats the audit surfaced
**Differentiation:** ✓ all 8 features net-new; the rich v2.0.0 free tier raises the bar but Auto Plan + Sunday Drop clearly clear it.
**Margin:** ✓ Haiku generation ≈ $0.004/recipe; RevenueCat free under $2.5K MTR; 15% Apple cut → net ≈ $3.39/mo, $34/yr. COGS stays <20% even for power users.

**⚠️ Caveat B1 — generated recipes have NO image today.** `api/generate-recipe.ts` returns `image_url: null`. Sunday Drop ("7 personalized recipes") and pantry-gen will look broken in an image-driven UI. Decision needed: add `gpt-image-1` generation for Mori+ recipes (≈$0.04–0.06/image → Sunday Drop ≈$1.70/user/mo at 7/wk, still fine vs a $5 sub and a real quality differentiator) **or** ship text-only generated cards (cheaper, worse UX).

**✅ Caveat B2 — RESOLVED (was based on a wrong premise).** Re-audit (grep for `generate-recipe`): `/api/generate-recipe` is **only called by admin seed scripts** (`scripts/generate-recipes.mjs`, `scripts/generate-new-recipes.mjs`) + tests — **never from the client.** There is NO user-facing AI generation in the app today. So there is **no takeaway risk** — gating AI generation behind Mori+ removes nothing users have. AI generation is **net-new for users**, making it a clean paid feature. Open sub-decision: give the free tier a small *monthly taste* (e.g. 3/mo) as a paywall on-ramp (that's *adding* a capability, pure upside) vs. Mori+-only. The original "3/month" number is fine — it just isn't a cut, it's a free sample.

**CONFIRMED DECISIONS (2026-05-28 rundown):**
- ✅ **Budget-aware planning** — IN Mori+ v1 scope. Wire the dormant `weekly_budget` field into Auto Plan (plan to a $ target + running cost). New paid sub-feature of Auto Plan.

**MAJOR REFRAME (2026-05-28) — catalog-first, generation as a narrow tool, NOT the headline.**
Prompted by "why would people want to generate recipes?" Honest answer: for Mori specifically, generation is a *weak and risky* headline — the moat is 2,600+ curated, tested, imaged, reviewed recipes; a generated recipe is untested/unrated/imageless and risks a "Mori told me to cook this and it was gross" 1-star. Generation only earns its keep where the catalog *physically can't* answer the question. New positioning of the AI features:
- **Sunday Drop = curated, NOT generated.** 7 recipes hand-picked from the catalog (scorer + taste profile + season) for this user. Trustworthy, already imaged, showcases the library. (Cuts most `gpt-image-1` cost — catalog recipes already have images.)
- **Auto Plan = catalog-first.** Fill the week from saved + catalog via the scorer; generation only as a last-resort fallback when nothing fits. Value = automation, not invention.
- **Generate-from-Pantry = the ONE place generation is the point.** "I have salmon + broccoli + lemon, feed me tonight without shopping." Catalog can't cover arbitrary on-hand combos. Value = "cook what you have / reduce waste," generation is just the mechanism.
- **Macro Coach = guidance, no generation.**
- Mori+ value prop becomes **"automation + curation + coaching, powered by a catalog you trust"** — generation is a narrow pantry tool. "Unlimited AI generation" drops from a headline lever to a minor pantry-gen allowance.
- ⛔ **AI images — REVERSED 2026-05-28 (was "add gpt-image-1").** Under the catalog-first reframe, Sunday Drop + Auto Plan use **existing catalog recipes that already have images** — nothing is generated. The ONLY place a net-new recipe is created is the Fridge Cam / pantry **fallback** (when the 2,600-recipe catalog can't match the user's exact on-hand ingredients), which is rare. In that "feed me now" moment, a 5–10s `gpt-image-1` render is the wrong call (latency + cost). **Decision: NO image generation. Use an instant styled placeholder** (branded/cuisine-tinted card) for the rare net-new recipe. Net result: **nobody waits on image generation; all visuals come from the catalog.** Removes a cost + build + latency path entirely.
- ✅ **Free pantry-gen taste** — free tier gets **1 Generate-from-Pantry/month** (pure-upside on-ramp, no takeaway); Mori+ = unlimited. Confirmed default.

### FINAL Mori+ OFFERING (post-reframe, 2026-05-28)
Value prop: **"Automation + curation + coaching, powered by a catalog you trust."** Single `mori_plus` entitlement, 30-day trial, $4.99/mo · $39.99/yr (+ optional lifetime founders SKU).

| Feature | Mechanism | Free tier |
|---|---|---|
| **Auto Plan ("Build my week")** | catalog-first (saved + scorer); budget-aware via `weekly_budget`; generation only as fallback | ❌ |
| **Sunday Drop** | 7 **curated** catalog picks, pushed weekly (existing push infra) | ❌ |
| **Generate-from-Pantry** | the one true generation feature + `gpt-image-1` image | 1/month taste |
| **Macro Coach** | goals + gap suggestions + weekly review (guidance, no generation) | ❌ (passive macros stay free) |
| **Saved Decks** | named filter presets | ❌ |
| **Family/Shared Plan** | v1.2 | ❌ |
| **Substitution AI** | contextual subs | static table stays free |

Free tier keeps everything it has today (swipe, save, plan, grocery, Instacart, passive macros, leftovers, reviews, badges) — **nothing removed.** No ads.

### HYPE FEATURES (2026-05-28)
- **Flavor DNA shareable card — ALREADY SHIPPED, do not rebuild.** `components/ProfileSheet.tsx` captures the taste card via `captureRef` (react-native-view-shot, line ~120) + shares PNG via `Sharing.shareAsync`. It's a free viral loop today. (Could later add a Mori+ "deep"/animated version, but the base exists.)
- **🥕 Fridge Cam (photo → dinner) — FLAGSHIP Mori+ hype feature.** Snap your fridge → vision IDs ingredients → **user confirms/edits** → catalog-first match (generate only as fallback) → 3 dinners ranked by fewest-missing → Instacart "buy what's missing."
  - Pipeline: camera (`expo-image-picker`, in deps) → new `/api/scan-fridge` (Claude vision; Anthropic SDK already installed) returns `[{ingredient, confidence}]` → reuse `lib/imageUpload.ts` validation + the existing scorer/catalog + Instacart. Vision cost ~$0.01–0.03/scan.
  - **Confirm/edit step is non-negotiable** — fridge photos are hard (jars/packaging/occlusion); vision will miss items. "AI + you, fast" beats "perfect AI."
  - **Honest moat:** the vision is commoditized (competitor fridge apps exist). Mori wins on **tested catalog + taste personalization + Instacart close**, NOT on the camera. Position as "Mori knows what to *do* with what's in your fridge." Build for hype + funnel + Generate-from-Pantry supercharge, not as a tech moat.
  - Free: 1 scan/month (taste); Mori+: unlimited.
- **"What do you feel like tonight?" (Describe-your-craving) — user likes this; upgraded spec 2026-05-28.** Natural-language input → returns **tested catalog recipes ranked by the user's taste profile** (NOT generic AI-invented recipes) → one tap to add-to-tonight's-slot or send to Instacart.
  - **Differentiation:** a generic recipe chatbot *invents* (untested, no image); Mori's *surfaces your tested catalog, personalized.* The chat is a natural-language front door to the taste-matched catalog + closed loop — the part competitors can't copy. Catalog-first; generate only as a rare fallback (like Fridge Cam).
  - **Role:** the "tonight / right now" counterpart to Auto Plan's "whole week." Same promise (never decide dinner), in-the-moment moment. **Supporting input, NOT the flagship** (a chat interface is a commodity; the catalog+taste underneath is the value).
  - **Build shape — DECIDED 2026-05-28: one-shot.** Single text box "what are you feeling tonight?" → ranked catalog matches. NOT a multi-turn chatbot. Fast, hard to disappoint, ~90% of value. Revisit conversational only if data shows demand.
  - **Edge cases:** unsatisfiable query → graceful "closest matches, nothing exact"; contradictory constraints ("keto but pasta") → honor hard filters, surface the conflict; dietary/dislike hard filters always respected; resist generation (catalog-first).
- **📸 "Snap your plate" — CUT 2026-05-28 (user insight; correct).** Photographing a finished meal to get macros is **redundant** for Mori-cooked food (Mori already knows the recipe's macros via "mark cooked") and only adds value for *off-Mori* food (restaurants/snacks) — which is exactly Cal AI / MyFitnessPal territory we've chosen NOT to compete in. Redundant where we're strong, commoditized where we're weak → cut.
  - **Macro Coach input is the COOK LOOP, not a camera.** Cook a Mori recipe → mark cooked → macros auto-log (data we already own) → Coach does gap analysis → tomorrow's dinners to close it. Frictionless (no manual logging — the #1 tracker-churn driver), differentiated (Cal AI has no cook loop), honest scope: **Mori coaches your *cooking*, not your entire diet** ("hit your protein through the dinners you actually make"). Optional manual entry for the occasional off-Mori meal; no photo path.

### Mori+ identity (consolidated)
**"The cooking app you point your camera at."** Fridge → what to cook (Fridge Cam). Plate → what you ate + what to cook next (Snap-your-plate → Macro Coach). Underneath: **automation + curation + coaching, powered by a catalog you trust.** Borrowed hype mechanics (fridge-scan, Cal-AI photo-macros); defensible on Mori's moat (2,600 tested recipes + taste profile + Instacart close), never on the commoditized vision.

### D. Is there more we can add? (ranked by fit; don't add all)
1. **Budget-aware planning — STRONGEST.** `weekly_budget` is confirmed **collected-but-unused**. Plan a week to a $ target with running cost; reuses dormant data, distinct pain, stacks on Instacart. Add to Mori+ v1.
2. **Meal orchestration / smart timers** — "start the rice at 6:42 so it all plates at 7:00." Uses existing step data; nails "kitchen autopilot"; Cook Mode has no premium hook yet. Best "wow" for a follow-up update.
3. **Seasonal / in-season bias** — cheap prompt-context add to Sunday Drop + Auto Plan; keeps the weekly cadence feeling alive.
4. **Gift Mori+ / referral (give a month, get a month)** — growth loop, cheap via RC.
5. **Restaurant-dish recreation** — "make the pad thai you keep ordering." Marketing hook, AI-gen-heavy; fun but optional.

**Discipline:** ship Mori+ with the 8 core + **budget-planning** (data's already there). Hold orchestration for a "wow" update and the rest until conversion (≥5%) is proven.

---

## 0. TL;DR (decision summary, re-entry-friendly)

| Decision | Choice | One-line reason |
|---|---|---|
| Launch sequence | v1.0 ships free as currently submitted; **v1.1 ships full Mori+** (NOT phased across v1.1/v1.2/v1.3) | Apple reviews the binary; building in background means full feature set is ready, and a feature-rich paywall converts much better than a thin one |
| Subscription platform | **RevenueCat** | Free until $2.5K MTR; abstracts StoreKit; webhook → Supabase sync; Apple-Privacy-Manifest-compliant out of the box |
| Entitlement | Single `mori_plus` boolean | Simpler than per-feature entitlements; matches paywall messaging |
| SKUs | Monthly $4.99 · Annual $39.99 (default-selected) · Lifetime $79.99 (founders, first 60 days only) | Annual nets ~$34/yr after Apple cut; lifetime captures whales + funds launch |
| Apple cut | 15% (Small Business Program — Mori qualifies under $1M/yr) | Net ~$3.39/mo on monthly, ~$33.99/yr on annual |
| Free tier | Unlimited swipe + plan + grocery + Instacart; **3 AI gens/month, 1 pantry-gen/month**; passive macros only; sees sponsored content (deferred) | Free product stays fully cookable; budget gates only on AI |
| Paid features | Auto Plan · Sunday Drop · Macro Coach (with Apple Health) · Unlimited AI · Saved Decks · Family Share · Substitution AI · Ad-free | Time-saving features, not content-gating |
| Paywall | Single full-screen modal · NO toggle · 3 SKU cards · Restore + Privacy + Terms in footer · trial disclosure under CTA | Toggle paywalls banned by Apple Jan 2026; layout matches RevenueCat's pre-vetted templates |
| Pre-launch traffic | v1.0 captures email waitlist for Mori+ Founders → first 60 days of v1.1 = lifetime offer | Bootstraps revenue + creates launch event |

---

## 1. Context

Mori is a swipe-based recipe discovery app currently in TestFlight Beta App Review. Zero payment infrastructure exists today. Goal: introduce a paid tier that monetizes the AI-heavy features (recipe generation, meal planning, macro coaching) while protecting the free swipe + plan + grocery + Instacart core that drives the funnel.

The Instacart affiliate program is already live (5% of orders); subscription revenue stacks on top of it.

**What this plan covers:** every architectural piece, every Apple compliance requirement, every paywall element, every edge case I could think of, every policy/legal change, and the App Store submission strategy.

**What this plan does NOT cover:** sponsored ingredients (stashed → Appendix A); Android/web parity (out of scope for Mori); marketing creative beyond launch event.

---

## 2. Why all-at-once in v1.1 (and not phased)

The previous draft proposed phasing: v1.1 = paywall + AI gen budget gate; v1.2 = Auto Plan + Sunday Drop; v1.3 = Macro Coach. Reconsidered after the user's challenge ("why phase if we dev in background?"):

### Arguments FOR phased shipping
1. Smallest possible v1.1 review surface = lowest first-IAP rejection risk
2. Real conversion data informs feature priority (kill features that nobody pays for)
3. Faster v1.1 ship date = faster revenue start

### Arguments AGAINST phased shipping (and why these win)
1. **Apple reviews the binary, not the features.** Once the paywall + IAP setup is approved, adding more gated features in v1.2 still requires a full review pass. Phasing doesn't reduce total review touches; it multiplies them.
2. **Conversion is feature-density-dependent.** "$5/mo for unlimited AI gen" converts at <2%. "$5/mo for Auto Plan + Sunday Drop + unlimited AI + Macro Coach + Family Share" converts at 5–8%. Apple sees this in their own data: feature-rich subscriptions retain 2–3× longer.
3. **The "wasted work" argument fails for solo dev built in background.** If we build all features in a feature branch alongside v1.0 going through review, by the time v1.0 is in public hands we already have v1.1 bundle ready. Phasing artificially withholds finished code.
4. **First-IAP review is the hardest one** — Apple scrutinizes every paywall element. Doing it once with the full feature set is one rejection cycle, not three.
5. **Brand momentum matters at launch.** "Mori+ launches with 7 premium features" is a press story. "Mori+ launches with 1 paywalled feature" is not.

### The compromise (what we DO defer)
- **Apple Health integration in Macro Coach** — adds HealthKit permission complexity + a new Apple review angle (data permission). Ship Macro Coach in v1.1 with manual logging; add HealthKit in v1.2 as "Mori+ now syncs with Apple Health."
- **Family Share** — requires multi-account state syncing; high test surface. Ship in v1.2 as the "renewal anchor" feature for users hitting the 30-day mark.

### Final v1.1 scope
Everything except HealthKit and Family Share. v1.2 follows ~6 weeks later as the "Coach + Family" update.

---

## 3. Apple App Review + IAP Rules (full mandate)

### 3.1 Mandatory rules (App Review Guidelines 3.1.1, 3.1.2)

| Rule | Mori implementation |
|---|---|
| Digital goods/services MUST use Apple IAP | Mori+ uses StoreKit via RevenueCat — ✓ |
| Auto-renewable subs ≥ 7 days | Monthly = 1 month, Annual = 1 year — ✓ |
| Subscription must provide ongoing value | AI generation, weekly Sunday Drop, ongoing macro tracking, evolving family plan — ✓ |
| Available across user's devices | RevenueCat `appUserID` carries entitlement across logins — ✓ |
| Price + duration shown clearly before purchase | Paywall layout (§7) shows price and "/mo" or "/yr" at same prominence — ✓ |
| Intro offer must be clearly disclosed | "30 days free, then $4.99/month" disclosure under CTA — ✓ |
| Restore Purchases must be present in-app | Footer of paywall + Settings → Subscription — ✓ |
| Privacy Policy + Terms of Use must be linked in-app | Footer of paywall, opens in-app webview — ✓ |
| Cannot mislead about "free" | Use "Start 30-day free trial" not "Free!"; full price shown — ✓ |
| **No toggle paywalls** (banned Jan 2026) | Stacked SKU cards instead of toggle — ✓ |
| Cannot lock unrelated features behind login that aren't part of the subscription | Free features (swipe, save, plan, grocery) require login but are not paywalled — ✓ |

### 3.2 Privacy Manifest (PrivacyInfo.xcprivacy)
RevenueCat ships its own privacy manifest declaring `NSPrivacyCollectedDataTypePurchaseHistory` linked. We must:
- Update **App Privacy** section in App Store Connect to declare:
  - **Purchase History** (Linked to user, used for App Functionality)
  - **User ID** (Linked to user, used for App Functionality + Analytics)
  - Existing declarations remain
- The Expo `react-native-purchases` install adds the manifest automatically; verify via `npx pod-install` then check `ios/Pods/RevenueCat/PrivacyInfo.xcprivacy`

### 3.3 Billing Grace Period (must be enabled)
In App Store Connect → Subscriptions → enable **Billing Grace Period: 16 days**. This means when a renewal fails (expired card, bank decline), Apple keeps the user's premium active for up to 16 days while retrying. Without it, users churn instantly on a temporary card issue. RevenueCat reports `BILLING_ISSUE` webhook and we keep `is_premium=true` until `premium_expires_at`.

### 3.4 Tax + Region
- Apple withholds VAT/GST in EU/UK/AU/etc.; you receive net
- Apple files 1099 with US income
- Pricing shown to user is always in their App Store region's currency (Apple converts via tier table)
- Sandbox accounts default to US; create test accounts in other regions for localization QA

### 3.5 Apple Family Sharing
By default, subscriptions are NOT shareable via Apple Family Sharing. We can opt in per-product in App Store Connect. **Decision: opt out** — Mori+ "Family Share" is our own multi-account feature (richer than Apple's), and enabling Apple's would dilute it.

### 3.6 Promotional Offers + Win-Back
Available via App Store Connect:
- **Introductory offers** — set per SKU (we use 30-day free trial)
- **Promotional offers** — discount codes for re-subs, requires server-side signing
- **Win-back offers** — automated re-engagement for cancelled users (RC supports)
- **Subscription pause** — annual subscribers can pause for 1–3 months; RC reports as paused state, gate accordingly

---

## 4. Architecture

### 4.1 System diagram

```
┌──────────────┐       StoreKit        ┌──────────────┐
│  Mori app    │◀──────────────────────▶│  App Store   │
│  (Expo iOS)  │                        │   (Apple)    │
└──────┬───────┘                        └──────┬───────┘
       │                                       │
       │ Purchases SDK                         │ S2S
       ▼                                       ▼
┌──────────────────────────────────────────────────┐
│                 RevenueCat                       │
│  - Receipt validation (server-side)              │
│  - Entitlement state machine                     │
│  - Webhook dispatch                              │
└──────┬─────────────────────────┬─────────────────┘
       │                         │
       │ getCustomerInfo()       │ Webhook (HMAC-signed)
       │ (client, real-time)     ▼
       │                  ┌──────────────────┐
       │                  │  Vercel:         │
       │                  │  /api/rc-webhook │
       │                  └──────┬───────────┘
       │                         │
       │                         │ upsert
       │                         ▼
       │                  ┌──────────────────┐
       └─────────────────▶│   Supabase       │
                          │  profiles.       │
                          │  is_premium etc. │
                          └──────────────────┘
```

### 4.2 Two sources of truth (intentional)

| Concern | Source | Why |
|---|---|---|
| Client-side UI gating (show/hide premium features) | `Purchases.getCustomerInfo()` → `entitlements.active['mori_plus']` | Real-time, works offline (24h cache), no backend round-trip |
| Server-side gating (`/api/auto-plan-week`, Sunday Drop cron eligibility, monthly budget enforcement) | `profiles.is_premium` (synced via RC webhook) | Client can be jailbroken/spoofed; server gate prevents abuse of expensive Anthropic calls |

**Sync delay:** RC webhook usually < 5s after purchase. Client-side gate flips immediately on `Purchases.purchasePackage()` resolve, so the user never sees a "paid but locked" state. If they hit a server endpoint before the webhook lands, server falls back to client-asserted `customerInfo` token (signed) for first 60 seconds post-purchase.

### 4.3 RevenueCat configuration

**RevenueCat dashboard setup (one-time):**
1. Create project: "Mori"
2. Connect Apple App Store: enter App Store Connect API Key (Issuer ID, Key ID, .p8 file)
3. Define products (mirror App Store Connect):
   - `mori_plus_monthly` (subscription)
   - `mori_plus_annual` (subscription)
   - `mori_plus_lifetime` (non-renewing)
4. Define entitlement: `mori_plus` → attach all 3 products
5. Define offering: `default` → 3 packages (monthly, annual, lifetime)
6. Configure Webhook → URL `https://getmori.app/api/rc-webhook` + Authorization header `Bearer ${RC_WEBHOOK_SECRET}`
7. Generate iOS API key → goes into EAS env as `EXPO_PUBLIC_REVENUECAT_IOS_KEY`

**Two RevenueCat projects:** one for sandbox/TestFlight, one for production. Different API keys. Pin both in `eas.json` per-profile (per Mori's "Pre-Ship Commandment" about pinning critical EXPO_PUBLIC_* vars).

---

## 5. Database schema (full migration)

New file: `supabase/add-mori-plus.sql`. After applying, fold into `supabase/schema.sql` (per Mori's pattern — no migration drift).

```sql
-- ============================================================================
-- Mori+ subscription tier
-- ============================================================================

-- 5.1 Profile columns
ALTER TABLE profiles
  ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN premium_product_id TEXT,            -- 'mori_plus_monthly' | '_annual' | '_lifetime'
  ADD COLUMN premium_expires_at TIMESTAMPTZ,     -- null for lifetime
  ADD COLUMN premium_will_renew BOOLEAN,         -- false if user cancelled but period not yet ended
  ADD COLUMN premium_in_grace_period BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN premium_started_at TIMESTAMPTZ,
  ADD COLUMN revenuecat_user_id TEXT UNIQUE,
  ADD COLUMN push_token TEXT;                    -- expo push token (column may already exist; check first)

CREATE INDEX idx_profiles_revenuecat ON profiles(revenuecat_user_id);
CREATE INDEX idx_profiles_premium ON profiles(is_premium) WHERE is_premium = TRUE;

-- 5.2 AI usage (monthly budget tracking)
CREATE TABLE ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  month TEXT NOT NULL,                           -- 'YYYY-MM' (UTC)
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, month)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_self ON ai_usage FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION increment_ai_usage(p_user UUID, p_endpoint TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO ai_usage (user_id, endpoint, month, count)
  VALUES (p_user, p_endpoint, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), 1)
  ON CONFLICT (user_id, endpoint, month)
  DO UPDATE SET count = ai_usage.count + 1;
END $$;

-- 5.3 Webhook idempotency
CREATE TABLE rc_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID,
  received_at TIMESTAMPTZ DEFAULT now()
);

-- 5.4 Sunday Drop personalized recipe pack
CREATE TABLE sunday_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,                      -- the Sunday this drop is for
  recipe_ids UUID[] NOT NULL,                    -- 7 recipes
  generated_at TIMESTAMPTZ DEFAULT now(),
  notified_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  UNIQUE (user_id, week_start)
);
ALTER TABLE sunday_drops ENABLE ROW LEVEL SECURITY;
CREATE POLICY sunday_drops_self ON sunday_drops FOR SELECT
  USING (auth.uid() = user_id);

-- 5.5 Macro Coach
CREATE TABLE macro_goals (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL CHECK (goal IN ('cut', 'maintain', 'bulk')),
  target_weight_lbs NUMERIC,
  current_weight_lbs NUMERIC,
  activity_level TEXT NOT NULL,
  daily_kcal INT, daily_protein_g INT, daily_carbs_g INT, daily_fat_g INT,
  set_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE macro_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY macro_goals_self ON macro_goals FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE macro_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_for DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('apple_health', 'recipe_cooked', 'manual')),
  kcal INT, protein_g INT, carbs_g INT, fat_g INT,
  recipe_id UUID,
  external_id TEXT,                              -- HealthKit UUID for dedupe
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_macro_logs_user_date ON macro_logs(user_id, logged_for);
CREATE UNIQUE INDEX idx_macro_logs_external ON macro_logs(user_id, external_id)
  WHERE external_id IS NOT NULL;
ALTER TABLE macro_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY macro_logs_self ON macro_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5.6 Saved Decks (filter combos)
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filter JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY decks_self ON decks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5.7 Family Share (v1.2)
CREATE TABLE family_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE family_members (
  group_id UUID REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY family_groups_member ON family_groups FOR SELECT
  USING (owner_id = auth.uid() OR id IN (
    SELECT group_id FROM family_members WHERE user_id = auth.uid()
  ));
CREATE POLICY family_groups_owner_write ON family_groups FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY family_members_self ON family_members FOR SELECT
  USING (user_id = auth.uid() OR group_id IN (
    SELECT id FROM family_groups WHERE owner_id = auth.uid()
  ));

-- 5.8 Founders waitlist (collected pre-v1.1)
CREATE TABLE founders_waitlist (
  email TEXT PRIMARY KEY,
  signed_up_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id),       -- linked when they sign up
  redeemed_at TIMESTAMPTZ                        -- when they bought lifetime
);
```

---

## 6. Client SDK integration

### 6.1 Packages

```bash
npx expo install react-native-purchases react-native-purchases-ui
```

Both packages auto-add their config plugins. Verify in `app.json`:

```json
"plugins": [
  ...
  ["react-native-purchases-ui"]
]
```

### 6.2 `lib/revenueCat.ts` (full code)

```ts
import Purchases, { LOG_LEVEL, CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { useUserStore } from '../stores/userStore';
import * as Sentry from '@sentry/react-native';

const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!;
export const ENTITLEMENT_ID = 'mori_plus';
export const OFFERING_ID = 'default';

let initialized = false;

export async function initRevenueCat(userId: string | null) {
  if (initialized) return;
  initialized = true;

  if (!RC_API_KEY_IOS) {
    if (__DEV__) console.warn('[RC] No API key — running in mock mode');
    return;
  }

  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({
      apiKey: RC_API_KEY_IOS,
      appUserID: userId ?? undefined,
    });
    Purchases.addCustomerInfoUpdateListener(handleCustomerInfoUpdate);
    // Initial sync
    const info = await Purchases.getCustomerInfo();
    handleCustomerInfoUpdate(info);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'revenuecat-init' } });
  }
}

export async function loginRevenueCat(userId: string) {
  if (!initialized) return;
  await Purchases.logIn(userId);
}

export async function logoutRevenueCat() {
  if (!initialized) return;
  await Purchases.logOut();
  useUserStore.getState().setPremium(false);
}

export function isPremium(info: CustomerInfo | null | undefined): boolean {
  return info?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
}

export async function getOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg: PurchasesPackage) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return isPremium(customerInfo);
}

export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  return isPremium(info);
}

function handleCustomerInfoUpdate(info: CustomerInfo) {
  const premium = isPremium(info);
  useUserStore.getState().setPremium(premium);
  // Optional: log entitlement changes for retention analytics
}
```

### 6.3 Init point — `app/_layout.tsx`

```ts
useEffect(() => {
  if (session?.user?.id) {
    initRevenueCat(session.user.id);
  } else {
    initRevenueCat(null);
  }
}, [session?.user?.id]);

// On sign-out: call logoutRevenueCat() in the existing signOut handler
```

### 6.4 `useUserStore` additions

```ts
isPremium: boolean,
setPremium: (v: boolean) => set({ isPremium: v }),
```

### 6.5 EAS env

Add to `eas.json` `production` and `preview` env blocks:
```json
"EXPO_PUBLIC_REVENUECAT_IOS_KEY": "appl_XXXXXXXXXXXX"
```
Use the **production** key in `production` profile and **sandbox** key in `preview` and `development` profiles. Production key: ONLY paid sandbox/real users. Sandbox key: TestFlight + simulator.

---

## 7. Server-side webhook + entitlement sync

### 7.1 `api/rc-webhook.ts` (full pseudocode)

```ts
// Auth: shared secret, timing-safe compare
// Body: RevenueCat event JSON

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as Sentry from '@sentry/node';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).end();

    // Auth
    const auth = req.headers.authorization || '';
    const expected = `Bearer ${process.env.RC_WEBHOOK_SECRET}`;
    if (auth.length !== expected.length ||
        !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = req.body?.event;
    if (!event?.id || !event?.type) return res.status(400).json({ error: 'Bad payload' });

    // Idempotency
    const { error: dupeErr } = await supabase
      .from('rc_webhook_events')
      .insert({ event_id: event.id, event_type: event.type, user_id: event.app_user_id });
    if (dupeErr?.code === '23505') return res.status(200).json({ ok: true, dedupe: true });

    const userId = event.app_user_id;
    if (!userId) return res.status(200).json({ ok: true, skipped: 'no user' });

    const productId = event.product_id;
    const expiresAt = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    let update: Record<string, any> = {};
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION':
        update = {
          is_premium: true,
          premium_product_id: productId,
          premium_expires_at: expiresAt,
          premium_will_renew: true,
          premium_in_grace_period: false,
          premium_started_at: event.purchased_at_ms
            ? new Date(event.purchased_at_ms).toISOString()
            : new Date().toISOString(),
          revenuecat_user_id: event.original_app_user_id || userId,
        };
        break;

      case 'NON_RENEWING_PURCHASE':                // lifetime
        update = {
          is_premium: true,
          premium_product_id: productId,
          premium_expires_at: null,
          premium_will_renew: false,
          revenuecat_user_id: event.original_app_user_id || userId,
        };
        break;

      case 'CANCELLATION':                         // user cancelled, but period still active
        update = { premium_will_renew: false };
        break;

      case 'EXPIRATION':                           // period ended, no renewal
        update = {
          is_premium: false,
          premium_will_renew: false,
          premium_in_grace_period: false,
        };
        break;

      case 'BILLING_ISSUE':                        // grace period
        update = { premium_in_grace_period: true };
        break;

      case 'SUBSCRIPTION_PAUSED':                  // user paused (annual only)
        update = { is_premium: false, premium_will_renew: true };
        break;

      case 'TRANSFER':                             // user transferred sub to new appUserID
        // Handled by 2 events: original loses, new gains. The INITIAL_PURCHASE on new
        // user fires separately; here we just clear original.
        update = { is_premium: false, premium_will_renew: false };
        break;

      default:
        // TEST event, etc.
        return res.status(200).json({ ok: true, ignored: event.type });
    }

    const { error } = await supabase
      .from('profiles').update(update).eq('id', userId);
    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'rc-webhook' } });
    return res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    await Sentry.flush(2000);                      // per Mori's "Pre-Ship Commandment"
  }
}
```

### 7.2 `lib/aiUsage.ts`

```ts
import { supabase } from './supabase';

type AIEndpoint = 'generate-recipe' | 'generate-from-pantry' | 'auto-plan-week';

export async function checkAiBudget(
  userId: string,
  endpoint: AIEndpoint,
  freeMonthlyLimit: number
): Promise<{ allowed: boolean; remaining: number; isPremium: boolean }> {
  // 1. Premium check
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_premium, premium_in_grace_period, premium_expires_at')
    .eq('id', userId)
    .single();

  const premium = !!(profile?.is_premium ||
    (profile?.premium_in_grace_period &&
     new Date(profile.premium_expires_at) > new Date()));

  if (premium) return { allowed: true, remaining: Infinity, isPremium: true };

  // 2. Monthly budget check (UTC month)
  const month = new Date().toISOString().slice(0, 7);
  const { data: usage } = await supabase
    .from('ai_usage')
    .select('count')
    .eq('user_id', userId).eq('endpoint', endpoint).eq('month', month)
    .maybeSingle();

  const used = usage?.count ?? 0;
  return {
    allowed: used < freeMonthlyLimit,
    remaining: Math.max(0, freeMonthlyLimit - used),
    isPremium: false,
  };
}

export async function incrementAiUsage(userId: string, endpoint: AIEndpoint) {
  await supabase.rpc('increment_ai_usage', { p_user: userId, p_endpoint: endpoint });
}
```

Modify `api/generate-recipe.ts`: add `checkAiBudget` after `requireAuth`, return 402 with `{ error: 'monthly_limit', remaining: 0 }` if not allowed. Increment AFTER successful generation (idempotency: failed gens don't burn budget).

---

## 8. Per-feature implementation specs

### F1 — AI Auto Plan ("Build my week")

**Goal:** in 1 tap, fill the entire week's empty meal slots with personalized recipe suggestions, leveraging saved library + leftovers + pantry + macro goals + time budget.

**UX flow:**
1. Plan tab header — new pill button "✨ Build my week" between "Add all to list" and AvatarButton (file: [app/(tabs)/plan.tsx:352-371](app/(tabs)/plan.tsx#L352-L371))
2. Tap → if `!isPremium` → paywall modal. If premium → AutoPlanSheet (bottom sheet)
3. Sheet content:
   - Days/meals to plan: pre-filled with empty slots in current week, all selected
   - "Use my leftovers + pantry first" toggle (default ON)
   - Time budget per night: chips [15, 30, 45, 60, ∞] min
   - "Allow batch cooking" toggle: turn one Sunday recipe into 3 weeknight dinners
   - "Confirm" CTA
4. Loading state: skeleton shimmer on Plan tab grid + "Mori is planning your week…"
5. Result: slots populate in place, user can tap any to swap, or "Send to grocery list" CTA at bottom of Plan tab.

**API:** `api/auto-plan-week.ts`

```ts
POST {
  weekStart: '2026-05-04',                       // ISO date (Monday)
  emptyDayMeals: [{ date: '2026-05-05', meal: 'dinner' }, ...],
  constraints: {
    useLeftovers: boolean,
    timeMaxMins: number | null,
    allowBatch: boolean
  }
}

→ 200 {
  plan: [{ date, meal, source: 'saved'|'catalog'|'generated', recipeId, recipe? }],
  groceryDelta: [{ ingredient, qty, unit }]
}

Auth: requireAuth + is_premium check (402 if not premium).
Rate limit: rateLimitUser(userId, 'auto-plan-week', 5, 86400) — 5/day defense-in-depth.
Cost cap: max 1 Haiku generation for net-new recipes per call (rest must come from existing).
```

**Server logic:**
1. Fetch user state in parallel: saved recipes (top 50 by save date), taste_profile, pantry, leftovers (non-expired), profile (dietary_goals, ingredient_dislikes, eating_style), recently cooked (last 14 days, exclude)
2. Build candidate pool:
   - Tier A: saved recipes matching meal type + time constraint + leftover-ingredient overlap
   - Tier B: catalog recipes matching same + scoring via existing `scoreRecipe`
   - Tier C: generate ≤1 net-new recipe via Haiku if pool < day count
3. Assign one recipe per slot, ensuring:
   - No same recipe twice in a week (unless `allowBatch` and dinner)
   - Cuisine variety (max 3 of same cuisine per week)
   - Balanced macros across week if `macro_goals` exists
4. Compute `groceryDelta`: union of ingredients minus pantry items + minus expired leftovers
5. Return; client writes to `meal_plans` table

**Edge cases:**
- 0 saved recipes → use catalog pool only; show toast "Save more recipes to personalize your weekly plan"
- All days already filled → button disabled with tooltip "Plan is full — clear week first"
- Generation timeout (>10s) → return partial plan with empty slot fallback
- User changes mid-loading (offline, app backgrounded) → AbortController cancels, show retry
- Pantry items expired in real life → only use ingredient_storage non-expired
- Dietary conflict (saved recipe has dairy, user added dairy-free goal) → filter out
- User cancels Mori+ mid-generation → server-side check on completion, reject if no longer premium

**Files touched:**
- new: `api/auto-plan-week.ts`, `components/plan/AutoPlanSheet.tsx`, `lib/autoPlan.ts` (candidate scoring helper)
- modified: [app/(tabs)/plan.tsx](app/(tabs)/plan.tsx), [lib/api.ts](lib/api.ts)

**Cost projection:** $0.06 worst-case per call (1 Haiku + 1 image). Power user does 1/week × 4 weeks = $0.24/user/mo. At 1000 paid users = $240/mo COGS vs ~$5K MRR.

---

### F2 — Sunday Drop

**Goal:** every Sunday morning, a personalized 7-recipe drop arrives via push notification. Creates ritual + ongoing recurring value.

**UX flow:**
1. **Saturday 22:00 UTC – Sunday 12:00 UTC:** hourly cron iterates over `is_premium = TRUE` profiles where local Sunday-9am falls in the next hour
2. For each: generate drop, write to `sunday_drops` row, send push: "🌿 Your Sunday Drop is ready — 7 new recipes for you"
3. User taps push → deep link to `discover` tab with `?drop=<id>` param → drop section appears at top with horizontal scroll of 7 recipe cards
4. Drop section persists all week with "Sunday Drop · May 4" header
5. Old drops accessible via Profile → "Sunday Drop archive"

**Composition (7 recipes):**
- 4 net-new generated via Haiku (taste-profile-tailored, season-aware)
- 3 catalog hits filtered by scorer minus already-seen, sorted by score

**Cron:** `api/cron/sunday-drop.ts` (Vercel cron schedule: `0 22-23 * * 6,0 12 * * 0`)

```ts
// Pseudocode
for each profile where is_premium = TRUE
  AND last_active > now() - 30 days                  // skip dormant users
  AND timezone Sunday-9am ∈ [now, now+1h]:
    weekStart = next Sunday in user's tz
    if exists(sunday_drops where user_id, week_start) → skip
    drop = await generateDrop(userId)
    insert sunday_drops { recipe_ids, generated_at }
    send push notification { title, body, data: { drop_id } }
    update sunday_drops.notified_at
```

**Push pipeline (this is the side-quest that unblocks Sunday Drop):**
- Wire `expo-notifications` token registration in [app/_layout.tsx](app/_layout.tsx) — after Supabase auth, call `Notifications.getExpoPushTokenAsync()` and write to `profiles.push_token`
- New `lib/push.ts` server-side helper using `expo-server-sdk`
- Add `EXPO_ACCESS_TOKEN` to Vercel env (Expo's server-side token, lets us bypass per-app rate limits)
- Push permission prompt: ask once after onboarding completes (low-friction moment), with payoff copy "Get your Sunday Drop and cook reminders"
- Quiet hours: never send push between 22:00–07:00 user-local for any future push types

**Edge cases:**
- User just bought Mori+ Saturday afternoon → schedule first drop for Sunday automatically
- User cancels Mori+ Saturday → drop cron skips them (re-checks `is_premium` at fire time)
- User in unusual timezone (e.g., Samoa UTC-11, Kiribati UTC+14) → cron window covers full 24h
- Push permission denied → drop still generated, surfaced in-app; no notification
- User has 5 push tokens (multiple devices) → store array in profiles; send to all
- Token invalidated (uninstalled, expired) → expo-server-sdk returns error; mark `push_token = null`
- DST changes → cron in UTC, recompute user-local Sunday-9am dynamically each Sunday
- Generation fails for 1 user → log Sentry, continue batch (don't block other users)
- User opens app at Sunday-8am, we haven't generated yet → surface a "Drop coming soon" placeholder
- 100% same recipes generated for siblings (same household, very similar profiles) → fine, both will see same set; not a bug
- User with 0 saved + 0 swipe history → fall back to seasonal trending pool

**Files touched:**
- new: `api/cron/sunday-drop.ts`, `lib/push.ts`, `components/discover/SundayDropSection.tsx`, `app/sunday-drop-archive.tsx`
- modified: [app/(tabs)/discover.tsx](app/(tabs)/discover.tsx), [app/_layout.tsx](app/_layout.tsx), [vercel.json](vercel.json) (cron entry), `api/_pushUtils.ts` (complete the existing stub)

**Cost projection:** 4 generations/user × $0.06 = $0.24/week/user → $1/mo/user. 1000 paid users = $1K/mo COGS.

---

### F3 — Generate from Pantry / Leftovers

**Goal:** "I have salmon, broccoli, and lemon — give me 5 recipes that use them." Reduces food waste + eliminates "what's for dinner" decision fatigue.

**UX flow:**
1. Two entry points:
   - Discover tab — small chip below the deck "🥬 Cook what I have"
   - LeftoversReminderCard — "Generate recipes →" CTA (file: [components/cards/LeftoversReminderCard.tsx](components/cards/LeftoversReminderCard.tsx))
2. Tap → CookWhatIHaveSheet (bottom sheet)
3. Sheet pre-filled with pantry items + non-expired leftovers (chip list, all selected)
4. "And also have…" free text input
5. "Generate 3 recipes" CTA → premium gate (free: 1/mo, then paywall)
6. Loading state → 3 recipe cards rendered, each showing:
   - Title + image + macros
   - "Uses: chicken, broccoli, lemon" tag
   - "Buy 2 more: garlic, soy sauce" if extras needed
7. Tap any → save / view detail / send to plan slot

**API:** `api/generate-from-pantry.ts`
```ts
POST {
  ingredients: string[],
  freeText?: string,
  count?: number                                  // default 3, max 5 for premium
}

→ 200 {
  recipes: Recipe[],
  extraIngredientsByRecipe: { [recipeId]: string[] }
}

Auth: requireAuth + checkAiBudget('generate-from-pantry', 1) for free users.
Rate limit: rateLimitUser(userId, 'gen-pantry', 10, 86400) — 10/day max even for premium.
```

**Server logic:**
- Inject system prompt: "Generate {count} recipes using ONLY these ingredients (or with at most 2 additional ingredients). Prefer simple, weeknight-friendly. Return for each: title, description, ingredients, steps, macros, dietary_tags, extra_ingredients_needed."
- Haiku call with structured output
- Image gen via gpt-image-1 in parallel for each
- Validate via existing `validate-recipe-ratios` logic (≥85 plausibility) — reject if any recipe scores below threshold; retry once

**Edge cases:**
- User selects 0 ingredients → button disabled
- User selects 1 ingredient (e.g., just "chicken") → inject "feel free to add 2-3 common pantry staples"
- Generation returns 0 valid recipes → show error toast "Try selecting different ingredients"
- User saves recipe → auto-mark leftover as "used" (ask in toast "Mark salmon as used?")
- User has dietary conflict (vegan goal but selected chicken) → warn before generation

**Files touched:**
- new: `api/generate-from-pantry.ts`, `components/discover/CookWhatIHaveSheet.tsx`
- modified: [app/(tabs)/discover.tsx](app/(tabs)/discover.tsx), [components/cards/LeftoversReminderCard.tsx](components/cards/LeftoversReminderCard.tsx), [lib/api.ts](lib/api.ts)

---

### F4 — Macro Coach (v1.1: manual logging only; v1.2 adds Apple Health)

**Goal:** turn passive macro display into active coaching. Set a weight goal → daily targets → real-time gap-suggestions → weekly review.

**UX flow:**
1. Profile tab → new "Coach" row (premium gate)
2. First-time setup screen:
   - Goal: cut / maintain / bulk (radio)
   - Current weight + target weight
   - Activity level (sedentary / light / moderate / active / very active)
   - Calculate → show derived daily macros
   - "Save goals"
3. Coach home screen:
   - Today's progress: progress rings (kcal, protein, carbs, fat) using `react-native-circular-progress-indicator`
   - "180g protein eaten / 240g target — 3 dinner ideas to close the gap" → tappable to filtered Discover deck
   - Log meal manually: tap +
   - Recently cooked auto-logs (only counts macros from recipes user marked "cooked")
4. Weekly review (Sunday-evening notification): "You hit protein 5/7 days. Tuesday + Friday were under. Here's why →" deep-link to review screen with chart + Haiku narrative

**API:** `api/macro-coach.ts`
```ts
POST { action: 'compute-targets', goal, weight, target_weight, activity }
  → 200 { daily_kcal, daily_protein_g, daily_carbs_g, daily_fat_g }

POST { action: 'gap-suggest', date }
  → 200 { remaining: {...}, suggestedRecipes: Recipe[] }

POST { action: 'weekly-review', weekStart }
  → 200 { narrative: string, chartData: {...} }

Auth: requireAuth + is_premium check.
```

**Target calculation (Mifflin-St Jeor + activity factor):**
```ts
function computeTargets(goal, weight_lbs, height_in, age, sex, activity) {
  // ...standard Mifflin-St Jeor BMR + activity multiplier
  // Then adjust for goal: cut -20%, maintain 0%, bulk +15%
  // Protein: 0.8-1.2g/lb depending on goal
  // Fat: 25-30% of kcal
  // Carbs: remainder
}
```

**Edge cases:**
- User changes goal mid-week → recalc targets, keep history
- Weight outside reasonable bounds → reject + show error
- 0 recipes match remaining macros → show "Eat ~50g protein from any source — try Greek yogurt or jerky"
- User over kcal target → don't suggest more food; suggest "Done eating? Save calories for tomorrow"
- Recipe macros unset → exclude from logged contributions
- Manual log entered then deleted → soft delete with undo

**Files touched:**
- new: [app/macro-coach.tsx](app/macro-coach.tsx), [app/macro-coach-setup.tsx](app/macro-coach-setup.tsx), `api/macro-coach.ts`, `lib/macroCoach.ts`, `components/macro-coach/*`
- modified: [app/(tabs)/profile.tsx](app/(tabs)/profile.tsx), [components/ProfileSheet.tsx](components/ProfileSheet.tsx)

---

### F5 — Saved Decks

**Goal:** save filter combos as named "decks" for focused swipe sessions.

**UX:**
- Explore tab gets "+ Save as Deck" button when filter is active
- Profile → "My Decks" → list with count badges + last-used
- Tap deck → enter Discover with that filter pre-applied + named header

**Schema:** `decks` table (above)

**Edge cases:**
- User changes pantry/dietary after saving deck → deck still works (filter is its own filter, not user state)
- Deck name collision → disambiguate with "(2)"
- Free user creates 1 deck while in trial → keeps it visible but locked after trial ends; show "Unlock with Mori+"

---

### F6 — Family / Shared Plan (v1.2)

**Goal:** premium households share Plan + grocery list across up to 4 members.

**UX:**
1. Profile → "Family" → "Start a family"
2. 6-char invite code generated (e.g. "MORI-7K2X")
3. Share via iMessage / copy
4. Other premium user enters code → joins
5. Plan tab + grocery list become shared when "Family view" toggled in Plan header
6. Member roster in Profile, owner can remove members

**Conflict resolution:**
- Plan slots: last-write-wins + Realtime subscription so other devices see updates within 1s
- Grocery list: union (everyone's items appear with avatar tag); checkbox sync via Supabase Realtime
- Recipe save: shared library by default + per-member private library
- Dietary restrictions: union of restrictions for grocery list, individual for Discover

**Edge cases:**
- Owner cancels Mori+ → entire group loses access (mirror Apple's Family pattern). Members notified, must individually subscribe to keep shared state. 30-day soft window before group is deleted.
- Member cancels → keeps personal data, drops from group
- 5th person tries to join → "Family is full"
- Owner deletes account → ownership transfers to oldest member; if all members cancelled, group archived
- Conflicting Plan edits within 100ms → server-side optimistic lock with retry
- Member toggles dietary preference → other members see toast "Sarah added a vegan day"

**Files touched:**
- new: `app/family.tsx`, `app/family-join.tsx`, `api/family-create.ts`, `api/family-join.ts`, `lib/family.ts`, `stores/familyStore.ts`
- modified: [app/(tabs)/plan.tsx](app/(tabs)/plan.tsx) (shared mode), [app/(tabs)/grocery-list.tsx](app/(tabs)/grocery-list.tsx)

---

### F7 — Substitution AI (sweetener)

Extend existing `lib/substitutions.ts` (~125 static entries) with context-aware Haiku call: "This recipe uses buttermilk for tang AND tenderizing; the best sub is yogurt + lemon, NOT plain milk."

**UX:** Recipe Detail ingredient row gets long-press → "Substitute…" sheet. Free users see static substitutions (existing). Premium users get contextual recommendation.

**API:** `api/substitutions.ts` (already exists per Explore output, extend it).

---

## 9. Paywall design

### 9.1 Layout (every pixel)

```
┌─────────────────────────────────────┐
│  ✕                              ⓘ  │ ← Dismiss + (?) help link
│                                     │
│      [hero: spatula on linen]       │
│                                     │
│           Mori+                     │ ← Wordmark, Georgia italic 32pt
│   Your kitchen, on autopilot        │ ← Tagline, SF 16pt, muted
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                     │
│  ✨  Build your week in one tap     │ ← 3 value props, SF 16pt
│  🌿  7 fresh recipes every Sunday   │
│  🥬  Cook from what you have        │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Yearly      $39.99/yr       │  │ ← Selected by default
│  │ ✓ 30 days free   $3.33/mo    │  │
│  │           Save 33%          │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Monthly     $4.99/mo        │  │
│  │ ✓ 30 days free               │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │ ← Lifetime card only shown
│  │ Lifetime    $79.99 once     │  │   during first 60 days post-v1.1
│  │ Founders only · No renewal  │  │
│  └───────────────────────────────┘  │
│                                     │
│  [   Start 30-day free trial   ]    │ ← Primary CTA, full-width
│                                     │
│  30 days free, then $39.99/year.    │ ← Disclosure (REQUIRED 3.1.2)
│  Auto-renews unless cancelled at   │
│  least 24 hours before period end. │
│  Cancel anytime in Settings.       │
│                                     │
│  Restore · Privacy Policy · Terms  │ ← All 3 required, in-app webview
└─────────────────────────────────────┘
```

### 9.2 Copy (verbatim)

| Element | Text |
|---|---|
| Tagline | "Your kitchen, on autopilot" |
| Value prop 1 | "Build your week in one tap" |
| Value prop 2 | "7 fresh recipes every Sunday" |
| Value prop 3 | "Cook from what you have" |
| Annual badge | "Save 33%" |
| Lifetime badge (founders window) | "Founders only · No renewal" |
| CTA | "Start 30-day free trial" → flips to "Subscribe" if no trial available |
| Disclosure | "30 days free, then $39.99/year. Auto-renews unless cancelled at least 24 hours before period end. Cancel anytime in Settings." |
| Footer | "Restore · Privacy Policy · Terms of Use" |

If user is on monthly card: "30 days free, then $4.99/month."
If user is on lifetime card: "One-time payment of $79.99. No recurring charges."

### 9.3 Trigger points (where the paywall fires)

| Trigger | Free shows | Premium does |
|---|---|---|
| Tap "Build my week" | Paywall | Auto Plan sheet |
| Tap "Cook what I have" | If 1 free already used → paywall; else allow + warn "1 of 1 free this month" | Sheet |
| Tap Sunday Drop card | Paywall ("Get fresh recipes every Sunday") | Open recipe |
| Tap "Coach" in Profile | Paywall | Coach screen |
| 4th AI gen in calendar month | Paywall | (always allowed) |
| Tap "+ Save as Deck" | Paywall | Save deck |
| Profile → "Upgrade" row | Paywall (always visible to free users) | "Manage subscription" instead |
| Onboarding final screen (post v1.1 onboarding refresh) | Paywall (skippable) | n/a |

### 9.4 Paywall edge cases

- **Offline:** show cached offerings if available; else "Connect to internet to see plans"
- **No products fetched (RC outage):** show error + retry; surface "Email us" mailto link
- **User already has active sub but hits paywall (sync delay):** banner top "Mori+ active — refreshing…" + auto-dismiss
- **User cancels purchase modal mid-flow:** dismiss back to paywall, show toast "No charge — try again anytime"
- **Restore tapped, no purchases found:** alert "No active subscription on this Apple ID"
- **Family Sharing:** disabled per §3.5; if user attempts, show "Mori+ uses our own Family share — see Profile"
- **Sandbox vs production:** label paywall "[SANDBOX]" in dev/preview builds for QA visibility
- **Trial already used (re-subscribe after cancel):** SDK reports `introductory_price_eligible: false` → CTA flips to "Subscribe" with "$39.99/year" (no "30 days free" copy)
- **App Store region without local currency:** Apple shows USD; we don't override

---

## 10. Edge case register (master list)

### 10.1 Subscription lifecycle

| Event | Behavior |
|---|---|
| User upgrades monthly → annual mid-period | StoreKit prorates; RC fires `PRODUCT_CHANGE` at next renewal boundary; we update `premium_product_id` in webhook |
| User downgrades annual → monthly | Queues to next renewal (Apple policy); `premium_will_renew` stays true; product changes at renewal |
| User cancels mid-period | `CANCELLATION` webhook → `premium_will_renew = FALSE`; `is_premium` stays TRUE until `premium_expires_at` |
| Refund issued by Apple | `CANCELLATION` (with `cancel_reason: 'customer_support'`) → revoke immediately; flip `is_premium = FALSE` |
| Billing failure | `BILLING_ISSUE` webhook → `premium_in_grace_period = TRUE`; `is_premium` stays TRUE; up to 16 days |
| Grace period expires unrecovered | `EXPIRATION` webhook → `is_premium = FALSE` |
| Subscription paused (annual only) | `SUBSCRIPTION_PAUSED` → `is_premium = FALSE`, `premium_will_renew = TRUE`; Auto Plan + Sunday Drop disabled but resumed on un-pause |
| User logs out + re-logs same Apple ID | RC `Purchases.logIn(newUserID)` syncs entitlement to new app user |
| User logs in with different Apple ID (sub on first ID) | New user has no entitlement; original keeps it. Tell user "use the same Apple ID you subscribed with" |
| User uninstalls + reinstalls | Restore Purchases recovers entitlement; show prompt on first launch if Apple ID has prior purchase |
| User on multiple devices | `appUserID` (Supabase user ID) unifies all devices; entitlement carries automatically |
| Trial abuser: cancel → re-sub for another trial | Apple blocks at the subscription-group level (one trial per group ever). RC reports `introductory_price_eligible: false` |
| Sandbox time accelerated (sub renews in 5 min not 1 month) | Test flow works the same; `premium_expires_at` updates; webhooks fire faster |

### 10.2 Free tier

- Monthly budget timezone: **UTC `YYYY-MM`** (consistent globally; user in Hawaii reset 14h before user in Europe but that's accepted simplification)
- Failed AI gen → does NOT increment budget (idempotency)
- Manual admin grant of free premium (comp account) → directly set `is_premium = TRUE` in Supabase + create RC override entitlement via dashboard
- Race condition (2 simultaneous gens): both check budget = "2 remaining" → both succeed → DB increments to 4 (over budget by 1). Acceptable. Hard cap is enforced by `rateLimitUser` (5/day) as backstop.

### 10.3 Push notifications

| Edge case | Behavior |
|---|---|
| Push permission denied | Drop generated, no notification; section appears in app on next open |
| User has 5 devices | Store array `push_tokens TEXT[]`; send to all; remove on `DeviceNotRegistered` error |
| Token invalidated | Mark removed in DB on next failed send |
| User in Hawaii vs Maine | Cron in UTC, calculate user-local Sunday-9am dynamically using `profiles.timezone` (capture at signup via `Intl.DateTimeFormat().resolvedOptions().timeZone`) |
| DST changes | UTC cron unaffected; local-time computation handles |
| Quiet hours | Never send 22:00–07:00 user-local |
| Push send rate limit | expo-server-sdk batches at 100/req; cron processes in chunks |
| Push body too long | Truncate at 100 chars + "…"; full content in app |

### 10.4 Auto Plan

| Edge case | Behavior |
|---|---|
| 0 saved recipes | Use catalog only; toast "Save more recipes to personalize" |
| All days filled | Button disabled with tooltip |
| Generation timeout (>10s) | Partial plan returned with empty slots; retry button |
| Pantry items expired in real life | Excluded based on `ingredient_storage` non-expired |
| Dietary conflict (saved has dairy, user added dairy-free goal) | Filtered before scoring |
| User cancels Mori+ during loading | Server checks `is_premium` at completion; if revoked, return 402 |
| App backgrounded mid-call | AbortController cancels; show retry on resume |
| Time budget too aggressive (15 min) → no recipes match | Loosen to 30 min + show toast |
| Family share active | Aggregate dietary restrictions across all members |
| Recipe in plan deleted (curated removed) | Replace silently with next-best |

### 10.5 Sunday Drop

| Edge case | Behavior |
|---|---|
| User subscribes Saturday | First drop Sunday morning; cron picks them up |
| User cancels Saturday | Cron skips (re-checks `is_premium` at fire time) |
| User in unusual timezone | Cron window covers full 24h |
| Generation fails for 1 user | Sentry log; continue batch; user sees "Drop coming" placeholder |
| User opens app Sunday-8am pre-generation | Show "Your Sunday Drop arrives at 9am" placeholder |
| Same recipes generated for different users | Acceptable; not a bug |
| 0 saved + 0 swipes | Fall back to seasonal trending pool |
| Drop already generated this week (idempotent) | Skip (UNIQUE constraint enforces) |

### 10.6 Macro Coach

| Edge case | Behavior |
|---|---|
| Goal change mid-week | Recalc targets, keep history in `macro_logs` |
| Weight outside bounds (50-500lbs) | Reject + error |
| 0 recipes match remaining macros | Generic suggestion: "~50g protein from any source" |
| Over kcal target | "Done for today? Save calories for tomorrow" |
| Recipe macros null | Excluded from auto-log |
| Manual log deleted | Soft delete with 5s undo toast |
| Apple Health revoked mid-use (v1.2) | Fallback to manual; banner "Reconnect to Apple Health" |
| HealthKit returns impossible values | Clamp to [0, 5000] kcal etc. |
| HealthKit dedupe (same meal logged twice) | UNIQUE INDEX on `external_id` |

### 10.7 Family Share

| Edge case | Behavior |
|---|---|
| Owner cancels Mori+ | Group enters 30-day soft window; members notified to upgrade individually |
| Member leaves | Drops from group, keeps personal library |
| 5th tries to join | "Family is full" |
| Owner deletes account | Ownership transfers to oldest member |
| Conflicting Plan edits | Optimistic lock + retry |
| Realtime subscription drops | Polling fallback every 30s |

### 10.8 App Review

| Risk | Mitigation |
|---|---|
| Reviewer can't get past onboarding | Sandbox demo account skips onboarding (server-side flag) |
| Reviewer hits monthly AI gen cap | Sandbox demo account flagged premium |
| Reviewer can't access Instacart (US-only) | Note in review notes: "Instacart is a US-only feature; not required to test Mori+" |
| Reviewer rejects "subscription unclear value" | Specific value propositions in App Store description + paywall + review notes |
| Reviewer can't see paywall (UI bug) | Provide deeplink in review notes: `mori://paywall` |
| Reviewer rejects "missing Restore" | Restore on paywall AND in Settings (double placement) |
| Reviewer rejects "trial unclear" | Disclosure copy verbatim per §9.2 |
| Reviewer rejects "auto-renew unclear" | Same disclosure |
| Reviewer rejects toggle paywall | Don't ship one (banned Jan 2026) |

### 10.9 Operational

| Risk | Monitoring |
|---|---|
| RC webhook failures | Sentry alert on >0 errors in 1h |
| AI cost spike | Daily Anthropic spend alert via cron + Slack/email |
| Push send failures | Daily digest of `DeviceNotRegistered` count |
| Sub conversion < target | Weekly cohort dashboard (Supabase function) |
| Paywall view → trial start funnel | Track via Sentry breadcrumbs + Supabase event log |
| Cancellation reasons | RC dashboard cancellation reason histogram |

### 10.10 Tax + legal

| Item | Action |
|---|---|
| US 1099 | Apple files; track in spreadsheet |
| EU VAT | Apple withholds; net deposited |
| GDPR data deletion | Account delete must purge `ai_usage`, `macro_logs`, `sunday_drops`, `decks`, `family_*` rows + RC `deleteUser` |
| CCPA | Same |
| App Privacy Manifest | Include RC's; declare Purchase History + User ID linked |
| Privacy Policy update | Mention RC, Apple Health (v1.2), subscription data collection |
| Terms of Use update | Auto-renew, cancel, refund policy, family share rules |

---

## 11. Policy + legal changes

### 11.1 Privacy Policy updates
Add new section "Subscriptions and Payment Processing":
> When you subscribe to Mori+, your purchase is processed by Apple via the App Store and managed by RevenueCat, our subscription management provider. RevenueCat receives your anonymized user ID, purchase history, and subscription status. This data is used to maintain your access to Mori+ features. We do not receive your payment method, full name, or billing address — only your subscription state.

Add v1.2 (Apple Health):
> If you opt in to Apple Health integration, Mori reads weight and activity data from HealthKit and writes meals you cook to HealthKit. This data stays on-device or syncs to your iCloud-encrypted Health database; Mori never transmits HealthKit data to our servers without your explicit per-action consent.

### 11.2 Terms of Use updates
Add new section "Subscriptions":
> Mori+ is an auto-renewing subscription billed through Apple. Subscription periods (monthly or yearly) renew automatically unless cancelled at least 24 hours before the end of the current period. Cancellation is managed via your iPhone Settings → [Apple ID] → Subscriptions. Refunds are processed by Apple per their refund policy; Mori cannot directly issue refunds. Subscription benefits cease at the end of the paid period after cancellation.

Add Family Share clause (v1.2):
> Mori+ Family allows the subscriber (owner) to share access with up to 4 other Mori users. The owner is solely responsible for the subscription. If the owner cancels, all members lose Mori+ access at the end of the paid period.

### 11.3 App Store Connect "App Privacy" updates
Add data types:
- **Purchase History** — Linked to user — App Functionality
- **User ID** — Linked to user — App Functionality, Analytics
- (v1.2) **Health & Fitness** — Linked to user — App Functionality (only if HealthKit enabled)

### 11.4 Privacy Manifest (`PrivacyInfo.xcprivacy`)
RevenueCat includes its own. Verify it's bundled in production build:
```
ios/Pods/RevenueCat/PrivacyInfo.xcprivacy
```
Also update Mori's app-level manifest at `ios/Mori/PrivacyInfo.xcprivacy` to add UserDefaults usage if absent (RC writes a small cache there).

### 11.5 GDPR / CCPA data deletion
Update the existing account-delete flow ([app/account-delete.tsx](app/account-delete.tsx) — verify exists; add if not):
1. Delete from Supabase: `profiles`, `ai_usage`, `macro_logs`, `macro_goals`, `sunday_drops`, `decks`, `family_groups` (where owner), `family_members`, `recipe_interactions`, `meal_plans`, `pantry_items`, `user_leftovers`, `recipe_reviews`, `recipe_flags`, `saved_recipes`
2. Call RevenueCat REST API: `DELETE /v1/subscribers/{user_id}` (deletes RC profile)
3. Delete `auth.users` row last
4. Note: Apple keeps purchase history regardless (legal record); we cannot delete that

---

## 12. App Store Connect submission spec (v1.1)

### 12.1 Products to create (App Store Connect → In-App Purchases)

**Subscription Group: "Mori+"**

| Product | Type | Price | Trial | Reference Name | Display Name |
|---|---|---|---|---|---|
| `mori_plus_monthly` | Auto-Renewable Subscription | $4.99 | 30 days free | Mori+ Monthly | Mori+ Monthly |
| `mori_plus_annual` | Auto-Renewable Subscription | $39.99 | 30 days free | Mori+ Yearly | Mori+ Yearly |

**Standalone (Non-Renewing):**

| Product | Type | Price | Display |
|---|---|---|---|
| `mori_plus_lifetime` | Non-Consumable | $79.99 | Mori+ Lifetime |

### 12.2 Per-product metadata required

For each:
- Localizations: English (US) only at launch
- Display Name (matches above)
- Description (1 short sentence per SKU)
- Review Screenshot: full paywall screenshot annotated with arrow pointing to that SKU

For subscription group:
- App Name (auto-filled): Mori
- Localized Group Display Name: "Mori+"

### 12.3 Subscription benefit descriptions (per SKU)

```
Mori+ Monthly:
"Unlock AI-powered weekly meal planning, personalized Sunday recipe drops,
unlimited recipe generation, and macro coaching. Billed monthly."

Mori+ Yearly:
"All Mori+ benefits at 33% off the monthly rate. AI weekly meal planner,
Sunday Drop, unlimited generation, macro coach. Billed annually."

Mori+ Lifetime:
"One-time payment for permanent Mori+ access. Founders pricing — limited
to first 60 days post-launch. No recurring charges."
```

### 12.4 App Review Information

**Demo Account:**
- Email: `appreview+sandbox@getmori.app`
- Password: `<rotated each submission>`
- Pre-flagged premium=TRUE in DB so reviewer doesn't need to actually purchase

**Sandbox Tester Account (separate):**
- Apple-provided sandbox account for the actual purchase test
- Email: `sandbox+mori@apple-test.com`

**Review Notes (paste verbatim into App Store Connect):**

```
Mori+ is an auto-renewing subscription that unlocks AI-powered features:
- AI Weekly Meal Planner (Plan tab → "Build my week")
- Sunday Drop: 7 personalized recipes delivered weekly
- Unlimited AI recipe generation (free tier: 3/month)
- Generate-from-Pantry: AI recipes using ingredients you already have
- Macro Coach: daily macro targets + recipe gap-suggestions
- Saved filter Decks for focused recipe discovery
- Ad-free experience (free tier shows sponsored ingredient placements)

The free tier remains fully functional: swipe-based recipe discovery,
recipe library, manual meal planning, grocery list, and Instacart
integration are all unlimited and unaffected by the subscription.

To test the paywall:
1. Sign in with the demo account: appreview+sandbox@getmori.app /
   <password from form>
2. The demo account is flagged premium so you can see all paid
   features. To see the paywall itself:
3. Open Settings → "Manage Mori+" — this opens the same paywall
   surface used to acquire new subscribers
4. To test purchasing, use the provided sandbox tester account
   (sandbox+mori@apple-test.com) on a device signed out of Apple ID,
   then sign in to App Store with the sandbox account when prompted

Restore Purchases is in two locations:
- Footer of the paywall modal
- Settings → Subscription → Restore

Privacy Policy: https://getmori.app/privacy
Terms of Use: https://getmori.app/terms
Both also linked from the paywall footer (in-app webview).

The Instacart feature in the grocery list is a US-only third-party
integration and is not required to evaluate Mori+. If the reviewer
is in a non-US region, the "Send to Instacart" button will be hidden;
all other functionality remains.

If anything is unclear, please contact: jacob@getmori.app
```

### 12.5 Demo video (when needed)
Apple may request a demo video if review notes are insufficient. Pre-record:
- 60-second screen recording (1080×1920 portrait)
- Shows: open app → tap "Build my week" → paywall appears → annotate price + Restore + Privacy + Terms
- Upload to App Store Connect or include link in review notes (private YouTube unlisted)

### 12.6 Submission sequence

1. **Create products** in App Store Connect (3 products above) — populate metadata, screenshots
2. **Set products to "Ready to Submit"** state (verify before binary upload)
3. **Build v1.1 binary** with full paywall + RevenueCat SDK + all premium features
4. **Add IAPs to binary submission** at upload time (UI prompt in App Store Connect submission flow)
5. **Submit binary + IAPs together** as one bundle for review
6. **Reviewer tests both** — paywall mechanics + sandbox purchase
7. **Approval triggers IAP propagation** — wait 24h for App Store CDN before public launch
8. **Phased release** — start at 1% rollout, scale 10% → 50% → 100% over 7 days; pause if churn spikes

### 12.7 Pre-submission checklist (block submission if any unchecked)

- [ ] All 3 IAPs in **Ready to Submit** state
- [ ] Privacy Policy URL works (`https://getmori.app/privacy`)
- [ ] Terms of Use URL works (`https://getmori.app/terms`)
- [ ] Both URLs open in-app webview from paywall footer
- [ ] Restore button on paywall + in Settings
- [ ] Disclosure copy matches §9.2 exactly
- [ ] Trial disclosure under CTA (NOT only on confirmation modal)
- [ ] No toggle paywall
- [ ] Screenshots updated showing Mori+ features
- [ ] App Store description mentions subscription
- [ ] App Privacy section updated (Purchase History, User ID)
- [ ] Privacy Manifest bundled in build
- [ ] Sandbox-tested all flows: purchase, cancel, renew, restore, upgrade, refund
- [ ] EAS env: `EXPO_PUBLIC_REVENUECAT_IOS_KEY` set in production + preview, pinned in `eas.json`
- [ ] Vercel env: `RC_WEBHOOK_SECRET`, `EXPO_ACCESS_TOKEN` set
- [ ] RC webhook URL verified: `curl -i https://getmori.app/api/rc-webhook` returns 401 (correct — no auth)
- [ ] Sentry.flush(2000) in finally on every new endpoint
- [ ] Demo account flagged premium in production DB
- [ ] Demo video recorded (link in review notes)
- [ ] Billing Grace Period = 16 days enabled in App Store Connect

### 12.8 If rejected

| Rejection reason | Fix |
|---|---|
| 3.1.2 — Restore missing | Verify on paywall footer; resubmit |
| 3.1.2 — Trial unclear | Tighten disclosure; resubmit |
| 3.1.2 — Toggle paywall | Re-architect to stacked cards (already done in §9) |
| 3.1.2 — Subscription terms unclear | Expand description; expand review notes |
| 4.0 — Spam / minimum functionality | Ensure paywall surfaces ≥3 distinct features; resubmit |
| 5.1.1 — Privacy declarations missing | Update App Privacy + manifest |
| Reviewer can't reproduce | Better demo account credentials; demo video |

Appeal via App Store Connect Resolution Center within 24h. RevenueCat support team will help review for free if first rejection — email support@revenuecat.com.

---

## 13. Implementation milestones (revised — all-at-once for v1.1)

| M | Scope | Files | Complexity |
|---|---|---|---|
| **M0 — Pre-work** | Apply schema migration; create RC + sandbox accounts; RC dashboard config; pin EAS env | `supabase/add-mori-plus.sql`, `eas.json`, RC dashboard | S |
| **M1 — RevenueCat client** | `lib/revenueCat.ts`; init in `_layout.tsx`; `userStore.isPremium`; logout flow | 4 files | M |
| **M2 — Webhook + entitlement sync** | `api/rc-webhook.ts`; idempotency table; webhook secret in env | 2 files | M |
| **M3 — Paywall** | `components/paywall/PaywallModal.tsx`; trigger plumbing; Settings → Subscription screen; Restore flow | 5 files | M |
| **M4 — Free-tier monthly budgets** | `lib/aiUsage.ts`; modify `api/generate-recipe.ts`; soft-paywall trigger at 1 left | 3 files modified, 1 new | S |
| **M5 — Push pipeline** | `lib/push.ts`; `api/_pushUtils.ts` complete; `_layout.tsx` token registration; profiles.push_token migration; permission prompt timing | 4 files | M |
| **M6 — Auto Plan** | `api/auto-plan-week.ts`; `components/plan/AutoPlanSheet.tsx`; plan.tsx integration; idempotency cache | 3 files | M-L |
| **M7 — Sunday Drop** | `api/cron/sunday-drop.ts`; `components/discover/SundayDropSection.tsx`; archive screen; vercel.json cron | 5 files | L |
| **M8 — Generate from Pantry** | `api/generate-from-pantry.ts`; `components/discover/CookWhatIHaveSheet.tsx`; discover integration | 3 files | S |
| **M9 — Macro Coach (manual logging)** | `app/macro-coach.tsx` + setup screen; `api/macro-coach.ts`; `lib/macroCoach.ts`; macro_logs + macro_goals migration | 6 files | L |
| **M10 — Saved Decks** | `app/decks.tsx`; `stores/decksStore.ts`; explore.tsx integration | 3 files | S |
| **M11 — Substitution AI extension** | Extend existing `api/substitutions.ts`; recipe detail long-press | 2 files | XS |
| **M12 — Policy + manifest** | Privacy Policy update; ToS update; App Privacy declarations; Privacy Manifest verification | docs only | XS |
| **M13 — Submit v1.1** | Sandbox QA; screenshots; ASC product setup; review notes; demo video; binary upload | — | S |
| **M14 — Phased rollout** | 1%→10%→50%→100% over 7 days; monitor churn + crash rate | — | S |

**Total scope:** ~50 new files, ~20 modified. Estimated 4–6 weeks for solo dev parallelizing with v1.0 review window.

**Critical path:** M0 → M1 → M2 → M3 → M4 → M13. Everything else is parallel.

### v1.2 milestones (~6 weeks after v1.1)

| M | Scope |
|---|---|
| **M15 — Apple Health (Macro Coach v2)** | HealthKit plugin + permissions + read/write |
| **M16 — Family Share** | Group + member tables; invite flow; shared Plan + grocery list with Realtime |
| **M17 — Win-back campaign** | RC promotional offers; in-app re-engagement for churned users |

---

## 14. Development workflow

### 14.1 Branching
- `main` — v1.0 (already submitted, no Mori+ code)
- `mori-plus` — long-running feature branch with all M1–M14 work
- After v1.0 launches publicly, merge `mori-plus` → `main` and tag v1.1

### 14.2 Feature flag
Wrap entire Mori+ surface in remote config flag `mori_plus_enabled` (Vercel env var fetched on app start). Allows kill-switch if launch goes sideways.

```ts
// lib/featureFlags.ts
export const flags = {
  moriPlusEnabled: process.env.EXPO_PUBLIC_MORI_PLUS_ENABLED === 'true',
};
```

Default OFF until v1.1 launch day. Flip to ON via EAS env update + OTA push (instant).

### 14.3 Testing
- All new logic gets Jest tests (matches existing pattern — 471 tests, 36 suites currently)
- New tests required:
  - `__tests__/lib/aiUsage.test.ts` — budget gate, increment idempotency
  - `__tests__/api/rc-webhook.test.ts` — auth, idempotency, all event types
  - `__tests__/lib/revenueCat.test.ts` — isPremium guard, mock Purchases
  - `__tests__/lib/macroCoach.test.ts` — Mifflin-St Jeor, target calculation
  - `__tests__/api/auto-plan-week.test.ts` — auth, premium gate, candidate scoring
  - `__tests__/api/cron-sunday-drop.test.ts` — eligibility filter, idempotency
  - `__tests__/components/PaywallModal.test.ts` — render correctness, all SKU states
- Integration tests in TestFlight: each milestone gets a TF build + manual test pass

### 14.4 Sandbox QA matrix
Run before submission:

| Scenario | Expected |
|---|---|
| Buy monthly | webhook fires within 5s; `is_premium=TRUE`; AI gen unlimited |
| Cancel monthly | `premium_will_renew=FALSE`; access until expiry |
| Resubscribe after cancel pre-expiry | `premium_will_renew=TRUE`; no double charge |
| Resubscribe after expiry (no trial) | New sub, no trial offered |
| Buy annual | same as monthly + 33% saved badge |
| Upgrade monthly→annual | proration charged; `PRODUCT_CHANGE` webhook |
| Buy lifetime | one-time charge; `is_premium=TRUE`, `premium_expires_at=NULL` |
| Restore on new device | entitlement carries via Apple ID |
| Restore with no purchases | "No subscriptions found" alert |
| Sandbox time-skip renewal | webhooks fire; entitlement persists |
| Force refund via App Store | `is_premium=FALSE` within 5s |
| Billing failure simulation | `premium_in_grace_period=TRUE`; 16 days access |
| Sub paused (annual) | `is_premium=FALSE` during pause; resume re-enables |
| Free user hits 3 AI gens | 4th call returns 402 |
| Premium user hits 100 AI gens | All succeed |
| Push permission denied | Sunday Drop still appears in app |
| Sunday Drop generated 2x | UNIQUE constraint blocks; no double-charge |
| Webhook replay (same event_id) | 200 noop |
| Webhook with bad auth | 401 |

---

## 15. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| App Store rejects paywall | M | H | Pre-vetted layout (§9), RC support pre-review, demo video, careful review notes |
| RC outage | L | M | SDK caches entitlement 24h; degraded mode unlocks all premium features with banner |
| AI cost spike | M | M | Hard rate limits per-user-per-day; daily Anthropic spend monitor + Slack alert |
| Push send failures cascade | L | L | expo-server-sdk handles retries; failed tokens auto-cleared |
| Conversion < 2% (paywall fails) | M | H | A/B test paywall copy via RC Experiments; founders lifetime offer fills gap |
| Churn > 30% in month 1 | M | H | Win-back campaign in v1.2; Family Share creates lock-in |
| Subscriber thinks "unlimited AI" = unlimited cost | L | M | Per-user-per-day cap (50/day); user-facing text says "unlimited for normal use" |
| Family Share abuse (1 sub → 10 friends) | L | M | Hard 4-member cap; require active premium of owner |
| Apple changes 3.1.2 mid-cycle | L | H | RC watches for guideline changes and updates SDK quickly |
| Refund fraud (charge back after using) | M | L | Apple bears risk; we revoke immediately on chargeback webhook |
| User accuses unwanted charge | L | L | Apple handles refund; we point user to App Store support |

---

## 16. Verification + test plan (post-merge)

### 16.1 Smoke test (run after each TestFlight build)
```bash
# Webhook reachable (no auth)
curl -i https://getmori.app/api/rc-webhook
# Expect: 401

# Webhook with valid auth, dummy event
curl -X POST https://getmori.app/api/rc-webhook \
  -H "Authorization: Bearer $RC_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":{"id":"test-1","type":"TEST","app_user_id":"test"}}'
# Expect: 200 ok ignored

# Auto-plan endpoint with no auth
curl -X POST https://getmori.app/api/auto-plan-week -d '{}'
# Expect: 401

# Auto-plan with free user JWT
curl -X POST https://getmori.app/api/auto-plan-week \
  -H "Authorization: Bearer $FREE_USER_JWT" -d '{}'
# Expect: 402
```

### 16.2 End-to-end golden path
1. New user installs v1.1 → onboarding → arrives at Discover (free)
2. Swipes 5 recipes → saves 3
3. Goes to Plan tab → taps "Build my week" → paywall appears
4. Taps annual → 30-day trial starts
5. Plan tab populates → Send to grocery list → Send to Instacart
6. Sunday: receives push → opens app → Sunday Drop section visible
7. Cooks a recipe → marks cooked → macros auto-log
8. Macro Coach screen: "200g protein logged, 240g target — 3 dinner ideas"
9. Day 5 of trial: settings → Manage Mori+ → would charge $39.99 next
10. Day 8: card charged successfully → `RENEWAL` webhook fires → access continues

### 16.3 Cohort dashboard (Supabase Studio)
SQL views to monitor weekly:
```sql
-- Conversion funnel
SELECT
  COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS signups,
  COUNT(*) FILTER (WHERE is_premium AND created_at > now() - interval '30 days') AS converted,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_premium AND created_at > now() - interval '30 days') /
    NULLIF(COUNT(*) FILTER (WHERE created_at > now() - interval '30 days'), 0), 2) AS pct
FROM profiles;

-- Churn
SELECT
  DATE_TRUNC('week', premium_started_at) AS cohort_week,
  COUNT(*) AS subscribed,
  COUNT(*) FILTER (WHERE is_premium = FALSE) AS churned,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_premium = FALSE) / COUNT(*), 2) AS churn_pct
FROM profiles
WHERE premium_started_at IS NOT NULL
GROUP BY cohort_week ORDER BY cohort_week DESC;

-- Feature usage by tier
SELECT
  is_premium,
  COUNT(DISTINCT user_id) AS users,
  AVG(count) AS avg_ai_gens
FROM ai_usage
JOIN profiles ON ai_usage.user_id = profiles.id
WHERE month = to_char(now(), 'YYYY-MM')
GROUP BY is_premium;
```

---

## 17. Operational runbook (post-launch)

### 17.1 Daily
- Check Sentry dashboard for `area: revenuecat-init` and `area: rc-webhook` errors
- Spot-check Anthropic spend via dashboard

### 17.2 Weekly
- Review conversion + churn cohort dashboards
- Review RC dashboard: cancellation reasons, trial-to-paid conversion
- Review push delivery rate

### 17.3 Monthly
- Audit `ai_usage` for anomalies (any user > 200 gens?)
- Review revenue: Apple Connect → Sales + Trends → Subscriptions
- Review cost: Anthropic + OpenAI + Vercel + RC fees
- Calculate gross margin: revenue (after Apple cut) - COGS

### 17.4 Alerts (set up)
- Sentry: any error tagged `rc-webhook` → email
- Vercel: function errors > 1/hr → email
- Daily Slack: `Daily Anthropic spend: $X | Vercel functions: Y | RC active subs: Z`

---

## 18. Critical files reference

| File | Role |
|---|---|
| [supabase/schema.sql](supabase/schema.sql) | Final schema target |
| [supabase/add-mori-plus.sql](supabase/add-mori-plus.sql) | New migration (apply first) |
| [api/_apiAuth.ts](api/_apiAuth.ts) | Reuse `requireAuth` pattern |
| [api/_rateLimit.ts](api/_rateLimit.ts) | Reuse `rateLimitUser` |
| [api/generate-recipe.ts](api/generate-recipe.ts) | Add `checkAiBudget` + `incrementAiUsage` |
| [api/rc-webhook.ts](api/rc-webhook.ts) | NEW — entitlement sync |
| [api/auto-plan-week.ts](api/auto-plan-week.ts) | NEW |
| [api/generate-from-pantry.ts](api/generate-from-pantry.ts) | NEW |
| [api/macro-coach.ts](api/macro-coach.ts) | NEW |
| [api/cron/sunday-drop.ts](api/cron/sunday-drop.ts) | NEW |
| [app/_layout.tsx](app/_layout.tsx) | Init RC, register push token |
| [app/(tabs)/plan.tsx](app/(tabs)/plan.tsx) | Lines 352–371 → "Build my week" button |
| [app/(tabs)/discover.tsx](app/(tabs)/discover.tsx) | Sunday Drop section + Cook-what-I-have button |
| [app/(tabs)/profile.tsx](app/(tabs)/profile.tsx) | "Coach" entry + "Upgrade" row |
| [app/macro-coach.tsx](app/macro-coach.tsx) | NEW — coach screen |
| [app/decks.tsx](app/decks.tsx) | NEW — saved decks |
| [stores/userStore.ts](stores/userStore.ts) | Add `isPremium` |
| [lib/revenueCat.ts](lib/revenueCat.ts) | NEW — SDK wrapper |
| [lib/aiUsage.ts](lib/aiUsage.ts) | NEW — monthly budget gate |
| [lib/push.ts](lib/push.ts) | NEW — server push helper |
| [lib/macroCoach.ts](lib/macroCoach.ts) | NEW — target math |
| [lib/featureFlags.ts](lib/featureFlags.ts) | NEW — kill switch |
| [components/paywall/PaywallModal.tsx](components/paywall/PaywallModal.tsx) | NEW |
| [components/plan/AutoPlanSheet.tsx](components/plan/AutoPlanSheet.tsx) | NEW |
| [components/discover/SundayDropSection.tsx](components/discover/SundayDropSection.tsx) | NEW |
| [components/discover/CookWhatIHaveSheet.tsx](components/discover/CookWhatIHaveSheet.tsx) | NEW |
| [eas.json](eas.json) | Pin `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_MORI_PLUS_ENABLED` |
| [vercel.json](vercel.json) | Sunday Drop cron schedule |
| [package.json](package.json) | + `react-native-purchases`, `react-native-purchases-ui`, `expo-server-sdk` |

---

## Appendix A — STASHED: Idea #2 — Sponsored Ingredients (DEFERRED)

Captured in full so it isn't lost. **Not part of this implementation.**

### Concept
CPG brands pay to be featured as the default brand for generic ingredients in recipes + grocery lists. Native, FTC-labeled, opt-out for paid users.

### Three placement types
1. **Featured pill** on Recipe Detail bottom: "Sponsored — Try with Maldon Sea Salt"
2. **Default ingredient brand match** in grocery list (highest converting — point of purchase intent)
3. **Sponsored Discover card** (1 per ~20 organic) — labeled "Sponsored by [Brand]"

### Pricing models
- CPM $5–15, CPC $0.50–2, CPA $3–10, hybrid CPM + CPA bonus
- Conservative: 10K MAU × 120 impressions/mo × $7 CPM × 3 active campaigns = ~$8.4K/mo
- Stacks on top of Instacart 5% (user is in buying mode)

### Schema (when built)
```sql
sponsored_brands (id, name, logo_url, website_url, contact_email,
                  active, contract_start, contract_end, budget_remaining_cents)
sponsored_placements (id, brand_id, placement_type, ingredient_keyword,
                      recipe_filter_jsonb, cpm_cents, cpc_cents, cpa_cents,
                      start_date, end_date, daily_impression_cap, weight)
sponsored_impressions (id, placement_id, user_id, recipe_id, session_id,
                       shown_at, clicked, clicked_at, instacart_added, added_at)
```

### Mandatory guardrails
- Always labeled "Sponsored"
- Always dismissible (X to hide brand forever, recorded as negative signal)
- 1 pill/recipe, 3/session max
- **Mori+ subscribers see ZERO sponsored content** (this is the perk that justifies the sub)
- Never on community recipes (protects social trust)
- Never on dietary/medical-tagged recipes (no sponsored brands on diabetic, allergen-free, pregnancy)

### Brand pipeline (when activated)
Tier 1 cold outreach: Maldon, Diamond Crystal, Jacobsen, Brightland, Graza, Flamingo Estate, Rao's, Fly By Jing, Cholula, Bonne Maman, Mike's Hot Honey, Kerrygold, Vital Proteins, Burlap & Barrel, Otamot, Omsom

Phase 1 (months 1–3): hand-sell 1–2 brand pilots ($1–3K/mo) — prove the model with case study data.
Phase 2 (months 4–9): scale to 5–10 brands via warm intros.
Phase 3 (month 10+): plug into CPG ad network (Aki Technologies, GroundTruth, Hivebrite).

### Why deferred
- Subscription should prove out first to avoid "ad-supported AND paywalled" trap that kills retention
- Network effects matter: needs ≥10K free MAU before brand pitches land
- Hand-place ONE pilot brand at flat $2K/mo for 60 days BEFORE building the platform
- Trigger threshold to revisit: Mori has ≥10K MAU AND ≥200 paying Mori+ subs, OR a brand inbounds with ≥$2K pilot offer

### Mini implementation plan (when triggered)
1. Schema migration (3 tables above)
2. Recipe Detail UI: featured-pill renderer with "Sponsored" label + dismiss
3. Grocery list: ingredient → brand match resolver
4. Discover card: sponsored-card renderer
5. Impression/click tracking
6. Daily reporting cron
7. UTM params on Instacart deep links for attribution
8. Mori+ premium hide-all logic

---

## Appendix B — Alternatives considered (and rejected)

### B1 — Free-forever + ads only
Rejected. Recipe app users hate ads; user reviews suffer; CPM alone won't sustain Anthropic costs at scale.

### B2 — Premium tier only (no free generation)
Rejected. Free AI gen is a key acquisition driver — converts curiosity into commitment. 3/mo budget is enough to taste the feature without crowding out paid value.

### B3 — Per-feature IAP (buy Auto Plan separately, buy Coach separately)
Rejected. Higher friction; harder to message; lower per-user revenue; Apple discourages "feature unlock" IAPs in favor of subscriptions for ongoing value.

### B4 — Family-only tier (Mori+ Family at $7.99/mo)
Rejected for v1.1. Adds tier complexity. Revisit in v1.3 if data supports — Family Share is included in single Mori+ tier as standard.

### B5 — Lifetime as permanent SKU (not founders-only)
Rejected. Lifetime caps LTV; founders-only window creates urgency and converts our most-engaged users while preserving recurring revenue from everyone else.

### B6 — Different price point ($2.99/mo or $9.99/mo)
$2.99 too low to fund Anthropic costs at scale + creates "cheap = bad" perception. $9.99 too high for first-year app without proven feature value. $4.99/mo is the standard for this category and matches users' reference price.

### B7 — Phased v1.1 → v1.2 → v1.3 with single feature each
Rejected (see §2). Multiplies review touches without reducing risk.

---

*Plan ready to execute. Critical path: M0 → M1 → M2 → M3 → M4 → M13. Everything else parallel.*
