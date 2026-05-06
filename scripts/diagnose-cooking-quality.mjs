/**
 * diagnose-cooking-quality.mjs — Phase 0a
 *
 * DEEP cooking-correctness diagnostic. The recipes are a pillar of the app,
 * so this audit is held to the same bar a culinary editor would apply when
 * reviewing a cookbook for publication.
 *
 * What it does:
 *   - Pulls a stratified sample (default 60 recipes — 10 per cuisine bucket).
 *   - Asks Haiku 4.5 to score each recipe on 5 dimensions (0–100):
 *       ratio_score      — sauce/emulsion/glaze ratios
 *       time_score       — cook time per method realistic
 *       heat_score       — heat level appropriate for the technique + ingredient
 *       technique_score  — method choices sound (sear-then-roast, parboil-then-sear, deglaze, mount, rest)
 *       pairing_score    — ingredients in steps actually exist in the list; pairings make culinary sense
 *     Plus an overall cookability_score (model-judged, NOT just an average — heavily penalizes anything below 70 in any one dimension).
 *
 *   - Uses a rigorous culinary rubric (sauce ratios, method-specific time floors,
 *     heat-level mapping, common pitfalls) embedded as a CACHED system prompt.
 *     90% discount on the rubric portion after recipe #1.
 *
 *   - Emits TWO artifacts:
 *       scripts/reports/cooking-quality-report.md    — narrative + aggregate
 *       scripts/reports/cooking-quality-detail.csv   — per-recipe per-dim scores
 *
 *   - Lock file refuses double-runs (per the $1.53 dupe-process lesson).
 *   - Resume-safe: --resume reads the progress file and continues.
 *
 * Cost (Haiku 4.5, prompt-cached rubric):
 *   - 60-recipe sample: ~$0.30
 *   - Marginal per-recipe cost after caching: ~$0.005
 *
 * Usage:
 *   node scripts/diagnose-cooking-quality.mjs                       # default 60 recipes
 *   node scripts/diagnose-cooking-quality.mjs --sample 100          # bigger sample
 *   node scripts/diagnose-cooking-quality.mjs --id <uuid>           # single recipe (skip sampling)
 *   node scripts/diagnose-cooking-quality.mjs --resume              # continue from progress file
 *   node scripts/diagnose-cooking-quality.mjs --verbose             # print per-recipe issues
 *
 * Prerequisite: Get-Process node — make sure no other Node process is running.
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const SUPABASE_URL  = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY   = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const sb        = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── CLI ───────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const VERBOSE   = args.includes('--verbose');
const RESUME    = args.includes('--resume');
const SINGLE_ID = (() => { const i = args.indexOf('--id');     return i >= 0 ? args[i + 1] : null; })();
const SAMPLE    = (() => { const i = args.indexOf('--sample'); return i >= 0 ? parseInt(args[i + 1], 10) : 60; })();

// ── Lock file ─────────────────────────────────────────────────────────────────
const LOCK_DIR  = resolve(process.cwd(), 'scripts/.locks');
const LOCK_PATH = resolve(LOCK_DIR, 'diagnose-cooking-quality.lock');
const PROG_PATH = resolve(LOCK_DIR, 'diagnose-cooking-quality.progress.json');

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

// ── Cuisine buckets ───────────────────────────────────────────────────────────
const BUCKETS = [
  ['Italian',       /italian/i],
  ['Asian',         /chinese|japanese|korean|thai|vietnamese|asian|filipino|indonesian/i],
  ['Mexican',       /mexican|tex.?mex|latin/i],
  ['American',      /american|southern|cajun|bbq|comfort/i],
  ['Mediterranean', /mediterranean|greek|middle.?eastern|moroccan|lebanese|turkish|israeli/i],
  ['Other',         /.*/], // catch-all
];

function bucketFor(cuisine) {
  const c = (cuisine || '').toLowerCase();
  for (const [name, re] of BUCKETS) {
    if (re.test(c)) return name;
  }
  return 'Other';
}

// Reservoir-style stratified sample: shuffle the bucket and take the first N.
function stratifiedSample(rows, perBucket) {
  const grouped = new Map(BUCKETS.map(b => [b[0], []]));
  for (const r of rows) grouped.get(bucketFor(r.cuisine)).push(r);
  const out = [];
  for (const [name, list] of grouped.entries()) {
    // Fisher-Yates shuffle in place
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    out.push(...list.slice(0, perBucket).map(r => ({ ...r, _bucket: name })));
  }
  return out;
}

