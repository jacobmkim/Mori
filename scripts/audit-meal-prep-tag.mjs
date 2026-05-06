/**
 * audit-meal-prep-tag.mjs — v2 (full-recipe AI evaluation, 85% threshold)
 *
 * v1 used substring keyword matching on titles + steps + ingredients
 * ("tart" matched "start", "pie" matched "pieces") and produced ~1200
 * spurious negative-signal hits. v2 drops keyword scanning entirely and
 * lets Haiku 4.5 evaluate each recipe's full ingredients + full steps.
 *
 * Pipeline:
 *   1. Hard numeric gates (free, deterministic):
 *        - macros must exist            → else cannot-evaluate
 *        - macros.calories ≤ 600        → else fail-cal
 *        - macros.protein  ≥ 30 g       → else fail-protein
 *
 *   2. For every recipe that clears the numeric gates, send the FULL
 *      recipe (title, cuisine, macros, all ingredients, all steps with
 *      full instruction text) to Haiku with a cached rubric. Haiku
 *      returns:
 *        - confidence:   0–100
 *        - has_structure: starch + protein
 *        - reheats_well: holds 4–5 days, reheats cleanly
 *        - reasoning:    one sentence
 *
 *   3. Final verdict:
 *        - numeric gate fail              → suggested = false (with reason)
 *        - confidence ≥ 85 AND has_structure AND reheats_well → suggested = true
 *        - else                            → suggested = false
 *
 * Outputs:
 *   scripts/reports/meal-prep-audit.md  — narrative summary
 *   scripts/reports/meal-prep-review.csv — every relevant recipe with
 *     confidence + booleans + decision column for hand review
 *
 * Cost (Haiku 4.5, prompt caching active):
 *   - Numeric gates: free
 *   - AI eval: ~1,840 recipes × ~$0.004 ≈ $7-8
 *
 * Usage:
 *   node scripts/audit-meal-prep-tag.mjs                # full run
 *   node scripts/audit-meal-prep-tag.mjs --limit 200    # quick sample
 *   node scripts/audit-meal-prep-tag.mjs --resume       # continue from progress
 *   node scripts/audit-meal-prep-tag.mjs --verbose
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';

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
const args     = process.argv.slice(2);
const LIMIT    = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const RESUME   = args.includes('--resume');
const VERBOSE  = args.includes('--verbose');

// ── Locked thresholds ─────────────────────────────────────────────────────────
const CAL_CEILING_PER_SERVING   = 600;
const PROTEIN_FLOOR_PER_SERVING = 30; // grams
const CONFIDENCE_THRESHOLD      = 85;

// ── Hard numeric gate (no AI, no keywords) ────────────────────────────────────
function numericGate(recipe) {
  const m = recipe.macros;
  if (!m || typeof m.calories !== 'number' || typeof m.protein !== 'number') {
    return { verdict: 'cannot-evaluate', reason: 'macros missing — backfill before audit' };
  }
  if (m.calories > CAL_CEILING_PER_SERVING) {
    return { verdict: 'fail-cal', reason: `${m.calories} kcal > ${CAL_CEILING_PER_SERVING} ceiling` };
  }
  if (m.protein < PROTEIN_FLOOR_PER_SERVING) {
    return { verdict: 'fail-protein', reason: `${m.protein}g protein < ${PROTEIN_FLOOR_PER_SERVING}g floor` };
  }
  return { verdict: 'pass-gates', reason: `${m.calories} kcal, ${m.protein}g protein` };
}

// ── Lock + progress ───────────────────────────────────────────────────────────
const LOCK_DIR  = resolve(process.cwd(), 'scripts/.locks');
const LOCK_PATH = resolve(LOCK_DIR, 'audit-meal-prep-tag.lock');
const PROG_PATH = resolve(LOCK_DIR, 'audit-meal-prep-tag.progress.json');

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

// ── AI rubric (cached system prompt) ──────────────────────────────────────────
// Padded to clear the 1024-token cache minimum for Haiku ephemeral cache.
const RUBRIC = `You are a meal-prep coach evaluating whether a recipe is a TYPICAL macro-conscious meal-prep meal — the "rice + good protein + vegetables" archetype that fitness-minded home cooks batch-cook on Sundays for the week.

This is a HOLISTIC evaluation. You are given the full ingredients list and the full steps. Read everything. Do not judge by the title alone. A recipe with "fried" in the title might still be a meal prep if the steps reveal an oven-bake method; a recipe with a wholesome name might fail because the steps require last-minute crisping. Read the actual recipe.

A TYPICAL MEAL PREP is:
- Has a clear starch base — rice, quinoa, sweet potato, pasta, farro, oats, potatoes, couscous, barley, noodles, tortilla — present in meaningful quantity (not a garnish)
- Has a clear protein component — chicken, turkey, beef, pork, lamb, fish, shrimp, tofu, tempeh, eggs in volume, beans, lentils, Greek yogurt, cottage cheese — also in meaningful quantity
- Survives 4-5 days refrigerated without quality loss (texture, flavour, food safety)
- Reheats cleanly in microwave or oven without breaking, separating, going limp, or losing critical texture
- Components do not require last-minute crispness, fresh assembly, or à la minute finishing
- Calorie + protein numbers (already pre-screened) make it cut/maintain-friendly

NOT A TYPICAL MEAL PREP — even if calorie + protein numbers fit:
- Crispy/breaded foods where the crust is the point: schnitzel, tonkatsu, fried chicken, panko-crusted, tempura. Crust softens within hours.
- Salads where fresh raw vegetables ARE the main component: caesar, garden salad, greek salad, slaw. Greens wilt.
- Egg dishes with intentionally runny yolks as the dish's defining quality: shakshuka with runny eggs, sunny-side, soft-poached, soft-scrambled. Yolks oxidize and aren't food-safe at 4-5 days.
- Raw fish preparations: sashimi, ceviche, poke, tartare, crudo, carpaccio. Not safe past day 2.
- Soufflés, custards, mousses, fresh-cream desserts. Texture-dependent.
- Heavy cream / butter / béchamel / hollandaise sauces as the MAIN carrier — they break in the microwave (a bit of cream is fine; a cream-sauce-as-the-sauce is not).
- Dishes that depend on contrast (crispy + soft, hot + cold) where one element degrades fast.
- Sushi rolls, fresh spring rolls, fresh pasta tossed in butter, anything where "freshly assembled" is part of the appeal.

GREY ZONES (use judgment):
- Sauced bowls: if the sauce is tomato/stock/soy/coconut-milk-based, fine. If it's emulsion (cream, butter, hollandaise) as the main carrier, NOT fine.
- Pasta: cooked pasta with thick sauce reheats acceptably though slightly soft. Sturdy enough for meal prep.
- Rice/noodle bowls with garnish vegetables: fine if the garnish wilting doesn't ruin the dish.
- Grain bowls with separate component dressing: fine if dressing stored separately is acceptable in context.

Output JSON only, no markdown, no prose:
{
  "confidence": 0-100,
  "has_structure": true|false,
  "reheats_well": true|false,
  "reasoning": "One short sentence — what specifically pushed the score up or down. Reference actual ingredients or steps, not the title."
}

Confidence scoring:
- 90-100: textbook meal prep. A fitness blog would feature this. Examples: chicken + rice + broccoli, salmon teriyaki bowl, beef bulgogi over rice, lentil + quinoa + roasted veg, turkey chili over rice.
- 75-89: solid meal prep with minor caveats (sauce stored separately, a vegetable garnish that softens but doesn't ruin).
- 60-74: works as meal prep with adaptation (smaller portion, eat within 2-3 days, dressings on the side).
- < 60: not a typical meal prep — texture, food-safety, or assembly-dependence makes it fail the archetype.

A confidence of 85+ is the publication-quality bar. Be strict. If a beginner posting this recipe to a meal-prep subreddit would draw skeptical comments, score below 85.`;

async function evaluateMealPrep(recipe) {
  // Send the FULL recipe — every ingredient, every step, full instruction text
  const ingredientList = (recipe.ingredients || [])
    .map(i => `${i.quantity || ''} ${i.unit || ''} ${i.name || ''}`.trim().replace(/\s+/g, ' '))
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join('\n');
  const stepList = (recipe.steps || [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(s => `  Step ${s.order}${s.title ? ` (${s.title})` : ''}: ${s.instruction || ''}`)
    .join('\n');

  const m = recipe.macros || {};
  const userMsg = `Recipe: "${recipe.title}"
Cuisine: ${recipe.cuisine || 'unknown'}
Servings: ${recipe.servings ?? 4}
Macros (per serving): ${m.calories ?? '?'} kcal · ${m.protein ?? '?'}g protein · ${m.carbohydrates ?? '?'}g carbs · ${m.fat ?? '?'}g fat

Ingredients:
${ingredientList || '  (none)'}

Steps:
${stepList || '  (none)'}

Evaluate against the rubric. Read the full recipe. Score with confidence 0-100.`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 350,
    system: [{ type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  });

  const raw = msg.content[0].text.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { confidence: null, has_structure: null, reheats_well: null, reasoning: `parse-fail: ${raw.slice(0, 100)}` };
    parsed = JSON.parse(match[0]);
  }
  const conf = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(100, parsed.confidence)) : null;
  return {
    confidence:    conf,
    has_structure: typeof parsed.has_structure === 'boolean' ? parsed.has_structure : null,
    reheats_well:  typeof parsed.reheats_well  === 'boolean' ? parsed.reheats_well  : null,
    reasoning:     typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    cache_creation: msg.usage?.cache_creation_input_tokens ?? 0,
    cache_read:     msg.usage?.cache_read_input_tokens ?? 0,
    input_tokens:   msg.usage?.input_tokens ?? 0,
    output_tokens:  msg.usage?.output_tokens ?? 0,
  };
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  acquireLock();
  console.log(`audit-meal-prep-tag v2 — gates: cal≤${CAL_CEILING_PER_SERVING}, protein≥${PROTEIN_FLOOR_PER_SERVING}g; AI confidence threshold: ${CONFIDENCE_THRESHOLD}\n`);
  console.log(`(Make sure you ran 'Get-Process node' first.)\n`);

  // Fetch all recipes — full ingredients + steps
  const PAGE = 500;
  let offset = 0;
  const all = [];
  while (true) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, cuisine, servings, meal_prep_friendly, macros, ingredients, steps')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const recipes = isFinite(LIMIT) ? all.slice(0, LIMIT) : all;
  console.log(`Fetched ${all.length} recipes${isFinite(LIMIT) ? `, limited to ${LIMIT}` : ''}\n`);

  // ── Numeric gate (free) ──
  const gated = recipes.map(r => ({ recipe: r, gate: numericGate(r) }));
  const gateCounts = gated.reduce((acc, x) => { acc[x.gate.verdict] = (acc[x.gate.verdict] || 0) + 1; return acc; }, {});
  console.log(`── Numeric gate (cal + protein) ──`);
  for (const [k, v] of Object.entries(gateCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  console.log();

  // ── AI eval on gate-passers ──
  const aiCandidates = gated.filter(x => x.gate.verdict === 'pass-gates');
  console.log(`AI evaluation candidates (full recipe context): ${aiCandidates.length}`);
  console.log(`Estimated cost: ~$${(aiCandidates.length * 0.005).toFixed(2)}\n`);

  let progress = { aiResults: {} };
  if (RESUME && existsSync(PROG_PATH)) {
    progress = JSON.parse(readFileSync(PROG_PATH, 'utf8'));
    console.log(`Resuming — ${Object.keys(progress.aiResults).length} done.\n`);
  }

  let totalCacheCreation = 0, totalCacheRead = 0, totalInput = 0, totalOutput = 0;

  for (let i = 0; i < aiCandidates.length; i++) {
    const { recipe } = aiCandidates[i];
    if (progress.aiResults[recipe.id]) continue;

    process.stdout.write(`[${i + 1}/${aiCandidates.length}] ${recipe.title.slice(0, 50).padEnd(50)} `);
    try {
      const r = await evaluateMealPrep(recipe);
      progress.aiResults[recipe.id] = r;
      writeFileSync(PROG_PATH, JSON.stringify(progress, null, 2));
      const passed = r.confidence !== null && r.confidence >= CONFIDENCE_THRESHOLD && r.has_structure && r.reheats_well;
      console.log(`conf=${r.confidence ?? '??'} ${passed ? 'PASS' : 'fail'} ${r.has_structure ? '[s]' : '[ ]'} ${r.reheats_well ? '[r]' : '[ ]'}`);
      if (VERBOSE && r.reasoning) console.log(`     ${r.reasoning}`);
      totalCacheCreation += r.cache_creation || 0;
      totalCacheRead     += r.cache_read || 0;
      totalInput         += r.input_tokens || 0;
      totalOutput        += r.output_tokens || 0;
    } catch (err) {
      console.log(`ERROR: ${err.message.slice(0, 80)}`);
      progress.aiResults[recipe.id] = { confidence: null, has_structure: null, reheats_well: null, reasoning: `error: ${err.message}` };
    }
    if ((i + 1) % 10 === 0) await sleep(300);
  }

  // ── Compute final decisions ──
  const decisions = gated.map(({ recipe, gate }) => {
    const ai = progress.aiResults[recipe.id] || null;
    const cannotEval = gate.verdict === 'cannot-evaluate';
    let suggestion;
    let reasonShort;
    if (cannotEval) {
      suggestion = null;
      reasonShort = 'macros missing';
    } else if (gate.verdict !== 'pass-gates') {
      suggestion = false;
      reasonShort = gate.reason;
    } else if (!ai || ai.confidence === null) {
      suggestion = null;
      reasonShort = ai?.reasoning || 'AI eval failed';
    } else {
      const passed = ai.confidence >= CONFIDENCE_THRESHOLD && ai.has_structure && ai.reheats_well;
      suggestion = passed;
      reasonShort = ai.reasoning;
    }
    return {
      recipe, gate, ai,
      suggestion,
      reasonShort,
      wouldChange: recipe.meal_prep_friendly !== suggestion && suggestion !== null,
      isFalsePositive: recipe.meal_prep_friendly === true && suggestion === false,
      isMissedPrep:    recipe.meal_prep_friendly !== true && suggestion === true,
      cannotEval,
    };
  });

  const passing = decisions.filter(d => d.suggestion === true);
  const failing = decisions.filter(d => d.suggestion === false);
  const cannotEvalList = decisions.filter(d => d.cannotEval);
  const falsePositives = decisions.filter(d => d.isFalsePositive);
  const missedPreps    = decisions.filter(d => d.isMissedPrep);

  // ── Markdown report ──
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  ensureDir(REPORT_DIR);
  const MD_PATH  = resolve(REPORT_DIR, 'meal-prep-audit.md');
  const CSV_PATH = resolve(REPORT_DIR, 'meal-prep-review.csv');

  let md = '';
  md += `# Meal-Prep Tag Audit (v2 — full-recipe AI evaluation)\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `**Method.** Hard numeric gates on calories (≤${CAL_CEILING_PER_SERVING}) and protein (≥${PROTEIN_FLOOR_PER_SERVING}g). Recipes that pass numeric gates are evaluated holistically by Haiku 4.5 on the FULL ingredients list and FULL steps — not on title-keyword matching. Confidence threshold: ${CONFIDENCE_THRESHOLD}.\n\n`;
  md += `**Pass criteria.** Numeric gates AND AI confidence ≥ ${CONFIDENCE_THRESHOLD} AND has_structure AND reheats_well.\n\n`;
  md += `## Headline\n\n`;
  md += `- **${passing.length}** of ${decisions.length} recipes pass the meal-prep bar (${(passing.length / decisions.length * 100).toFixed(1)}%)\n`;
  md += `- ${failing.length} fail one or more criteria\n`;
  md += `- ${cannotEvalList.length} cannot be evaluated (macros missing — backfill first)\n\n`;
  md += `## Numeric gate distribution\n\n`;
  md += `| Verdict | Count |\n|---|---|\n`;
  for (const [k, v] of Object.entries(gateCounts).sort((a, b) => b[1] - a[1])) {
    md += `| ${k} | ${v} |\n`;
  }
  md += `\n## Tag-correctness vs. current state\n\n`;
  md += `- **${falsePositives.length}** recipes are currently tagged \`meal_prep_friendly = true\` but should be \`false\`\n`;
  md += `- **${missedPreps.length}** recipes are currently \`false\` or \`null\` but should be \`true\`\n\n`;
  md += `## How to apply\n\n`;
  md += `Open \`scripts/reports/meal-prep-review.csv\` in Excel. Filter on \`would_change = yes\`. Inspect the \`confidence\` and \`ai_reasoning\` columns. Mark the \`decision\` column with \`keep\` (force true) or \`remove\` (force false). Then run \`scripts/apply-meal-prep-decisions.mjs --apply\`.\n\n`;
  md += `## Sample of ${Math.min(20, falsePositives.length)} highest-confidence false positives\n\n`;
  for (const d of falsePositives.sort((a, b) => (a.ai?.confidence ?? 0) - (b.ai?.confidence ?? 0)).slice(0, 20)) {
    const ai = d.ai || {};
    const m = d.recipe.macros || {};
    md += `- **${d.recipe.title}** — confidence ${ai.confidence ?? '?'}\n`;
    md += `  - ${m.calories ?? '?'} kcal · ${m.protein ?? '?'}g protein\n`;
    md += `  - ${ai.reasoning || d.reasonShort}\n\n`;
  }
  md += `## Sample of ${Math.min(20, missedPreps.length)} highest-confidence missed preps\n\n`;
  for (const d of missedPreps.sort((a, b) => (b.ai?.confidence ?? 0) - (a.ai?.confidence ?? 0)).slice(0, 20)) {
    const ai = d.ai || {};
    const m = d.recipe.macros || {};
    md += `- **${d.recipe.title}** — confidence ${ai.confidence ?? '?'}\n`;
    md += `  - ${m.calories ?? '?'} kcal · ${m.protein ?? '?'}g protein\n`;
    md += `  - ${ai.reasoning || d.reasonShort}\n\n`;
  }
  md += `## Token usage\n\n`;
  md += `- Cache creation: ${totalCacheCreation.toLocaleString()} tokens\n`;
  md += `- Cache reads:    ${totalCacheRead.toLocaleString()} tokens\n`;
  md += `- Non-cached in:  ${totalInput.toLocaleString()} tokens\n`;
  md += `- Output:         ${totalOutput.toLocaleString()} tokens\n`;
  md += `- Approx cost:    $${((totalCacheCreation * 1.25 + totalCacheRead * 0.1 + totalInput) / 1e6 + (totalOutput * 5) / 1e6).toFixed(3)}\n`;

  writeFileSync(MD_PATH, md);

  // ── CSV (review surface) ──
  const headers = [
    'id','title','cuisine','current_tag','suggested_tag','would_change',
    'calories','protein_g','gate_verdict','confidence','has_structure','reheats_well','ai_reasoning','decision'
  ];
  const csvRows = decisions
    .filter(d => d.recipe.meal_prep_friendly === true || d.suggestion === true || d.cannotEval || d.gate.verdict === 'pass-gates')
    .sort((a, b) => {
      const score = d => d.isFalsePositive ? 0 : d.isMissedPrep ? 1 : d.cannotEval ? 3 : 2;
      return score(a) - score(b);
    });
  const lines = [headers.join(',')];
  for (const d of csvRows) {
    const m = d.recipe.macros || {};
    const ai = d.ai || {};
    lines.push([
      d.recipe.id,
      csvEscape(d.recipe.title),
      csvEscape(d.recipe.cuisine || ''),
      d.recipe.meal_prep_friendly === null ? 'null' : (d.recipe.meal_prep_friendly ? 'true' : 'false'),
      d.suggestion === null ? 'null' : (d.suggestion ? 'true' : 'false'),
      d.wouldChange ? 'yes' : 'no',
      m.calories ?? '',
      m.protein ?? '',
      d.gate.verdict,
      ai.confidence ?? '',
      ai.has_structure === true ? 'yes' : ai.has_structure === false ? 'no' : '',
      ai.reheats_well  === true ? 'yes' : ai.reheats_well  === false ? 'no' : '',
      csvEscape(ai.reasoning || d.reasonShort || ''),
      '',
    ].join(','));
  }
  writeFileSync(CSV_PATH, lines.join('\n'));

  console.log(`\n── Done ─────────────────────────────────────`);
  console.log(`  Pass meal-prep bar:               ${passing.length} (${(passing.length / decisions.length * 100).toFixed(1)}%)`);
  console.log(`  Fail (one or more criteria):      ${failing.length}`);
  console.log(`  Cannot evaluate (macros missing): ${cannotEvalList.length}`);
  console.log(`  Currently TRUE → should be FALSE: ${falsePositives.length}`);
  console.log(`  Currently null/false → should TRUE: ${missedPreps.length}`);
  console.log(`  Report:    ${MD_PATH}`);
  console.log(`  CSV:       ${CSV_PATH}`);
  if (existsSync(PROG_PATH)) unlinkSync(PROG_PATH);
}

main().catch(err => { console.error(err); releaseLock(); process.exit(1); });
