/**
 * fix-recipe-portions.mjs
 *
 * Reads the latest recipe-portion-audit CSV. For each recipe with an
 * over-portion flag (sev=3+), proposes a NEW servings count = ceil(grams /
 * band.max). E.g. 5.5 lb short ribs (2495g) ÷ band.max 400g = 6.2 → 7 servings.
 *
 * Output: scripts/reports/portion-fix-proposals-<ts>.csv with columns
 *   id, title, current_servings, proposed_servings, ingredient, grams, decision
 *
 * Apply with --apply after reviewing the CSV.
 *
 * Usage:
 *   node scripts/fix-recipe-portions.mjs              # dry-run, write proposals
 *   node scripts/fix-recipe-portions.mjs --apply      # actually write servings
 *   node scripts/fix-recipe-portions.mjs --csv <path>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
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
const CSV_OVERRIDE = (() => { const i = args.indexOf('--csv'); return i >= 0 ? args[i + 1] : null; })();

function parseCsv(text) {
  const rows = []; let i = 0, row = [], cur = '', inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i+1] === '"') { cur += '"'; i += 2; continue; } inQ = false; i++; continue; } cur += c; i++; continue; }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(cur); cur = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function findLatestAudit() {
  const dir = resolve(process.cwd(), 'scripts/reports');
  const files = readdirSync(dir).filter(f => /^recipe-portion-audit-.*\.csv$/.test(f));
  if (files.length === 0) return null;
  files.sort();
  return resolve(dir, files[files.length - 1]);
}
function csvEscape(v) { if (v == null) return ''; const s = String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

async function main() {
  console.log(`fix-recipe-portions — mode: ${APPLY ? 'LIVE WRITE' : 'DRY-RUN'}\n`);

  const csvPath = CSV_OVERRIDE || findLatestAudit();
  if (!csvPath || !existsSync(csvPath)) { console.error('No audit CSV.'); process.exit(1); }
  console.log(`Reading: ${csvPath}\n`);

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = rows.shift();
  const idx = (n) => header.indexOf(n);

  // Group by recipe — pick the WORST per recipe (highest grams over band.max)
  const byRecipe = new Map();
  for (const r of rows) {
    if (r.length < header.length) continue;
    const id = r[idx('id')];
    const direction = r[idx('direction')];
    if (!direction.includes('over') && !direction.includes('OVER')) continue; // only OVER
    const gramsServ = parseInt(r[idx('grams_per_serv')], 10);
    const bandMax = parseInt(r[idx('band_max')], 10);
    const overshoot = gramsServ - bandMax;
    if (!byRecipe.has(id) || byRecipe.get(id).overshoot < overshoot) {
      byRecipe.set(id, {
        id,
        title: r[idx('title')],
        servings: parseInt(r[idx('servings')], 10),
        ingredient: r[idx('ingredient')],
        gramsServ,
        bandMax,
        overshoot,
        direction,
      });
    }
  }

  // Compute proposed servings: total_grams / band.max
  const proposals = [];
  for (const r of byRecipe.values()) {
    const totalGrams = r.gramsServ * r.servings;
    const proposedServings = Math.ceil(totalGrams / r.bandMax);
    if (proposedServings <= r.servings) continue; // no change needed
    proposals.push({ ...r, totalGrams, proposedServings });
  }

  proposals.sort((a, b) => b.overshoot - a.overshoot);

  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const PATH = resolve(REPORT_DIR, `portion-fix-proposals-${ts}.csv`);
  const lines = ['id,title,current_servings,proposed_servings,ingredient,total_grams,grams_per_serv_now,grams_per_serv_after,band_max'];
  for (const p of proposals) {
    const newPerServ = Math.round(p.totalGrams / p.proposedServings);
    lines.push([p.id, csvEscape(p.title), p.servings, p.proposedServings, csvEscape(p.ingredient), Math.round(p.totalGrams), p.gramsServ, newPerServ, p.bandMax].join(','));
  }
  writeFileSync(PATH, lines.join('\n'));

  console.log(`── Plan ──`);
  console.log(`  Proposals (servings increase): ${proposals.length}`);
  console.log(`  CSV: ${PATH}`);
  console.log(`\nTop 15 proposals:`);
  for (const p of proposals.slice(0, 15)) {
    const newPerServ = Math.round(p.totalGrams / p.proposedServings);
    console.log(`  ${p.title.slice(0,40).padEnd(40)} servings ${p.servings} → ${p.proposedServings}  (${p.ingredient.slice(0,25)} ${p.gramsServ}g/serv → ${newPerServ}g/serv)`);
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] No DB writes. Re-run with --apply.`);
    return;
  }
  console.log(`\nApplying ${proposals.length} servings updates...`);
  let ok = 0, fail = 0;
  for (const p of proposals) {
    const { error } = await sb.from('recipes').update({ servings: p.proposedServings }).eq('id', p.id);
    if (error) { console.error(`  ${p.id}: ${error.message}`); fail++; }
    else ok++;
  }
  console.log(`Done: ${ok} updated, ${fail} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