// ── Culinary rubric (cached system prompt) ───────────────────────────────────
// This is the reference Haiku checks against. Keep it terse — one line per rule.
// Token budget target: under 1500 tokens. Cache hits are ~10% of that on repeat.
const RUBRIC = `You are a senior culinary editor auditing recipes for publication-quality cookability. Apply this reference rigorously. Cite specific step numbers. Do not be lenient on numerical realism.

== SAUCE & GLAZE RATIOS ==
- Vinaigrette: 3:1 oil:acid by volume. Anything from 4:1 to 2:1 is acceptable; 1:1 is not.
- Honey/maple/sugar glazes: total sweetener ≤ 25% of liquid by volume. Honey > 30% reduces to candy/burns.
- Pan sauce: deglaze with stock/wine, reduce by half, mount with cold butter OFF heat. Boiling after butter breaks the emulsion.
- Béchamel/roux gravy: 1:1 butter:flour by weight, cooked 1–2 min, then 8–10:1 milk:fat ratio.
- Mayo/aioli emulsion: 1 yolk per ~3/4 cup oil; oil added drop-by-drop initially.
- Reductions: liquid loses ≥ 1/3 volume → flavour intensifies; salt is added at end, not before.
- Asian "honey-soy-garlic" glaze: honey ≤ 25% of total liquid; balance soy/stock/acid; finish with butter or sesame oil off heat.

== METHOD-SPECIFIC TIME FLOORS (assume serves 4) ==
- Pan-sear cubed potato (~1") all-pan @ med-high: 18–22 min covered then uncovered. < 12 min = raw centers.
- Parboil + sear potato: 8 min boil + 6 min sear. Skipping the parboil and using < 15 min sear = undercooked.
- Roast cubed potato @ 425°F: 30–40 min, flipped halfway.
- Pan-sear chicken breast (1" thick): 5–7 min/side, internal 165°F. Less = raw center, more = leather.
- Pan-sear salmon fillet (1" thick): 3–4 min skin-down + 1–2 min flesh-side, OR sear-then-roast 2 min sear + 6–8 min @ 400°F.
- Pan-sear steak (1" thick, med-rare): 3–4 min/side + 5 min rest. Always rest.
- Braise (chuck/shoulder/thigh): minimum 1.5 h covered @ 300–325°F. Less = chewy.
- Caramelized onions: minimum 30–40 min low heat. < 15 min = sweated, not caramelized.
- Rice pilaf: 2:1 liquid:rice, 18 min covered + 10 min rest off-heat.
- Pasta water: 1 tbsp salt per quart. Pasta cooks in 8–12 min depending on shape.
- Eggs (scrambled, soft): low heat, off heat 30 sec before "done" — carryover finishes them.

== HEAT LEVELS (surface temp / fat smoke point) ==
- Low: 200–300°F. Eggs, custards, simmer.
- Medium: 300–375°F. Most sautés, sweat onions, simmer reductions.
- Medium-high: 375–425°F. Sears, stir-fries, pan-roasts.
- High: 425–500°F+. Steak sear, wok hei, blistered veg.
- Smoke points: butter ≈ 350°F, EVOO ≈ 375°F, refined olive ≈ 410°F, avocado ≈ 520°F. Never butter alone for high-heat sear — clarify or blend with neutral oil.

== TECHNIQUE SOUNDNESS ==
- Sear-then-roast for thick proteins (salmon, pork chop, steak) — pan-only on 1.5"+ proteins burns the outside before centre cooks.
- Parboil-then-sear or oven-finish for potatoes ≥ 1" cubes.
- Always rest meat ≥ 5 min after cooking; do not rest fish.
- Deglaze with cold liquid (drops pan ~110°F so fond lifts without burning).
- Don't crowd the pan; a crowded pan steams instead of sears.
- Salt eggplant/zucchini before frying; salt steak ≥ 40 min before OR right before — between is wet.
- Add aromatics (garlic, ginger) AFTER onion sweating, not at start; they burn in 30 sec at high heat.

== INGREDIENT-PAIRING & STEP LOGIC ==
- Every ingredient in the list should appear in a step. Every ingredient referenced in a step should be in the list.
- Quantities should match serving count: 4-serve dinner ≈ 1.25–1.5 lb protein, 1.5–2 cups starch dry, ≥ 2 cups vegetables.
- Steps should flow prep → cook → assemble → plate. Critical missing-step examples: "preheat oven", "bring water to a boil", "rest the meat", "discard excess liquid".

== SCORING RUBRIC (0–100 per dimension) ==
- 90–100: nothing to fix; would teach the technique correctly.
- 75–89: minor issue, edible result, no major surprises.
- 60–74: produces a passable dish but a beginner would notice problems (rubbery protein, raw centers, overly thick sauce).
- < 60: produces a failure — undercooked starch, broken sauce, burned aromatics, missing critical step.

OUTPUT FORMAT (JSON ONLY, no markdown):
{
  "cookability_score": 78,
  "ratio_score": 85,
  "time_score": 65,
  "heat_score": 80,
  "technique_score": 75,
  "pairing_score": 95,
  "issues": [
    {"category":"COOK-TIME","step_orders":[3],"severity":"high","problem":"Pan-sear potato cubes for 8 min at medium heat is well below the 18–22 min floor; centres will be raw."},
    {"category":"SAUCE-RATIO","step_orders":[5],"severity":"medium","problem":"Honey is ~40% of glaze liquid; reduces to candy."}
  ],
  "summary": "One sentence on the recipe's overall cookability and which dimension is weakest."
}

cookability_score must NOT be a simple average — heavily penalize any single sub-score below 70. A recipe with a 50 in time_score cannot have cookability above 70.

Categories: SAUCE-RATIO | COOK-TIME | HEAT-LEVEL | TECHNIQUE | MISSING-STEP | INGREDIENT-MISMATCH | PAIRING
Severity: high | medium | low`;

