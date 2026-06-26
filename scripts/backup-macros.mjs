/**
 * backup-macros.mjs — snapshot every recipe's current macros to a JSON file (read-only).
 * Run BEFORE compute-macros-from-usda.mjs --apply so the write is instantly reversible.
 *   node scripts/backup-macros.mjs            # writes scripts/reports/macros-backup-<ts>.json
 *   node scripts/restore-macros.mjs <file>    # (companion) restores from a backup
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(env['EXPO_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const all = [];
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb.from('recipes').select('id, macros').range(from, from + PAGE - 1);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE) break;
}
const dir = resolve(process.cwd(), 'scripts/reports');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const path = resolve(dir, `macros-backup-${ts}.json`);
writeFileSync(path, JSON.stringify(all));
console.log(`Backed up ${all.length} recipes' macros → ${path}`);
