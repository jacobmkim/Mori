# M8 — "Cook with what I have" (Generate from Pantry)

*Planned 2026-07-03. Prereq (AI-budget gate wired into all AI endpoints) landed the same day —
this feature launches gated from day one. Build order: after the Sunday Drop on-device debug pass.*

## Value prop
Open the fridge, tap once, dinner appears. Pantry + leftovers → ranked, cookable-tonight recipes
from the 2,600-recipe audited catalog; AI generation constrained to what's on hand when the catalog
comes up thin. This is also the **food-waste planner mode** (spoiling leftovers rank first) and the
third paywall card (pantry-gen is a promised fallback-paywall feature).

## Two-tier design (cardinal-rule safe)
- **FREE — catalog ranking.** Pure client-side compute over the existing deck catalog (like the
  scorer): zero AI cost, instant, works offline once the catalog is cached. A NEW free surface that
  demonstrates the value and carries the conversion moment.
- **PREMIUM — constrained generation.** `api/generate-from-pantry.ts`: Haiku generates up to
  **3 recipes/call** (commandment cap) using ONLY the user's on-hand ingredients + universal staples.
  Free taste: **1/month** (`FREE_AI_LIMITS['generate-from-pantry']` already = 1) → then the paywall.
  Premium unlimited (fair-use counted via `incrementAiUsage`, same as the other endpoints).

## Architecture

### 1. `lib/pantryMatch.ts` — pure, RN-free, unit-tested
`rankByPantryCoverage(catalog, pantrySet, leftovers, profileHardFilters)` → per recipe:
- **coverage** = matched non-staple ingredients ÷ total non-staple ingredients — reuse `isStaple`
  (lib/staples.ts) so salt/oil/spices never skew the ratio, and the scorer's word-containment
  matching semantics ("chicken breast" matches "chicken breasts").
- **missing**: the unmatched non-staple ingredient names (drives the grocery handoff).
- **usesLeftovers** + spoil-urgency bonus: leftovers expiring ≤3 days weight the rank (food-waste mode).
- **taste tie-break**: coverage buckets tie-broken by `scoreRecipe` (weekPlanCore) — same
  personalization as everything else, no fork.
- Hard filters FIRST: dietary goals (deckFilter) + ingredient dislikes + skill cap — commandment,
  and `violatesCurrentPrefs` (lib/sundayDrop.ts) already implements the recipe-level check to reuse.

### 2. UI — Discover entry (per the locked IA)
"Cook with what I have" entry on Discover → full-screen sheet:
- **Step 1 — what's on hand:** pantry items + active leftovers pre-checked (uncheck = don't use);
  spoiling items flagged "use soon"; quick-add input. **Empty pantry = friendly setup state**
  (reuse the onboarding staple tap-grid), never a dead end.
- **Step 2 — results:** two sections: **"You can make tonight"** (missing 0–1) and **"Almost
  there"** (missing 2–3, each card shows the missing items + one-tap **add-missing-to-grocery-list**
  → existing Instacart flow — closes the loop). Cards reuse `components/RecipeCards.tsx`; tap →
  `RecipeDetailModal` (full save/cook/cart).
- **Generate CTA** (shown when full matches < 3, or always at list end): "Generate a recipe from
  exactly what you have" → `flags.moriPlusEnabled` + `gateMoriPlus()` → endpoint. Free users get
  their 1/month taste before the paywall (conversion moment, mirrors Build-my-week).

### 3. `api/generate-from-pantry.ts`
- Security per commandments: `requireAuth` + Zod schema (`lib/validation.ts`) + `rateLimitUser`
  (5/day) + `checkAiBudget('generate-from-pantry')` before Claude + `incrementAiUsage` only on
  success + generic errors + `Sentry.flush` in `finally`.
- Prompt: reuses generate-recipe's COOKING-CORRECTNESS + grocery-availability scaffolding, plus a
  hard constraint: *use ONLY the provided ingredients + universal staples (salt, pepper, oil,
  common dried spices); introduce NOTHING that needs a shopping trip.* Dietary goals + dislikes
  passed as hard exclusions.
- Post-validation server-side (same as generate-recipe's tag sanitizer) + client-side
  `violatesCurrentPrefs` check before display — a generated recipe must never violate the
  profile it was generated for.
- Output: up to 3 ephemeral recipes. "Save to My Recipes" persists via the existing insert path
  with `is_public: false`, `source_type: 'generated'` (deck filters already exclude non-public).
- NOT saved to the shared catalog — pantry recipes are personal.

### 4. Data — no migration needed
`pantry_items`, `user_leftovers`, `recipes.is_public` all exist. No new tables.

## User edge cases (designed in, not patched later)
- Empty/stale pantry → setup state / default-on checkboxes to prune this session.
- Dietary change mid-session → hard filters read the CURRENT profile at rank time (no snapshot).
- Offline → catalog ranking works from cache; generate CTA shows a polite offline notice.
- Quantities are unknown (pantry stores names only) → card copy says "uses what you have — check
  amounts"; never claim exact sufficiency.
- Free user over budget → 402 → paywall sheet with honest copy ("1 free pantry recipe a month —
  Mori+ is unlimited"), catalog results stay fully usable.
- Double-tap generate → client in-flight guard + server rate limit.
- Allergy-grade dislikes → excluded at BOTH prompt and post-validation layers (prompt alone is
  not a guarantee).

## Verification
- `__tests__/lib/pantryMatch.test.ts` — coverage math, staples exclusion, word-containment,
  leftover urgency bonus, dietary/dislike hard filters, taste tie-break determinism.
- `__tests__/api/generateFromPantry.test.ts` — auth, rate limit, budget gate (402 pre-Claude,
  increment-on-success-only), 3-recipe cap, constraint post-validation.
- Adversarial audit workflows (money/bypass + cardinal-rule + user-edge-case lenses) after each
  stage, per standing commandment. On-device pass with kimmy_eatz before merge.

## Sequencing (~3 working sessions)
1. `lib/pantryMatch.ts` + tests (pure core first, same as weekPlanCore).
2. Sheet UI + Discover entry + grocery-list handoff (free tier complete, shippable alone).
3. Endpoint + gating + paywall CTA + tests + audits.

## Explicitly out of scope (v1)
Fridge Cam / photo recognition (demoted per converged scope), pantry quantity tracking,
multi-meal pantry planning (that's Auto Plan's job), saving pantry-gen recipes to the public
catalog, Android.
