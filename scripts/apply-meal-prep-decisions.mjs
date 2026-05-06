/**
 * apply-meal-prep-decisions.mjs — Phase 0c
 *
 * Reads the hand-edited meal-prep-review.csv and applies meal_prep_friendly
 * updates to Supabase ONLY for rows where the `decision` column is filled in.
 *
 * Decision values (case-insensitive, trimmed):
 *   keep       — set meal_prep_friendly = true
 *   remove     — set meal_prep_friendly = false
 *   <blank>    — skip (no change)
 *
 * Defaults to --dry-run. You must pass --apply to actually write.
 * Always emits a confirmation log to scripts/reports/meal-prep-applied-<ts>.log.
 *
 * Usage:
 *   node scripts/apply-meal-prep-decisions.mjs                                    # dry-run
 *   node scripts/apply-meal-prep-decisions.mjs --apply                            # write
 *   node scripts/apply-meal-prep-decisions.mjs --csv path/to/file.csv             # custom path
 *   node scripts/apply-meal-prep-decisions.mjs --apply --only-changes             # skip rows where suggested == current
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
const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── CLI ───────────────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const APPLY        = args.includes('--apply');
const ONLY_CHANGES = args.includes('--only-changes');
const CSV_PATH     = (() => {
  const i = args.indexOf('--csv');
  return i >= 0 ? args[i + 1] : resolve(process.cwd(), 'scripts/reports/meal-prep-review.csv');
})();

// ── Tiny CSV parser (handles quoted fields with commas + escaped quotes) ─────
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  // Split lines respecting quoted newlines (basic version — our CSV doesn't embed newlines).
  const rows = text.split(/\r?\n/).filter(l => l.length > 0).map(parseCsvLine);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0];
  const objs = rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows: objs };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`CSV not found at ${CSV_PATH}`);
    console.error(`Run scripts/audit-meal-prep-tag.mjs first to generate it.`);
    process.exit(1);
  }
  const text = readFileSync(CSV_PATH, 'utf8');
  const { headers, rows } = parseCsv(text);

  const required = ['id','title','current_tag','decision'];
  for (const h of required) {
    if (!headers.includes(h)) {
      console.error(`CSV is missing required column: ${h}`);
      process.exit(1);
    }
  }

  // Filter rows that have a decision
  const decided = rows.map(r => ({
    ...r,
    decision: (r.decision || '').trim().toLowerCase(),
  })).filter(r => r.decision === 'keep' || r.decision === 'remove');

  if (decided.length === 0) {
    console.log(`No rows have a 'decision' value of 'keep' or 'remove'. Nothing to do.`);
    process.exit(0);
  }

  // Build the change set
  const changes = [];
  for (const r of decided) {
    const targetValue = r.decision === 'keep';
    const currentTag = r.current_tag === 'true' ? true : r.current_tag === 'false' ? false : null;
    if (ONLY_CHANGES && currentTag === targetValue) continue;
    changes.push({
      id: r.id,
      title: r.title,
      current: currentTag,
      target: targetValue,
      decision: r.decision,
    });
  }

  console.log(`apply-meal-prep-decisions — mode: ${APPLY ? 'LIVE WRITE' : 'DRY RUN'}`);
  console.log(`CSV: ${CSV_PATH}`);
  console.log(`Rows with decision: ${decided.length}`);
  console.log(`Changes to apply:   ${changes.length} ${ONLY_CHANGES ? '(skipping no-ops)' : ''}\n`);

  if (changes.length === 0) {
    console.log('Nothing to apply.');
    process.exit(0);
  }

  // ── Write log ──
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const LOG_PATH = resolve(REPORT_DIR, `meal-prep-applied-${ts}.log`);
  const logLines = [];
  logLines.push(`apply-meal-prep-decisions log — ${ts}`);
  logLines.push(`mode: ${APPLY ? 'LIVE' : 'DRY-RUN'}`);
  logLines.push(`csv: ${CSV_PATH}`);
  logLines.push('');

  let succeeded = 0, skipped = 0, errored = 0;
  for (const c of changes) {
    const line = `${c.decision.padEnd(7)} ${String(c.current).padEnd(5)} → ${String(c.target).padEnd(5)}  ${c.id}  ${c.title}`;
    process.stdout.write(line);
    if (!APPLY) {
      console.log('  [dry-run]');
      logLines.push(line + '  [dry-run]');
      skipped++;
      continue;
    }
    try {
      const { error } = await sb.from('recipes').update({ meal_prep_friendly: c.target }).eq('id', c.id);
      if (error) throw error;
      console.log('  ✓');
      logLines.push(line + '  OK');
      succeeded++;
    } catch (err) {
      console.log(`  ✗ ${err.message}`);
      logLines.push(line + `  ERROR: ${err.message}`);
      errored++;
    }
  }

  writeFileSync(LOG_PATH, logLines.join('\n'));

  console.log(`\n── Summary ──`);
  if (APPLY) {
    console.log(`  Succeeded: ${succeeded}`);
    console.log(`  Errored:   ${errored}`);
  } else {
    console.log(`  Would change: ${skipped}`);
    console.log(`  (dry-run — nothing written. Re-run with --apply to commit.)`);
  }
  console.log(`  Log:       ${LOG_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
