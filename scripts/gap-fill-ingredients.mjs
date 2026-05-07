/**
 * gap-fill-ingredients.mjs
 *
 * For every `no-match` ingredient in the latest calculator misses CSV, ask
 * Haiku to estimate per-100g cal/protein/fat/carb/fibre + density (for volume
 * conversion) + countWeight (for "1 large X" inputs). Save results to a JSON
 * cache that the calculator reads as a fallback layer after the live USDA API.
 *
 * Usage:
 *   node scripts/gap-fill-ingredients.mjs                 # use latest misses CSV
 *   node scripts/gap-fill-ingredients.mjs --csv <path>    # explicit
 *   node scripts/gap-fill-ingredients.mjs --resume        # continue from progress
 *
 * Output: scripts/.cache/usda-gap-fill.json
 *
 * Cost: ~$0.30 for ~500 unique ingredients (Haiku 4.5, small per-call prompt).
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
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
const CSV_OVERRIDE = (() => { const i = args.indexOf('--csv'); return i >= 0 ? args[i + 1] : null; })();

const LOCK_DIR  = resolve(process.cwd(), 'scripts/.locks');
const LOCK_PATH = resolve(LOCK_DIR, 'gap-fill-ingredients.lock');
const CACHE_PATH = resolve(process.cwd(), 'scripts/.cache/usda-gap-fill.json');

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
function acquireLock() {
  ensureDir(LOCK_DIR);
  if (existsSync(LOCK_PATH)) {
    try {
      const meta = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      try { process.kill(meta.pid, 0); } catch { unlinkSync(LOCK_PATH); }
      if (existsSync(LOCK_PATH)) {
        console.error(`Lock held by PID ${meta.pid} since ${meta.startedAt}.`);
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

const RUBRIC = `You are a USDA nutrition reference. For each ingredient name given, return a JSON object with per-100g nutritional values plus density (for volume-to-mass conversion) and countWeight (grams per 1 unit when sold by count).

Output schema (JSON only, no prose, no markdown fences):
{
  "cal": number,           // kcal per 100g
  "protein": number,       // grams per 100g
  "fat": number,           // grams per 100g
  "carb": number,          // grams per 100g
  "fibre": number,         // grams per 100g
  "density": number|null,  // g/ml — only for liquids/pastes/loose dry goods. null if N/A.
  "countWeight": number|null, // grams per 1 typical "whole" unit (1 medium fruit, 1 fillet, 1 slice). null if not normally counted.
  "note": string           // one-line description of the assumption made
}

GUIDELINES:
- Use raw weight values (the calculator uses raw input mass). Do NOT use cooked/drained values unless the food is always sold cooked (e.g., bacon, smoked salmon).
- For canned items, give the DRAINED weight as countWeight (e.g., a 14 oz can of black beans drained ≈ 250g).
- For pastas/grains, density is for dry uncooked.
- For leafy greens (lettuce, spinach, etc.), use density 0.13 (very loose packing).
- For loose dry goods (flour, sugar), density ≈ 0.5–0.85.
- For liquids (oil, vinegar, juice), density ≈ 0.92–1.05.
- For pastes (tomato paste, miso, peanut butter), density ≈ 1.0–1.4.
- For non-edible items (skewers, parchment paper, twine), set ALL macros + density + countWeight to 0 with note "non-edible".

If the ingredient name is malformed or completely unrecognizable, return your best guess but note "uncertain" in the note field.

Output ONLY the JSON object. Be calibrated and accurate.`;

async function judge(ingredientName) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    system: [{ type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: `Ingredient: "${ingredientName}"` },
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
  const num = (v) => (typeof v === 'number' && !isNaN(v)) ? v : 0;
  return {
    entry: {
      cal: Math.round(num(parsed.cal)),
      protein: Math.round(num(parsed.protein) * 10) / 10,
      fat: Math.round(num(parsed.fat) * 10) / 10,
      carb: Math.round(num(parsed.carb) * 10) / 10,
      fibre: Math.round(num(parsed.fibre) * 10) / 10,
      density: parsed.density && typeof parsed.density === 'number' ? parsed.density : undefined,
      countWeight: parsed.countWeight && typeof parsed.countWeight === 'number' ? parsed.countWeight : undefined,
      note: parsed.note || '',
      _gap_fill: true,
    },
    usage: {
      input: msg.usage?.input_tokens ?? 0,
      output: msg.usage?.output_tokens ?? 0,
      cache_creation: msg.usage?.cache_creation_input_tokens ?? 0,
      cache_read: msg.usage?.cache_read_input_tokens ?? 0,
    },
  };
}

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
function findLatestMissesCsv() {
  const dir = resolve(process.cwd(), 'scripts/reports');
  const files = readdirSync(dir).filter(f => /^macros-coverage-misses-.*\.csv$/.test(f));
  if (files.length === 0) return null;
  files.sort();
  return resolve(dir, files[files.length - 1]);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  acquireLock();
  console.log(`gap-fill-ingredients\n`);

  const csvPath = CSV_OVERRIDE || findLatestMissesCsv();
  if (!csvPath || !existsSync(csvPath)) { console.error('No misses CSV found.'); process.exit(1); }
  console.log(`Reading: ${csvPath}\n`);

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  rows.shift(); // header
  const noMatch = rows
    .filter(r => r.length >= 3 && r[1] === 'no-match')
    .map(r => ({ name: r[0], count: parseInt(r[2], 10) || 1 }))
    .filter(r => r.name && r.name.trim());

  console.log(`No-match ingredients: ${noMatch.length}\n`);

  // Load existing cache (resume support)
  ensureDir(resolve(process.cwd(), 'scripts/.cache'));
  let cache = {};
  if (existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8')); } catch { cache = {}; }
    if (RESUME) console.log(`Resuming — ${Object.keys(cache).length} already cached.\n`);
  }

  let totalIn = 0, totalOut = 0, totalCacheR = 0, totalCacheC = 0;
  let evaluated = 0, errored = 0;

  for (let i = 0; i < noMatch.length; i++) {
    const ing = noMatch[i];
    const key = ing.name.toLowerCase().trim();
    if (cache[key]) continue;
    process.stdout.write(`[${i + 1}/${noMatch.length}] ${ing.name.slice(0, 50).padEnd(50)} `);
    try {
      const { entry, usage } = await judge(ing.name);
      cache[key] = entry;
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`cal=${entry.cal} p=${entry.protein} f=${entry.fat} c=${entry.carb}${entry.density ? ` d=${entry.density}` : ''}${entry.countWeight ? ` cw=${entry.countWeight}` : ''}`);
      totalIn += usage.input;
      totalOut += usage.output;
      totalCacheR += usage.cache_read;
      totalCacheC += usage.cache_creation;
      evaluated++;
    } catch (err) {
      console.log(`ERR: ${err.message.slice(0, 80)}`);
      errored++;
    }
    if ((i + 1) % 20 === 0) await sleep(150);
  }

  const cost = (totalCacheC * 1.0 + totalCacheR * 0.08 + totalIn * 0.8 + totalOut * 4.0) / 1_000_000;
  console.log(`\n── Summary ──`);
  console.log(`  Evaluated:        ${evaluated}`);
  console.log(`  Errored:          ${errored}`);
  console.log(`  Cache size:       ${Object.keys(cache).length}`);
  console.log(`  Tokens: in=${totalIn.toLocaleString()} out=${totalOut.toLocaleString()} cacheR=${totalCacheR.toLocaleString()} cacheC=${totalCacheC.toLocaleString()}`);
  console.log(`  Estimated cost:   $${cost.toFixed(3)}`);
  console.log(`  Cache file:       ${CACHE_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
