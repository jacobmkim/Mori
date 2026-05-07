# Recipe Quality Overhaul — 2026-05-07

End-to-end overhaul of the recipe database (2,617 recipes) covering accurate
USDA-grounded macros, recipe portion correction, and instruction validity.

---

## Final state (after this session)

| Metric | Value |
|---|---|
| Total recipes | **2,617** (deleted 2 invalid) |
| Macros source | **USDA-grounded calculator** (replaced AI estimator) |
| Macro ingredient coverage | **99.2%** useful (incl. gap-fill cache); 94% direct hardcoded match |
| Recipes with computed macros applied | **2,579** (37 skipped at coverage <70%, 1 transient retry) |
| Absurdity-warned recipes (cal>2500, fat>200g, protein>200g, carb>300g, cal<30) | **0** |
| Recipe-step audit (Haiku score < 90) | **0** flagged after manual sweep (was 66 after first run) |
| Meal-prep tagged | **463 / 2,617 (18%)** — based on real macros + cal≤600 + protein≥25 + structure rules |

---

## What changed in production

### Recipes deleted (2)

| ID | Title | Why |
|---|---|---|
| `10e1c37c-56d8-4dd4-a5ec-88a75ba87a62` | Garlic Pasta | User-added test recipe; only ingredient was "4 cloves of garlic" |
| `5f8d3039-f25b-4bb9-8a89-f037d36ad592` | Ground Beef Taco Seasoning | Component-only (just spice mix); not a meal |

### Recipes with corrected `servings`

87 recipes had over-portioned ingredients (e.g. 5.5 lb short ribs for 4
servings = 624 g/serving raw, way above 100-400 g band). Fix was always
`servings += N` to bring per-serving portion into a normal band. Applied via
`scripts/fix-recipe-portions.mjs`.

Examples:
- Slow-roast lamb 5-7 lb → servings 4 → 8 (per-serving 680g → 340g)
- Slow Cooker Korean Beef Short Ribs → servings 4 → 7
- Pork Ribs with Dry Rub → servings 4 → 6
- Crispy Beef Birria Tacos → servings 4 → 6

Plus two individual servings fixes during the calculator-bug sweep:
- Baklava → servings 4 → 16 (1 lb butter + 2.25 c walnuts is correct for 16 pieces)
- Crispy Pork Belly (Lechon Kawali) → servings 4 → 6 (3.5 lb pork belly)

### Recipes with corrected ingredients/steps (66+)

Phase 3 step audit flagged 66 recipes with score <90. Two rounds of
Haiku-proposed patches + a final hand-fix pass cleared all 66 to 90+. Fixes
fell into these categories:

| Category | Count | Pattern |
|---|---|---|
| `ingredient_mismatch` | 29 | Step references ingredient not in list → `add_ingredient` |
| `wrong_times` | 13 | Cook time off (e.g. raw chicken 2 min/side) → `update_step` time |
| `missing_ingredients` | 7 | Listed but never used → `remove_ingredient` |
| `wrong_technique` | 6 | E.g. Risotto without gradual stock → step rewrite |
| `ambiguous` | 5 | "Cook until done" with no time/cue → tighten wording |
| `incomplete` / `missing_steps` | 6 | Missing crucial step → `add_step` or `update_step` |

### Calculator (`scripts/compute-macros-from-usda.mjs`) bug fixes shipped

These were the source-of-truth bugs surfaced by the audit:

1. **Period-strip in unit normalizer** — `replace(/[.,]/g, '')` was destroying
   decimals: `"1.5 lb"` → `"15 lb"` → 10× over-count. Fixed with
   `(?<=\D)\.(?=\D|$)` to only strip non-decimal periods.
2. **Substring fallback was too permissive** — matched `"anchovy"` inside
   `"vegetable or anchovy stock"` → 173g protein/serving. Removed the substring
   path entirely; matcher now relies on first-N / last-N partials.
3. **Last-N priority before first-N** — head-noun bias: `"tomato ketchup"`
   now matches `ketchup`, not `tomato`.
4. **Ambiguous-bare-words guard** — `pepper`, `butter`, `beans`, `tomato`,
   `anchovy`, etc. cannot match as a partial of a compound name (only
   exact-equals input).
