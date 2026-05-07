/**
 * propose-step-fixes.mjs
 *
 * For each recipe in scripts/reports/flagged-with-data.json (the 66 recipes
 * that scored < 90 in the step audit), use Haiku to produce a SPECIFIC
 * JSON patch describing how to fix it. Output is a CSV the user reviews.
 *
 * Patch types:
 *   - {"op":"add_ingredient","name":"...","quantity":"...","unit":"..."}
 *   - {"op":"remove_ingredient","name":"..."}
 *   - {"op":"update_step_time","step":N,"from":"...","to":"..."}
 *   - {"op":"update_step_text","step":N,"new_text":"..."}
 *   - {"op":"remove_step","step":N}
 *   - {"op":"replace_steps","new_steps":[...]}    // for bigger rewrites
 *
 * Cost: ~$0.001/recipe × 66 = $0.07
 *
 * Usage:
 *   node scripts/propose-step-fixes.mjs              # generates proposals
 *   node scripts/propose-step-fixes.mjs --resume
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const anthropic = new Anthropic({ apiKey: envVars['ANTHROPIC_API_KEY'] });

const args = process.argv.slice(2);
const RESUME = args.includes('--resume');

const RUBRIC = `You are a culinary editor reviewing a recipe that has been flagged for an issue. Propose the MINIMAL fix as a JSON array of patch operations.

INPUT format you'll receive:
- Title
- Ingredient list (with qty/unit)
- Steps (numbered)
- Flagged issue from prior review

OUTPUT format (JSON only, no prose, no markdown):
{
  "patches": [
    {"op": "add_ingredient", "name": "...", "quantity": "...", "unit": "..."},
    {"op": "remove_ingredient", "name": "..."},
    {"op": "update_step", "step": N, "new_instruction": "..."},
    {"op": "remove_step", "step": N},
    {"op": "replace_all_steps", "new_steps": [{"order": 1, "title": "...", "instruction": "..."}]}
  ],
  "rationale": "one short sentence explaining the fix"
}

GUIDELINES:
- Prefer the SMALLEST patch that resolves the issue
- For "ingredient_mismatch" where step uses ingredient not in list → add_ingredient
- For "missing_ingredients" where ingredient listed but never used → either add a step using it, or remove_ingredient if it's truly unused
- For "wrong_times" where cook time is too short → update_step with corrected time
- For "wrong_technique" → update_step or replace_all_steps if the whole approach is wrong
- For "duplicate steps" → remove_step (later one)
- For zero-quantity ingredients (qty="0") → remove_ingredient
- For "ambiguous" with vague wording → update_step with clearer text

Use sensible quantities/times based on the dish:
- Chicken breast (boneless): 6-8 min/side at medium-high heat
- Chicken thighs (bone-in): 12-15 min/side
- Pork chops (1 inch thick): 4-5 min/side
- Beef steak (1.5 inch): 3-4 min/side for medium-rare
- Whole roasted chicken: 60-90 min at 400°F
- Lamb leg roast: 20 min/lb at 350°F
- Fish fillet: 3-4 min/side
- Boil pasta: 8-10 min for spaghetti, 10-12 for rigatoni
- Lentils: 20-30 min from dry
- Dried beans: 60-90 min from dry (2x with quick-soak)

If you cannot identify a clean fix, output: {"patches": [], "rationale": "no clean automated fix available"}

Be careful: only propose fixes that match the actual recipe data. Don't invent ingredients.

Padding for cache priming. Common ingredient quantities:
- 1 garlic clove = 3g, 1 small onion = 110g, 1 medium onion = 150g
- 1 tbsp oil = 14g, 1 cup oil = 218g, 1 tbsp butter = 14g
- 1 medium egg = 50g, 1 large egg = 60g
- 1 lb chicken breast = 4 servings, 1 cup rice (dry) = 4 servings cooked
Common cooking times:
- Sautéing onions: 5-8 min med-low to translucent, 10-15 to caramelize
- Blooming spices: 30-60 sec
- Reducing wine: 5-8 min
- Simmering tomato sauce: 20-30 min for flavor development
- Braising tough cuts: 2-3 hr at 325°F
- Roasting vegetables: 25-35 min at 425°F

When in doubt, output a small patch rather than no patch.`;

async function propose(item) {
  const recipe = item.recipe;
  const ingredientList = (recipe.ingredients || []).map(i => `- ${i.quantity || ''} ${i.unit || ''} ${i.name || ''}`.trim().replace(/\s+/g, ' ')).join('\n');
  const stepList = (recipe.steps || []).map((s, idx) => `${idx + 1}. ${s.instruction || s.title || ''}`.trim()).join('\n');
  const userMsg = `Recipe: ${recipe.title}
Servings: ${recipe.servings}
Score: ${item.score}/100  Category: ${item.cat}
Issues from prior review: ${item.issues}

Ingredients:
${ingredientList}

Steps:
${stepList}

Propose minimal fix patches.`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: [{ type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: userMsg },
      { role: 'assistant', content: '{' },
    ],
  });
  const raw = ('{' + msg.content[0].text).trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON');
    parsed = JSON.parse(m[0]);
  }
  return {
    patches: Array.isArray(parsed.patches) ? parsed.patches : [],
    rationale: parsed.rationale || '',
    usage: {
      input: msg.usage?.input_tokens ?? 0,
      output: msg.usage?.output_tokens ?? 0,
      cacheR: msg.usage?.cache_read_input_tokens ?? 0,
      cacheC: msg.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

async function main() {
  const items = JSON.parse(readFileSync('scripts/reports/flagged-with-data.json', 'utf8'));
  console.log(`Proposing fixes for ${items.length} flagged recipes\n`);

  const PROG_PATH = 'scripts/.locks/propose-step-fixes.progress.json';
  let progress = { results: {} };
  if (RESUME && existsSync(PROG_PATH)) {
    progress = JSON.parse(readFileSync(PROG_PATH, 'utf8'));
    console.log(`Resuming — ${Object.keys(progress.results).length} done.\n`);
  }

  let totalIn = 0, totalOut = 0;
  let evaluated = 0, errored = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (progress.results[it.id]) continue;
    if (!it.recipe) { errored++; continue; }
    process.stdout.write(`[${i + 1}/${items.length}] ${it.title.slice(0, 45).padEnd(45)} `);
    try {
      const p = await propose(it);
      progress.results[it.id] = { title: it.title, score: it.score, cat: it.cat, patches: p.patches, rationale: p.rationale };
      writeFileSync(PROG_PATH, JSON.stringify(progress, null, 2));
      console.log(`${p.patches.length} patches: ${p.rationale.slice(0,60)}`);
      totalIn += p.usage.input;
      totalOut += p.usage.output;
      evaluated++;
    } catch (err) {
      console.log(`ERR: ${err.message.slice(0, 80)}`);
      errored++;
    }
  }
  const cost = (totalIn * 0.8 + totalOut * 4.0) / 1_000_000;
  console.log(`\n── Summary ──`);
  console.log(`  Evaluated:  ${evaluated}`);
  console.log(`  Errored:    ${errored}`);
  console.log(`  Cost:       $${cost.toFixed(3)}`);

  // Write CSV review file
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const PATH = resolve(REPORT_DIR, `step-fix-proposals-${ts}.json`);
  writeFileSync(PATH, JSON.stringify(progress, null, 2));
  console.log(`  Proposals JSON: ${PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
