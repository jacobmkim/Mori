/**
 * sanity-check-macros.mjs
 *
 * Reads the dry-run CSV from compute-macros-from-usda.mjs and asks Haiku to
 * judge whether each computed per-serving macro number is plausible for the
 * dish. Flags outliers for manual audit.
 *
 * The CALCULATOR is the source of truth for nutrition (it sums real USDA
 * values for real ingredients). Haiku is here ONLY as a smoke detector — it
 * tells us when the computed number doesn't pass a sniff test for the dish
 * (e.g. "Caesar Salad: 1800 cal/serving" is suspect even if math says so).
 *
 * Pipeline:
 *   1. Read latest scripts/reports/macros-computed-dryrun-*.csv
 *   2. For each row, fetch the recipe title + ingredients from Supabase
 *   3. Send Haiku: title + ingredient names + computed cal/protein
 *   4. Haiku returns { verdict, severity, reason }
 *   5. Write flagged recipes to scripts/reports/macros-flagged-<ts>.csv
 *      sorted severity-first for me to audit
 *
 * Cost: Haiku 4.5, cached system rubric, ~200 in + 50 out per recipe.
 *   ≈ $0.0004/recipe → $1.05 for all 2,619 (≈ $0.50 with cache hits)
 *
 * Usage:
 *   node scripts/sanity-check-macros.mjs                          # use latest dry-run CSV
 *   node scripts/sanity-check-macros.mjs --csv <path>             # explicit CSV
 *   node scripts/sanity-check-macros.mjs --limit 50               # sample
 *   node scripts/sanity-check-macros.mjs --resume                 # continue from progress
 *   node scripts/sanity-check-macros.mjs --min-severity 3         # only flag sev>=3
 *
 * Resume-safe: lock file + per-recipe progress writes.
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { resolve } from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: envVars['ANTHROPIC_API_KEY'] });

// ── CLI ───────────────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const RESUME       = args.includes('--resume');
const VERBOSE      = args.includes('--verbose');
const LIMIT        = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const CSV_OVERRIDE = (() => { const i = args.indexOf('--csv'); return i >= 0 ? args[i + 1] : null; })();
const MIN_SEVERITY = (() => { const i = args.indexOf('--min-severity'); return i >= 0 ? parseInt(args[i + 1], 10) : 3; })();
const ONLY_IDS_FILE = (() => { const i = args.indexOf('--only-ids'); return i >= 0 ? args[i + 1] : null; })();

// ── Lock ──────────────────────────────────────────────────────────────────────
const LOCK_DIR  = resolve(process.cwd(), 'scripts/.locks');
const LOCK_PATH = resolve(LOCK_DIR, 'sanity-check-macros.lock');
const PROG_PATH = resolve(LOCK_DIR, 'sanity-check-macros.progress.json');
function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
function acquireLock() {
  ensureDir(LOCK_DIR);
  if (existsSync(LOCK_PATH)) {
    try {
      const meta = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      try { process.kill(meta.pid, 0); } catch { unlinkSync(LOCK_PATH); }
      if (existsSync(LOCK_PATH)) {
        console.error(`Lock held by PID ${meta.pid} since ${meta.startedAt}.`);
        console.error(`Refusing to start. If that PID is dead, delete ${LOCK_PATH}.`);
        process.exit(1);
      }
    } catch { unlinkSync(LOCK_PATH); }
  }
  writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
}
function releaseLock() { try { if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH); } catch {} }
process.on('SIGINT',  () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });
process.on('exit',    () => { releaseLock(); });

// ── Cached rubric ─────────────────────────────────────────────────────────────
// Padded to >2048 tokens so Haiku 4.5 ephemeral cache fires after the first call.
const RUBRIC = `You are a nutrition sanity-checker. You will receive a dish title, its ingredient list (names only, no quantities), the servings count, and a computed per-serving nutritional breakdown that was calculated by summing USDA values for the listed ingredients at their listed quantities.

Your job is NOT to recompute the numbers. Your job is to flag whether the computed numbers PASS THE SMELL TEST for this kind of dish. The math is deterministic and based on USDA values; we trust the math. We are looking for cases where the dish description and computed totals are clearly inconsistent — implying a mistake in the underlying recipe data (wrong portion size, missing ingredient, miscategorized dish, etc.).

Return a SINGLE JSON object with exactly these keys:
{
  "verdict": "ok" | "too_high" | "too_low" | "weird",
  "severity": 1-5,
  "reason": "one short sentence"
}

GUIDELINES:

verdict definitions:
- "ok": totals look reasonable for this dish at this serving size. No flag.
- "too_high": calorie or protein total is implausibly high for the dish. Examples:
    * "Garden Salad" at 1200 cal/serving (something is off — too much oil? wrong portion?)
    * "Vegetable Soup" at 850 cal (way too high unless it's a meal-in-a-bowl)
    * "Iced Coffee" at 600 cal (only if it's an extreme dessert drink)
- "too_low": calorie or protein total is implausibly low. Examples:
    * "Beef Wellington" at 250 cal/serving (impossible — beef + pastry + foie gras)
    * "Chicken Alfredo" at 280 cal/serving (cream sauce + pasta is calorie dense)
    * "Lasagna" at 180 cal/serving (cheese + meat + pasta cannot be that low)
- "weird": macro mix doesn't match the dish. Examples:
    * Vegan dish showing 60g protein per serving (unless it's tofu/tempeh-heavy)
    * Salad showing 0g fibre
    * Dessert showing 50g protein

severity scale:
- 1: probably fine, just a tiny inconsistency
- 2: minor — totals seem 10-20% off but not unreasonable
- 3: noticeable mismatch worth checking — totals 30%+ off expected
- 4: clearly wrong — totals 50%+ off, dish category vs number is suspect
- 5: definitely broken — egregious mismatch (e.g. tiny salad at 2000 cal, big roast at 80 cal)

REFERENCE RANGES (per serving, for typical recipes):

Calories — typical per-serving plausibility:
- Light salad / soup / appetizer:           150 — 400 cal
- Wrap / sandwich / handheld:               350 — 700 cal
- Full main (protein + starch + veg):       450 — 800 cal
- Indulgent / pasta with cream / fried:     600 — 1100 cal
- Smoothie bowl / breakfast bowl (1 serv):  400 — 900 cal
- Dessert (single serving):                 250 — 700 cal
- Stew / one-pot / curry:                   400 — 900 cal
- Anything > 1200 cal/serving is suspect unless it's a hearty composed plate

Protein — typical per-serving:
- Vegetable / vegan dish:                   5 — 25 g (protein > 25g for vegan = check)
- Pasta dishes (no meat):                   10 — 25 g
- Chicken main:                             30 — 60 g
- Beef / pork main:                         25 — 55 g
- Fish main:                                25 — 45 g
- Egg-based main:                           15 — 35 g
- Anything > 80 g/serving is suspect

Fat — typical per-serving:
- Salads / vegetables:                      5 — 25 g
- Lean protein meals:                       10 — 30 g
- Pasta with oil/cheese:                    15 — 45 g
- Cream/cheese-heavy / fried:               25 — 60 g
- > 80 g/serving is suspect (frying-oil counted as consumed?)

Carbs — typical per-serving:
- Low-carb / keto:                          5 — 20 g
- Salad / vegetable-heavy:                  15 — 40 g
- Standard meal:                            30 — 80 g
- Pasta / rice / bread heavy:               60 — 110 g
- Smoothie bowl with banana + honey:        50 — 90 g
- > 130 g/serving is suspect

Common failure modes you should catch:
1. Frying oil over-counted: dish like "Pakora" or "Falafel" at 2000+ cal/serving — the recipe includes "1 cup oil for frying" and the calculator counted it all. Flag as too_high.
2. Portion size wrong: dish lists 4 servings but ingredients are clearly 8 servings (e.g. 2 lb chicken for "4 servings" of fajitas → 250g chicken/person is reasonable but if oil + cheese + tortillas pile on, could exceed 1000 cal). Borderline — check title.
3. Missing main ingredient: dish title says "Chicken Caesar Salad" but no chicken in the ingredients (calculator returns vegetable-only macros) → too_low for the title.
4. Wrong unit interpretation: "1 cup salt" instead of "1 tsp salt" — though salt has 0 cal so this hides. More common: "2 cups oil" when "2 tbsp" was meant. Flag too_high.
5. Dredge-and-butter dishes (Marsala, Piccata, Cordon Bleu, Parmigiana) under 500 cal/serving → too_low (cream + butter + flour + cheese should push them past 600).
6. Smoothie bowl / breakfast bowl: 1 serving size, with banana + honey + nut butter + coconut, can legitimately reach 1000 cal — that's NOT a flag, that's a known dense single-serving format.

Be calibrated: most well-built recipes will be "ok" with severity 1. Only flag with severity 3+ when there's a clear inconsistency. Don't flag a stew at 800 cal as "too_high" — that's normal for a meal-in-a-bowl. Don't flag a salad at 600 cal if it has chicken + nuts + cheese + dressing.

ADDITIONAL CALIBRATION GUIDANCE BY DISH TYPE:

Asian dishes:
- Pad Thai (1 serving): 600–900 cal, 25–40g protein. Below 400 = too_low. Above 1100 = check.
- Fried rice: 500–800 cal, 15–30g protein.
- Stir-fries with oil: 400–700 cal. Above 1000 with no protein-heavy meat = check.
- Ramen / noodle soup: 400–700 cal (broth-based, lower than dry noodle dishes).
- Sushi rolls: 200–400 cal/roll. Above 600 = check unless deep-fried tempura roll.
- Korean BBQ / bulgogi: 600–900 cal/serving. Above 1500 = check oil counted as frying.
- Curries (Indian/Thai): 500–800 cal with rice on the side counted, 350–550 without.
- Bibimbap / Korean rice bowls: 600–900 cal.

Italian / Mediterranean:
- Pasta dishes: 450–700 cal regular, 600–950 cal with cream sauce.
- Pasta carbonara / alfredo: 700–1000 cal — the high end is normal here, NOT a flag.
- Pizza (per serving = 2 slices): 500–800 cal.
- Risotto: 500–750 cal.
- Lasagna: 550–800 cal/serving (cheese + meat + pasta is dense).
- Bruschetta: 200–400 cal.
- Caprese salad: 300–500 cal/serving.
- Greek salad: 250–500 cal.

Mexican / Latin:
- Burritos: 600–900 cal (with rice + beans + protein).
- Tacos (3 per serving): 400–700 cal.
- Quesadillas: 400–700 cal.
- Enchiladas: 500–800 cal.
- Chili: 350–600 cal.
- Birria / barbacoa: 500–800 cal/serving for the meat portion alone.

American comfort:
- Burgers: 500–800 cal/serving.
- Mac and cheese: 500–900 cal/serving.
- Fried chicken: 600–1000 cal/serving.
- BBQ pulled pork: 500–800 cal/serving.
- Casseroles: 350–700 cal/serving.

Light fare / low-cal:
- Salad with light dressing: 150–400 cal/serving.
- Salad with chicken/avocado/cheese/dressing: 350–700 cal.
- Soup (broth-based): 150–350 cal.
- Soup (cream-based): 250–500 cal.
- Smoothies (1 serving): 200–500 cal regular, 400–900 cal with PB/banana/coconut.
- Yogurt parfait: 250–500 cal.

Breakfast:
- Avocado toast: 300–500 cal.
- Pancakes (3 per serving): 350–600 cal.
- Eggs benedict: 500–800 cal.
- Breakfast burrito: 500–800 cal.
- Omelet: 300–600 cal.
- Granola bowl: 350–700 cal.

Desserts:
- Cookies (2–3 per serving): 200–400 cal.
- Brownies / blondies: 300–500 cal/serving.
- Cake slice: 300–600 cal.
- Cheesecake slice: 400–700 cal.
- Pie slice: 300–550 cal.
- Ice cream (1/2 cup): 150–300 cal.
- Mousse: 200–400 cal.
- Crème brûlée: 300–500 cal.

Specific failure-mode pattern memory — common ways the calculator goes wrong:
1. "Recipe with no main protein listed" — title says "Chicken Salad" but ingredients list only veg → too_low
2. "Recipe with absurd portion size" — 4 lb of meat for 4 servings → too_high (1 lb/person raw is huge)
3. "Recipe with frying oil counted in full" — pakora, tempura, falafel showing 1500+ cal → too_high
4. "Recipe with single ingredient" — "Pasta" recipe with only "garlic" listed → too_low
5. "Recipe with wrong unit" — "1 cup salt" instead of "1 tsp" → won't show in cal but salt is 0-cal so this hides; check carbs/protein for similar weirdness
6. "Smoothie bowl (1 serving) with banana + PB + honey + coconut" — legitimately 700–1100 cal, NOT a flag
7. "Hearty stew or curry" — 700–1000 cal/serving is normal for a meal-in-a-bowl, NOT a flag
8. "Indulgent pasta with cream + cheese" — 800–1000 cal/serving is normal for cream-based pasta

When in doubt, cross-check against the ingredient list:
- If you see "1 cup heavy cream" + "8 oz cheese" + "1 lb pasta" for 4 servings → 800+ cal/serving is correct
- If you see lean chicken + vegetables + minimal oil → expect ≤500 cal/serving
- If a recipe has only 2–3 ingredients and 4 servings → almost certainly under-counted (recipe data is incomplete)

Output ONLY the JSON object, no prose, no markdown fences.`;

function buildUserMsg(title, servings, ingredientNames, computed) {
  const ings = ingredientNames.slice(0, 30).join(', ');
  return `Title: ${title}
Servings: ${servings}
Ingredients: ${ings}
Computed per-serving:
- Calories: ${computed.cal}
- Protein: ${computed.protein} g
- Fat: ${computed.fat} g
- Carbs: ${computed.carb} g

Verdict?`;
}

async function judge(title, servings, ingredientNames, computed) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: [{ type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: buildUserMsg(title, servings, ingredientNames, computed) },
      { role: 'assistant', content: '{' },
    ],
  });
  const raw = ('{' + msg.content[0].text).trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }
  return {
    verdict: parsed.verdict || 'ok',
    severity: typeof parsed.severity === 'number' ? Math.max(1, Math.min(5, Math.round(parsed.severity))) : 1,
    reason: parsed.reason || '',
    cache_creation: msg.usage?.cache_creation_input_tokens ?? 0,
    cache_read:     msg.usage?.cache_read_input_tokens ?? 0,
    input_tokens:   msg.usage?.input_tokens ?? 0,
    output_tokens:  msg.usage?.output_tokens ?? 0,
  };
}

// ── CSV helpers ──────────────────────────────────────────────────────────────
function parseCsv(text) {
  // simple CSV parser handling quoted fields with embedded commas/newlines
  const rows = [];
  let i = 0;
  let row = [];
  let cur = '';
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      cur += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(cur); cur = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function findLatestComputedCsv() {
  const dir = resolve(process.cwd(), 'scripts/reports');
  const files = readdirSync(dir).filter(f => /^macros-computed-dryrun-.*\.csv$/.test(f));
  if (files.length === 0) return null;
  files.sort();
  return resolve(dir, files[files.length - 1]);
}
function csvEscape(v) { if (v == null) return ''; const s = String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  acquireLock();
  console.log(`sanity-check-macros — flagging severity >= ${MIN_SEVERITY}\n`);

  const csvPath = CSV_OVERRIDE || findLatestComputedCsv();
  if (!csvPath || !existsSync(csvPath)) {
    console.error(`No computed CSV found. Run compute-macros-from-usda.mjs first.`);
    process.exit(1);
  }
  console.log(`Reading: ${csvPath}\n`);

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = rows.shift();
  const idx = (name) => header.indexOf(name);
  const computedRows = rows
    .filter(r => r.length >= header.length)
    .map(r => ({
      id: r[idx('id')],
      title: r[idx('title')],
      servings: parseInt(r[idx('servings')], 10) || 4,
      coverage: parseInt(r[idx('coverage_pct')], 10),
      newCal: parseInt(r[idx('new_cal')], 10),
      newProtein: parseFloat(r[idx('new_protein')]),
      newFat: parseFloat(r[idx('new_fat')]),
      newCarb: idx('new_carb') >= 0 ? parseFloat(r[idx('new_carb')]) : null,
    }));

  let filtered = isFinite(LIMIT) ? computedRows.slice(0, LIMIT) : computedRows;
  if (ONLY_IDS_FILE && existsSync(ONLY_IDS_FILE)) {
    const onlyIds = new Set(readFileSync(ONLY_IDS_FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
    filtered = filtered.filter(r => onlyIds.has(r.id));
    console.log(`Filtered to ${filtered.length} recipes (only-ids file: ${onlyIds.size} ids)`);
  }
  console.log(`Sanity-checking ${filtered.length} recipes\n`);

  // Fetch ingredient names for these recipes (batch query Supabase by id)
  console.log(`Fetching recipe ingredients...`);
  const idToIngredients = new Map();
  const BATCH = 200;
  for (let i = 0; i < filtered.length; i += BATCH) {
    const ids = filtered.slice(i, i + BATCH).map(r => r.id);
    const { data, error } = await sb.from('recipes').select('id, ingredients, macros').in('id', ids);
    if (error) { console.error(error.message); process.exit(1); }
    for (const r of data) idToIngredients.set(r.id, { ingredients: r.ingredients || [], oldMacros: r.macros || {} });
  }

  // Resume
  let progress = { results: {} };
  if (RESUME && existsSync(PROG_PATH)) {
    progress = JSON.parse(readFileSync(PROG_PATH, 'utf8'));
    console.log(`Resuming — ${Object.keys(progress.results).length} done.\n`);
  }

  let totalCacheCreation = 0, totalCacheRead = 0, totalInput = 0, totalOutput = 0;
  let evaluated = 0, errored = 0;
  const verdictCounts = { ok: 0, too_high: 0, too_low: 0, weird: 0 };

  for (let i = 0; i < filtered.length; i++) {
    const r = filtered[i];
    if (progress.results[r.id]) {
      verdictCounts[progress.results[r.id].verdict] = (verdictCounts[progress.results[r.id].verdict] || 0) + 1;
      continue;
    }
    const meta = idToIngredients.get(r.id);
    if (!meta) { errored++; continue; }
    const ingNames = (meta.ingredients || []).map(x => x.name).filter(Boolean);
    process.stdout.write(`[${i + 1}/${filtered.length}] ${r.title.slice(0, 40).padEnd(40)} ${r.newCal}cal/${r.newProtein}p `);
    try {
      const v = await judge(r.title, r.servings, ingNames, {
        cal: r.newCal, protein: r.newProtein, fat: r.newFat, carb: r.newCarb ?? '?',
      });
      progress.results[r.id] = {
        title: r.title,
        servings: r.servings,
        newCal: r.newCal,
        newProtein: r.newProtein,
        newFat: r.newFat,
        oldCal: meta.oldMacros.calories ?? null,
        coverage: r.coverage,
        verdict: v.verdict,
        severity: v.severity,
        reason: v.reason,
      };
      writeFileSync(PROG_PATH, JSON.stringify(progress, null, 2));
      verdictCounts[v.verdict] = (verdictCounts[v.verdict] || 0) + 1;
      const flagged = v.verdict !== 'ok' && v.severity >= MIN_SEVERITY ? '🚩' : '  ';
      console.log(`${flagged} ${v.verdict.padEnd(9)} sev=${v.severity}  ${v.reason.slice(0, 70)}`);
      totalCacheCreation += v.cache_creation;
      totalCacheRead     += v.cache_read;
      totalInput         += v.input_tokens;
      totalOutput        += v.output_tokens;
      evaluated++;
    } catch (err) {
      console.log(`ERROR: ${err.message.slice(0, 80)}`);
      errored++;
    }
    if ((i + 1) % 20 === 0) await sleep(200);
  }

  // Cost
  const cost = (totalCacheCreation * 1.0 + totalCacheRead * 0.08 + totalInput * 0.8 + totalOutput * 4.0) / 1_000_000;
  console.log(`\n── Summary ──`);
  console.log(`  Evaluated:                       ${evaluated}`);
  console.log(`  Errored:                         ${errored}`);
  console.log(`  Verdicts:                        ok=${verdictCounts.ok} too_high=${verdictCounts.too_high} too_low=${verdictCounts.too_low} weird=${verdictCounts.weird}`);
  console.log(`  Cache creation tokens:           ${totalCacheCreation.toLocaleString()}`);
  console.log(`  Cache read tokens:               ${totalCacheRead.toLocaleString()}`);
  console.log(`  Input tokens (uncached):         ${totalInput.toLocaleString()}`);
  console.log(`  Output tokens:                   ${totalOutput.toLocaleString()}`);
  console.log(`  Estimated Haiku cost:            $${cost.toFixed(3)}`);

  // Write flagged CSV
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  ensureDir(REPORT_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const FLAGGED_PATH = resolve(REPORT_DIR, `macros-flagged-${ts}.csv`);
  const ALL_PATH     = resolve(REPORT_DIR, `macros-sanity-all-${ts}.csv`);

  const header2 = ['id','title','servings','coverage_pct','old_cal','new_cal','new_protein','new_fat','verdict','severity','reason'];
  const allLines = [header2.join(',')];
  const flaggedLines = [header2.join(',')];
  const sorted = Object.entries(progress.results)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.severity - a.severity);
  for (const v of sorted) {
    const line = [
      v.id, csvEscape(v.title), v.servings, v.coverage,
      v.oldCal ?? '', v.newCal, v.newProtein, v.newFat,
      v.verdict, v.severity, csvEscape(v.reason),
    ].join(',');
    allLines.push(line);
    if (v.verdict !== 'ok' && v.severity >= MIN_SEVERITY) flaggedLines.push(line);
  }
  writeFileSync(ALL_PATH, allLines.join('\n'));
  writeFileSync(FLAGGED_PATH, flaggedLines.join('\n'));
  console.log(`  All verdicts CSV:    ${ALL_PATH}`);
  console.log(`  Flagged CSV (sev>=${MIN_SEVERITY}): ${FLAGGED_PATH}`);
  console.log(`  Flagged count:       ${flaggedLines.length - 1}`);
}

main().catch(e => { console.error(e); process.exit(1); });