5. **Range units `(5-7 lb)`** — picks midpoint, not max.
6. **Inline quantity strings** — `quantity="2 cups"` with empty unit now parses
   correctly.
7. **OR handling** — `"ground beef or pork"` matches `ground beef`;
   `"vegetable or anchovy stock"` becomes `vegetable stock`.
8. **Plural matcher** — last-word `s`-strip for partial matches.
9. **Frying-oil discount** — fats >30g/serving treated as frying excess at
   15% absorption (USDA convention). Plus explicit `for frying` qualifier.
10. **Absurdity bounds** — calculator now flags `cal>2500`, `fat>200g`,
    `protein>200g`, `carb>300g`, `cal<30 (cov≥80)` — refused to write to DB.
11. **countWeight added** for: chicken cuts (drumsticks, legs, thighs, wings,
    quarters, cutlets, tenders), pork cuts (chops, tenderloin, shoulder
    steaks, ribs, baby back ribs), beef cuts (tenderloin/filet, ribeye,
    sirloin, flank, skirt, NY strip, T-bone, porterhouse), fish (salmon, cod,
    tilapia, trout, sea bass, branzino fillets), shellfish (lobster tail,
    lobster meat), turkey (legs, breast), duck (legs, breast, wings), whole
    birds.
12. **Gap-fill cache** — 269 ingredients Haiku-estimated and cached at
    `scripts/.cache/usda-gap-fill.json`. Calculator merges these into its
    USDA dict at startup. ~$0.23 to generate; reusable forever.

---

## The 4-layer macro pipeline (state of the system)

```
ingredient name → matchHardcoded() → live USDA API → gap-fill cache → null
```

1. **Hardcoded USDA table** (~990 entries) — fastest path, traceable to FDC IDs
2. **Live USDA API** (free w/ key, 1000 req/hr) — disk-cached at `scripts/.cache/usda-api-cache.json`
3. **Gap-fill cache** (Haiku-estimated, 269 entries) — for items not in
   hardcoded or API, e.g. specialty ingredients, brand names, unusual phrasing
4. **null** — ingredient is unmatched (1.7% of calls); contributes 0 cal

Per-recipe pipeline:
```
fetch ingredients → for each: match → toGrams → applyFryingDiscount → totals
                                                              ↓
                                                  divide by servings
                                                              ↓
                                                  absurdity bounds check
                                                              ↓
                                                  write to recipes.macros
```

Calculator output schema:
```
{
  macros: { calories, protein, carbohydrates, fat, fibre, isEstimated: true },
  coverage: 0..1,           // fraction of ingredients matched
  matched, total,
  viaHc, viaApi,            // counts by source
  detail, misses,           // per-ingredient breakdown
  warns: ["cal>2500", ...]  // absurdity flags
}
```

---

## Audit / checker scripts (saved in `scripts/`)

These are the durable tools for ongoing recipe quality:

### Calculator + macros
| Script | Purpose | Cost |
|---|---|---|
| `compute-macros-from-usda.mjs` | Compute per-serving macros from ingredients via USDA. **The primary calculator.** | $0 (USDA is free) |
| `gap-fill-ingredients.mjs` | Haiku-estimate macros for `no-match` ingredients; saves to JSON cache | ~$0.30 once |
| `apply-computed-macros.mjs` | Write computed macros to Supabase (`--apply`); skips coverage<70 by default | $0 |

### Audit / sanity check
| Script | Purpose | Cost |
|---|---|---|
| `sanity-check-macros.mjs` | Haiku judges plausibility of computed macros for each dish (per-serving). Flags egregious mismatches (cal/protein/dish-type) | ~$2-5 full DB |
| `audit-recipe-portions.mjs` | Deterministic per-serving portion check for meats/fish against bands (e.g. 100-300g chicken breast/serv) | $0 |
| `audit-recipe-steps.mjs` | Haiku scores cookability 0-100 (ingredient coverage, cook times, technique). Flags <threshold (default 90) | ~$5 full DB; `--only-ids <file>` for subset |

