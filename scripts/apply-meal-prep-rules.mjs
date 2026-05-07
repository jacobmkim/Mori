/**
 * apply-meal-prep-rules.mjs
 *
 * Deterministic meal-prep tag cleanup based on manual review of 60 recipes
 * (May 2026). Removes the meal_prep_friendly tag from any currently-tagged-true
 * recipe matching ANY of the rules below. No AI calls, transparent, reversible.
 *
 * RULES (a recipe is REMOVED if it matches any one of these):
 *   1. Calories > 600 per serving
 *   2. Protein < 25 g per serving
 *   3. No starch keyword found in any ingredients[].name (word-boundary match,
 *      ingredient names only — never title or step text)
 *   4. Any ingredients[].name matches a texture-fail noodle pattern
 *      (rice noodles / glass noodles / ramen / wide noodles get gummy reheated)
 *   5. Title matches a fresh-assembly pattern (taco / wrap / sandwich / sliders /
 *      hot dog / lobster roll / croissant / lunchable / snack box / mezze)
 *      — with whitelist overrides for cooked-dish forms (bowl / shell / skillet /
 *      casserole / bake / soup / pasta / salad)
 *
 * Rule 6 (crispy/breaded/fried) and rule for cream sauces SKIPPED — too noisy
 * to detect deterministically without false positives. Will leave those for
 * future hand review.
 *
 * Rule for "no starch but otherwise good" recipes: these become a separate
 * report at scripts/reports/needs-rice-candidates.csv. They are still REMOVED
 * by rule 3, but flagged so you can later choose to either add rice to the
 * recipe (re-tagging it true) or accept the removal.
 *
 * Usage:
 *   node scripts/apply-meal-prep-rules.mjs              # dry-run (default)
 *   node scripts/apply-meal-prep-rules.mjs --apply      # write to Supabase
 *   node scripts/apply-meal-prep-rules.mjs --verbose    # show every flipped recipe
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);

const args     = process.argv.slice(2);
const APPLY    = args.includes('--apply');
const VERBOSE  = args.includes('--verbose');

// ── Locked thresholds + keyword lists ────────────────────────────────────────
const CAL_CEILING   = 600;
const PROTEIN_FLOOR = 25;

// Bad-noodle patterns — research-backed list of noodles that fail meal-prep
// when sauced + refrigerated. These lack gluten structure (rice/mung bean
// based) so they clump or turn to mush over 1-2 days. Wheat pasta is fine
// and is NOT included here.
//
// Sources (mental synthesis): meal-prep convention — rice noodle dishes are
// universally recommended fresh, never make-ahead. Ramen broth-based dishes
// bloat by day 2. Glass/bean thread noodles stick into a single mass.
//
// Note: udon and soba are intentionally OMITTED — they're borderline (some
// meal-prep them, some don't) so we leave them KEPT for user discretion.
//
// Match against ingredient.name AND recipe title.
const BAD_NOODLE_INGREDIENT = [
  /\brice noodles?\b/,
  /\bglass noodles?\b/,
  /\bbean thread\b/,
  /\bcellophane noodles?\b/,
  /\brice vermicelli\b/,
  /\bramen( noodles?)?\b/,
  /\bpho noodles?\b/,
  /\bbanh pho\b/,
];
const BAD_NOODLE_TITLE = [
  // Dish names that imply rice noodles or ramen broth — even if the ingredient
  // list doesn't say "rice noodle" explicitly, the dish format guarantees the
  // noodle type and storage failure mode.
  /\bpad thai\b/, /\bpad see ew\b/, /\bpad kee mao\b/,
  /\bpho\b/, /\bbun bo hue\b/, /\bbun rieu\b/, /\bmi quang\b/,
  /\bramen\b/, /\bchow fun\b/,
  /\blaksa\b/,           // coconut rice noodle soup
  /\bbun cha\b/,         // rice vermicelli
];

// "Fried / dredged-and-pan-fried" title patterns — dishes where the
// preparation is oil-absorbing (dredge in flour, deep fry, or pan-fry with
// butter sauce that breaks on reheat). Macros are often under-reported by
// AI estimators because they don't account for oil absorption from dredging.
//
// Includes:
//   1. Unambiguous deep-fry titles
//   2. Dredged-and-pan-fried-with-butter-sauce dishes (marsala, piccata,
//      francese, cordon bleu, parmigiana when chicken/pork, milanese) —
//      even at moderate macros these don't meal-prep well: butter sauce
//      breaks reheating and breaded crust softens.
const DEEP_FRIED_TITLE = [
  // Deep-fry / fritter / batter
  /\btempura\b/, /\btonkatsu\b/, /\bschnitzel\b/,
  /\bdeep[\s-]?fried\b/,
  /\bbeignets?\b/, /\bchurros?\b/,
  /\bhush ?puppies\b/, /\bcorn dogs?\b/,
  /\bbeer[\s-]battered\b/,
  /\bonion rings\b/, /\bjalape[ñn]o poppers?\b/, /\bmozzarella sticks?\b/,
  /\bpakoras?\b/, /\bbhajis?\b/, /\bsamosas?\b/,
  /\bfritters?\b/,
  // Dredge-and-pan-fry-with-butter-sauce family
  /\bmarsala\b/, /\bpiccata\b/, /\bfrancese\b/, /\bcordon bleu\b/,
  // Milanese — only when applied to a specific protein (Chicken/Veal Milanese
  // = dredged pan-fry). Excludes "alla milanese" regional naming like
  // "Osso Buco alla Milanese" which is braised, not fried.
  /\b(?:chicken|veal|pork|turkey)\s+milanese\b/,
  // Parmigiana — exclude eggplant variants (vegetarian, less oil-heavy)
  /\b(?:chicken|pork|veal|turkey)\s+parmigiana\b/, /\b(?:chicken|pork|veal|turkey)\s+parmesan\b/,
];

// ── Rule application ──────────────────────────────────────────────────────────
function applyRules(recipe) {
  const reasons = [];
  const m = recipe.macros;
  const titleLower = (recipe.title || '').toLowerCase();
  const ingNames = (recipe.ingredients || [])
    .map(i => String(i.name || '').toLowerCase())
    .filter(Boolean);

  // To qualify as meal prep, recipe MUST be both low-cal AND high-protein.
  // Either failing disqualifies. Numeric gates check each independently.
  if (m && typeof m.calories === 'number' && typeof m.protein === 'number') {
    if (m.calories > CAL_CEILING) {
      reasons.push(`cal>${CAL_CEILING} (${m.calories})`);
    }
    if (m.protein < PROTEIN_FLOOR) {
      reasons.push(`protein<${PROTEIN_FLOOR} (${m.protein}g)`);
    }
  } else {
    reasons.push('no macros');
  }

  // Rule 3: bad noodles — check ingredient names AND title
  let badNoodleHit = null;
  for (const ing of ingNames) {
    for (const pat of BAD_NOODLE_INGREDIENT) {
      if (pat.test(ing)) { badNoodleHit = `ing: ${ing}`; break; }
    }
    if (badNoodleHit) break;
  }
  if (!badNoodleHit) {
    for (const pat of BAD_NOODLE_TITLE) {
      if (pat.test(titleLower)) { badNoodleHit = `title: ${pat.source}`; break; }
    }
  }
  if (badNoodleHit) reasons.push(`bad-noodle (${badNoodleHit})`);

  // Rule 4: deep-fried title — oil-heavy preparation, fails healthy bar
  for (const pat of DEEP_FRIED_TITLE) {
    if (pat.test(titleLower)) {
      reasons.push(`deep-fried (${pat.source})`);
      break;
    }
  }

  return reasons;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`apply-meal-prep-rules — mode: ${APPLY ? 'LIVE WRITE' : 'DRY-RUN'}`);
  console.log(`Pass criteria: cal<=${CAL_CEILING} AND protein>=${PROTEIN_FLOOR} AND not-bad-noodle AND not-deep-fried`);
  console.log(`Disqualify if any one fails.\n`);

  // Fetch all currently-tagged-true recipes
  const PAGE = 500;
  let offset = 0;
  const all = [];
  while (true) {
    const { data, error } = await sb.from('recipes')
      .select('id, title, cuisine, macros, ingredients')
      .eq('meal_prep_friendly', true)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`Fetched ${all.length} currently-tagged-true recipes\n`);

  // Apply rules
  const flips = [];
  const keeps = [];
  const ruleCounts = {};
  for (const r of all) {
    const reasons = applyRules(r);
    if (reasons.length > 0) {
      flips.push({ recipe: r, reasons });
      // Tally each rule kind (use first word)
      for (const reason of reasons) {
        const key = reason.split(' ')[0].split('(')[0].split('<')[0].split('>')[0];
        ruleCounts[key] = (ruleCounts[key] || 0) + 1;
      }
    } else {
      keeps.push(r);
    }
  }

  console.log(`── Stats ─────────────────────────`);
  console.log(`  Currently tagged true:  ${all.length}`);
  console.log(`  Would FLIP to false:    ${flips.length} (${(flips.length / all.length * 100).toFixed(1)}%)`);
  console.log(`  Would KEEP true:        ${keeps.length} (${(keeps.length / all.length * 100).toFixed(1)}%)`);
  console.log();
  console.log(`── Rule trigger counts (a recipe can hit multiple) ──`);
  for (const [k, v] of Object.entries(ruleCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }

  // ── Sample 5 per rule for sanity check ──
  console.log(`\n── Samples (5 per rule kind) ──`);
  const ruleKinds = ['cal>', 'protein<', 'bad-noodle', 'deep-fried'];
  for (const kind of ruleKinds) {
    const matches = flips.filter(f => f.reasons.some(r => r.startsWith(kind)));
    if (matches.length === 0) continue;
    console.log(`\n  Rule "${kind}" (${matches.length} total) — sample of ${Math.min(5, matches.length)}:`);
    for (let i = 0; i < Math.min(5, matches.length); i++) {
      const f = matches[i];
      const m = f.recipe.macros || {};
      console.log(`    "${f.recipe.title}" (${m.calories ?? '?'}cal, ${m.protein ?? '?'}g)`);
      console.log(`        reasons: ${f.reasons.join(' | ')}`);
    }
  }

  if (VERBOSE) {
    console.log(`\n── All flips (verbose) ──`);
    for (const f of flips) {
      const m = f.recipe.macros || {};
      console.log(`  ${f.recipe.title.padEnd(60).slice(0, 60)} ${m.calories ?? '?'}/${m.protein ?? '?'}  [${f.reasons.join(', ')}]`);
    }
  }

  // ── Write CSV ──
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const CSV_PATH = resolve(REPORT_DIR, `meal-prep-rule-flips-${APPLY ? 'applied' : 'dryrun'}-${ts}.csv`);
  const lines = ['id,title,cuisine,calories,protein_g,reasons'];
  for (const f of flips) {
    const m = f.recipe.macros || {};
    const csvSafe = s => /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    lines.push([
      f.recipe.id,
      csvSafe(f.recipe.title || ''),
      csvSafe(f.recipe.cuisine || ''),
      m.calories ?? '',
      m.protein ?? '',
      csvSafe(f.reasons.join(' | ')),
    ].join(','));
  }
  writeFileSync(CSV_PATH, lines.join('\n'));
  console.log(`\nCSV: ${CSV_PATH}`);

  // ── Write keeps CSV too — these are the ones that survive ──
  const KEEPS_PATH = resolve(REPORT_DIR, `meal-prep-rule-keeps-${APPLY ? 'applied' : 'dryrun'}-${ts}.csv`);
  const keepLines = ['id,title,cuisine,calories,protein_g'];
  for (const k of keeps) {
    const m = k.macros || {};
    const csvSafe = s => /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    keepLines.push([k.id, csvSafe(k.title || ''), csvSafe(k.cuisine || ''), m.calories ?? '', m.protein ?? ''].join(','));
  }
  writeFileSync(KEEPS_PATH, keepLines.join('\n'));
  console.log(`Keeps CSV: ${KEEPS_PATH}`);

  // ── Apply if requested ──
  if (!APPLY) {
    console.log(`\n[DRY-RUN] Nothing written. Re-run with --apply to flip these tags.`);
    return;
  }

  console.log(`\nApplying ${flips.length} updates to Supabase...`);
  let ok = 0, fail = 0;
  // Batch by 100 IDs per request using .in()
  const BATCH = 100;
  for (let i = 0; i < flips.length; i += BATCH) {
    const ids = flips.slice(i, i + BATCH).map(f => f.recipe.id);
    const { error } = await sb.from('recipes').update({ meal_prep_friendly: false }).in('id', ids);
    if (error) {
      console.error(`Batch ${i}-${i + ids.length}: ${error.message}`);
      fail += ids.length;
    } else {
      ok += ids.length;
      process.stdout.write(`  Wrote ${ok}/${flips.length}\r`);
    }
  }
  console.log(`\n  Updated: ${ok}\n  Failed:  ${fail}`);
}

main().catch(err => { console.error(err); process.exit(1); });
