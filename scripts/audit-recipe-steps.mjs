/**
 * audit-recipe-steps.mjs
 *
 * Phase 3 of comprehensive audit. For every recipe, ask Haiku to score the
 * step quality on a 0-100 scale. Anything below 90 is flagged for manual
 * Claude review.
 *
 * Haiku evaluates:
 *   - Do steps reference all the listed ingredients?
 *   - Are cook times plausible (raw chicken: 6-12 min/side, not 2)?
 *   - Does technique match the dish (steamed fish shouldn't say "fry")?
 *   - Are the steps clear and complete (no gaps)?
 *   - Do measurements/temperatures make sense?
 *   - Are there structural issues (missing ingredient additions, missing
 *     finishing steps, out-of-order operations)?
 *
 * Output:
 *   - scripts/reports/recipe-steps-audit-<ts>.csv (all scores)
 *   - scripts/reports/recipe-steps-flagged-<ts>.csv (score < 90, sorted by score)
 *
 * Cost: Haiku 4.5, ~600 tokens in + 80 out per recipe.
 *   ≈ $0.0008/recipe → $2.10 for all 2,617 (less w/ cache).
 *
 * Usage:
 *   node scripts/audit-recipe-steps.mjs                       # full DB
 *   node scripts/audit-recipe-steps.mjs --limit 50            # sample
 *   node scripts/audit-recipe-steps.mjs --resume              # continue
 *   node scripts/audit-recipe-steps.mjs --threshold 85        # custom flag threshold
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: envVars['ANTHROPIC_API_KEY'] });

const args = process.argv.slice(2);
const RESUME = args.includes('--resume');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const THRESHOLD = (() => { const i = args.indexOf('--threshold'); return i >= 0 ? parseInt(args[i + 1], 10) : 90; })();
const ONLY_IDS_FILE = (() => { const i = args.indexOf('--only-ids'); return i >= 0 ? args[i + 1] : null; })();

const LOCK_DIR  = resolve(process.cwd(), 'scripts/.locks');
const LOCK_PATH = resolve(LOCK_DIR, 'audit-recipe-steps.lock');
const PROG_PATH = resolve(LOCK_DIR, 'audit-recipe-steps.progress.json');
function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
function acquireLock() {
  ensureDir(LOCK_DIR);
  if (existsSync(LOCK_PATH)) {
    try {
      const meta = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      try { process.kill(meta.pid, 0); } catch { unlinkSync(LOCK_PATH); }
      if (existsSync(LOCK_PATH)) { console.error(`Lock held by PID ${meta.pid} since ${meta.startedAt}.`); process.exit(1); }
    } catch { unlinkSync(LOCK_PATH); }
  }
  writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
}
function releaseLock() { try { if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH); } catch {} }
process.on('SIGINT',  () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });
process.on('exit',    () => { releaseLock(); });

const RUBRIC = `You are a culinary editor reviewing recipes for a meal-discovery app. Score each recipe's STEPS on a 0-100 scale based on how cookable, complete, and accurate they are.

OUTPUT (JSON only, no prose, no markdown fences):
{
  "score": 0-100,
  "issues": ["..."],         // empty array if score=100, otherwise concrete issues found
  "category": "ok" | "missing_steps" | "wrong_times" | "wrong_technique" | "missing_ingredients" | "ingredient_mismatch" | "incomplete" | "ambiguous"
}

SCORING RUBRIC:
- 100: steps are clear, complete, reference all ingredients, plausible times, technique matches dish
- 95-99: minor wording issues, slightly vague step but cookable
- 90-94: a few small problems — maybe one ingredient not explicitly added, or a generic time
- 80-89: notable issues — missing a key step, technique mismatch, wrong cook time
- 60-79: serious gaps — multiple ingredients not used, big time error, wrong method
- <60: broken — recipe cannot be cooked from these steps

CHECKS YOU MUST RUN:
1. Ingredient coverage: every ingredient in the list should be used in some step. Penalize for ingredients listed but never added (missing_ingredients).
2. Plausibility of cook times: raw chicken breast needs 6-12 min/side, not 2. Roasting whole chicken needs 60-90 min, not 20. Pan-seared steak needs 3-5 min/side, not 1.
3. Technique vs dish: a "steamed fish" recipe shouldn't say "deep fry"; a "raw salad" shouldn't say "boil".
4. Step count: a complex dish (lasagna, biryani) with 2 steps is incomplete. A simple snack (boiled eggs) with 2 steps is fine.
5. Missing finishing steps: did they say to plate / serve / garnish if applicable? Not required, just noting.
6. Order of operations: are things done in the right sequence? (e.g., "marinate chicken" should come before "cook chicken")
7. Reasonable temperatures: oven at 200°F for roasting whole chicken is wrong (should be 375-450°F).

NON-ISSUES (do NOT penalize for these):
- Recipe is short: simple recipes can be short.
- Recipe omits explicit "preheat oven" if oven temperature is given in the cooking step.
- Recipe doesn't say "serve immediately" — that's implied.
- Plain language (don't penalize for not using fancy culinary terms).
- "Salt to taste" / "season as needed" — these are valid.
- Pre-prep steps embedded in ingredient list (e.g. "chopped onion" — no separate "chop the onion" step needed).

Be calibrated: most well-built recipes should score 95-100. Only score <90 when there's a real problem. Only score <70 when the recipe is genuinely broken.

Output ONLY the JSON object, no prose, no markdown fences. Padding for cache priming.

ADDITIONAL CONTEXT — common bad patterns from past recipe data we want to catch:

Pattern A: Generic "cook until done" step. If steps say "cook chicken until done" without time/visual cue → score 88-92, category=ambiguous.

Pattern B: Missing primary cooking step. If recipe is "BBQ Chicken" but steps don't actually grill/bake/cook the chicken → score 60-70, category=missing_steps.

Pattern C: Ingredient never used. If recipe lists "fresh basil" or "lemon zest" but no step adds it → score 80-89, category=missing_ingredients.

Pattern D: Wrong cook time for the cut. Pan-searing thick pork chops at 2 min/side will leave them raw. Boiling pasta for 30 min will turn it to mush. Score the magnitude:
  - Off by 30-50% → score 85-90
  - Off by 50%+ → score 75-85
  - Off by 100%+ (e.g., 2 min when 10 needed) → score 60-75

Pattern E: Wrong technique for the dish. "Steamed Fish" with a fry step → score 65-80. "Raw cucumber salad" with cooking → score 60-75.

Pattern F: Missing crucial precursor. "Slow Cooker Pulled Pork" without "shred the pork at end" → score 80-90.

Pattern G: Step references an ingredient not in the list. "Add the bay leaves" but no bay leaves listed → score 75-85, category=ingredient_mismatch.

Pattern H: Vague quantities in steps. "Add some sauce" instead of "Add 2 tbsp sauce" → -2 points. Multiple → -5.

Pattern I: Wrong order. "Add eggs to the hot oil" before "Heat the oil" → score 70-80.

Pattern J: Microwave/instant cooking for traditional method. "Risotto in 10 min in microwave" → score 60-70.

Recipe categories with their typical step ranges:
  Salads / no-cook dips: 3-5 steps usually enough
  Soups / stews / curries: 5-8 steps
  Roasts (oven): 4-7 steps
  Stir-fries: 4-6 steps
  Pasta dishes: 5-7 steps
  Baking (cookies, cake): 6-10 steps
  Multi-component (lasagna, biryani, dim sum): 8-15 steps

If step count is way under the expected range for the dish category, score lower. If way over (15+ for a stir-fry) usually fine — extra detail is good.

Common dish-specific traps:
  - Pasta carbonara: must temper egg yolks off heat, otherwise scrambled eggs → score 65-75 if step says "add eggs to hot pan"
  - Risotto: needs gradual stock addition, stirring continuously → -10 if just "add all stock"
  - Steak: need to rest after cooking → -3 if no rest mentioned
  - Bread: needs proofing time → -10 if no rest period
  - Sushi rice: needs proper cooling/seasoning → -10 if treated like normal rice
  - Caramel: temperature/color cues critical → -10 if just "cook until brown"
  - Soufflé: technique-critical, fold not stir → -15 if "stir whites in"

When in doubt, default to 95 — only mark down for concrete observable issues.`;

function buildUserMsg(recipe) {
  const ingredientList = (recipe.ingredients || []).map(i => `- ${i.quantity || ''} ${i.unit || ''} ${i.name || ''}`.trim().replace(/\s+/g, ' ')).join('\n');
  const stepList = (recipe.steps || []).map((s, idx) => `${idx + 1}. ${s.title ? '[' + s.title + '] ' : ''}${s.instruction || ''}`.trim()).join('\n');
  return `Title: ${recipe.title}
Servings: ${recipe.servings || 4}

Ingredients:
${ingredientList || '(none listed)'}

Steps:
${stepList || '(no steps listed)'}

Score?`;
}

async function score(recipe) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: [{ type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: buildUserMsg(recipe) },
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
    score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 50,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    category: parsed.category || 'ok',
    usage: {
      input: msg.usage?.input_tokens ?? 0,
      output: msg.usage?.output_tokens ?? 0,
      cacheR: msg.usage?.cache_read_input_tokens ?? 0,
      cacheC: msg.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

function csvEscape(v) { if (v == null) return ''; const s = String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  acquireLock();
  console.log(`audit-recipe-steps — flag threshold: ${THRESHOLD}\n`);

  let all = []; let offset = 0;
  while (true) {
    const { data } = await sb.from('recipes').select('id,title,servings,ingredients,steps').order('id').range(offset, offset+999);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (ONLY_IDS_FILE && existsSync(ONLY_IDS_FILE)) {
    const onlyIds = new Set(readFileSync(ONLY_IDS_FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
    all = all.filter(r => onlyIds.has(r.id));
    console.log(`Filtered to ${all.length} recipes (only-ids: ${onlyIds.size})`);
  }
  if (isFinite(LIMIT)) all = all.slice(0, LIMIT);
  console.log(`Auditing ${all.length} recipes\n`);

  let progress = { results: {} };
  if (RESUME && existsSync(PROG_PATH)) {
    progress = JSON.parse(readFileSync(PROG_PATH, 'utf8'));
    console.log(`Resuming — ${Object.keys(progress.results).length} done.\n`);
  }

  let totalIn = 0, totalOut = 0, totalCacheR = 0, totalCacheC = 0;
  let evaluated = 0, errored = 0;
  const scoreHist = {};

  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (progress.results[r.id]) continue;
    process.stdout.write(`[${i + 1}/${all.length}] ${r.title.slice(0, 45).padEnd(45)} `);
    try {
      const s = await score(r);
      progress.results[r.id] = { title: r.title, score: s.score, category: s.category, issues: s.issues };
      writeFileSync(PROG_PATH, JSON.stringify(progress, null, 2));
      const bucket = Math.floor(s.score / 10) * 10;
      scoreHist[bucket] = (scoreHist[bucket]||0)+1;
      const flag = s.score < THRESHOLD ? '🚩' : '  ';
      console.log(`${flag} score=${s.score.toString().padStart(3)}  ${s.category.padEnd(20)}  ${s.issues.slice(0,2).join('; ').slice(0,60)}`);
      totalIn += s.usage.input;
      totalOut += s.usage.output;
      totalCacheR += s.usage.cacheR;
      totalCacheC += s.usage.cacheC;
      evaluated++;
    } catch (err) {
      console.log(`ERR: ${err.message.slice(0, 80)}`);
      errored++;
    }
    if ((i + 1) % 30 === 0) await sleep(150);
  }

  const cost = (totalCacheC * 1.0 + totalCacheR * 0.08 + totalIn * 0.8 + totalOut * 4.0) / 1_000_000;
  console.log(`\n── Summary ──`);
  console.log(`  Evaluated:       ${evaluated}`);
  console.log(`  Errored:         ${errored}`);
  console.log(`  Score histogram:`);
  Object.keys(scoreHist).sort((a,b)=>+b-+a).forEach(b => console.log(`    ${b}-${+b+9}: ${scoreHist[b]}`));
  console.log(`  Tokens: in=${totalIn.toLocaleString()} out=${totalOut.toLocaleString()} cacheR=${totalCacheR.toLocaleString()} cacheC=${totalCacheC.toLocaleString()}`);
  console.log(`  Estimated cost:  $${cost.toFixed(3)}`);

  // Write CSVs
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  ensureDir(REPORT_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const ALL_PATH = resolve(REPORT_DIR, `recipe-steps-audit-${ts}.csv`);
  const FLAG_PATH = resolve(REPORT_DIR, `recipe-steps-flagged-${ts}.csv`);
  const allLines = ['id,title,score,category,issues'];
  const flagLines = ['id,title,score,category,issues'];
  const sorted = Object.entries(progress.results).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.score - b.score);
  for (const r of sorted) {
    const line = [r.id, csvEscape(r.title), r.score, r.category, csvEscape(r.issues.join(' / '))].join(',');
    allLines.push(line);
    if (r.score < THRESHOLD) flagLines.push(line);
  }
  writeFileSync(ALL_PATH, allLines.join('\n'));
  writeFileSync(FLAG_PATH, flagLines.join('\n'));
  console.log(`  All CSV:     ${ALL_PATH}`);
  console.log(`  Flagged CSV: ${FLAG_PATH} (${flagLines.length - 1} recipes < ${THRESHOLD})`);
}

main().catch(e => { console.error(e); process.exit(1); });