### Fix scripts
| Script | Purpose |
|---|---|
| `fix-recipe-portions.mjs` | Auto-propose `servings += N` to bring portion into band; `--apply` writes |
| `propose-step-fixes.mjs` | Haiku generates JSON patches for flagged recipes |
| `apply-step-fixes.mjs` | Apply the patches: `add_ingredient` / `remove_ingredient` / `update_step` / `remove_step` / `replace_all_steps` |

### Re-runnable workflow

To re-audit + fix recipe quality going forward:

```bash
# 1. Compute fresh macros (free, ~10 min)
node scripts/compute-macros-from-usda.mjs

# 2. Apply to DB (free, ~2 min)
node scripts/apply-computed-macros.mjs --apply

# 3. (Optional) Haiku sanity-check on plausibility
node scripts/sanity-check-macros.mjs --min-severity 3

# 4. Portion audit (free) + fix
node scripts/audit-recipe-portions.mjs
node scripts/fix-recipe-portions.mjs --apply

# 5. Step audit (cost ~$5)
node scripts/audit-recipe-steps.mjs

# 6. Generate fix proposals for flagged + apply
node scripts/propose-step-fixes.mjs
node scripts/apply-step-fixes.mjs --apply

# 7. Re-audit residuals + hand-fix as needed (only-ids flag)
node scripts/audit-recipe-steps.mjs --only-ids <ids.txt>

# 8. Re-run meal-prep rules
node scripts/apply-meal-prep-rules.mjs --apply
```

---

## Cost ledger for this session

| Step | Cost |
|---|---|
| First Haiku sanity-check (full DB, found 642 flagged before calculator was solid) | $7.22 |
| Targeted re-Haiku on 642 after calculator round-2 fixes | $1.77 |
| Gap-fill 270 unknown ingredients | $0.23 |
| Step audit (Haiku score 0-100 on all 2,617) | $5.34 |
| Step-fix proposals round 1 (66 recipes) | $0.16 |
| Step-fix proposals round 2 (15 residuals) | $0.04 |
| Step-audit verifications | $0.31 |
| **Total Haiku spend** | **~$15.07** |

Calculator is free going forward — only recurring cost is sanity-check ($5
when you want to re-validate) and gap-fill (when new recipes introduce new
ingredients, ~$0.10 per round).

---

## Community-recipe submission flow (post-this-session)

When a user submits a recipe via the Add Recipe wizard:

```
[user submits] → insertCommunityRecipe()
                ↓
                recipes row inserted: moderation_status='pending', is_public=true
                ↓
                enrichCommunityRecipe() (fire-and-forget):
                  - infers dietary_tags client-side
                  - calls /api/macros (AI estimator) → writes macros
                ↓
[hourly cron] api/cron/audit-pending-community.ts:
                - Haiku step-quality score (0-100)
                - writes recipes.audit_data { score, category, issues, audited_at, ingredient_hash }
                ↓
[admin reviews] Supabase Studio → recipes table:
                - sees audit_data.score, issues[]
                - flips moderation_status='approved' if it looks good
                - or 'rejected' if it doesn't
                ↓
[recipe goes public]  fetchDiscoverRecipes filters moderation_status='approved'
```

**What admin sees in Supabase Studio for a pending recipe:**
- `audit_data.score`: 0-100 cookability
- `audit_data.category`: ok | missing_steps | wrong_times | wrong_technique | etc.
- `audit_data.issues`: concrete observations (array)
- `audit_data.audited_at`: ISO timestamp
- `audit_data.ingredient_hash`: re-audit triggers when ingredients/steps change

**Recommended approval thresholds (admin guideline):**
- score ≥ 95: approve
- score 90-94: spot-check the issues, usually fine
- score 80-89: read the recipe; many of these are minor wording but some are real bugs
- score < 80: reject or send back for revision

**Macros for community recipes:** Currently AI-estimated via `/api/macros`. To upgrade to USDA-grounded: run the calculator periodically with `node scripts/compute-macros-from-usda.mjs` then apply. Future improvement: port calculator to a Vercel function and run as part of submission flow.

