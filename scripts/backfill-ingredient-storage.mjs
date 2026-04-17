// Backfill ingredient_storage: walks every recipe, extracts unique
// ingredient names, filters out staples, asks Haiku for storage data,
// and upserts into ingredient_storage.
//
// Run:
//   node scripts/backfill-ingredient-storage.mjs --dry-run   (prints first 10)
//   node scripts/backfill-ingredient-storage.mjs             (live)
//   node scripts/backfill-ingredient-storage.mjs --limit 50  (cap)
//
// Safe to re-run. Resume-safe: skips rows already in ingredient_storage.
// Cost: ~1 Haiku call per unique ingredient (~600-900 for full catalogue).

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── env ───────────────────────────────────────────────────────────────────────
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

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── flags ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(args[limitArg + 1]) : null;

// ── staples (mirror of lib/staples.ts — keep in sync manually) ────────────────
const STAPLES = new Set([
  'salt', 'kosher salt', 'sea salt', 'table salt',
  'pepper', 'black pepper', 'white pepper', 'ground pepper',
  'oil', 'olive oil', 'extra virgin olive oil', 'vegetable oil',
  'canola oil', 'sunflower oil', 'grapeseed oil', 'neutral oil',
  'sesame oil', 'cooking oil',
  'water', 'ice', 'ice cubes',
  'flour', 'all-purpose flour', 'all purpose flour', 'plain flour',
  'bread flour', 'cake flour', 'whole wheat flour', 'self-raising flour',
  'sugar', 'white sugar', 'granulated sugar', 'caster sugar',
  'brown sugar', 'light brown sugar', 'dark brown sugar',
  'baking soda', 'bicarbonate of soda', 'baking powder', 'cornstarch', 'corn starch',
  'cornflour',
  'butter', 'unsalted butter', 'salted butter',
  'garlic', 'garlic clove', 'garlic cloves', 'minced garlic', 'garlic powder',
  'cumin', 'ground cumin', 'cumin seeds',
  'paprika', 'smoked paprika', 'sweet paprika', 'hot paprika',
  'chilli flakes', 'chili flakes', 'red pepper flakes', 'crushed red pepper',
  'oregano', 'dried oregano',
  'thyme', 'dried thyme',
  'basil', 'dried basil',
  'bay leaf', 'bay leaves',
  'cinnamon', 'ground cinnamon', 'cinnamon stick',
  'nutmeg', 'ground nutmeg',
  'coriander', 'ground coriander', 'coriander seeds',
  'turmeric', 'ground turmeric',
  'ginger powder', 'ground ginger',
  'onion powder', 'cayenne', 'cayenne pepper',
  'italian seasoning', 'herbs de provence',
]);

function isStaple(name) {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (STAPLES.has(n)) return true;
  for (const s of STAPLES) {
    if (s.includes(' ') && n.includes(s)) return true;
  }
  return false;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Haiku call: structured storage info per ingredient ────────────────────────
async function fetchStorageInfo(name) {
  const prompt = `You are a food safety reference. For the ingredient "${name}", respond ONLY with a JSON object — no markdown, no explanation. Format:

{
  "canonical_name": "<lowercase simplest form>",
  "aliases": ["alt name 1", "alt name 2"],
  "category": "<produce|protein|dairy|grain|condiment|herb|legume|other>",
  "days_fridge": <integer days, typical raw/cooked storage, or null>,
  "days_freezer": <integer days, or null>,
  "days_room_temp": <integer days, or null if must be refrigerated>,
  "tips_text": "<one short sentence of storage + usage tip, general guidance only, max 140 chars>"
}

Use conservative, commonly cited USDA-style estimates. If the ingredient shouldn't be room-temp (meat, dairy, cut produce), set days_room_temp to null. Fridge defaults to covered/sealed. Freezer numbers assume proper wrapping.`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  // sanity
  if (!parsed.canonical_name) throw new Error('Missing canonical_name');
  return parsed;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${DRY_RUN ? 'DRY RUN — ' : ''}Extracting unique ingredients from recipes...`);

  // Pull all recipes (paginate via .range to dodge 1000-row default)
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, ingredients')
      .range(from, from + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  Loaded ${all.length} recipes`);

  const nameSet = new Map(); // key: normalized, val: sample original
  for (const r of all) {
    for (const ing of (r.ingredients ?? [])) {
      if (!ing?.name) continue;
      const n = ing.name.trim().toLowerCase();
      if (!n) continue;
      if (isStaple(n)) continue;
      if (!nameSet.has(n)) nameSet.set(n, ing.name.trim());
    }
  }
  console.log(`  ${nameSet.size} unique non-staple ingredients`);

  // Skip ones already in ingredient_storage
  const { data: existing } = await sb
    .from('ingredient_storage')
    .select('canonical_name, aliases');
  const existingSet = new Set();
  for (const row of (existing ?? [])) {
    existingSet.add(row.canonical_name);
    for (const a of (row.aliases ?? [])) existingSet.add(a.toLowerCase());
  }
  const todo = [...nameSet.entries()].filter(([n]) => !existingSet.has(n));
  console.log(`  ${todo.length} new rows to fetch (${nameSet.size - todo.length} already present)`);

  if (DRY_RUN) {
    console.log('\nFirst 10 to fetch:');
    for (const [n] of todo.slice(0, 10)) console.log('  -', n);
    console.log('\nDry run — exiting.');
    return;
  }

  const effectiveTodo = LIMIT ? todo.slice(0, LIMIT) : todo;
  let ok = 0, fail = 0;

  for (let i = 0; i < effectiveTodo.length; i++) {
    const [key] = effectiveTodo[i];
    try {
      const info = await fetchStorageInfo(key);
      const row = {
        canonical_name: (info.canonical_name || key).toLowerCase(),
        aliases: Array.from(new Set([
          key,
          ...(Array.isArray(info.aliases) ? info.aliases.map(a => String(a).toLowerCase()) : []),
        ])).filter(a => a !== info.canonical_name?.toLowerCase()),
        category: info.category ?? null,
        days_fridge: Number.isFinite(info.days_fridge) ? info.days_fridge : null,
        days_freezer: Number.isFinite(info.days_freezer) ? info.days_freezer : null,
        days_room_temp: Number.isFinite(info.days_room_temp) ? info.days_room_temp : null,
        tips_text: info.tips_text ?? null,
        is_staple: false,
      };
      const { error } = await sb
        .from('ingredient_storage')
        .upsert(row, { onConflict: 'canonical_name' });
      if (error) throw new Error(error.message);
      ok++;
      console.log(`  [${i + 1}/${effectiveTodo.length}] ✓ ${row.canonical_name} — fridge ${row.days_fridge}d, freezer ${row.days_freezer}d`);
    } catch (err) {
      fail++;
      console.error(`  [${i + 1}/${effectiveTodo.length}] ✗ ${key}: ${err.message}`);
    }
    if (i < effectiveTodo.length - 1) await sleep(1200);
  }

  console.log(`\nDone — ${ok} upserted, ${fail} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
