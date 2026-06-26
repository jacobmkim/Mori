/**
 * restore-macros.mjs — restore recipe macros from a backup file made by backup-macros.mjs.
 *   node scripts/restore-macros.mjs scripts/reports/macros-backup-<ts>.json [--apply]
 * Without --apply it's a dry run (reports how many would change). With --apply it writes.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(env['EXPO_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('usage: node scripts/restore-macros.mjs <backup.json> [--apply]'); process.exit(1); }
const rows = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
console.log(`Loaded ${rows.length} backed-up recipes. Mode: ${APPLY ? 'RESTORE (write)' : 'DRY-RUN'}`);
if (!APPLY) { console.log('Re-run with --apply to write.'); process.exit(0); }
let ok = 0, fail = 0;
for (let i = 0; i < rows.length; i++) {
  const { error } = await sb.from('recipes').update({ macros: rows[i].macros }).eq('id', rows[i].id);
  if (error) { console.error(`  ${rows[i].id}: ${error.message}`); fail++; } else ok++;
  if ((i + 1) % 200 === 0) process.stdout.write(`  Restored ${ok}/${rows.length}\r`);
}
console.log(`\n  Restored: ${ok}\n  Failed:   ${fail}`);