**Cron details:**
- Schedule: `0 * * * *` (hourly)
- Batch limit: 50 recipes per run (well under 30s Vercel timeout)
- Re-audits if `ingredient_hash` changes OR audit older than 7 days
- Cost: ~$0.001/recipe × <50/hr → trivial

---

## What's NOT covered (known gaps)

1. **Authenticity**: audit doesn't verify "is this really pad thai?" Cultural
   accuracy / regional traditions are out of scope.
2. **Sauce ratios**: calculator sums grams but doesn't judge whether a sauce's
   soy:vinegar:sugar ratio is right. Would need a separate ratio audit.
3. **Subtle technique**: tempering order in Indian dishes, when to add
   aromatics, salt timing — Haiku catches obvious cases, may miss nuance.
4. **`no-grams` items** (1,603 instances across 372 unique names) — these are
   mostly "to taste" salt/pepper/herbs (0-cal), harmless. Not contributing to
   under-counting.
5. **Recipe images**: separate audit (`audit-recipe-images.mjs` exists but
   wasn't run this session).
6. **Cooking-knowledge floor in generator**: `api/generate-recipe.ts` was
   already hardened earlier (sear-then-roast crossovers, sauce ratios, time
   floors). New recipes go through that.

---

## Files written this session (all in `scripts/`)

New scripts (callable):
- `compute-macros-from-usda.mjs` — calculator (extensively expanded — USDA
  table, parser, fry-cap, plurals, gap-fill loader, absurdity bounds)
- `gap-fill-ingredients.mjs`
- `apply-computed-macros.mjs`
- `sanity-check-macros.mjs`
- `audit-recipe-portions.mjs`
- `audit-recipe-validity.mjs`
- `audit-recipe-steps.mjs`
- `audit-recipe-data-bugs.mjs`
- `fix-recipe-portions.mjs`
- `propose-step-fixes.mjs`
- `apply-step-fixes.mjs`
- `hand-fix-residual-6.mjs` — kept as reference
- `hand-fix-residual-3.mjs` — kept as reference
- `test-audit-diagnose.mjs` — unit test

Caches (regenerable):
- `scripts/.cache/usda-api-cache.json` — live USDA API responses
- `scripts/.cache/usda-gap-fill.json` — Haiku-estimated entries (269 items)

Reports (timestamped, all in `scripts/reports/`):
- `macros-computed-dryrun-*.csv` — calculator output per run
- `macros-coverage-misses-*.csv` — per-run miss list (no-match + no-grams)
- `macros-flagged-*.csv` — Haiku sanity-check flagged recipes
- `recipe-portion-audit-*.csv` — Phase 1 portion flags
- `recipe-validity-audit-*.csv` — Phase 2 (mostly false positives)
- `recipe-steps-audit-*.csv` — Phase 3 all scores
- `recipe-steps-flagged-*.csv` — Phase 3 score<90
- `recipe-data-audit-*.csv` — combined warns + previously-flagged audit
- `step-fix-diff-*.txt` — before/after for applied step fixes

---

## Closing notes for future me / Mori v1.1+

- The **calculator is the single source of truth** for macros. AI-estimated
  macros from `backfill-macros.mjs` are deprecated; do not re-run that script.
- For new recipes: `api/generate-recipe.ts` produces the recipe; then
  immediately run `compute-macros-from-usda.mjs` (it can run incrementally;
  add `--id <recipe_id>` for single-recipe).
- The gap-fill cache should be refreshed when batches of new recipes
  introduce unfamiliar ingredients. Run `gap-fill-ingredients.mjs --resume`
  to add only the new misses.
- When user reports a wrong-macro recipe in production: check
  `compute-macros-from-usda.mjs --id <id> --verbose` to see the per-ingredient
  trace. If an ingredient is matching wrong, add to USDA hardcoded table or
  AMBIGUOUS_BARE_WORDS.
- The 90-score threshold on step audit is a calibration choice. For a stricter
  pass, raise to 95 — expect ~5-10× more flags. For a looser pass, lower to
  85 — accepts most "minor wording" issues.
- **Do not run the full Haiku sanity-check (`sanity-check-macros.mjs`) on
  every commit** — $5/run. Use `--only-ids <file>` to target subsets.
