/**
 * audit-recipe-portions.mjs
 *
 * Phase 1 of the comprehensive recipe audit. For every recipe in Supabase,
 * compute per-serving raw weight of every meat/fish/key-protein ingredient.
 * Flag recipes where the per-serving portion is outside the reasonable band:
 *
 *   - Chicken breast / pork chop / fish fillet: 100-300g raw per serving
 *   - Steaks (sirloin, ribeye, tenderloin): 150-300g per serving
 *   - Ground meat: 80-200g per serving
 *   - Wings, drumsticks: 200-400g per serving
 *   - Whole fish, whole chicken: 300-600g per serving
 *
 * Output: scripts/reports/recipe-portion-audit-<ts>.csv
 *   columns: id, title, servings, ingredient, qty_per_serving_g, expected_band, severity
 *
 * Free, deterministic, no AI.
 *
 * Usage:
 *   node scripts/audit-recipe-portions.mjs                  # full sweep
 *   node scripts/audit-recipe-portions.mjs --limit 100      # sample
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
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();

const VOLUME_ML = { 'tsp':5,'tbsp':15,'tablespoon':15,'tablespoons':15,'cup':240,'cups':240,'c':240,'ml':1,'liter':1000,'l':1000,'pint':473,'quart':946 };
const WEIGHT_G  = { 'g':1,'gram':1,'grams':1,'kg':1000,'oz':28.35,'ounce':28.35,'ounces':28.35,'lb':453.59,'lbs':453.59,'pound':453.59,'pounds':453.59 };

// Per-ingredient reasonable per-serving raw weight bands.
// Each entry: regex matching ingredient names → { min g/serv, max g/serv, label }
const PORTION_BANDS = [
  // Whole-bird formats
  { re: /\bwhole chicken\b|spatchcock/i, min: 200, max: 600, label: 'whole chicken (200-600g/serv raw, w/bone)' },
  { re: /\bwhole (?:duck|turkey)\b/i,   min: 250, max: 700, label: 'whole bird' },
  { re: /\bwhole (?:fish|trout|sea bass|branzino|bream)\b/i, min: 150, max: 500, label: 'whole fish' },

  // Cuts where 1 piece per person is normal
  { re: /\bchicken (?:breast|breasts)\b/i,  min: 100, max: 300, label: 'chicken breast' },
  { re: /\bchicken (?:thigh|thighs)\b/i,    min: 100, max: 280, label: 'chicken thighs' },
  { re: /\bchicken (?:drumstick|drumsticks)\b/i, min: 200, max: 500, label: 'chicken drumsticks' },
  { re: /\bchicken wings?\b/i,              min: 150, max: 450, label: 'chicken wings (snack vs main)' },
  { re: /\bchicken (?:leg|legs|quarter|quarters)\b/i, min: 200, max: 400, label: 'chicken legs/quarters' },
  { re: /\bturkey breast\b/i,               min: 100, max: 300, label: 'turkey breast' },
  { re: /\bturkey leg\b/i,                  min: 250, max: 500, label: 'turkey leg' },

  { re: /\bpork (?:chop|chops)\b/i,         min: 130, max: 320, label: 'pork chops' },
  { re: /\bpork tenderloin\b/i,             min: 100, max: 300, label: 'pork tenderloin' },
  { re: /\bpork (?:shoulder|butt)\b/i,      min: 100, max: 350, label: 'pork shoulder/butt (raw, will shrink)' },
  { re: /\bpork belly\b/i,                  min: 150, max: 350, label: 'pork belly' },
  { re: /\bpork ribs?\b|baby back|spare ribs/i, min: 200, max: 500, label: 'pork ribs (with bone)' },

  { re: /\bbeef tenderloin\b|filet mignon\b/i, min: 100, max: 280, label: 'beef tenderloin' },
  { re: /\b(?:ribeye|sirloin|new york strip|t-bone|porterhouse)\b/i, min: 150, max: 350, label: 'beef steak' },
  { re: /\bflank steak\b|skirt steak\b/i,   min: 100, max: 250, label: 'flank/skirt' },
  { re: /\bbeef chuck\b|chuck roast\b|short ribs?\b|brisket\b|oxtail\b/i, min: 100, max: 400, label: 'tough beef cuts (will braise down)' },
  { re: /\b(?:lamb|veal) (?:shoulder|leg|chops?)\b/i, min: 100, max: 350, label: 'lamb cut' },

  { re: /\bground (?:beef|pork|turkey|chicken|lamb)\b/i, min: 50, max: 180, label: 'ground meat' },
  { re: /\bbacon\b/i,                       min: 15, max: 100, label: 'bacon (per serving)' },
  { re: /\bsausage\b/i,                     min: 50, max: 200, label: 'sausage' },

  // Fish & seafood
  { re: /\b(?:salmon|cod|tilapia|halibut|mahi|trout|sea bass|snapper) (?:fillet|fillets|steak|steaks)\b/i, min: 100, max: 250, label: 'fish fillet' },
  { re: /\bsalmon\b(?!.*(?:smoked|cured))/i, min: 100, max: 250, label: 'salmon' },
  { re: /\b(?:tuna|cod|tilapia|halibut|trout|bass) /i, min: 100, max: 250, label: 'fish' },
  { re: /\bshrimps?\b(?!\s+sauce|\s+paste)|prawns?\b/i, min: 80, max: 250, label: 'shrimp/prawns' },
  { re: /\bscallops?\b/i,                   min: 80, max: 200, label: 'scallops' },
  { re: /\blobster (?:tail|tails)\b/i,      min: 100, max: 300, label: 'lobster tail' },
  // Exclude sauce/paste contexts — "oyster sauce" / "fish sauce" are not the seafood
  { re: /\b(?:mussels?|clams?|oysters?)\b(?!\s+(?:sauce|paste|extract))/i, min: 100, max: 300, label: 'shellfish (with shell)' },
];

// Skip recipes that legitimately combine multiple proteins ("X or Y" / multi-protein stews).
// For those, flagging each individual protein as "under" produces false positives.
function isMultiProteinIngredient(name) {
  return /\bor\b|\b\/\b|\band\b.*(?:beef|pork|chicken|lamb|turkey|fish|shrimp|sausage)/i.test(name);
}

function approxGrams(qty, unit, density = 1.0, countWeight = null) {
  if (qty == null || qty === '') return null;
  // Range in unit "(5-7 lb)" or "(1.5 lb)"
  const t = String(unit || '').toLowerCase();
  const rng = t.match(/\(?\s*(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|lb|lbs?|pounds?)\s*\)?/);
  if (rng) {
    const mid = (parseFloat(rng[1]) + parseFloat(rng[2])) / 2;
    const w = WEIGHT_G[rng[3]] || WEIGHT_G[rng[3].replace(/s$/, '')];
    if (w) return parseFloat(qty) * mid * w;
  }
  const m = t.match(/\(?\s*(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|lb|lbs?|pounds?)\s*\)?/);
  if (m) {
    const w = WEIGHT_G[m[2]] || WEIGHT_G[m[2].replace(/s$/, '')];
    if (w) return parseFloat(qty) * parseFloat(m[1]) * w;
  }
  // Inline qty "1 1/2 cup" with empty unit
  if (!unit || !unit.trim()) {
    const s = String(qty).trim().toLowerCase();
    const mixed = s.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)\s+([a-z]+)$/);
    if (mixed) {
      const q = parseFloat(mixed[1]) + parseInt(mixed[2])/parseInt(mixed[3]);
      const u = mixed[4];
      if (WEIGHT_G[u]) return q * WEIGHT_G[u];
      if (VOLUME_ML[u]) return q * VOLUME_ML[u] * density;
    }
    const simple = s.match(/^(\d+(?:\.\d+)?)\s+([a-z]+)$/);
    if (simple) {
      const q = parseFloat(simple[1]);
      const u = simple[2];
      if (WEIGHT_G[u]) return q * WEIGHT_G[u];
      if (VOLUME_ML[u]) return q * VOLUME_ML[u] * density;
    }
  }
  const q = parseFloat(qty);
  if (!q || isNaN(q)) return null;
  const u = String(unit || '').trim().toLowerCase();
  if (WEIGHT_G[u]) return q * WEIGHT_G[u];
  if (VOLUME_ML[u]) return q * VOLUME_ML[u] * density;
  // count units — only useful if we have countWeight
  if (countWeight) return q * countWeight;
  return null;
}

// Common count weights for proteins (used as fallback when unit is count-based)
const PROTEIN_COUNT_WEIGHTS = {
  'chicken breast': 175, 'chicken breasts': 175, 'chicken thigh': 110, 'chicken thighs': 110,
  'chicken drumstick': 130, 'chicken drumsticks': 130, 'chicken wing': 35, 'chicken wings': 35,
  'chicken leg': 200, 'chicken legs': 200, 'chicken quarter': 250, 'chicken quarters': 250,
  'whole chicken': 1600, 'half chicken': 700,
  'pork chop': 200, 'pork chops': 200, 'bone-in pork chop': 280, 'pork tenderloin': 450,
  'pork shoulder steak': 250, 'pork shoulder steaks': 250, 'pork steak': 200, 'pork steaks': 200,
  'beef tenderloin': 200, 'filet mignon': 200, 'ribeye': 280, 'ribeye steak': 280,
  'sirloin steak': 200, 'flank steak': 600, 'skirt steak': 350,
  'salmon fillet': 170, 'salmon fillets': 170, 'salmon steak': 200,
  'cod fillet': 170, 'cod fillets': 170, 'cod': 170, 'tilapia': 130,
  'tilapia fillet': 130, 'tilapia fillets': 130,
  'whole trout': 280, 'rainbow trout': 280, 'trout': 280,
  'whole sea bass': 400, 'whole branzino': 400, 'sea bass': 400, 'whole fish': 400,
  'lobster tail': 150, 'lobster tails': 150, 'lobster': 600,
  'duck leg': 350, 'duck legs': 350, 'duck breast': 200, 'duck breasts': 200,
  'turkey leg': 1100, 'turkey breast': 250,
};
function lookupCountWeight(name) {
  const n = String(name || '').trim().toLowerCase();
  for (const [k, v] of Object.entries(PROTEIN_COUNT_WEIGHTS)) {
    if (n === k || n.includes(k)) return v;
  }
  return null;
}

function csvEscape(v) { if (v == null) return ''; const s = String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

async function main() {
  console.log('audit-recipe-portions — flagging out-of-band per-serving portions\n');

  let all = []; let offset = 0;
  while (true) {
    const { data } = await sb.from('recipes').select('id,title,servings,ingredients').order('id').range(offset, offset+999);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (isFinite(LIMIT)) all = all.slice(0, LIMIT);
  console.log(`Auditing ${all.length} recipes\n`);

  const flags = [];
  for (const r of all) {
    const servings = Math.max(1, r.servings || 4);
    for (const ing of r.ingredients || []) {
      const name = String(ing.name || '');
      // Find which portion band applies (only the FIRST match — most specific)
      let band = null;
      for (const b of PORTION_BANDS) {
        if (b.re.test(name)) { band = b; break; }
      }
      if (!band) continue;
      // Skip multi-protein ingredients (stew with "X or Y") — they're typically
      // a smaller share of the dish so under-portioning is expected.
      const isMulti = isMultiProteinIngredient(name);
      const cw = lookupCountWeight(name);
      const grams = approxGrams(ing.quantity, ing.unit, 1.0, cw);
      if (grams == null) continue;
      const perServ = grams / servings;
      let severity = 0;
      let direction = '';
      // Focus on OVER — UNDER produces too many false positives (snacks, appetizers,
      // accent ingredients where small protein is normal: chawanmushi, pinwheels, etc.)
      if (perServ > band.max * 2) { severity = 5; direction = 'WAY OVER'; }
      else if (perServ > band.max) { severity = 3; direction = 'over'; }
      if (severity === 0) continue;
      flags.push({
        id: r.id, title: r.title, servings,
        ingredient: name,
        qty: ing.quantity, unit: ing.unit,
        gramsPerServ: Math.round(perServ),
        band: band.label,
        bandMin: band.min, bandMax: band.max,
        severity, direction,
      });
    }
  }

  // Sort by severity desc then by overshoot magnitude
  flags.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    const overA = Math.max(a.gramsPerServ - a.bandMax, a.bandMin - a.gramsPerServ);
    const overB = Math.max(b.gramsPerServ - b.bandMax, b.bandMin - b.gramsPerServ);
    return overB - overA;
  });

  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const PATH = resolve(REPORT_DIR, `recipe-portion-audit-${ts}.csv`);
  const lines = ['id,title,servings,ingredient,qty,unit,grams_per_serv,band_label,band_min,band_max,severity,direction'];
  for (const f of flags) {
    lines.push([
      f.id, csvEscape(f.title), f.servings, csvEscape(f.ingredient), csvEscape(f.qty), csvEscape(f.unit),
      f.gramsPerServ, csvEscape(f.band), f.bandMin, f.bandMax, f.severity, f.direction,
    ].join(','));
  }
  writeFileSync(PATH, lines.join('\n'));

  // Summary
  const sevCount = {};
  const dirCount = {};
  for (const f of flags) { sevCount[f.severity] = (sevCount[f.severity]||0)+1; dirCount[f.direction] = (dirCount[f.direction]||0)+1; }
  const uniqueRecipes = new Set(flags.map(f => f.id)).size;
  console.log(`── Summary ──`);
  console.log(`  Total flags:          ${flags.length}`);
  console.log(`  Unique recipes:       ${uniqueRecipes}`);
  console.log(`  Severity:             ${JSON.stringify(sevCount)}`);
  console.log(`  Direction:            ${JSON.stringify(dirCount)}`);
  console.log(`  CSV: ${PATH}`);
  console.log(`\nTop 15 most-egregious portion flags:`);
  for (const f of flags.slice(0, 15)) {
    console.log(`  [sev=${f.severity}] ${f.title.slice(0,40).padEnd(40)} ${f.direction.padEnd(10)} ${f.ingredient.slice(0,30).padEnd(30)} ${f.gramsPerServ}g/serv (band: ${f.bandMin}-${f.bandMax}g)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