// ── Haiku call ────────────────────────────────────────────────────────────────
async function evaluateRecipe(recipe) {
  const ingInput = (recipe.ingredients || []).map(i => ({
    name: i.name ?? '', quantity: i.quantity ?? '', unit: i.unit ?? '',
  }));
  const stepInput = (recipe.steps || []).map(s => ({
    order: s.order, title: s.title ?? '', instruction: s.instruction ?? '',
  }));

  const userMsg = `Recipe: "${recipe.title}"
Cuisine: ${recipe.cuisine || 'unknown'}
Servings: ${recipe.servings ?? 4}
Prep + cook time: ${(recipe.prep_time_mins ?? 0) + (recipe.cook_time_mins ?? 0)} min total

Ingredients (${ingInput.length}):
${JSON.stringify(ingInput, null, 2)}

Steps (${stepInput.length}):
${JSON.stringify(stepInput, null, 2)}

Score this recipe per the rubric. Return JSON only.`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: [
      { type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMsg }],
  });

  const raw = msg.content[0].text.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  const num = (v) => (typeof v === 'number' && v >= 0 && v <= 100) ? v : null;
  return {
    cookability_score: num(parsed.cookability_score),
    ratio_score:       num(parsed.ratio_score),
    time_score:        num(parsed.time_score),
    heat_score:        num(parsed.heat_score),
    technique_score:   num(parsed.technique_score),
    pairing_score:     num(parsed.pairing_score),
    issues:            Array.isArray(parsed.issues) ? parsed.issues : [],
    summary:           typeof parsed.summary === 'string' ? parsed.summary : '',
    cache_creation:    msg.usage?.cache_creation_input_tokens ?? 0,
    cache_read:        msg.usage?.cache_read_input_tokens ?? 0,
    input_tokens:      msg.usage?.input_tokens ?? 0,
    output_tokens:     msg.usage?.output_tokens ?? 0,
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── CSV helpers ───────────────────────────────────────────────────────────────
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  acquireLock();
  console.log(`diagnose-cooking-quality — sample=${SINGLE_ID ? 1 : SAMPLE}, mode=DIAGNOSTIC (no writes)\n`);
  console.log(`(Make sure you ran 'Get-Process node' to confirm no duplicate Node processes.)\n`);

  // ── Fetch recipes ──
  let sample;
  if (SINGLE_ID) {
    const { data, error } = await sb
      .from('recipes').select('id, title, cuisine, servings, prep_time_mins, cook_time_mins, ingredients, steps')
      .eq('id', SINGLE_ID).single();
    if (error || !data) { console.error('Recipe not found:', SINGLE_ID); process.exit(1); }
    sample = [{ ...data, _bucket: bucketFor(data.cuisine) }];
  } else {
    // Fetch all viable recipes (with steps + ingredients), then stratify.
    const PAGE = 500;
    let offset = 0;
    const all = [];
    while (true) {
      const { data, error } = await sb
        .from('recipes')
        .select('id, title, cuisine, servings, prep_time_mins, cook_time_mins, ingredients, steps')
        .order('id')
        .range(offset, offset + PAGE - 1);
      if (error) { console.error('Fetch error:', error.message); process.exit(1); }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    const viable = all.filter(r =>
      Array.isArray(r.ingredients) && r.ingredients.length > 0 &&
      Array.isArray(r.steps) && r.steps.length > 0
    );
    console.log(`Pool: ${viable.length} viable recipes (of ${all.length} total)`);

    const perBucket = Math.ceil(SAMPLE / BUCKETS.length);
    sample = stratifiedSample(viable, perBucket).slice(0, SAMPLE);
    const counts = Object.fromEntries(BUCKETS.map(b => [b[0], 0]));
    sample.forEach(r => { counts[r._bucket] = (counts[r._bucket] || 0) + 1; });
    console.log(`Sample distribution:`, counts, `\n`);
  }

  // ── Resume ──
  let progress = { completedIds: [], results: [] };
  if (RESUME && existsSync(PROG_PATH)) {
    progress = JSON.parse(readFileSync(PROG_PATH, 'utf8'));
    console.log(`Resuming — ${progress.completedIds.length} recipes already done.\n`);
    sample = sample.filter(r => !progress.completedIds.includes(r.id));
  }

  // ── Run ──
  const results = progress.results.slice();
  let totalCacheCreation = 0, totalCacheRead = 0, totalInput = 0, totalOutput = 0;

  for (let i = 0; i < sample.length; i++) {
    const r = sample[i];
    const label = `[${i + 1}/${sample.length}] ${r._bucket.padEnd(13)} ${r.title.slice(0, 50).padEnd(50)}`;
    process.stdout.write(label);
    try {
      const result = await evaluateRecipe(r);
      results.push({ ...r, _result: result });
      const c = result.cookability_score ?? '??';
      const flagCount = result.issues.filter(x => x.severity === 'high').length;
      console.log(` cookability=${c}  high-sev=${flagCount}`);
      if (VERBOSE) {
        result.issues.slice(0, 4).forEach(x => console.log(`    [${x.severity}] ${x.category}: ${x.problem}`));
      }
      totalCacheCreation += result.cache_creation;
      totalCacheRead     += result.cache_read;
      totalInput         += result.input_tokens;
      totalOutput        += result.output_tokens;

      // Persist progress per-recipe (so a kill loses ≤ 1)
      progress.completedIds.push(r.id);
      progress.results = results;
      writeFileSync(PROG_PATH, JSON.stringify(progress, null, 2));
    } catch (err) {
      console.log(` ERROR: ${err.message.slice(0, 100)}`);
      results.push({ ...r, _result: { error: err.message } });
    }
    if ((i + 1) % 5 === 0) await sleep(400); // rate-limit cushion
  }

  // ── Aggregate ──
  const valid = results.filter(r => r._result && !r._result.error);
  const dimNames = ['cookability_score','ratio_score','time_score','heat_score','technique_score','pairing_score'];
  const avg = Object.fromEntries(dimNames.map(d => [
    d,
    valid.length ? Math.round(valid.reduce((s, r) => s + (r._result[d] ?? 0), 0) / valid.length) : 0,
  ]));
  const failingByDim = Object.fromEntries(dimNames.map(d => [
    d,
    valid.filter(r => (r._result[d] ?? 0) < 70).length,
  ]));
  const allIssues = valid.flatMap(r => (r._result.issues || []).map(i => ({ ...i, recipe_id: r.id, title: r.title })));
  const issuesByCategory = {};
  for (const x of allIssues) {
    issuesByCategory[x.category] = (issuesByCategory[x.category] || 0) + 1;
  }
  const highSevByCategory = {};
  for (const x of allIssues.filter(x => x.severity === 'high')) {
    highSevByCategory[x.category] = (highSevByCategory[x.category] || 0) + 1;
  }

  // Worst recipes (lowest cookability)
  const worst = [...valid].sort((a, b) => (a._result.cookability_score ?? 100) - (b._result.cookability_score ?? 100)).slice(0, 10);

  // ── Write report ──
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  ensureDir(REPORT_DIR);
  const MD_PATH  = resolve(REPORT_DIR, 'cooking-quality-report.md');
  const CSV_PATH = resolve(REPORT_DIR, 'cooking-quality-detail.csv');

  // Markdown
  let md = '';
  md += `# Cooking Quality Diagnostic Report\n\n`;
  md += `Generated: ${new Date().toISOString()}\n`;
  md += `Sample: ${valid.length} recipes (errors: ${results.length - valid.length})\n\n`;
  md += `## Average scores (0–100)\n\n`;
  md += `| Dimension | Average | Recipes < 70 |\n|---|---|---|\n`;
  for (const d of dimNames) {
    md += `| ${d} | ${avg[d]} | ${failingByDim[d]} / ${valid.length} |\n`;
  }
  md += `\n## Issues by category\n\n`;
  md += `| Category | Total | High-severity |\n|---|---|---|\n`;
  for (const cat of Object.keys(issuesByCategory).sort((a, b) => issuesByCategory[b] - issuesByCategory[a])) {
    md += `| ${cat} | ${issuesByCategory[cat]} | ${highSevByCategory[cat] || 0} |\n`;
  }
  md += `\n## 10 lowest-scoring recipes\n\n`;
  for (const r of worst) {
    md += `### ${r.title} — cookability ${r._result.cookability_score}\n`;
    md += `*${r._bucket} · ${r.cuisine || 'unknown'} · id=${r.id}*\n\n`;
    md += `> ${r._result.summary}\n\n`;
    md += `Sub-scores: ratios=${r._result.ratio_score} times=${r._result.time_score} heat=${r._result.heat_score} technique=${r._result.technique_score} pairing=${r._result.pairing_score}\n\n`;
    if (r._result.issues.length) {
      for (const x of r._result.issues) {
        md += `- **[${x.severity}] ${x.category}** (step ${(x.step_orders || []).join(', ')}): ${x.problem}\n`;
      }
      md += `\n`;
    }
  }
  md += `\n## Per-bucket averages\n\n`;
  md += `| Bucket | Recipes | Avg cookability | Avg time_score | Avg ratio_score |\n|---|---|---|---|---|\n`;
  for (const [bucket] of BUCKETS) {
    const inB = valid.filter(r => r._bucket === bucket);
    if (!inB.length) continue;
    const avgIn = (k) => Math.round(inB.reduce((s, r) => s + (r._result[k] ?? 0), 0) / inB.length);
    md += `| ${bucket} | ${inB.length} | ${avgIn('cookability_score')} | ${avgIn('time_score')} | ${avgIn('ratio_score')} |\n`;
  }
  md += `\n## Token usage\n\n`;
  md += `- Cache creation: ${totalCacheCreation.toLocaleString()} tokens (paid once at 1.25× input rate)\n`;
  md += `- Cache reads:    ${totalCacheRead.toLocaleString()} tokens (paid at 0.1× input rate)\n`;
  md += `- Non-cached in:  ${totalInput.toLocaleString()} tokens\n`;
  md += `- Output:         ${totalOutput.toLocaleString()} tokens\n`;
  md += `- Approx total cost: $${((totalCacheCreation * 1.25 + totalCacheRead * 0.1 + totalInput) / 1e6 + (totalOutput * 5) / 1e6).toFixed(3)}\n`;

  writeFileSync(MD_PATH, md);

  // CSV
  const headers = ['id','title','bucket','cuisine','cookability_score','ratio_score','time_score','heat_score','technique_score','pairing_score','high_sev_issues','total_issues','summary'];
  const lines = [headers.join(',')];
  for (const r of valid) {
    const high = (r._result.issues || []).filter(i => i.severity === 'high').length;
    const total = (r._result.issues || []).length;
    lines.push([
      r.id, csvEscape(r.title), r._bucket, csvEscape(r.cuisine || ''),
      r._result.cookability_score ?? '',
      r._result.ratio_score ?? '',
      r._result.time_score ?? '',
      r._result.heat_score ?? '',
      r._result.technique_score ?? '',
      r._result.pairing_score ?? '',
      high, total,
      csvEscape(r._result.summary || ''),
    ].join(','));
  }
  writeFileSync(CSV_PATH, lines.join('\n'));

  console.log(`\n── Done ─────────────────────────────────────`);
  console.log(`  Evaluated:       ${valid.length} / ${results.length}`);
  console.log(`  Avg cookability: ${avg.cookability_score}`);
  console.log(`  Recipes < 70:    ${failingByDim.cookability_score} (${Math.round(failingByDim.cookability_score * 100 / Math.max(1, valid.length))}%)`);
  console.log(`  Report:          ${MD_PATH}`);
  console.log(`  CSV detail:      ${CSV_PATH}`);
  if (existsSync(PROG_PATH)) unlinkSync(PROG_PATH); // clean up progress on success
}

main().catch(err => { console.error(err); releaseLock(); process.exit(1); });
