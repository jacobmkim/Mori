/**
 * apply-computed-macros.mjs
 *
 * Takes the dry-run CSV from compute-macros-from-usda.mjs and writes the
 * `new_cal / new_protein / new_fat / new_carb / new_fibre` values back to
 * Supabase recipes.macros.
 *
 * Skips recipes that:
 *   - have coverage < MIN_COVERAGE (default 70%) — calculator wasn't confident
 *   - appear in --skip-list <csv> (one id per line) — for flagged recipes you don't want to overwrite yet
 *
 * Usage:
 *   node scripts/apply-computed-macros.mjs                              # use latest CSV, dry-run
 *   node scripts/apply-computed-macros.mjs --csv <path>                 # explicit CSV
 *   node scripts/apply-computed-macros.mjs --apply                      # actually write
 *   node scripts/apply-computed-macros.mjs --skip-list <ids.txt>        # skip these IDs
 *   node scripts/apply-computed-macros.mjs --min-coverage 80            # stricter threshold
 *   node scripts/apply-computed-macros.mjs --only-flagged <flagged.csv> # ONLY apply IDs from this CSV
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
const CSV_OVERRIDE   = (() => { const i = args.indexOf('--csv'); return i >= 0 ? args[i + 1] : null; })();
const SKIP_LIST_PATH = (() => { const i = args.indexOf('--skip-list'); return i >= 0 ? args[i + 1] : null; })();
const ONLY_LIST_PATH = (() => { const i = args.indexOf('--only-flagged'); return i >= 0 ? args[i + 1] : null; })();
const MIN_COVERAGE   = (() => { const i = args.indexOf('--min-coverage'); return i >= 0 ? parseInt(args[i + 1], 10) : 70; })();

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
function findLatestComputedCsv() {
  const dir = resolve(process.cwd(), 'scripts/reports');
  const files = readdirSync(dir).filter(f => /^macros-computed-dryrun-.*\.csv$/.test(f));
  if (files.length === 0) return null;
  files.sort();
  return resolve(dir, files[files.length - 1]);
}

async function main() {
  console.log(`apply-computed-macros — mode: ${APPLY ? 'LIVE WRITE' : 'DRY-RUN'}\n`);
  const csvPath = CSV_OVERRIDE || findLatestComputedCsv();
  if (!csvPath || !existsSync(csvPath)) { console.error('No computed CSV found.'); process.exit(1); }
  console.log(`Reading: ${csvPath}\n`);

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = rows.shift();
  const idx = (name) => header.indexOf(name);

  const skipSet = new Set();
  if (SKIP_LIST_PATH && existsSync(SKIP_LIST_PATH)) {
    const lines = readFileSync(SKIP_LIST_PATH, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
    for (const l of lines) skipSet.add(l.split(',')[0].trim()); // first column = id
    console.log(`Skip list: ${skipSet.size} ids will be skipped\n`);
  }
  let onlySet = null;
  if (ONLY_LIST_PATH && existsSync(ONLY_LIST_PATH)) {
    const lines = readFileSync(ONLY_LIST_PATH, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
    onlySet = new Set();
    for (const l of lines) onlySet.add(l.split(',')[0].trim());
    onlySet.delete('id'); // header row
    console.log(`Only-flagged: ${onlySet.size} ids will be applied\n`);
  }

  let willApply = 0, skipped = 0, lowCov = 0, notInOnly = 0;
  const updates = [];
  for (const r of rows) {
    if (r.length < header.length) continue;
    const id = r[idx('id')];
    const title = r[idx('title')];
    const cov = parseInt(r[idx('coverage_pct')], 10);
    const newCal = parseInt(r[idx('new_cal')], 10);
    const newP = parseFloat(r[idx('new_protein')]);
    const newF = parseFloat(r[idx('new_fat')]);
    const newC = idx('new_carb') >= 0 ? parseFloat(r[idx('new_carb')]) : null;
    const newFib = idx('new_fibre') >= 0 ? parseFloat(r[idx('new_fibre')]) : null;

    if (cov < MIN_COVERAGE) { lowCov++; continue; }
    if (skipSet.has(id)) { skipped++; continue; }
    if (onlySet && !onlySet.has(id)) { notInOnly++; continue; }

    updates.push({
      id, title,
      macros: {
        calories: newCal,
        protein: newP,
        fat: newF,
        carbohydrates: newC ?? undefined,
        fibre: newFib ?? undefined,
        isEstimated: true,
      },
    });
    willApply++;
  }

  console.log(`── Plan ──`);
  console.log(`  Will apply:                   ${willApply}`);
  console.log(`  Skipped (in skip list):       ${skipped}`);
  console.log(`  Skipped (cov < ${MIN_COVERAGE}%):     ${lowCov}`);
  if (onlySet) console.log(`  Skipped (not in only-flag):   ${notInOnly}`);

  if (!APPLY) {
    console.log(`\n[DRY-RUN] No DB writes. Re-run with --apply to write to Supabase.`);
    // Write a preview CSV
    const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
    if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const PREVIEW = resolve(REPORT_DIR, `apply-macros-preview-${ts}.csv`);
    const lines = ['id,title,calories,protein,fat,carbohydrates,fibre'];
    for (const u of updates) {
      const m = u.macros;
      lines.push([u.id, u.title.replace(/[",\n]/g, ' '), m.calories, m.protein, m.fat, m.carbohydrates ?? '', m.fibre ?? ''].join(','));
    }
    writeFileSync(PREVIEW, lines.join('\n'));
    console.log(`Preview CSV: ${PREVIEW}`);
    return;
  }

  console.log(`\nApplying ${updates.length} updates to Supabase...`);
  let ok = 0, fail = 0;
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    const macros = { ...u.macros };
    if (macros.carbohydrates === undefined) delete macros.carbohydrates;
    if (macros.fibre === undefined) delete macros.fibre;
    const { error } = await sb.from('recipes').update({ macros }).eq('id', u.id);
    if (error) { console.error(`  ${u.id}: ${error.message}`); fail++; }
    else ok++;
    if ((i + 1) % 100 === 0) process.stdout.write(`  Wrote ${ok}/${updates.length}\r`);
  }
  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
}

main().catch(e => { console.error(e); process.exit(1); });
