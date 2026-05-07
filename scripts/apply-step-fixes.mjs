/**
 * apply-step-fixes.mjs
 *
 * Reads scripts/.locks/propose-step-fixes.progress.json (the patch proposals)
 * and applies them to each recipe in Supabase.
 *
 * Supported patch ops:
 *   - add_ingredient { name, quantity, unit }
 *   - remove_ingredient { name }            (case-insensitive partial match)
 *   - update_ingredient { name, new_name?, new_quantity?, new_unit? }
 *   - update_step { step, new_instruction } (1-based)
 *   - remove_step { step }                  (1-based)
 *   - add_step { step, instruction }        (insert at 1-based position; 0 = prepend)
 *   - replace_all_steps { new_steps: [...] }
 *
 * Usage:
 *   node scripts/apply-step-fixes.mjs                  # dry-run, write before/after CSV
 *   node scripts/apply-step-fixes.mjs --apply          # write to DB
 *   node scripts/apply-step-fixes.mjs --skip <ids.txt> # skip these IDs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_PATH = (() => { const i = args.indexOf('--skip'); return i >= 0 ? args[i + 1] : null; })();

function csvEscape(v) { if (v == null) return ''; const s = String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

function applyPatches(recipe, patches) {
  const result = {
    ingredients: [...(recipe.ingredients || [])],
    steps: [...(recipe.steps || [])],
  };
  const errors = [];

  for (const p of patches) {
    try {
      switch (p.op) {
        case 'add_ingredient': {
          if (!p.name) { errors.push(`add_ingredient missing name`); break; }
          result.ingredients.push({
            name: p.name,
            quantity: p.quantity != null ? String(p.quantity) : '',
            unit: p.unit || '',
          });
          break;
        }
        case 'remove_ingredient': {
          if (!p.name) { errors.push(`remove_ingredient missing name`); break; }
          const target = p.name.toLowerCase().replace(/^\d+\s+/, '').trim();
          const before = result.ingredients.length;
          result.ingredients = result.ingredients.filter(i => {
            const n = String(i.name || '').toLowerCase();
            return !n.includes(target) && !target.includes(n);
          });
          if (result.ingredients.length === before) errors.push(`remove_ingredient: "${p.name}" not found`);
          break;
        }
        case 'update_ingredient': {
          if (!p.name) { errors.push(`update_ingredient missing name`); break; }
          const target = p.name.toLowerCase().replace(/^\d+\s+/, '').trim();
          let updated = false;
          for (const ing of result.ingredients) {
            const n = String(ing.name || '').toLowerCase();
            if (n.includes(target) || target.includes(n)) {
              if (p.new_name) ing.name = p.new_name;
              if (p.new_quantity != null) ing.quantity = String(p.new_quantity);
              if (p.new_unit != null) ing.unit = p.new_unit;
              if (p.new_description) ing.name = p.new_description;
              updated = true;
              break;
            }
          }
          if (!updated) errors.push(`update_ingredient: "${p.name}" not found`);
          break;
        }
        case 'update_step': {
          if (typeof p.step !== 'number') { errors.push(`update_step missing step number`); break; }
          const idx = p.step - 1;
          if (idx < 0 || idx >= result.steps.length) { errors.push(`update_step ${p.step} out of range (steps=${result.steps.length})`); break; }
          const newText = p.new_instruction || p.new_text || p.instruction;
          if (!newText) { errors.push(`update_step missing new_instruction`); break; }
          result.steps[idx] = { ...result.steps[idx], instruction: newText };
          break;
        }
        case 'remove_step': {
          if (typeof p.step !== 'number') { errors.push(`remove_step missing step number`); break; }
          const idx = p.step - 1;
          if (idx < 0 || idx >= result.steps.length) { errors.push(`remove_step ${p.step} out of range`); break; }
          result.steps.splice(idx, 1);
          // Re-number 'order' fields if present
          for (let i = 0; i < result.steps.length; i++) {
            if (result.steps[i].order != null) result.steps[i].order = i + 1;
          }
          break;
        }
        case 'add_step': {
          const idx = (p.step != null ? p.step : result.steps.length + 1) - 1;
          const newStep = {
            order: idx + 1,
            title: p.title || '',
            instruction: p.instruction || p.new_instruction || '',
          };
          result.steps.splice(Math.max(0, idx), 0, newStep);
          for (let i = 0; i < result.steps.length; i++) {
            if (result.steps[i].order != null) result.steps[i].order = i + 1;
          }
          break;
        }
        case 'replace_all_steps': {
          if (!Array.isArray(p.new_steps)) { errors.push(`replace_all_steps missing new_steps`); break; }
          result.steps = p.new_steps.map((s, i) => ({
            order: i + 1,
            title: s.title || '',
            instruction: s.instruction || s.text || '',
          }));
          break;
        }
        default:
          errors.push(`unknown op: ${p.op}`);
      }
    } catch (e) {
      errors.push(`patch error: ${e.message}`);
    }
  }
  return { result, errors };
}

async function main() {
  console.log(`apply-step-fixes — mode: ${APPLY ? 'LIVE WRITE' : 'DRY-RUN'}\n`);

  const proposals = JSON.parse(readFileSync('scripts/.locks/propose-step-fixes.progress.json', 'utf8'));
  const items = JSON.parse(readFileSync('scripts/reports/flagged-with-data.json', 'utf8'));
  const itemsById = new Map(items.map(i => [i.id, i]));

  const skipSet = new Set();
  if (SKIP_PATH && existsSync(SKIP_PATH)) {
    for (const line of readFileSync(SKIP_PATH, 'utf8').split('\n')) {
      const id = line.trim().split(',')[0];
      if (id) skipSet.add(id);
    }
    console.log(`Skip list: ${skipSet.size} ids\n`);
  }

  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const DIFF_PATH = resolve(REPORT_DIR, `step-fix-diff-${ts}.txt`);

  let willApply = 0, skipped = 0, errored = 0;
  const updates = [];
  const diffs = [];

  for (const id of Object.keys(proposals.results)) {
    const prop = proposals.results[id];
    const orig = itemsById.get(id);
    if (!orig || !orig.recipe) { errored++; continue; }
    if (skipSet.has(id)) { skipped++; continue; }
    if (!prop.patches || prop.patches.length === 0) { skipped++; continue; }

    const { result, errors } = applyPatches(orig.recipe, prop.patches);

    diffs.push(`==== ${prop.title} (${id})`);
    diffs.push(`Score: ${prop.score}  Category: ${prop.cat}`);
    diffs.push(`Rationale: ${prop.rationale}`);
    diffs.push(`Patches:`);
    for (const p of prop.patches) diffs.push('  ' + JSON.stringify(p));
    if (errors.length) diffs.push(`Errors: ${errors.join('; ')}`);
    diffs.push(`BEFORE ingredients (${orig.recipe.ingredients?.length || 0}):`);
    for (const i of (orig.recipe.ingredients || [])) diffs.push('  - ' + JSON.stringify(i));
    diffs.push(`AFTER ingredients (${result.ingredients.length}):`);
    for (const i of result.ingredients) diffs.push('  - ' + JSON.stringify(i));
    diffs.push(`BEFORE steps (${orig.recipe.steps?.length || 0}):`);
    for (let i = 0; i < (orig.recipe.steps || []).length; i++) diffs.push('  ' + (i + 1) + '. ' + (orig.recipe.steps[i].instruction || '').slice(0, 120));
    diffs.push(`AFTER steps (${result.steps.length}):`);
    for (let i = 0; i < result.steps.length; i++) diffs.push('  ' + (i + 1) + '. ' + (result.steps[i].instruction || '').slice(0, 120));
    diffs.push('');

    updates.push({ id, title: prop.title, ingredients: result.ingredients, steps: result.steps, errors });
    willApply++;
  }

  writeFileSync(DIFF_PATH, diffs.join('\n'));
  console.log(`── Plan ──`);
  console.log(`  Will apply:    ${willApply}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Errored:       ${errored}`);
  console.log(`  Diff file:     ${DIFF_PATH}`);
  const withErrors = updates.filter(u => u.errors.length > 0);
  console.log(`  Updates with patch errors: ${withErrors.length}`);
  if (withErrors.length) {
    for (const u of withErrors.slice(0, 10)) console.log(`    ${u.title}: ${u.errors.join(' / ')}`);
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] No DB writes. Review diff and re-run with --apply.`);
    return;
  }

  console.log(`\nApplying ${updates.length} updates...`);
  let ok = 0, fail = 0;
  for (const u of updates) {
    const { error } = await sb.from('recipes').update({ ingredients: u.ingredients, steps: u.steps }).eq('id', u.id);
    if (error) { console.error(`  ${u.title}: ${error.message}`); fail++; }
    else ok++;
    if ((ok + fail) % 10 === 0) process.stdout.write(`  ${ok}/${updates.length}\r`);
  }
  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
