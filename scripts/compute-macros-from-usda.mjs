/**
 * compute-macros-from-usda.mjs — production deterministic macro calculator
 *
 * Computes per-serving macros for each recipe by summing USDA reference
 * values for each ingredient at its listed quantity. Fully deterministic,
 * no AI. Auditable: every computed macro traces back to a USDA FDC ID
 * (or to the hardcoded reference table, also USDA-sourced).
 *
 * Pipeline per recipe:
 *   1. For each ingredient: match to USDA entry (hardcoded → API → null)
 *   2. Convert quantity+unit → grams (deterministic parser)
 *   3. macros += entry.macros × (grams / 100)
 *   4. divide by servings → per-serving macros
 *
 * Cooking adjustments: NOT applied. We use raw USDA values, matching the
 * convention of MyFitnessPal, Cronometer, USDA itself. This conservatively
 * over-counts oil-heavy dishes by ~5% (oil "for frying" often partially
 * discarded) — acceptable for meal-prep classification.
 *
 * Output:
 *   - scripts/reports/macros-computed-<ts>.csv (per-recipe results + coverage)
 *   - scripts/reports/macros-coverage-misses-<ts>.csv (ingredients we couldn't match)
 *   - With --apply: writes new macros to Supabase recipes.macros field
 *
 * Cost: $0 runtime. USDA API is free with key (1000 req/hour); cache makes
 * repeat ingredients a no-op. ~30 min for full DB.
 *
 * Usage:
 *   node scripts/compute-macros-from-usda.mjs               # dry-run all 2619
 *   node scripts/compute-macros-from-usda.mjs --limit 30    # sample
 *   node scripts/compute-macros-from-usda.mjs --apply       # write to DB
 *   node scripts/compute-macros-from-usda.mjs --verbose
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
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);
const USDA_API_KEY = envVars['USDA_API_KEY'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const ONLY_ID = (() => { const i = args.indexOf('--id'); return i >= 0 ? args[i + 1] : null; })();
const ONLY_TITLE = (() => { const i = args.indexOf('--title'); return i >= 0 ? args[i + 1].toLowerCase() : null; })();
const NO_GATE = args.includes('--no-gate');

// Decide whether a recomputed recipe is SAFE to write over the stored value. The bug we fix DROPPED
// ingredients (undercount), so real fixes show up as increases or flat. A material DROP on an
// incompletely-covered recipe means we're now dropping a calorie-significant ingredient the stored
// value already had (a regression — e.g. "1 can coconut milk" with no can-weight) → skip it.
function applyDecision(recipe, computed) {
  const old = recipe.macros?.calories;
  const neu = computed.macros.calories;
  if (typeof old !== 'number') return { apply: true, reason: 'no-prior' };
  if (neu === old) return { apply: false, reason: 'unchanged' };
  if ((computed.warns || []).length > 0) return { apply: false, reason: `warn(${computed.warns.join('|')})` };
  if (NO_GATE) return { apply: true, reason: 'no-gate' };
  if (computed.coverage >= 0.999) return { apply: true, reason: 'full-coverage' };
  if (neu >= old * 0.85) return { apply: true, reason: 'increase/flat' };
  return { apply: false, reason: 'regression-risk' };
}

// An UNMATCHED ingredient is either negligible (salt/herbs/spices/garnish — fine to drop) or
// CALORIE-SIGNIFICANT (a specialty protein/dairy/starch the table doesn't know — e.g. "salt cod",
// "bonito flakes"). The latter must NEVER be silently dropped: it goes on the needs-review report so
// a human adds it. Conservative: anything with a calorie-dense word, or not clearly a seasoning, is
// treated as review-worthy.
const NEGLIGIBLE_RE = /\b(salt|pepper|peppercorns?|water|ice|baking (soda|powder)|cream of tartar|food colou?ring|vanilla|zest|garnish|to taste|to serve|thyme|basil|rosemary|parsley|cilantro|coriander|oregano|sage|mint|chives|dill|bay leaf|bay leaves|tarragon|marjoram|chervil|cumin|paprika|turmeric|cinnamon|nutmeg|cardamom|cloves?|allspice|cayenne|chil(l?i|li)(es|s)?|chiles?|red pepper flakes|curry powder|curry leaf|curry leaves|garam masala|saffron|sumac|za'?atar|herbs?|spices?|seasoning|lemongrass|kaffir|makrut|ginger|stock cube|bouillon|parchment|cooking spray|skewers?|toothpicks?|twine)\b/i;
const CALORIE_DENSE_RE = /\b(oil|butter|ghee|cream|cheese|milk|coconut|yogurt|sauce|paste|sugar|honey|syrup|molasses|flour|bread|baguette|rice|pasta|noodle|bean|lentil|chickpea|nut|seed|cod|fish|salmon|tuna|prawn|shrimp|scallop|mussel|squid|meat|chicken|beef|pork|lamb|veal|bacon|ham|sausage|chorizo|egg|tofu|tempeh|potato|chocolate|oats?|grain|quinoa)\b/i;
// Non-edible wrappers / vessels / sub-1g sachets — discarded or trace, never contribute macros.
// Checked BEFORE the calorie-dense gate so e.g. "squid ink sachet" isn't flagged for "squid".
const NON_EDIBLE_RE = /\b(husks?|vine leaves?|grape leaves?|banana leaf|banana leaves|lotus leaf|lotus leaves|cooking spray|squid ink|wrappers?|foil|skewers?|toothpicks?|twine|parchment)\b/i;
function isNegligibleMiss(name) {
  const n = String(name || '').toLowerCase();
  if (NON_EDIBLE_RE.test(n)) return true;        // wrapper / vessel / trace sachet → safe to ignore
  if (CALORIE_DENSE_RE.test(n)) return false;   // has a calorie-bearing word → must review
  return NEGLIGIBLE_RE.test(n);                  // clearly a seasoning/garnish → safe to ignore
}

// ─────────────────────────────────────────────────────────────────────────────
// USDA REFERENCE TABLE (per 100g basis)
// Sourced from USDA FoodData Central (https://fdc.nal.usda.gov)
// Each entry: cal, protein, fat, carb, fibre per 100g
//   density:     g/ml for volume conversion (default 1.0 if missing)
//   countWeight: grams per 1 "medium" / "whole" / "clove" if used by count
//   fdcId:       USDA FoodData Central ID for traceability
// ─────────────────────────────────────────────────────────────────────────────
const USDA = {
  // ── PROTEINS — animal ──
  'chicken breast':           { cal: 165, protein: 31,   fat: 3.6, carb: 0,   fibre: 0,   fdcId: 171477, countWeight: 175, note: 'boneless skinless' },
  'chicken breasts':          { cal: 165, protein: 31,   fat: 3.6, carb: 0,   fibre: 0,   countWeight: 175 },
  'boneless skinless chicken breast':  { cal: 165, protein: 31,   fat: 3.6, carb: 0,   fibre: 0,   countWeight: 175 },
  'boneless skinless chicken breasts': { cal: 165, protein: 31,   fat: 3.6, carb: 0,   fibre: 0,   countWeight: 175 },
  'bone-in chicken breast':   { cal: 165, protein: 31,   fat: 3.6, carb: 0,   fibre: 0,   countWeight: 250 },
  'chicken cutlet':           { cal: 165, protein: 31,   fat: 3.6, carb: 0,   fibre: 0,   countWeight: 110 },
  'chicken cutlets':          { cal: 165, protein: 31,   fat: 3.6, carb: 0,   fibre: 0,   countWeight: 110 },
  'chicken tenderloin':       { cal: 110, protein: 24,   fat: 1.1, carb: 0,   fibre: 0,   countWeight: 30 },
  'chicken tenderloins':      { cal: 110, protein: 24,   fat: 1.1, carb: 0,   fibre: 0,   countWeight: 30 },
  'chicken tender':           { cal: 110, protein: 24,   fat: 1.1, carb: 0,   fibre: 0,   countWeight: 30 },
  'chicken tenders':          { cal: 110, protein: 24,   fat: 1.1, carb: 0,   fibre: 0,   countWeight: 30 },
  'chicken thigh':            { cal: 209, protein: 26,   fat: 11,  carb: 0,   fibre: 0,   fdcId: 171474, countWeight: 110 },
  'chicken thighs':           { cal: 209, protein: 26,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 110 },
  'boneless chicken thighs':  { cal: 209, protein: 26,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 110 },
  'bone-in chicken thighs':   { cal: 209, protein: 26,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 150 },
  'chicken wing':             { cal: 222, protein: 20.5, fat: 15.5, carb: 0,  fibre: 0,   fdcId: 171466, countWeight: 35 },
  'chicken wings':            { cal: 222, protein: 20.5, fat: 15.5, carb: 0,  fibre: 0,   countWeight: 35 },
  'chicken drumstick':        { cal: 161, protein: 24,   fat: 7,   carb: 0,   fibre: 0,   countWeight: 130 },
  'chicken drumsticks':       { cal: 161, protein: 24,   fat: 7,   carb: 0,   fibre: 0,   countWeight: 130 },
  'drumstick':                { cal: 161, protein: 24,   fat: 7,   carb: 0,   fibre: 0,   countWeight: 130, note: 'assume chicken' },
  'drumsticks':               { cal: 161, protein: 24,   fat: 7,   carb: 0,   fibre: 0,   countWeight: 130 },
  'chicken leg':              { cal: 184, protein: 24,   fat: 9.4, carb: 0,   fibre: 0,   countWeight: 200, note: 'leg + thigh quarter' },
  'chicken legs':             { cal: 184, protein: 24,   fat: 9.4, carb: 0,   fibre: 0,   countWeight: 200 },
  'chicken quarter':          { cal: 184, protein: 24,   fat: 9.4, carb: 0,   fibre: 0,   countWeight: 250 },
  'chicken quarters':         { cal: 184, protein: 24,   fat: 9.4, carb: 0,   fibre: 0,   countWeight: 250 },
  'half chicken':             { cal: 190, protein: 22,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 700 },
  'chicken':                  { cal: 165, protein: 25,   fat: 7,   carb: 0,   fibre: 0,   note: 'cooked avg' },
  'rotisserie chicken':       { cal: 190, protein: 24,   fat: 10,  carb: 0,   fibre: 0 },
  'whole chicken':            { cal: 190, protein: 18,   fat: 14,  carb: 0,   fibre: 0,   countWeight: 1600 },
  'spatchcocked chicken':     { cal: 190, protein: 18,   fat: 14,  carb: 0,   fibre: 0,   countWeight: 1600 },
  'ground chicken':           { cal: 143, protein: 17,   fat: 8,   carb: 0,   fibre: 0,   fdcId: 171471 },
  'ground turkey':            { cal: 158, protein: 20,   fat: 8,   carb: 0,   fibre: 0,   fdcId: 171116 },
  'turkey breast':            { cal: 109, protein: 22.5, fat: 1.7, carb: 0,   fibre: 0 },
  'turkey':                   { cal: 158, protein: 20,   fat: 8,   carb: 0,   fibre: 0 },
  'ground beef':              { cal: 254, protein: 17.2, fat: 20,  carb: 0,   fibre: 0,   fdcId: 174030, note: '80/20 raw' },
  'lean ground beef':         { cal: 176, protein: 21,   fat: 10,  carb: 0,   fibre: 0,   note: '90/10 raw' },
  'ground beef 80/20':        { cal: 254, protein: 17.2, fat: 20,  carb: 0,   fibre: 0 },
  'ground beef 90/10':        { cal: 176, protein: 21,   fat: 10,  carb: 0,   fibre: 0 },
  'beef sirloin':             { cal: 201, protein: 22.6, fat: 11,  carb: 0,   fibre: 0,   fdcId: 168626 },
  'sirloin':                  { cal: 201, protein: 22.6, fat: 11,  carb: 0,   fibre: 0 },
  'sirloin steak':            { cal: 201, protein: 22.6, fat: 11,  carb: 0,   fibre: 0 },
  'beef chuck':               { cal: 271, protein: 17.4, fat: 22,  carb: 0,   fibre: 0,   fdcId: 168636 },
  'chuck':                    { cal: 271, protein: 17.4, fat: 22,  carb: 0,   fibre: 0 },
  'beef shoulder':            { cal: 215, protein: 19.5, fat: 14,  carb: 0,   fibre: 0 },
  'beef brisket':             { cal: 247, protein: 17.5, fat: 19,  carb: 0,   fibre: 0,   fdcId: 168604 },
  'brisket':                  { cal: 247, protein: 17.5, fat: 19,  carb: 0,   fibre: 0 },
  'flank steak':              { cal: 192, protein: 22,   fat: 10.5, carb: 0,  fibre: 0 },
  'skirt steak':              { cal: 192, protein: 22,   fat: 10.5, carb: 0,  fibre: 0 },
  'ribeye':                   { cal: 271, protein: 18.7, fat: 21,  carb: 0,   fibre: 0 },
  'beef stew meat':           { cal: 246, protein: 19,   fat: 18,  carb: 0,   fibre: 0 },
  'pork shoulder':            { cal: 242, protein: 17,   fat: 19,  carb: 0,   fibre: 0,   fdcId: 167890, countWeight: 250 },
  'pork shoulder steaks':     { cal: 242, protein: 17,   fat: 19,  carb: 0,   fibre: 0,   countWeight: 250 },
  'pork steak':               { cal: 198, protein: 22,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 200 },
  'pork steaks':              { cal: 198, protein: 22,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 200 },
  'pork shoulder steak':      { cal: 242, protein: 17,   fat: 19,  carb: 0,   fibre: 0,   countWeight: 250 },
  'pork tenderloin':          { cal: 120, protein: 21,   fat: 3.5, carb: 0,   fibre: 0,   fdcId: 167906, countWeight: 450 },
  'pork tenderloins':         { cal: 120, protein: 21,   fat: 3.5, carb: 0,   fibre: 0,   countWeight: 450 },
  'pork chop':                { cal: 198, protein: 22,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 200 },
  'pork chops':               { cal: 198, protein: 22,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 200 },
  'bone-in pork chop':        { cal: 198, protein: 22,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 280 },
  'bone-in pork chops':       { cal: 198, protein: 22,   fat: 11,  carb: 0,   fibre: 0,   countWeight: 280 },
  'pork ribs':                { cal: 277, protein: 19,   fat: 22,  carb: 0,   fibre: 0,   countWeight: 60, note: 'per rib bone' },
  'baby back ribs':           { cal: 277, protein: 19,   fat: 22,  carb: 0,   fibre: 0,   countWeight: 60 },
  'spare ribs':               { cal: 277, protein: 19,   fat: 22,  carb: 0,   fibre: 0,   countWeight: 80 },
  'pork spare ribs':          { cal: 277, protein: 19,   fat: 22,  carb: 0,   fibre: 0,   countWeight: 80 },
  'pork loin':                { cal: 175, protein: 22,   fat: 9,   carb: 0,   fibre: 0 },
  'pork belly':               { cal: 518, protein: 9.3,  fat: 53,  carb: 0,   fibre: 0,   fdcId: 169184 },
  'ground pork':              { cal: 263, protein: 16.9, fat: 21.2, carb: 0,  fibre: 0,   fdcId: 167902 },
  'pork ribs':                { cal: 277, protein: 19,   fat: 22,  carb: 0,   fibre: 0 },
  'lamb shoulder':            { cal: 235, protein: 17,   fat: 18,  carb: 0,   fibre: 0,   fdcId: 174362 },
  'lamb chop':                { cal: 230, protein: 19,   fat: 16,  carb: 0,   fibre: 0 },
  'lamb chops':               { cal: 230, protein: 19,   fat: 16,  carb: 0,   fibre: 0 },
  'ground lamb':              { cal: 282, protein: 17,   fat: 23,  carb: 0,   fibre: 0 },
  'lamb':                     { cal: 235, protein: 17,   fat: 18,  carb: 0,   fibre: 0 },
  'lamb leg':                 { cal: 219, protein: 18,   fat: 16,  carb: 0,   fibre: 0 },
  'beef tenderloin':          { cal: 226, protein: 21,   fat: 15,  carb: 0,   fibre: 0,   fdcId: 168658, countWeight: 200, note: 'per filet steak' },
  'beef filet':               { cal: 226, protein: 21,   fat: 15,  carb: 0,   fibre: 0,   countWeight: 200 },
  'filet mignon':             { cal: 226, protein: 21,   fat: 15,  carb: 0,   fibre: 0,   countWeight: 200 },
  'sirloin steak':            { cal: 201, protein: 22.6, fat: 11,  carb: 0,   fibre: 0,   countWeight: 200 },
  'flank steak':              { cal: 192, protein: 22,   fat: 10.5, carb: 0,  fibre: 0,   countWeight: 600, note: 'per whole flank' },
  'skirt steak':              { cal: 192, protein: 22,   fat: 10.5, carb: 0,  fibre: 0,   countWeight: 350 },
  'ribeye':                   { cal: 271, protein: 18.7, fat: 21,  carb: 0,   fibre: 0,   countWeight: 280 },
  'ribeye steak':             { cal: 271, protein: 18.7, fat: 21,  carb: 0,   fibre: 0,   countWeight: 280 },
  'new york strip':           { cal: 271, protein: 22,   fat: 19,  carb: 0,   fibre: 0,   countWeight: 280 },
  't-bone':                   { cal: 245, protein: 19,   fat: 18,  carb: 0,   fibre: 0,   countWeight: 450 },
  'porterhouse':              { cal: 245, protein: 19,   fat: 18,  carb: 0,   fibre: 0,   countWeight: 600 },
  'beef short ribs':          { cal: 296, protein: 17,   fat: 25,  carb: 0,   fibre: 0,   fdcId: 168649 },
  'short ribs':               { cal: 296, protein: 17,   fat: 25,  carb: 0,   fibre: 0 },
  'oxtail':                   { cal: 270, protein: 21,   fat: 20,  carb: 0,   fibre: 0 },
  'beef cheeks':              { cal: 175, protein: 25,   fat: 8.5, carb: 0,   fibre: 0 },
  'beef shank':               { cal: 200, protein: 22,   fat: 12,  carb: 0,   fibre: 0 },
  'pork sausage':             { cal: 339, protein: 14,   fat: 31,  carb: 0,   fibre: 0 },
  'breakfast sausage':        { cal: 339, protein: 14,   fat: 31,  carb: 0,   fibre: 0 },
  'italian sausage':          { cal: 346, protein: 14,   fat: 31,  carb: 1,   fibre: 0 },
  'andouille sausage':        { cal: 290, protein: 17,   fat: 23,  carb: 1.4, fibre: 0 },
  'chorizo':                  { cal: 455, protein: 24,   fat: 38,  carb: 1.9, fibre: 0,   fdcId: 167903 },
  'kielbasa':                 { cal: 309, protein: 13,   fat: 27,  carb: 4,   fibre: 0 },
  'bratwurst':                { cal: 333, protein: 12,   fat: 30,  carb: 3,   fibre: 0 },
  'merguez':                  { cal: 290, protein: 17,   fat: 23,  carb: 1,   fibre: 0 },
  'salami':                   { cal: 336, protein: 22,   fat: 27,  carb: 1,   fibre: 0 },
  'prosciutto':               { cal: 195, protein: 25,   fat: 10,  carb: 0,   fibre: 0 },
  'pancetta':                 { cal: 460, protein: 11,   fat: 47,  carb: 0,   fibre: 0 },
  'beef bacon':               { cal: 280, protein: 20,   fat: 22,  carb: 0,   fibre: 0 },
  'turkey bacon':             { cal: 226, protein: 17,   fat: 17,  carb: 0,   fibre: 0 },
  'beef':                     { cal: 250, protein: 26,   fat: 17,  carb: 0,   fibre: 0,   note: 'avg cooked beef' },
  'pork':                     { cal: 242, protein: 27,   fat: 14,  carb: 0,   fibre: 0,   note: 'avg cooked pork' },
  'fish':                     { cal: 140, protein: 22,   fat: 5,   carb: 0,   fibre: 0,   note: 'avg fish' },
  'meat':                     { cal: 250, protein: 26,   fat: 17,  carb: 0,   fibre: 0,   note: 'avg meat' },
  'veal':                     { cal: 172, protein: 22,   fat: 8.5, carb: 0,   fibre: 0 },
  'veal shoulder':            { cal: 172, protein: 22,   fat: 8.5, carb: 0,   fibre: 0 },
  'duck':                     { cal: 337, protein: 19,   fat: 28,  carb: 0,   fibre: 0 },
  'duck leg':                 { cal: 217, protein: 19,   fat: 15,  carb: 0,   fibre: 0,   countWeight: 350 },
  'duck legs':                { cal: 217, protein: 19,   fat: 15,  carb: 0,   fibre: 0,   countWeight: 350 },
  'duck breast':              { cal: 132, protein: 23,   fat: 4,   carb: 0,   fibre: 0,   countWeight: 200 },
  'duck breasts':             { cal: 132, protein: 23,   fat: 4,   carb: 0,   fibre: 0,   countWeight: 200 },
  'duck wings':               { cal: 222, protein: 20.5, fat: 15.5, carb: 0,  fibre: 0,   countWeight: 50 },
  'duck fat':                 { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'duck fat or lard':         { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'whole duck':               { cal: 337, protein: 19,   fat: 28,  carb: 0,   fibre: 0,   countWeight: 1800 },
  'goat':                     { cal: 109, protein: 21,   fat: 2.3, carb: 0,   fibre: 0 },

  // ── FISH / SEAFOOD ──
  'salmon':                   { cal: 208, protein: 20,   fat: 13,  carb: 0,   fibre: 0,   fdcId: 175167 },
  'salmon fillet':            { cal: 208, protein: 20,   fat: 13,  carb: 0,   fibre: 0,   countWeight: 170 },
  'salmon fillets':           { cal: 208, protein: 20,   fat: 13,  carb: 0,   fibre: 0,   countWeight: 170 },
  'salmon steak':             { cal: 208, protein: 20,   fat: 13,  carb: 0,   fibre: 0,   countWeight: 200 },
  'salmon steaks':            { cal: 208, protein: 20,   fat: 13,  carb: 0,   fibre: 0,   countWeight: 200 },
  'smoked salmon':            { cal: 117, protein: 18,   fat: 4.3, carb: 0,   fibre: 0 },
  'cod':                      { cal: 82,  protein: 18,   fat: 0.7, carb: 0,   fibre: 0,   fdcId: 173685 },
  'cod fillet':               { cal: 82,  protein: 18,   fat: 0.7, carb: 0,   fibre: 0,   countWeight: 170 },
  'cod fillets':              { cal: 82,  protein: 18,   fat: 0.7, carb: 0,   fibre: 0,   countWeight: 170 },
  'cod':                      { cal: 82,  protein: 18,   fat: 0.7, carb: 0,   fibre: 0,   countWeight: 170 },
  'tilapia':                  { cal: 96,  protein: 20.1, fat: 1.7, carb: 0,   fibre: 0,   fdcId: 175176, countWeight: 130 },
  'tilapia fillet':           { cal: 96,  protein: 20.1, fat: 1.7, carb: 0,   fibre: 0,   countWeight: 130 },
  'tilapia fillets':          { cal: 96,  protein: 20.1, fat: 1.7, carb: 0,   fibre: 0,   countWeight: 130 },
  'halibut':                  { cal: 91,  protein: 19,   fat: 1.3, carb: 0,   fibre: 0 },
  'tuna':                     { cal: 132, protein: 28,   fat: 1.3, carb: 0,   fibre: 0 },
  'canned tuna':              { cal: 116, protein: 26,   fat: 1,   carb: 0,   fibre: 0 },
  'sardines':                 { cal: 208, protein: 25,   fat: 11,  carb: 0,   fibre: 0 },
  'mackerel':                 { cal: 205, protein: 19,   fat: 14,  carb: 0,   fibre: 0 },
  'trout':                    { cal: 148, protein: 21,   fat: 6.6, carb: 0,   fibre: 0,   countWeight: 280 },
  'whole trout':              { cal: 148, protein: 21,   fat: 6.6, carb: 0,   fibre: 0,   countWeight: 280 },
  'rainbow trout':            { cal: 141, protein: 20,   fat: 6.2, carb: 0,   fibre: 0,   countWeight: 280 },
  'sea bass':                 { cal: 97,  protein: 19,   fat: 2,   carb: 0,   fibre: 0,   countWeight: 400 },
  'whole sea bass':           { cal: 97,  protein: 19,   fat: 2,   carb: 0,   fibre: 0,   countWeight: 400 },
  'branzino':                 { cal: 97,  protein: 19,   fat: 2,   carb: 0,   fibre: 0,   countWeight: 400 },
  'whole branzino':           { cal: 97,  protein: 19,   fat: 2,   carb: 0,   fibre: 0,   countWeight: 400 },
  'sea bream':                { cal: 96,  protein: 19,   fat: 1.9, carb: 0,   fibre: 0,   countWeight: 400 },
  'whole fish':               { cal: 100, protein: 20,   fat: 2,   carb: 0,   fibre: 0,   countWeight: 400 },
  'snapper':                  { cal: 100, protein: 21,   fat: 1.3, carb: 0,   fibre: 0 },
  'swordfish':                { cal: 121, protein: 20,   fat: 4,   carb: 0,   fibre: 0 },
  'shrimp':                   { cal: 85,  protein: 20,   fat: 0.5, carb: 0,   fibre: 0,   fdcId: 175179 },
  'prawn':                    { cal: 85,  protein: 20,   fat: 0.5, carb: 0,   fibre: 0 },
  'prawns':                   { cal: 85,  protein: 20,   fat: 0.5, carb: 0,   fibre: 0 },
  'scallops':                 { cal: 88,  protein: 17,   fat: 0.8, carb: 2.4, fibre: 0 },
  'crab':                     { cal: 87,  protein: 18,   fat: 1.1, carb: 0,   fibre: 0 },
  'lobster':                  { cal: 89,  protein: 19,   fat: 0.9, carb: 0,   fibre: 0,   countWeight: 600 },
  'lobster tail':             { cal: 89,  protein: 19,   fat: 0.9, carb: 0,   fibre: 0,   countWeight: 150 },
  'lobster tails':            { cal: 89,  protein: 19,   fat: 0.9, carb: 0,   fibre: 0,   countWeight: 150 },
  'lobster meat':             { cal: 89,  protein: 19,   fat: 0.9, carb: 0,   fibre: 0,   density: 0.85 },
  'mussels':                  { cal: 86,  protein: 12,   fat: 2.2, carb: 3.7, fibre: 0 },
  'clams':                    { cal: 86,  protein: 14.7, fat: 1,   carb: 3,   fibre: 0 },
  'octopus':                  { cal: 82,  protein: 15,   fat: 1,   carb: 2.2, fibre: 0 },
  'squid':                    { cal: 92,  protein: 16,   fat: 1.4, carb: 3,   fibre: 0 },
  'anchovies':                { cal: 210, protein: 29,   fat: 10,  carb: 0,   fibre: 0 },
  'anchovy':                  { cal: 210, protein: 29,   fat: 10,  carb: 0,   fibre: 0 },

  // ── DELI / CURED MEATS ──
  'bacon':                    { cal: 417, protein: 13,   fat: 42,  carb: 1.4, fibre: 0,   fdcId: 168277 },
  'bacon slices':             { cal: 417, protein: 13,   fat: 42,  carb: 1.4, fibre: 0,   countWeight: 28 },
  'sausage':                  { cal: 301, protein: 14,   fat: 27,  carb: 1.4, fibre: 0 },
  'italian sausage':          { cal: 346, protein: 14,   fat: 31,  carb: 4,   fibre: 0 },
  'smoked sausage':           { cal: 296, protein: 14,   fat: 27,  carb: 0.8, fibre: 0 },
  'andouille sausage':        { cal: 263, protein: 16,   fat: 21,  carb: 1.4, fibre: 0 },
  'breakfast sausage':        { cal: 339, protein: 13,   fat: 31,  carb: 1.7, fibre: 0 },
  'chorizo':                  { cal: 455, protein: 24,   fat: 38,  carb: 1.9, fibre: 0,   fdcId: 167931 },
  'salami':                   { cal: 336, protein: 22,   fat: 26,  carb: 2,   fibre: 0 },
  'pepperoni':                { cal: 504, protein: 23,   fat: 44,  carb: 1.2, fibre: 0,   countWeight: 1.1 },
  'pepperoni slices':         { cal: 504, protein: 23,   fat: 44,  carb: 1.2, fibre: 0,   countWeight: 1.1 },
  'prosciutto':               { cal: 195, protein: 26,   fat: 9.7, carb: 0.4, fibre: 0 },
  'pancetta':                 { cal: 458, protein: 13,   fat: 45,  carb: 0,   fibre: 0 },
  'guanciale':                { cal: 600, protein: 7,    fat: 65,  carb: 0,   fibre: 0 },
  'ham':                      { cal: 145, protein: 20,   fat: 5.5, carb: 1.5, fibre: 0,   fdcId: 167821 },
  'sliced ham':               { cal: 145, protein: 20,   fat: 5.5, carb: 1.5, fibre: 0 },
  'hot dogs':                 { cal: 290, protein: 10,   fat: 26,  carb: 4,   fibre: 0,   countWeight: 45 },
  'hot dog':                  { cal: 290, protein: 10,   fat: 26,  carb: 4,   fibre: 0,   countWeight: 45 },
  'ham hock':                 { cal: 250, protein: 17,   fat: 19,  carb: 0,   fibre: 0 },

  // ── DAIRY ──
  'milk':                     { cal: 61,  protein: 3.2,  fat: 3.3, carb: 4.8, fibre: 0,   fdcId: 171265, density: 1.03 },
  'whole milk':               { cal: 61,  protein: 3.2,  fat: 3.3, carb: 4.8, fibre: 0,   density: 1.03 },
  '2% milk':                  { cal: 50,  protein: 3.4,  fat: 2,   carb: 4.9, fibre: 0,   density: 1.03 },
  'skim milk':                { cal: 34,  protein: 3.4,  fat: 0.1, carb: 5,   fibre: 0,   density: 1.03 },
  'half-and-half':            { cal: 130, protein: 3,    fat: 11.5, carb: 4.3, fibre: 0,  density: 1.0 },
  'half and half':            { cal: 130, protein: 3,    fat: 11.5, carb: 4.3, fibre: 0,  density: 1.0 },
  'heavy cream':              { cal: 340, protein: 2.84, fat: 36,  carb: 2.84, fibre: 0,  fdcId: 170859, density: 1.0 },
  'cream':                    { cal: 340, protein: 2.84, fat: 36,  carb: 2.84, fibre: 0,  density: 1.0 },
  'whipped cream':            { cal: 257, protein: 3,    fat: 22,  carb: 13,  fibre: 0,   density: 0.5 },
  'sour cream':               { cal: 198, protein: 2.4,  fat: 19,  carb: 4.6, fibre: 0,   fdcId: 171256, density: 1.0 },
  'yogurt':                   { cal: 61,  protein: 3.5,  fat: 3.3, carb: 4.7, fibre: 0,   density: 1.05 },
  'plain yogurt':             { cal: 61,  protein: 3.5,  fat: 3.3, carb: 4.7, fibre: 0,   density: 1.05 },
  'greek yogurt':             { cal: 97,  protein: 9,    fat: 5,   carb: 3.6, fibre: 0,   fdcId: 170894, density: 1.05 },
  'full fat yogurt':          { cal: 91,  protein: 5,    fat: 4.7, carb: 4.7, fibre: 0,   density: 1.05 },
  'cottage cheese':           { cal: 98,  protein: 11,   fat: 4.3, carb: 3.4, fibre: 0,   density: 1.0 },
  'butter':                   { cal: 717, protein: 0.85, fat: 81,  carb: 0.06, fibre: 0,  fdcId: 173410, density: 0.91 },
  'unsalted butter':          { cal: 717, protein: 0.85, fat: 81,  carb: 0.06, fibre: 0,  density: 0.91 },
  'salted butter':            { cal: 717, protein: 0.85, fat: 81,  carb: 0.06, fibre: 0,  density: 0.91 },
  'vegan butter':             { cal: 600, protein: 0,    fat: 67,  carb: 0,   fibre: 0,   density: 0.91 },
  'ghee':                     { cal: 876, protein: 0.3,  fat: 99.5, carb: 0,  fibre: 0,   density: 0.91 },
  'cream cheese':             { cal: 342, protein: 6,    fat: 34,  carb: 4,   fibre: 0,   fdcId: 173410, density: 1.04 },
  'mascarpone':               { cal: 429, protein: 5,    fat: 44,  carb: 4,   fibre: 0,   density: 1.0 },
  'mozzarella':               { cal: 280, protein: 28,   fat: 17,  carb: 3.1, fibre: 0,   fdcId: 173411 , density: 0.42 },
  'mozzarella cheese':        { cal: 280, protein: 28,   fat: 17,  carb: 3.1, fibre: 0 , density: 0.42 },
  'shredded mozzarella':      { cal: 280, protein: 28,   fat: 17,  carb: 3.1, fibre: 0 , density: 0.42 },
  'shredded mozzarella cheese': { cal: 280, protein: 28, fat: 17,  carb: 3.1, fibre: 0 , density: 0.42 },
  'fresh mozzarella':         { cal: 251, protein: 18,   fat: 19,  carb: 1.5, fibre: 0 },
  'cheddar':                  { cal: 403, protein: 25,   fat: 33,  carb: 1.3, fibre: 0,   fdcId: 173414 },
  'cheddar cheese':           { cal: 403, protein: 25,   fat: 33,  carb: 1.3, fibre: 0 , density: 0.42 },
  'shredded cheddar':         { cal: 403, protein: 25,   fat: 33,  carb: 1.3, fibre: 0 },
  'shredded cheddar cheese':  { cal: 403, protein: 25,   fat: 33,  carb: 1.3, fibre: 0 , density: 0.42 },
  'parmesan':                 { cal: 392, protein: 36,   fat: 26,  carb: 3.2, fibre: 0,   fdcId: 173420 , density: 0.38 },
  'parmesan cheese':          { cal: 392, protein: 36,   fat: 26,  carb: 3.2, fibre: 0 , density: 0.38 },
  'grated parmesan':          { cal: 392, protein: 36,   fat: 26,  carb: 3.2, fibre: 0 },
  'pecorino':                 { cal: 387, protein: 26,   fat: 30,  carb: 3.6, fibre: 0 },
  'feta':                     { cal: 264, protein: 14,   fat: 21,  carb: 4.1, fibre: 0,   fdcId: 173417 , density: 0.62 },
  'feta cheese':              { cal: 264, protein: 14,   fat: 21,  carb: 4.1, fibre: 0 , density: 0.62 },
  'ricotta':                  { cal: 174, protein: 11,   fat: 13,  carb: 3,   fibre: 0,   fdcId: 173424 },
  'ricotta cheese':           { cal: 174, protein: 11,   fat: 13,  carb: 3,   fibre: 0 },
  'gruyere':                  { cal: 413, protein: 30,   fat: 32,  carb: 0.4, fibre: 0 },
  'gruyère':                  { cal: 413, protein: 30,   fat: 32,  carb: 0.4, fibre: 0 },
  'brie':                     { cal: 334, protein: 21,   fat: 28,  carb: 0.5, fibre: 0 },
  'goat cheese':              { cal: 364, protein: 22,   fat: 30,  carb: 2.5, fibre: 0 , density: 0.62 },
  'cotija':                   { cal: 350, protein: 20,   fat: 28,  carb: 1.4, fibre: 0 },
  'queso fresco':             { cal: 305, protein: 18,   fat: 24,  carb: 3,   fibre: 0 },
  'halloumi':                 { cal: 321, protein: 22,   fat: 25,  carb: 2.7, fibre: 0 },
  'paneer':                   { cal: 321, protein: 18,   fat: 26,  carb: 4,   fibre: 0 },
  'swiss cheese':             { cal: 380, protein: 27,   fat: 28,  carb: 5,   fibre: 0 , density: 0.42 },
  'provolone':                { cal: 351, protein: 26,   fat: 27,  carb: 2.1, fibre: 0 },
  'cream cheese':             { cal: 342, protein: 6,    fat: 34,  carb: 4,   fibre: 0,   density: 1.04 },
  'blue cheese':              { cal: 353, protein: 21,   fat: 29,  carb: 2.3, fibre: 0,   fdcId: 173413 , density: 0.62 },
  'blue cheese crumbles':     { cal: 353, protein: 21,   fat: 29,  carb: 2.3, fibre: 0 },
  'gorgonzola':               { cal: 353, protein: 21,   fat: 29,  carb: 2.3, fibre: 0 },
  'roquefort':                { cal: 369, protein: 22,   fat: 31,  carb: 2,   fibre: 0 },
  'monterey jack':            { cal: 373, protein: 24,   fat: 30,  carb: 0.7, fibre: 0 , density: 0.42 },
  'pepper jack':              { cal: 357, protein: 23,   fat: 28,  carb: 1,   fibre: 0 },
  'colby':                    { cal: 394, protein: 24,   fat: 32,  carb: 2.6, fibre: 0 },
  'asiago':                   { cal: 392, protein: 36,   fat: 26,  carb: 3.2, fibre: 0 },
  'pecorino':                 { cal: 419, protein: 26,   fat: 33,  carb: 0,   fibre: 0 },
  'pecorino romano':          { cal: 419, protein: 26,   fat: 33,  carb: 0,   fibre: 0 },
  'romano':                   { cal: 419, protein: 26,   fat: 33,  carb: 0,   fibre: 0 },
  'mascarpone':               { cal: 429, protein: 4.5,  fat: 44,  carb: 4.5, fibre: 0 },
  'burrata':                  { cal: 330, protein: 21,   fat: 27,  carb: 2,   fibre: 0 },
  'fontina':                  { cal: 389, protein: 26,   fat: 31,  carb: 1.6, fibre: 0 },
  'manchego':                 { cal: 392, protein: 25,   fat: 32,  carb: 2,   fibre: 0 },
  'cottage cheese':           { cal: 98,  protein: 11,   fat: 4.3, carb: 3.4, fibre: 0,   fdcId: 173415 },

  // ── EGGS ──
  'eggs':                     { cal: 143, protein: 12.6, fat: 9.5, carb: 0.7, fibre: 0,   fdcId: 171287, countWeight: 50 },
  'egg':                      { cal: 143, protein: 12.6, fat: 9.5, carb: 0.7, fibre: 0,   countWeight: 50 },
  'large eggs':               { cal: 143, protein: 12.6, fat: 9.5, carb: 0.7, fibre: 0,   countWeight: 50 },
  'large egg':                { cal: 143, protein: 12.6, fat: 9.5, carb: 0.7, fibre: 0,   countWeight: 50 },
  'egg yolk':                 { cal: 322, protein: 16,   fat: 27,  carb: 3.6, fibre: 0,   countWeight: 17 },
  'egg yolks':                { cal: 322, protein: 16,   fat: 27,  carb: 3.6, fibre: 0,   countWeight: 17 },
  'egg whites':               { cal: 52,  protein: 11,   fat: 0.2, carb: 0.7, fibre: 0,   countWeight: 33, density: 1.04 },
  'egg white':                { cal: 52,  protein: 11,   fat: 0.2, carb: 0.7, fibre: 0,   countWeight: 33 },

  // ── FATS / OILS ──
  'olive oil':                { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   fdcId: 171413, density: 0.92 },
  'extra virgin olive oil':   { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'vegetable oil':            { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'canola oil':               { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'avocado oil':              { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'sesame oil':               { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'coconut oil':              { cal: 862, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'peanut oil':               { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'sunflower oil':            { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'oil':                      { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'cooking oil':              { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'lard':                     { cal: 902, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'mayonnaise':               { cal: 680, protein: 1,    fat: 75,  carb: 1,   fibre: 0,   density: 0.91 },
  'mayo':                     { cal: 680, protein: 1,    fat: 75,  carb: 1,   fibre: 0,   density: 0.91 },

  // ── GRAINS / RICE ──
  'rice':                     { cal: 365, protein: 7.1,  fat: 0.66, carb: 80, fibre: 1.3, fdcId: 169704, density: 0.78, note: 'raw white' },
  'white rice':               { cal: 365, protein: 7.1,  fat: 0.66, carb: 80, fibre: 1.3, density: 0.78 },
  'long-grain white rice':    { cal: 365, protein: 7.1,  fat: 0.66, carb: 80, fibre: 1.3, density: 0.78 },
  'long grain rice':          { cal: 365, protein: 7.1,  fat: 0.66, carb: 80, fibre: 1.3, density: 0.78 },
  'long-grain rice':          { cal: 365, protein: 7.1,  fat: 0.66, carb: 80, fibre: 1.3, density: 0.78 },
  'basmati rice':             { cal: 360, protein: 7.5,  fat: 0.7, carb: 79,  fibre: 1.4, density: 0.78 },
  'jasmine rice':             { cal: 365, protein: 7,    fat: 0.7, carb: 80,  fibre: 1.3, density: 0.78 },
  'brown rice':               { cal: 367, protein: 7.5,  fat: 2.7, carb: 77,  fibre: 3.4, density: 0.78 },
  'sushi rice':               { cal: 360, protein: 6.6,  fat: 0.6, carb: 79,  fibre: 1.3, density: 0.78 },
  'arborio rice':             { cal: 360, protein: 6.5,  fat: 0.6, carb: 79,  fibre: 1.4, density: 0.78 },

  // ── PASTA / NOODLES ──
  'pasta':                    { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.55 },
  'spaghetti':                { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.55 },
  'penne':                    { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.45 },
  'linguine':                 { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.55 },
  'fettuccine':               { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.45 },
  'rigatoni':                 { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.45 },
  'fusilli':                  { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.45 },
  'orzo':                     { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.71 },
  'macaroni':                 { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.45 },
  'lasagna':                  { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2 },
  'lasagne':                  { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2 },
  'lasagna sheets':           { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, countWeight: 30 },
  'lasagne sheets':           { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, countWeight: 30 },
  'cannelloni':               { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, countWeight: 12 },
  'cannelloni tubes':         { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2 },
  'jumbo pasta shells':       { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, countWeight: 12 },
  'pasta shells':             { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2 },
  'tortellini':               { cal: 280, protein: 12,   fat: 7,   carb: 41,  fibre: 2 },
  'ravioli':                  { cal: 263, protein: 11,   fat: 6,   carb: 40,  fibre: 2 },
  'gnocchi':                  { cal: 154, protein: 4,    fat: 0.5, carb: 33,  fibre: 1.5 },
  // Asian noodles
  'rice noodles':             { cal: 364, protein: 6,    fat: 0.6, carb: 80,  fibre: 1.6, density: 0.5 },
  'wide rice noodles':        { cal: 364, protein: 6,    fat: 0.6, carb: 80,  fibre: 1.6, density: 0.5 },
  'dried rice noodles':       { cal: 364, protein: 6,    fat: 0.6, carb: 80,  fibre: 1.6, density: 0.5 },
  'rice vermicelli':          { cal: 364, protein: 6,    fat: 0.6, carb: 80,  fibre: 1.6, density: 0.5 },
  'vermicelli':               { cal: 371, protein: 13,   fat: 1.5, carb: 75,  fibre: 3.2, density: 0.45 },
  'egg noodles':              { cal: 384, protein: 14,   fat: 4.4, carb: 71,  fibre: 3.3, density: 0.45 },
  'ramen noodles':            { cal: 436, protein: 10,   fat: 17,  carb: 65,  fibre: 2 },
  'udon noodles':             { cal: 130, protein: 4,    fat: 0.4, carb: 27,  fibre: 1.6, density: 0.6 },
  'udon':                     { cal: 130, protein: 4,    fat: 0.4, carb: 27,  fibre: 1.6 },
  'soba noodles':             { cal: 336, protein: 14.4, fat: 2.5, carb: 68,  fibre: 5,   density: 0.5 },
  'soba':                     { cal: 336, protein: 14.4, fat: 2.5, carb: 68,  fibre: 5 },
  'glass noodles':            { cal: 351, protein: 0,    fat: 0,   carb: 86,  fibre: 0.5, density: 0.5 },
  'bean thread noodles':      { cal: 351, protein: 0,    fat: 0,   carb: 86,  fibre: 0.5, density: 0.5 },
  'chow fun noodles':         { cal: 364, protein: 6,    fat: 0.6, carb: 80,  fibre: 1.6, density: 0.5 },
  'chow fun':                 { cal: 364, protein: 6,    fat: 0.6, carb: 80,  fibre: 1.6 },

  // ── OTHER STARCHES / GRAINS ──
  'all-purpose flour':        { cal: 364, protein: 10.3, fat: 1,   carb: 76,  fibre: 2.7, fdcId: 168944, density: 0.53 },
  'flour':                    { cal: 364, protein: 10.3, fat: 1,   carb: 76,  fibre: 2.7, density: 0.53 },
  'whole wheat flour':        { cal: 340, protein: 13,   fat: 2.5, carb: 72,  fibre: 11,  density: 0.53 },
  'bread flour':              { cal: 361, protein: 12,   fat: 1.7, carb: 72,  fibre: 2.4, density: 0.53 },
  'cornmeal':                 { cal: 362, protein: 8.1,  fat: 3.6, carb: 76,  fibre: 7.3, density: 0.65 },
  'cornstarch':               { cal: 381, protein: 0.3,  fat: 0.1, carb: 91,  fibre: 0.9, density: 0.6 },
  'oats':                     { cal: 379, protein: 13,   fat: 6.5, carb: 68,  fibre: 10,  fdcId: 173904, density: 0.41 },
  'rolled oats':              { cal: 379, protein: 13,   fat: 6.5, carb: 68,  fibre: 10,  density: 0.41 },
  'oatmeal':                  { cal: 379, protein: 13,   fat: 6.5, carb: 68,  fibre: 10,  density: 0.41 },
  'quinoa':                   { cal: 368, protein: 14,   fat: 6,   carb: 64,  fibre: 7,   fdcId: 168874, density: 0.71 },
  'farro':                    { cal: 340, protein: 13,   fat: 2.5, carb: 71,  fibre: 11,  density: 0.78 },
  'couscous':                 { cal: 376, protein: 12.8, fat: 0.6, carb: 77,  fibre: 5,   density: 0.71 },
  'barley':                   { cal: 354, protein: 12.5, fat: 2.3, carb: 73,  fibre: 17,  density: 0.78 },
  'pearl barley':             { cal: 354, protein: 12.5, fat: 2.3, carb: 73,  fibre: 17,  density: 0.78 },
  'bulgur':                   { cal: 342, protein: 12,   fat: 1.3, carb: 76,  fibre: 18,  density: 0.71 },
  'polenta':                  { cal: 362, protein: 8.1,  fat: 3.6, carb: 76,  fibre: 7.3, density: 0.65 },
  'grits':                    { cal: 371, protein: 8.7,  fat: 1.2, carb: 79,  fibre: 1.9, density: 0.65 },
  'millet':                   { cal: 378, protein: 11,   fat: 4.2, carb: 73,  fibre: 8.5, density: 0.78 },
  // Tubers
  'potato':                   { cal: 77,  protein: 2,    fat: 0.1, carb: 17,  fibre: 2.2, fdcId: 170026, countWeight: 200 },
  'potatoes':                 { cal: 77,  protein: 2,    fat: 0.1, carb: 17,  fibre: 2.2, countWeight: 200 },
  'small potatoes':           { cal: 77,  protein: 2,    fat: 0.1, carb: 17,  fibre: 2.2, countWeight: 100 },
  'baby potatoes':            { cal: 77,  protein: 2,    fat: 0.1, carb: 17,  fibre: 2.2, countWeight: 50 },
  'sweet potato':             { cal: 86,  protein: 1.6,  fat: 0.1, carb: 20,  fibre: 3,   fdcId: 168482, countWeight: 200 },
  'sweet potatoes':           { cal: 86,  protein: 1.6,  fat: 0.1, carb: 20,  fibre: 3,   countWeight: 200 },
  'yam':                      { cal: 118, protein: 1.5,  fat: 0.2, carb: 28,  fibre: 4,   countWeight: 200 },
  'yams':                     { cal: 118, protein: 1.5,  fat: 0.2, carb: 28,  fibre: 4,   countWeight: 200 },
  'plantain':                 { cal: 122, protein: 1.3,  fat: 0.4, carb: 32,  fibre: 2.3, countWeight: 200 },
  // Bread
  'bread':                    { cal: 265, protein: 9,    fat: 3.2, carb: 49,  fibre: 2.7, countWeight: 30 },
  'white bread':              { cal: 265, protein: 9,    fat: 3.2, carb: 49,  fibre: 2.7, countWeight: 30 },
  'whole wheat bread':        { cal: 247, protein: 13,   fat: 3.4, carb: 41,  fibre: 7,   countWeight: 30 },
  'sourdough':                { cal: 289, protein: 12,   fat: 1.7, carb: 56,  fibre: 2.4, countWeight: 30 },
  'baguette':                 { cal: 270, protein: 9,    fat: 1.5, carb: 53,  fibre: 2.4 },
  'rolls':                    { cal: 280, protein: 9,    fat: 4.5, carb: 51,  fibre: 2,   countWeight: 50 },
  'buns':                     { cal: 280, protein: 9,    fat: 4.5, carb: 51,  fibre: 2,   countWeight: 50 },
  'hot dog buns':             { cal: 280, protein: 9,    fat: 4.5, carb: 51,  fibre: 2,   countWeight: 43 },
  'hamburger buns':           { cal: 280, protein: 9,    fat: 4.5, carb: 51,  fibre: 2,   countWeight: 50 },
  'biscuits':                 { cal: 353, protein: 7,    fat: 16,  carb: 45,  fibre: 1.4, countWeight: 60 },
  'croissant':                { cal: 406, protein: 8,    fat: 21,  carb: 46,  fibre: 2.6, countWeight: 60 },
  'croissants':               { cal: 406, protein: 8,    fat: 21,  carb: 46,  fibre: 2.6, countWeight: 60 },
  'pita':                     { cal: 275, protein: 9,    fat: 1.2, carb: 56,  fibre: 2.2, countWeight: 60 },
  'naan':                     { cal: 310, protein: 9,    fat: 6,   carb: 54,  fibre: 2,   countWeight: 90 },
  'tortilla':                 { cal: 218, protein: 6,    fat: 4.5, carb: 39,  fibre: 2.5, countWeight: 35 },
  'tortillas':                { cal: 218, protein: 6,    fat: 4.5, carb: 39,  fibre: 2.5, countWeight: 35 },
  'flour tortilla':           { cal: 306, protein: 8,    fat: 8,   carb: 51,  fibre: 3,   countWeight: 50 },
  'flour tortillas':          { cal: 306, protein: 8,    fat: 8,   carb: 51,  fibre: 3,   countWeight: 50 },
  'corn tortilla':            { cal: 218, protein: 5.7,  fat: 2.9, carb: 45,  fibre: 6.3, countWeight: 25 },
  'corn tortillas':           { cal: 218, protein: 5.7,  fat: 2.9, carb: 45,  fibre: 6.3, countWeight: 25 },
  'wonton wrappers':          { cal: 291, protein: 9.8,  fat: 1.4, carb: 60,  fibre: 1.9, countWeight: 8 },
  'spring roll wrappers':     { cal: 305, protein: 8,    fat: 1,   carb: 65,  fibre: 2,   countWeight: 8 },
  'brik pastry sheets':       { cal: 305, protein: 8,    fat: 1,   carb: 65,  fibre: 2,   countWeight: 35 },
  'brik pastry':              { cal: 305, protein: 8,    fat: 1,   carb: 65,  fibre: 2,   countWeight: 35 },
  'phyllo dough':             { cal: 299, protein: 7.4,  fat: 6,   carb: 53,  fibre: 1.7, countWeight: 14 },
  'puff pastry':              { cal: 558, protein: 7.5,  fat: 38,  carb: 46,  fibre: 1.6, countWeight: 60 },
  'panko':                    { cal: 392, protein: 12,   fat: 5,   carb: 75,  fibre: 4,   density: 0.32 },
  'breadcrumbs':              { cal: 392, protein: 12,   fat: 5,   carb: 75,  fibre: 4,   density: 0.32 },
  'panko breadcrumbs':        { cal: 392, protein: 12,   fat: 5,   carb: 75,  fibre: 4,   density: 0.32 },
  'crackers':                 { cal: 502, protein: 7,    fat: 25,  carb: 64,  fibre: 2,   countWeight: 3 },

  // ── VEGETABLES ──
  'onion':                    { cal: 40,  protein: 1.1,  fat: 0.1, carb: 9.3, fibre: 1.7, fdcId: 170000, countWeight: 110 },
  'red onion':                { cal: 40,  protein: 1.1,  fat: 0.1, carb: 9.3, fibre: 1.7, countWeight: 110 },
  'white onion':              { cal: 40,  protein: 1.1,  fat: 0.1, carb: 9.3, fibre: 1.7, countWeight: 110 },
  'yellow onion':             { cal: 40,  protein: 1.1,  fat: 0.1, carb: 9.3, fibre: 1.7, countWeight: 110 },
  'shallot':                  { cal: 72,  protein: 2.5,  fat: 0.1, carb: 17,  fibre: 3.2, countWeight: 30 },
  'shallots':                 { cal: 72,  protein: 2.5,  fat: 0.1, carb: 17,  fibre: 3.2, countWeight: 30 },
  'leek':                     { cal: 61,  protein: 1.5,  fat: 0.3, carb: 14,  fibre: 1.8, countWeight: 90 },
  'green onions':             { cal: 32,  protein: 1.8,  fat: 0.2, carb: 7.3, fibre: 2.6, density: 0.4, countWeight: 15 },
  'spring onions':            { cal: 32,  protein: 1.8,  fat: 0.2, carb: 7.3, fibre: 2.6, density: 0.4, countWeight: 15 },
  'scallions':                { cal: 32,  protein: 1.8,  fat: 0.2, carb: 7.3, fibre: 2.6, density: 0.4, countWeight: 15 },
  'chives':                   { cal: 30,  protein: 3.3,  fat: 0.7, carb: 4.4, fibre: 2.5, density: 0.13 },
  'garlic':                   { cal: 149, protein: 6.4,  fat: 0.5, carb: 33,  fibre: 2.1, fdcId: 169230, countWeight: 3 },
  'garlic clove':             { cal: 149, protein: 6.4,  fat: 0.5, carb: 33,  fibre: 2.1, countWeight: 3 },
  'garlic cloves':            { cal: 149, protein: 6.4,  fat: 0.5, carb: 33,  fibre: 2.1, countWeight: 3 },
  'cloves':                   { cal: 149, protein: 6.4,  fat: 0.5, carb: 33,  fibre: 2.1, countWeight: 3, note: 'assume garlic if no other context' },
  'ginger':                   { cal: 80,  protein: 1.8,  fat: 0.8, carb: 18,  fibre: 2,   fdcId: 169231, density: 0.6, countWeight: 5 },
  'fresh ginger':             { cal: 80,  protein: 1.8,  fat: 0.8, carb: 18,  fibre: 2,   density: 0.6 },
  // Peppers
  'bell pepper':              { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1, fdcId: 170427, countWeight: 120 },
  'bell peppers':             { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1, countWeight: 120 },
  'red bell pepper':          { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1, countWeight: 120 },
  'green bell pepper':        { cal: 20,  protein: 0.9,  fat: 0.2, carb: 4.6, fibre: 1.7, countWeight: 120 },
  'yellow bell pepper':       { cal: 27,  protein: 1,    fat: 0.2, carb: 6.3, fibre: 0.9, countWeight: 120 },
  'orange bell pepper':       { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1, countWeight: 120 },
  'red pepper':               { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1, countWeight: 120 },
  'green pepper':             { cal: 20,  protein: 0.9,  fat: 0.2, carb: 4.6, fibre: 1.7, countWeight: 120 },
  'yellow pepper':            { cal: 27,  protein: 1,    fat: 0.2, carb: 6.3, fibre: 0.9, countWeight: 120 },
  'roasted pepper':           { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1 },
  'roasted peppers':          { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1 },
  'roasted red pepper':       { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1 },
  'roasted red peppers':      { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1 },
  'jarred roasted red peppers': { cal: 31, protein: 1,   fat: 0.3, carb: 6,   fibre: 2.1 },
  'piquillo peppers':         { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1 },
  'red chilli':               { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 5 },
  'red chillies':             { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 5 },
  'green chilli':             { cal: 30,  protein: 1.9,  fat: 0.2, carb: 7,   fibre: 1.5, countWeight: 5 },
  'green chillies':           { cal: 30,  protein: 1.9,  fat: 0.2, carb: 7,   fibre: 1.5, countWeight: 5 },
  'red chili':                { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 5 },
  'green chili':              { cal: 30,  protein: 1.9,  fat: 0.2, carb: 7,   fibre: 1.5, countWeight: 5 },
  'thai chili':               { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 2 },
  'thai chilli':              { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 2 },
  'serrano pepper':           { cal: 32,  protein: 1.7,  fat: 0.4, carb: 6.7, fibre: 3.7, countWeight: 6 },
  'serrano peppers':          { cal: 32,  protein: 1.7,  fat: 0.4, carb: 6.7, fibre: 3.7, countWeight: 6 },
  'jalapeno':                 { cal: 29,  protein: 0.9,  fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14 },
  'jalapeño':                 { cal: 29,  protein: 0.9,  fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14 },
  'jalapenos':                { cal: 29,  protein: 0.9,  fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14 },
  'jalapeños':                { cal: 29,  protein: 0.9,  fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14 },
  'scotch bonnet':            { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 8 },
  'scotch bonnet pepper':     { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 8 },
  'habanero':                 { cal: 40,  protein: 1.9,  fat: 0.4, carb: 9,   fibre: 1.5, countWeight: 8 },
  'dried ancho chiles':       { cal: 281, protein: 12,   fat: 8.2, carb: 51,  fibre: 21,  countWeight: 17 },
  'dried ancho chillies':     { cal: 281, protein: 12,   fat: 8.2, carb: 51,  fibre: 21,  countWeight: 17 },
  'dried guajillo chiles':    { cal: 295, protein: 11,   fat: 8.7, carb: 50,  fibre: 17,  countWeight: 12 },
  'dried guajillo chillies':  { cal: 295, protein: 11,   fat: 8.7, carb: 50,  fibre: 17,  countWeight: 12 },
  'dried chipotle chiles':    { cal: 281, protein: 12,   fat: 8.2, carb: 51,  fibre: 21,  countWeight: 5 },
  'white pepper':             { cal: 296, protein: 10,   fat: 2.1, carb: 69,  fibre: 26 },
  'red pepper':               { cal: 31,  protein: 1,    fat: 0.3, carb: 6,   fibre: 2.1, countWeight: 120 },
  'green pepper':             { cal: 20,  protein: 0.9,  fat: 0.2, carb: 4.6, fibre: 1.7, countWeight: 120 },
  'yellow pepper':            { cal: 27,  protein: 1,    fat: 0.2, carb: 6.3, fibre: 0.9, countWeight: 120 },
  'jalapeño':                 { cal: 29,  protein: 0.9,  fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14 },
  'jalapeno':                 { cal: 29,  protein: 0.9,  fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14 },
  'green chillies':           { cal: 40,  protein: 1.9,  fat: 0.2, carb: 9,   fibre: 1.5, countWeight: 14 },
  'red chillies':             { cal: 40,  protein: 1.9,  fat: 0.2, carb: 9,   fibre: 1.5, countWeight: 14 },
  'chillies':                 { cal: 40,  protein: 1.9,  fat: 0.2, carb: 9,   fibre: 1.5, countWeight: 14 },
  'serrano':                  { cal: 32,  protein: 1.7,  fat: 0.4, carb: 6.7, fibre: 3.7, countWeight: 6 },
  'chipotle':                 { cal: 282, protein: 14,   fat: 13,  carb: 54,  fibre: 35 },
  // Tomatoes
  'tomato':                   { cal: 18,  protein: 0.9,  fat: 0.2, carb: 3.9, fibre: 1.2, fdcId: 170457, countWeight: 123 },
  'tomatoes':                 { cal: 18,  protein: 0.9,  fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 123 },
  'cherry tomatoes':          { cal: 18,  protein: 0.9,  fat: 0.2, carb: 3.9, fibre: 1.2, density: 0.6 , countWeight: 17 },
  'roma tomatoes':            { cal: 18,  protein: 0.9,  fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 60 },
  'large tomatoes':           { cal: 18,  protein: 0.9,  fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 180 },
  'canned tomatoes':          { cal: 32,  protein: 1.6,  fat: 0.3, carb: 7,   fibre: 1.8, density: 1.04, countWeight: 411, note: '14oz can default' },
  'canned crushed tomatoes':  { cal: 32,  protein: 1.6,  fat: 0.3, carb: 7,   fibre: 1.8, density: 1.04, countWeight: 411 },
  'canned diced tomatoes':    { cal: 32,  protein: 1.6,  fat: 0.3, carb: 7,   fibre: 1.8, density: 1.04, countWeight: 411 },
  'crushed tomatoes':         { cal: 32,  protein: 1.6,  fat: 0.3, carb: 7,   fibre: 1.8, density: 1.04, countWeight: 411 },
  'diced tomatoes':           { cal: 32,  protein: 1.6,  fat: 0.3, carb: 7,   fibre: 1.8, density: 1.04, countWeight: 411 },
  'canned tuna':              { cal: 116, protein: 26,   fat: 1,   carb: 0,   fibre: 0,   countWeight: 142, note: '5oz can drained' },
  'canned tuna in oil':       { cal: 200, protein: 26,   fat: 9,   carb: 0,   fibre: 0,   countWeight: 142 },
  'canned green chiles':      { cal: 25,  protein: 1,    fat: 0.2, carb: 5,   fibre: 0.9, countWeight: 113, note: '4oz can' },
  'diced green chiles':       { cal: 25,  protein: 1,    fat: 0.2, carb: 5,   fibre: 0.9, countWeight: 113 },
  'chipotle peppers in adobo sauce': { cal: 137, protein: 4,    fat: 7,   carb: 17,  fibre: 5,   countWeight: 198, note: '7oz can' },
  'canned chipotle peppers in adobo sauce': { cal: 137, protein: 4, fat: 7, carb: 17, fibre: 5, countWeight: 198 },
  'tomato sauce':             { cal: 30,  protein: 1.4,  fat: 0.2, carb: 7,   fibre: 1.5, density: 1.04 },
  'tomato paste':             { cal: 82,  protein: 4.3,  fat: 0.5, carb: 19,  fibre: 4.1, density: 1.04 },
  'sun-dried tomatoes':       { cal: 258, protein: 14,   fat: 3,   carb: 56,  fibre: 12 },
  'sundried tomatoes':        { cal: 258, protein: 14,   fat: 3,   carb: 56,  fibre: 12 },
  'salsa':                    { cal: 36,  protein: 1.5,  fat: 0.2, carb: 7,   fibre: 1.8, density: 1.05 },
  'salsa verde':              { cal: 27,  protein: 1.4,  fat: 0.7, carb: 5,   fibre: 1.5, density: 1.05 },
  // Other vegetables
  'carrot':                   { cal: 41,  protein: 0.9,  fat: 0.2, carb: 9.6, fibre: 2.8, fdcId: 170393, countWeight: 60 },
  'carrots':                  { cal: 41,  protein: 0.9,  fat: 0.2, carb: 9.6, fibre: 2.8, countWeight: 60 },
  'celery':                   { cal: 16,  protein: 0.7,  fat: 0.2, carb: 3,   fibre: 1.6, density: 0.4, countWeight: 40 },
  'spinach':                  { cal: 23,  protein: 2.9,  fat: 0.4, carb: 3.6, fibre: 2.2, fdcId: 168462, density: 0.13 },
  'baby spinach':             { cal: 23,  protein: 2.9,  fat: 0.4, carb: 3.6, fibre: 2.2, density: 0.13 },
  'frozen spinach':           { cal: 28,  protein: 3.6,  fat: 0.4, carb: 4,   fibre: 3.2 },
  'broccoli':                 { cal: 34,  protein: 2.8,  fat: 0.4, carb: 6.6, fibre: 2.6, fdcId: 170379, density: 0.36 , countWeight: 350 },
  'broccoli florets':         { cal: 34,  protein: 2.8,  fat: 0.4, carb: 6.6, fibre: 2.6, density: 0.36 },
  'cauliflower':              { cal: 25,  protein: 1.9,  fat: 0.3, carb: 5,   fibre: 2,   density: 0.4 , countWeight: 600 },
  'cauliflower florets':      { cal: 25,  protein: 1.9,  fat: 0.3, carb: 5,   fibre: 2,   density: 0.4 },
  'mushrooms':                { cal: 22,  protein: 3.1,  fat: 0.3, carb: 3.3, fibre: 1,   fdcId: 169251, density: 0.32 },
  'mushroom':                 { cal: 22,  protein: 3.1,  fat: 0.3, carb: 3.3, fibre: 1,   density: 0.32 },
  'cremini mushrooms':        { cal: 22,  protein: 2.5,  fat: 0.1, carb: 4.3, fibre: 0.6, density: 0.32 },
  'shiitake mushrooms':       { cal: 34,  protein: 2.2,  fat: 0.5, carb: 7,   fibre: 2.5, density: 0.32 , countWeight: 19 },
  'portobello mushrooms':     { cal: 22,  protein: 2.1,  fat: 0.3, carb: 3.9, fibre: 1.3, countWeight: 100 },
  'mixed mushrooms':          { cal: 22,  protein: 3.1,  fat: 0.3, carb: 3.3, fibre: 1,   density: 0.32 },
  'zucchini':                 { cal: 17,  protein: 1.2,  fat: 0.3, carb: 3.1, fibre: 1,   countWeight: 200 },
  'courgette':                { cal: 17,  protein: 1.2,  fat: 0.3, carb: 3.1, fibre: 1,   countWeight: 200 },
  'courgettes':               { cal: 17,  protein: 1.2,  fat: 0.3, carb: 3.1, fibre: 1,   countWeight: 200 },
  'eggplant':                 { cal: 25,  protein: 1,    fat: 0.2, carb: 6,   fibre: 3,   countWeight: 280 },
  'aubergine':                { cal: 25,  protein: 1,    fat: 0.2, carb: 6,   fibre: 3,   countWeight: 280 },
  'cabbage':                  { cal: 25,  protein: 1.3,  fat: 0.1, carb: 5.8, fibre: 2.5, density: 0.36 , countWeight: 900 },
  'napa cabbage':             { cal: 12,  protein: 1.1,  fat: 0.2, carb: 2.2, fibre: 1.2, density: 0.36 , countWeight: 840 },
  'red cabbage':              { cal: 31,  protein: 1.4,  fat: 0.2, carb: 7.4, fibre: 2.1, density: 0.36 , countWeight: 900 },
  'lettuce':                  { cal: 15,  protein: 1.4,  fat: 0.2, carb: 2.9, fibre: 1.3, density: 0.2 , countWeight: 300 },
  'romaine':                  { cal: 17,  protein: 1.2,  fat: 0.3, carb: 3.3, fibre: 2.1, density: 0.2 },
  'arugula':                  { cal: 25,  protein: 2.6,  fat: 0.7, carb: 3.7, fibre: 1.6, density: 0.13 },
  'romaine lettuce':          { cal: 17,  protein: 1.2,  fat: 0.3, carb: 3.3, fibre: 2.1, density: 0.2 , countWeight: 300 },
  'iceberg lettuce':          { cal: 14,  protein: 0.9,  fat: 0.1, carb: 3,   fibre: 1.2, density: 0.2 , countWeight: 540 },
  'butter lettuce':           { cal: 13,  protein: 1.4,  fat: 0.2, carb: 2.2, fibre: 1.1, density: 0.2 },
  'bibb lettuce':             { cal: 13,  protein: 1.4,  fat: 0.2, carb: 2.2, fibre: 1.1, density: 0.2 },
  'mixed greens':             { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'mixed salad greens':       { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'salad greens':             { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'mesclun':                  { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'mesclun greens':           { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'spring mix':               { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'mixed leaves':             { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'mixed salad leaves':       { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'baby greens':              { cal: 22,  protein: 2,    fat: 0.3, carb: 3.5, fibre: 1.8, density: 0.13 },
  'baby spinach':             { cal: 23,  protein: 2.9,  fat: 0.4, carb: 3.6, fibre: 2.2, density: 0.13 },
  'bean sprouts':             { cal: 30,  protein: 3,    fat: 0.2, carb: 5.9, fibre: 1.8, density: 0.4 },
  'mung bean sprouts':        { cal: 30,  protein: 3,    fat: 0.2, carb: 5.9, fibre: 1.8, density: 0.4 },
  'soybean sprouts':          { cal: 122, protein: 13,   fat: 6.7, carb: 9.6, fibre: 1.1, density: 0.4 },
  'alfalfa sprouts':          { cal: 23,  protein: 4,    fat: 0.7, carb: 2.1, fibre: 1.9, density: 0.13 },
  'daikon':                   { cal: 18,  protein: 0.6,  fat: 0.1, carb: 4.1, fibre: 1.6, countWeight: 800 },
  'daikon radish':            { cal: 18,  protein: 0.6,  fat: 0.1, carb: 4.1, fibre: 1.6, countWeight: 800 },
  'radish':                   { cal: 16,  protein: 0.7,  fat: 0.1, carb: 3.4, fibre: 1.6, countWeight: 5 },
  'radishes':                 { cal: 16,  protein: 0.7,  fat: 0.1, carb: 3.4, fibre: 1.6, countWeight: 5 },
  'corn':                     { cal: 86,  protein: 3.3,  fat: 1.4, carb: 19,  fibre: 2.7, density: 0.6 },
  'corn on the cob':          { cal: 86,  protein: 3.3,  fat: 1.4, carb: 19,  fibre: 2.7, countWeight: 200 },
  'frozen corn':              { cal: 86,  protein: 3.3,  fat: 1.4, carb: 19,  fibre: 2.7, density: 0.6 },
  'green beans':              { cal: 31,  protein: 1.8,  fat: 0.2, carb: 7,   fibre: 2.7, density: 0.4 },
  'peas':                     { cal: 81,  protein: 5.4,  fat: 0.4, carb: 14,  fibre: 5.7, density: 0.6 },
  'frozen peas':              { cal: 77,  protein: 5,    fat: 0.4, carb: 14,  fibre: 4.5, density: 0.6 },
  'edamame':                  { cal: 122, protein: 11,   fat: 5.2, carb: 9.9, fibre: 5.2, density: 0.6 },
  'cucumber':                 { cal: 16,  protein: 0.7,  fat: 0.1, carb: 3.6, fibre: 0.5, countWeight: 300 },
  'avocado':                  { cal: 160, protein: 2,    fat: 15,  carb: 9,   fibre: 7,   countWeight: 150 },
  'asparagus':                { cal: 20,  protein: 2.2,  fat: 0.1, carb: 3.9, fibre: 2.1, density: 0.36 },
  'brussels sprouts':         { cal: 43,  protein: 3.4,  fat: 0.3, carb: 9,   fibre: 3.8, density: 0.36 },
  'butternut squash':         { cal: 45,  protein: 1,    fat: 0.1, carb: 12,  fibre: 2,   countWeight: 1000 },
  'pumpkin':                  { cal: 26,  protein: 1,    fat: 0.1, carb: 6.5, fibre: 0.5 },
  'pumpkin puree':            { cal: 34,  protein: 1.1,  fat: 0.3, carb: 8,   fibre: 2.9, density: 1.0 },
  'beets':                    { cal: 43,  protein: 1.6,  fat: 0.2, carb: 10,  fibre: 2.8, countWeight: 100 },
  'beet':                     { cal: 43,  protein: 1.6,  fat: 0.2, carb: 10,  fibre: 2.8, countWeight: 100 },
  'beetroot':                 { cal: 43,  protein: 1.6,  fat: 0.2, carb: 10,  fibre: 2.8, countWeight: 100 },
  'kale':                     { cal: 35,  protein: 2.9,  fat: 1.5, carb: 4.4, fibre: 4.1, density: 0.13 , countWeight: 250 },
  'bok choy':                 { cal: 13,  protein: 1.5,  fat: 0.2, carb: 2.2, fibre: 1,   density: 0.36 },
  'snow peas':                { cal: 42,  protein: 2.8,  fat: 0.2, carb: 7.5, fibre: 2.6, density: 0.4 },
  'snap peas':                { cal: 42,  protein: 2.8,  fat: 0.2, carb: 7.5, fibre: 2.6, density: 0.4 },
  'olives':                   { cal: 115, protein: 0.8,  fat: 11,  carb: 6,   fibre: 3.2, density: 0.7 },
  'kalamata olives':          { cal: 115, protein: 0.8,  fat: 11,  carb: 6,   fibre: 3.2 },
  'green olives':             { cal: 145, protein: 1,    fat: 15,  carb: 4,   fibre: 3.3 },
  'capers':                   { cal: 23,  protein: 2.4,  fat: 0.9, carb: 5,   fibre: 3.2, density: 1.0 },
  'pickles':                  { cal: 11,  protein: 0.3,  fat: 0.2, carb: 2.3, fibre: 1.2, countWeight: 30 },

  // ── HERBS ──
  'parsley':                  { cal: 36,  protein: 3,    fat: 0.8, carb: 6.3, fibre: 3.3, density: 0.13 },
  'fresh parsley':            { cal: 36,  protein: 3,    fat: 0.8, carb: 6.3, fibre: 3.3, density: 0.13 },
  'cilantro':                 { cal: 23,  protein: 2.1,  fat: 0.5, carb: 3.7, fibre: 2.8, density: 0.13 },
  'fresh cilantro':           { cal: 23,  protein: 2.1,  fat: 0.5, carb: 3.7, fibre: 2.8, density: 0.13 },
  'coriander':                { cal: 23,  protein: 2.1,  fat: 0.5, carb: 3.7, fibre: 2.8, density: 0.13 },
  'basil':                    { cal: 23,  protein: 3.2,  fat: 0.6, carb: 2.7, fibre: 1.6, density: 0.13 },
  'fresh basil':              { cal: 23,  protein: 3.2,  fat: 0.6, carb: 2.7, fibre: 1.6, density: 0.13 },
  'thai basil':               { cal: 23,  protein: 3.2,  fat: 0.6, carb: 2.7, fibre: 1.6 },
  'mint':                     { cal: 70,  protein: 3.7,  fat: 0.9, carb: 15,  fibre: 8,   density: 0.13 },
  'fresh mint':               { cal: 70,  protein: 3.7,  fat: 0.9, carb: 15,  fibre: 8,   density: 0.13 },
  'dill':                     { cal: 43,  protein: 3.5,  fat: 1.1, carb: 7,   fibre: 2.1, density: 0.13 },
  'fresh dill':               { cal: 43,  protein: 3.5,  fat: 1.1, carb: 7,   fibre: 2.1, density: 0.13 },
  'rosemary':                 { cal: 131, protein: 3.3,  fat: 5.9, carb: 21,  fibre: 14,  density: 0.13 },
  'fresh rosemary':           { cal: 131, protein: 3.3,  fat: 5.9, carb: 21,  fibre: 14,  density: 0.13 },
  'thyme':                    { cal: 101, protein: 5.6,  fat: 1.7, carb: 24,  fibre: 14,  density: 0.13 },
  'fresh thyme':              { cal: 101, protein: 5.6,  fat: 1.7, carb: 24,  fibre: 14,  density: 0.13 },
  'oregano':                  { cal: 265, protein: 9,    fat: 4.3, carb: 69,  fibre: 42,  density: 0.4 },
  'fresh oregano':            { cal: 265, protein: 9,    fat: 4.3, carb: 69,  fibre: 42,  density: 0.13 },
  'dried oregano':            { cal: 265, protein: 9,    fat: 4.3, carb: 69,  fibre: 42,  density: 0.4 },
  'sage':                     { cal: 315, protein: 11,   fat: 13,  carb: 61,  fibre: 40,  density: 0.13 },
  'tarragon':                 { cal: 295, protein: 23,   fat: 7.2, carb: 50,  fibre: 7,   density: 0.13 },
  'bay leaf':                 { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   countWeight: 0.5 },
  'bay leaves':               { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   countWeight: 0.5 },
  'lemongrass':               { cal: 99,  protein: 1.8,  fat: 0.5, carb: 25,  fibre: 0,   countWeight: 5 },

  // ── CITRUS ──
  'lemon':                    { cal: 29,  protein: 1.1,  fat: 0.3, carb: 9,   fibre: 2.8, countWeight: 65 },
  'lemons':                   { cal: 29,  protein: 1.1,  fat: 0.3, carb: 9,   fibre: 2.8, countWeight: 65 },
  'lemon juice':              { cal: 22,  protein: 0.4,  fat: 0.2, carb: 6.9, fibre: 0.3, density: 1.03 },
  'fresh lemon':              { cal: 29,  protein: 1.1,  fat: 0.3, carb: 9,   fibre: 2.8, countWeight: 65 },
  'lime':                     { cal: 30,  protein: 0.7,  fat: 0.2, carb: 11,  fibre: 2.8, countWeight: 60 },
  'limes':                    { cal: 30,  protein: 0.7,  fat: 0.2, carb: 11,  fibre: 2.8, countWeight: 60 },
  'lime juice':               { cal: 25,  protein: 0.4,  fat: 0.1, carb: 8.4, fibre: 0.4, density: 1.03 },
  'fresh lime':               { cal: 30,  protein: 0.7,  fat: 0.2, carb: 11,  fibre: 2.8, countWeight: 60 },
  'orange':                   { cal: 47,  protein: 0.9,  fat: 0.1, carb: 12,  fibre: 2.4, countWeight: 130 },
  'oranges':                  { cal: 47,  protein: 0.9,  fat: 0.1, carb: 12,  fibre: 2.4, countWeight: 130 },
  'orange juice':             { cal: 45,  protein: 0.7,  fat: 0.2, carb: 10.4, fibre: 0.2, density: 1.05 },

  // ── FRUITS ──
  'apple':                    { cal: 52,  protein: 0.3,  fat: 0.2, carb: 14,  fibre: 2.4, fdcId: 171688, countWeight: 180 },
  'apples':                   { cal: 52,  protein: 0.3,  fat: 0.2, carb: 14,  fibre: 2.4, countWeight: 180 },
  'banana':                   { cal: 89,  protein: 1.1,  fat: 0.3, carb: 23,  fibre: 2.6, countWeight: 120 },
  'bananas':                  { cal: 89,  protein: 1.1,  fat: 0.3, carb: 23,  fibre: 2.6, countWeight: 120 },
  'pineapple':                { cal: 50,  protein: 0.5,  fat: 0.1, carb: 13,  fibre: 1.4, countWeight: 100 },
  'mango':                    { cal: 60,  protein: 0.8,  fat: 0.4, carb: 15,  fibre: 1.6, countWeight: 200 },
  'strawberries':             { cal: 32,  protein: 0.7,  fat: 0.3, carb: 7.7, fibre: 2,   density: 0.6 },
  'blueberries':              { cal: 57,  protein: 0.7,  fat: 0.3, carb: 14,  fibre: 2.4, density: 0.65 },
  'raspberries':              { cal: 52,  protein: 1.2,  fat: 0.7, carb: 12,  fibre: 6.5, density: 0.5 },
  'grapes':                   { cal: 69,  protein: 0.7,  fat: 0.2, carb: 18,  fibre: 0.9, density: 0.65 },
  'raisins':                  { cal: 299, protein: 3.1,  fat: 0.5, carb: 79,  fibre: 3.7, density: 0.66 },
  'dates':                    { cal: 282, protein: 2.5,  fat: 0.4, carb: 75,  fibre: 8,   countWeight: 8 },
  'figs':                     { cal: 74,  protein: 0.8,  fat: 0.3, carb: 19,  fibre: 2.9, countWeight: 50 },
  'cranberries':              { cal: 46,  protein: 0.5,  fat: 0.1, carb: 12,  fibre: 4.6, density: 0.42 },
  'dried cranberries':        { cal: 308, protein: 0.2,  fat: 1.4, carb: 82,  fibre: 5.7, density: 0.66 },
  'preserved lemon':          { cal: 29,  protein: 1.1,  fat: 0.3, carb: 9,   fibre: 2.8, countWeight: 65 },
  'pineapple chunks':         { cal: 50,  protein: 0.5,  fat: 0.1, carb: 13,  fibre: 1.4, density: 0.6 },

  // ── LEGUMES / BEANS ──
  'chickpeas':                { cal: 164, protein: 8.9,  fat: 2.6, carb: 27,  fibre: 8,   fdcId: 173757, density: 0.65, countWeight: 250, note: 'can drained' },
  'canned chickpeas':         { cal: 138, protein: 7,    fat: 2.6, carb: 23,  fibre: 6.4, density: 0.65, countWeight: 250 },
  'garbanzo beans':           { cal: 164, protein: 8.9,  fat: 2.6, carb: 27,  fibre: 8,   density: 0.65, countWeight: 250 },
  'black beans':              { cal: 132, protein: 8.9,  fat: 0.5, carb: 24,  fibre: 8.7, fdcId: 173735, density: 0.65, countWeight: 250 },
  'canned black beans':       { cal: 132, protein: 8.9,  fat: 0.5, carb: 24,  fibre: 8.7, density: 0.65, countWeight: 250 },
  'kidney beans':             { cal: 127, protein: 8.7,  fat: 0.5, carb: 23,  fibre: 6.4, density: 0.65, countWeight: 250 },
  'red kidney beans':         { cal: 127, protein: 8.7,  fat: 0.5, carb: 23,  fibre: 6.4, density: 0.65, countWeight: 250 },
  'white beans':              { cal: 139, protein: 9.7,  fat: 0.4, carb: 25,  fibre: 6.3, density: 0.65, countWeight: 250 },
  'cannellini beans':         { cal: 139, protein: 9.7,  fat: 0.4, carb: 25,  fibre: 6.3, density: 0.65, countWeight: 250 },
  'navy beans':               { cal: 140, protein: 8.2,  fat: 0.6, carb: 26,  fibre: 10,  density: 0.65, countWeight: 250 },
  'pinto beans':              { cal: 143, protein: 9,    fat: 0.7, carb: 26,  fibre: 9,   density: 0.65, countWeight: 250 },
  'butter beans':             { cal: 124, protein: 7.8,  fat: 0.4, carb: 23,  fibre: 7,   density: 0.65, countWeight: 250 },
  'lima beans':               { cal: 124, protein: 7.8,  fat: 0.4, carb: 23,  fibre: 7,   density: 0.65, countWeight: 250 },
  'fava beans':               { cal: 110, protein: 8,    fat: 0.4, carb: 19,  fibre: 5.4, density: 0.65, countWeight: 250 },
  'broad beans':              { cal: 110, protein: 8,    fat: 0.4, carb: 19,  fibre: 5.4, density: 0.65, countWeight: 250 },
  'black-eyed peas':          { cal: 116, protein: 7.7,  fat: 0.5, carb: 21,  fibre: 6.5, density: 0.65, countWeight: 250 },
  'edamame':                  { cal: 121, protein: 12,   fat: 5.2, carb: 8.9, fibre: 5.2, density: 0.7 },
  'mung beans':               { cal: 105, protein: 7,    fat: 0.4, carb: 19,  fibre: 7.6, density: 0.65 },
  'green beans':              { cal: 31,  protein: 1.8,  fat: 0.2, carb: 7,   fibre: 2.7, density: 0.55, countWeight: 6 },
  'string beans':             { cal: 31,  protein: 1.8,  fat: 0.2, carb: 7,   fibre: 2.7, density: 0.55 },
  'snap peas':                { cal: 42,  protein: 2.8,  fat: 0.2, carb: 7.6, fibre: 2.6, density: 0.55 },
  'snow peas':                { cal: 42,  protein: 2.8,  fat: 0.2, carb: 7.6, fibre: 2.6, density: 0.55 },
  'refried beans':            { cal: 99,  protein: 5.9,  fat: 1.5, carb: 16,  fibre: 5.4, density: 0.85 , countWeight: 454 },
  'lentils':                  { cal: 116, protein: 9,    fat: 0.4, carb: 20,  fibre: 8,   fdcId: 172420, density: 0.7 },
  'red lentils':              { cal: 116, protein: 9,    fat: 0.4, carb: 20,  fibre: 8,   density: 0.7 },
  'green lentils':            { cal: 116, protein: 9,    fat: 0.4, carb: 20,  fibre: 8,   density: 0.7 },
  'split peas':               { cal: 118, protein: 8,    fat: 0.4, carb: 21,  fibre: 8.3, density: 0.7 },
  'moong dal':                { cal: 348, protein: 24,   fat: 1.2, carb: 63,  fibre: 16,  density: 0.7 },
  'yellow dal':               { cal: 348, protein: 24,   fat: 1.2, carb: 63,  fibre: 16,  density: 0.7 },
  'dal':                      { cal: 348, protein: 24,   fat: 1.2, carb: 63,  fibre: 16,  density: 0.7 },
  'tofu':                     { cal: 76,  protein: 8,    fat: 4.8, carb: 1.9, fibre: 0.3, fdcId: 174291 },
  'firm tofu':                { cal: 76,  protein: 8,    fat: 4.8, carb: 1.9, fibre: 0.3 },
  'silken tofu':              { cal: 55,  protein: 5.9,  fat: 2.7, carb: 2.4, fibre: 0 },
  'tempeh':                   { cal: 192, protein: 20,   fat: 11,  carb: 7.6, fibre: 0 },
  'seitan':                   { cal: 121, protein: 25,   fat: 1.9, carb: 4,   fibre: 0.6 },

  // ── LIQUIDS / STOCKS / SAUCES ──
  'water':                    { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.0 },
  'chicken stock':            { cal: 5,   protein: 0.9,  fat: 0.2, carb: 0.4, fibre: 0,   density: 1.0 },
  'beef stock':               { cal: 7,   protein: 1.1,  fat: 0.3, carb: 0.4, fibre: 0,   density: 1.0 },
  'vegetable stock':          { cal: 5,   protein: 0.6,  fat: 0.1, carb: 0.6, fibre: 0,   density: 1.0 },
  'fish stock':               { cal: 7,   protein: 1.2,  fat: 0.5, carb: 0,   fibre: 0,   density: 1.0 },
  'seafood stock':            { cal: 7,   protein: 1.2,  fat: 0.5, carb: 0,   fibre: 0,   density: 1.0 },
  'stock':                    { cal: 5,   protein: 0.9,  fat: 0.2, carb: 0.4, fibre: 0,   density: 1.0 },
  'broth':                    { cal: 5,   protein: 0.9,  fat: 0.2, carb: 0.4, fibre: 0,   density: 1.0 },
  'chicken broth':            { cal: 5,   protein: 0.9,  fat: 0.2, carb: 0.4, fibre: 0,   density: 1.0 },
  'beef broth':               { cal: 7,   protein: 1.1,  fat: 0.3, carb: 0.4, fibre: 0,   density: 1.0 },
  'vegetable broth':          { cal: 5,   protein: 0.6,  fat: 0.1, carb: 0.6, fibre: 0,   density: 1.0 },
  'soy sauce':                { cal: 53,  protein: 8,    fat: 0.6, carb: 5,   fibre: 0.8, density: 1.18 },
  'dark soy sauce':           { cal: 53,  protein: 8,    fat: 0.6, carb: 5,   fibre: 0.8, density: 1.18 },
  'tamari':                   { cal: 60,  protein: 10,   fat: 0,   carb: 6,   fibre: 1,   density: 1.18 },
  'fish sauce':               { cal: 35,  protein: 5,    fat: 0,   carb: 4,   fibre: 0,   density: 1.18 },
  'oyster sauce':             { cal: 51,  protein: 1.4,  fat: 0.3, carb: 11,  fibre: 0.3, density: 1.2 },
  'hoisin sauce':             { cal: 220, protein: 3.3,  fat: 3.4, carb: 44,  fibre: 2.8, density: 1.2 },
  'rice vinegar':             { cal: 18,  protein: 0,    fat: 0,   carb: 0.4, fibre: 0,   density: 1.01 },
  'balsamic vinegar':         { cal: 88,  protein: 0.5,  fat: 0,   carb: 17,  fibre: 0,   density: 1.06 },
  'white vinegar':            { cal: 18,  protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.01 },
  'apple cider vinegar':      { cal: 21,  protein: 0,    fat: 0,   carb: 0.9, fibre: 0,   density: 1.01 },
  'red wine vinegar':         { cal: 19,  protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.01 },
  'white wine':               { cal: 82,  protein: 0.1,  fat: 0,   carb: 2.6, fibre: 0,   density: 0.99 },
  'red wine':                 { cal: 85,  protein: 0.1,  fat: 0,   carb: 2.6, fibre: 0,   density: 0.99 },
  'dry white wine':           { cal: 82,  protein: 0.1,  fat: 0,   carb: 2.6, fibre: 0,   density: 0.99 },
  'marsala wine':             { cal: 117, protein: 0.2,  fat: 0,   carb: 7,   fibre: 0,   density: 1.0 },
  'mirin':                    { cal: 240, protein: 0.2,  fat: 0,   carb: 43,  fibre: 0,   density: 1.07 },
  'sake':                     { cal: 134, protein: 0.5,  fat: 0,   carb: 5,   fibre: 0,   density: 0.99 },
  'beer':                     { cal: 43,  protein: 0.5,  fat: 0,   carb: 3.6, fibre: 0,   density: 1.01 },
  'sherry':                   { cal: 152, protein: 0.2,  fat: 0,   carb: 6,   fibre: 0,   density: 0.99 },
  'coconut milk':             { cal: 230, protein: 2.3,  fat: 24,  carb: 5.5, fibre: 2.2, fdcId: 170173, density: 1.0 , countWeight: 400 },
  'coconut milk full-fat':    { cal: 230, protein: 2.3,  fat: 24,  carb: 5.5, fibre: 2.2, density: 1.0 },
  'light coconut milk':       { cal: 73,  protein: 0.5,  fat: 7.2, carb: 1.6, fibre: 0.4, density: 1.0 },
  'coconut cream':            { cal: 330, protein: 3.6,  fat: 35,  carb: 6.6, fibre: 0,   density: 1.0 },

  // ── PASTES / CONDIMENTS ──
  'thai red curry paste':     { cal: 92,  protein: 4,    fat: 4,   carb: 12,  fibre: 4,   density: 1.0 },
  'thai green curry paste':   { cal: 92,  protein: 4,    fat: 4,   carb: 12,  fibre: 4,   density: 1.0 },
  'red curry paste':          { cal: 92,  protein: 4,    fat: 4,   carb: 12,  fibre: 4,   density: 1.0 },
  'green curry paste':        { cal: 92,  protein: 4,    fat: 4,   carb: 12,  fibre: 4,   density: 1.0 },
  'curry paste':              { cal: 92,  protein: 4,    fat: 4,   carb: 12,  fibre: 4,   density: 1.0 },
  'laksa paste':              { cal: 280, protein: 5,    fat: 22,  carb: 17,  fibre: 4,   density: 1.0 },
  'tandoori paste':           { cal: 100, protein: 3,    fat: 5,   carb: 12,  fibre: 3,   density: 1.0 },
  'harissa paste':            { cal: 70,  protein: 2,    fat: 2.5, carb: 10,  fibre: 4,   density: 1.0 },
  'harissa':                  { cal: 70,  protein: 2,    fat: 2.5, carb: 10,  fibre: 4,   density: 1.0 },
  'harissa spice':            { cal: 290, protein: 12,   fat: 14,  carb: 50,  fibre: 30,  density: 0.4 },
  'garam masala':             { cal: 379, protein: 14,   fat: 15,  carb: 50,  fibre: 25,  density: 0.4 },
  'curry powder':             { cal: 325, protein: 14,   fat: 14,  carb: 56,  fibre: 33,  density: 0.45 },
  'biryani masala':           { cal: 379, protein: 14,   fat: 15,  carb: 50,  fibre: 25,  density: 0.4 },
  'gochujang':                { cal: 226, protein: 6.6,  fat: 1.8, carb: 53,  fibre: 4.6, density: 1.1 },
  'miso':                     { cal: 199, protein: 12,   fat: 6,   carb: 26,  fibre: 5.4, density: 1.1 },
  'miso paste':               { cal: 199, protein: 12,   fat: 6,   carb: 26,  fibre: 5.4, density: 1.1 },
  'mustard':                  { cal: 66,  protein: 4.4,  fat: 4,   carb: 5,   fibre: 3.3, density: 1.05 },
  'dijon mustard':            { cal: 66,  protein: 4.4,  fat: 4,   carb: 5,   fibre: 3.3, density: 1.05 },
  'wholegrain mustard':       { cal: 144, protein: 7,    fat: 9,   carb: 9,   fibre: 3,   density: 1.05 },
  'ketchup':                  { cal: 101, protein: 1.7,  fat: 0.3, carb: 27,  fibre: 0.3, density: 1.1 },
  'sriracha':                 { cal: 93,  protein: 1.9,  fat: 0.9, carb: 19,  fibre: 2.2, density: 1.1 },
  'buffalo sauce':            { cal: 33,  protein: 0.5,  fat: 1.7, carb: 4.6, fibre: 0.7, density: 1.05 },
  'bbq sauce':                { cal: 172, protein: 0.8,  fat: 0.6, carb: 41,  fibre: 0.9, density: 1.15 },
  'worcestershire sauce':     { cal: 78,  protein: 0,    fat: 0,   carb: 20,  fibre: 0,   density: 1.1 },
  'hot sauce':                { cal: 11,  protein: 0.7,  fat: 0.4, carb: 1.8, fibre: 0.3, density: 1.05 },
  'tabasco':                  { cal: 11,  protein: 0.7,  fat: 0.4, carb: 1.8, fibre: 0.3, density: 1.05 },
  'cholula':                  { cal: 11,  protein: 0.7,  fat: 0.4, carb: 1.8, fibre: 0.3, density: 1.05 },
  'frank\'s red hot':         { cal: 15,  protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.05 },
  'marinara sauce':           { cal: 60,  protein: 1.6,  fat: 2.1, carb: 8.7, fibre: 1.7, density: 1.04 },
  'marinara':                 { cal: 60,  protein: 1.6,  fat: 2.1, carb: 8.7, fibre: 1.7, density: 1.04 },
  'pasta sauce':              { cal: 60,  protein: 1.6,  fat: 2.1, carb: 8.7, fibre: 1.7, density: 1.04 },
  'pizza sauce':              { cal: 50,  protein: 1.6,  fat: 1.5, carb: 8,   fibre: 1.7, density: 1.04 },
  'enchilada sauce':          { cal: 36,  protein: 1.4,  fat: 1.4, carb: 5.7, fibre: 1.4, density: 1.04 },
  'salsa':                    { cal: 30,  protein: 1.5,  fat: 0.2, carb: 7,   fibre: 1.5, density: 1.04 },
  'salsa verde':              { cal: 35,  protein: 1.4,  fat: 0.7, carb: 6.5, fibre: 1.5, density: 1.04 },
  'pico de gallo':            { cal: 25,  protein: 1.2,  fat: 0.2, carb: 5.4, fibre: 1.4, density: 0.85 },
  'guacamole':                { cal: 150, protein: 2,    fat: 14,  carb: 8.5, fibre: 6.5, density: 0.95 },
  'pesto':                    { cal: 418, protein: 4.7,  fat: 43,  carb: 4.6, fibre: 1.7, density: 0.95 },
  'tzatziki':                 { cal: 78,  protein: 5,    fat: 4.8, carb: 4.5, fibre: 0.3, density: 1.04 },
  'hummus':                   { cal: 166, protein: 7.9,  fat: 9.6, carb: 14,  fibre: 6,   fdcId: 175271, density: 1.0 },
  'tahini sauce':             { cal: 595, protein: 17,   fat: 54,  carb: 21,  fibre: 9.3, density: 1.05 },
  'teriyaki sauce':           { cal: 89,  protein: 5.9,  fat: 0,   carb: 16,  fibre: 0.1, density: 1.15 },
  'ponzu':                    { cal: 47,  protein: 5,    fat: 0.1, carb: 7,   fibre: 0,   density: 1.05 },
  'gochujang':                { cal: 240, protein: 5.5,  fat: 1,   carb: 51,  fibre: 4,   density: 1.2 },
  'doenjang':                 { cal: 199, protein: 12,   fat: 6,   carb: 26,  fibre: 5.4, density: 1.1 },
  'ssamjang':                 { cal: 220, protein: 9,    fat: 4,   carb: 40,  fibre: 5,   density: 1.1 },
  'sambal oelek':             { cal: 24,  protein: 1.3,  fat: 0.4, carb: 4.6, fibre: 2.5, density: 1.05 },
  'green curry paste':        { cal: 92,  protein: 4,    fat: 4.5, carb: 9.5, fibre: 2,   density: 1.1 },
  'red curry paste':          { cal: 92,  protein: 4,    fat: 4.5, carb: 9.5, fibre: 2,   density: 1.1 },
  'massaman curry paste':     { cal: 130, protein: 4,    fat: 8,   carb: 10,  fibre: 2,   density: 1.1 },
  'panang curry paste':       { cal: 110, protein: 4,    fat: 7,   carb: 9,   fibre: 2,   density: 1.1 },
  'thai curry paste':         { cal: 100, protein: 4,    fat: 5,   carb: 10,  fibre: 2,   density: 1.1 },
  // Non-edible — match to skip (cal=0)
  'wooden skewers':           { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   countWeight: 0, note: 'non-edible' },
  'bamboo skewers':           { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   countWeight: 0, note: 'non-edible' },
  'metal skewers':            { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   countWeight: 0, note: 'non-edible' },
  'toothpicks':               { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   countWeight: 0, note: 'non-edible' },
  'parchment paper':          { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   note: 'non-edible' },
  'cooking spray':            { cal: 7,   protein: 0,    fat: 0.7, carb: 0,   fibre: 0,   note: 'minimal — small spray' },
  'aluminum foil':            { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   note: 'non-edible' },
  'kitchen twine':            { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   note: 'non-edible' },
  'butcher twine':            { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   note: 'non-edible' },
  // Misc additions from v2 misses CSV
  'hotsauce':                 { cal: 11,  protein: 0.7,  fat: 0.4, carb: 1.8, fibre: 0.3, density: 1.05 },
  'buttermilk':               { cal: 40,  protein: 3.3,  fat: 0.9, carb: 4.8, fibre: 0,   density: 1.03 },
  'dried apricots':           { cal: 241, protein: 3.4,  fat: 0.5, carb: 63,  fibre: 7.3, countWeight: 8 },
  'dried cranberries':        { cal: 308, protein: 0.1,  fat: 1.4, carb: 82,  fibre: 5.3, density: 0.65 },
  'dried cherries':           { cal: 333, protein: 1.5,  fat: 1,   carb: 81,  fibre: 3.5, density: 0.65 },
  'raisins':                  { cal: 299, protein: 3.1,  fat: 0.5, carb: 79,  fibre: 3.7, density: 0.65 },
  'dates':                    { cal: 282, protein: 2.5,  fat: 0.4, carb: 75,  fibre: 8,   countWeight: 8 },
  'medjool dates':            { cal: 277, protein: 1.8,  fat: 0.2, carb: 75,  fibre: 6.7, countWeight: 24 },
  'dark chocolate':           { cal: 598, protein: 7.8,  fat: 43,  carb: 46,  fibre: 11,  fdcId: 170273 },
  'milk chocolate':           { cal: 535, protein: 7.7,  fat: 30,  carb: 59,  fibre: 3.4 },
  'chocolate chips':          { cal: 479, protein: 4.2,  fat: 23,  carb: 67,  fibre: 6,   density: 0.7 },
  'dark chocolate chips':     { cal: 479, protein: 4.2,  fat: 23,  carb: 67,  fibre: 6,   density: 0.7 },
  'cocoa powder':             { cal: 228, protein: 19,   fat: 14,  carb: 58,  fibre: 33,  density: 0.5 },
  'unsweetened cocoa powder': { cal: 228, protein: 19,   fat: 14,  carb: 58,  fibre: 33,  density: 0.5 },
  'fennel':                   { cal: 31,  protein: 1.2,  fat: 0.2, carb: 7.3, fibre: 3.1, countWeight: 234 },
  'fennel bulb':              { cal: 31,  protein: 1.2,  fat: 0.2, carb: 7.3, fibre: 3.1, countWeight: 234 },
  'fennel seeds':             { cal: 345, protein: 16,   fat: 15,  carb: 52,  fibre: 40,  density: 0.4 },
  'sumac':                    { cal: 297, protein: 5.4,  fat: 14,  carb: 47,  fibre: 25,  density: 0.5 },
  'nori':                     { cal: 35,  protein: 5.8,  fat: 0.3, carb: 5.1, fibre: 0.3, countWeight: 3 },
  'nori sheets':              { cal: 35,  protein: 5.8,  fat: 0.3, carb: 5.1, fibre: 0.3, countWeight: 3 },
  'nori seaweed sheets':      { cal: 35,  protein: 5.8,  fat: 0.3, carb: 5.1, fibre: 0.3, countWeight: 3 },
  'wakame':                   { cal: 45,  protein: 3,    fat: 0.6, carb: 9.1, fibre: 0.5, density: 0.4 },
  'kombu':                    { cal: 43,  protein: 1.7,  fat: 0.6, carb: 9,   fibre: 1.3, density: 0.4 },
  'poblano':                  { cal: 20,  protein: 0.9,  fat: 0.2, carb: 4.6, fibre: 1.7, countWeight: 60 },
  'poblano pepper':           { cal: 20,  protein: 0.9,  fat: 0.2, carb: 4.6, fibre: 1.7, countWeight: 60 },
  'poblano peppers':          { cal: 20,  protein: 0.9,  fat: 0.2, carb: 4.6, fibre: 1.7, countWeight: 60 },
  'anaheim pepper':           { cal: 20,  protein: 0.9,  fat: 0.2, carb: 4.6, fibre: 1.7, countWeight: 60 },
  'self-raising flour':       { cal: 364, protein: 10,   fat: 1,   carb: 76,  fibre: 2.7, density: 0.6 },
  'self-rising flour':        { cal: 364, protein: 10,   fat: 1,   carb: 76,  fibre: 2.7, density: 0.6 },
  'cake flour':               { cal: 362, protein: 8.2,  fat: 0.8, carb: 78,  fibre: 1.8, density: 0.55 },
  'almond flour':             { cal: 580, protein: 21,   fat: 50,  carb: 22,  fibre: 12,  density: 0.6 },
  'coconut flour':            { cal: 411, protein: 19,   fat: 14,  carb: 60,  fibre: 39,  density: 0.6 },
  'rice flour':               { cal: 366, protein: 5.9,  fat: 1.4, carb: 80,  fibre: 2.4, density: 0.65 },
  'chickpea flour':           { cal: 387, protein: 22,   fat: 6.7, carb: 58,  fibre: 11,  density: 0.6 },
  'gram flour':               { cal: 387, protein: 22,   fat: 6.7, carb: 58,  fibre: 11,  density: 0.6 },
  'cornstarch':               { cal: 381, protein: 0.3,  fat: 0.1, carb: 91,  fibre: 0.9, density: 0.6 },
  'corn flour':               { cal: 381, protein: 0.3,  fat: 0.1, carb: 91,  fibre: 0.9, density: 0.6 },
  'cornmeal':                 { cal: 370, protein: 8.1,  fat: 3.6, carb: 79,  fibre: 7.3, density: 0.65 },
  'polenta':                  { cal: 370, protein: 8.1,  fat: 3.6, carb: 79,  fibre: 7.3, density: 0.65 },
  'caster sugar':             { cal: 387, protein: 0,    fat: 0,   carb: 100, fibre: 0,   density: 0.85 },
  'golden caster sugar':      { cal: 387, protein: 0,    fat: 0,   carb: 100, fibre: 0,   density: 0.85 },
  'demerara sugar':            { cal: 380, protein: 0.1,  fat: 0,   carb: 98,  fibre: 0,   density: 0.93 },
  'turbinado sugar':          { cal: 380, protein: 0.1,  fat: 0,   carb: 98,  fibre: 0,   density: 0.93 },
  'parmigiano-reggiano':      { cal: 392, protein: 36,   fat: 26,  carb: 3.2, fibre: 0 },
  'parmigiano reggiano':      { cal: 392, protein: 36,   fat: 26,  carb: 3.2, fibre: 0 },
  'parmigiano-reggiano cheese': { cal: 392, protein: 36, fat: 26,  carb: 3.2, fibre: 0 , density: 0.38 },
  'sweetened condensed milk': { cal: 321, protein: 7.9,  fat: 8.7, carb: 54,  fibre: 0,   density: 1.3 , countWeight: 397 },
  'condensed milk':           { cal: 321, protein: 7.9,  fat: 8.7, carb: 54,  fibre: 0,   density: 1.3 },
  'evaporated milk':          { cal: 134, protein: 6.8,  fat: 7.6, carb: 10,  fibre: 0,   density: 1.06 },
  'rapeseed oil':             { cal: 884, protein: 0,    fat: 100, carb: 0,   fibre: 0,   density: 0.92 },
  'passata':                  { cal: 30,  protein: 1.4,  fat: 0.2, carb: 7,   fibre: 1.5, density: 1.04 },
  'tomato passata':           { cal: 30,  protein: 1.4,  fat: 0.2, carb: 7,   fibre: 1.5, density: 1.04 },
  'water chestnuts':          { cal: 50,  protein: 0.9,  fat: 0.1, carb: 12,  fibre: 1.5, density: 0.8 },
  'canned water chestnuts':   { cal: 50,  protein: 0.9,  fat: 0.1, carb: 12,  fibre: 1.5, density: 0.8 },
  'parsnips':                 { cal: 75,  protein: 1.2,  fat: 0.3, carb: 18,  fibre: 4.9, countWeight: 100 },
  'parsnip':                  { cal: 75,  protein: 1.2,  fat: 0.3, carb: 18,  fibre: 4.9, countWeight: 100 },
  'turnips':                  { cal: 28,  protein: 0.9,  fat: 0.1, carb: 6.4, fibre: 1.8, countWeight: 122 },
  'turnip':                   { cal: 28,  protein: 0.9,  fat: 0.1, carb: 6.4, fibre: 1.8, countWeight: 122 },
  'rutabaga':                 { cal: 37,  protein: 1.1,  fat: 0.2, carb: 8.6, fibre: 2.3, countWeight: 386 },
  'swede':                    { cal: 37,  protein: 1.1,  fat: 0.2, carb: 8.6, fibre: 2.3, countWeight: 386 },
  'tomatillo':                { cal: 32,  protein: 1,    fat: 1,   carb: 5.8, fibre: 1.9, countWeight: 35 },
  'tomatillos':               { cal: 32,  protein: 1,    fat: 1,   carb: 5.8, fibre: 1.9, countWeight: 35 },
  'fresh tomatillos':         { cal: 32,  protein: 1,    fat: 1,   carb: 5.8, fibre: 1.9, countWeight: 35 },
  'english muffin':           { cal: 235, protein: 8,    fat: 1.7, carb: 46,  fibre: 4.4, countWeight: 57 },
  'english muffins':          { cal: 235, protein: 8,    fat: 1.7, carb: 46,  fibre: 4.4, countWeight: 57 },
  'sweet chili sauce':        { cal: 233, protein: 0.5,  fat: 0,   carb: 58,  fibre: 1.3, density: 1.2 },
  'sweet chilli sauce':       { cal: 233, protein: 0.5,  fat: 0,   carb: 58,  fibre: 1.3, density: 1.2 },
  'watermelon':               { cal: 30,  protein: 0.6,  fat: 0.2, carb: 7.6, fibre: 0.4, density: 0.65 },
  'cantaloupe':               { cal: 34,  protein: 0.8,  fat: 0.2, carb: 8.2, fibre: 0.9, density: 0.65 , countWeight: 550 },
  'honeydew':                 { cal: 36,  protein: 0.5,  fat: 0.1, carb: 9,   fibre: 0.8, density: 0.65 },
  'pineapple':                { cal: 50,  protein: 0.5,  fat: 0.1, carb: 13,  fibre: 1.4, countWeight: 905 },
  'mango':                    { cal: 60,  protein: 0.8,  fat: 0.4, carb: 15,  fibre: 1.6, countWeight: 200 },
  'walnut pieces':            { cal: 654, protein: 15,   fat: 65,  carb: 14,  fibre: 6.7, density: 0.5 },
  'walnut halves':            { cal: 654, protein: 15,   fat: 65,  carb: 14,  fibre: 6.7, density: 0.5 },
  'pecan pieces':             { cal: 691, protein: 9,    fat: 72,  carb: 14,  fibre: 9.6, density: 0.5 },
  'almond slivers':           { cal: 579, protein: 21,   fat: 50,  carb: 22,  fibre: 12,  density: 0.5 },
  'sliced almonds':           { cal: 579, protein: 21,   fat: 50,  carb: 22,  fibre: 12,  density: 0.4 },
  'slivered almonds':         { cal: 579, protein: 21,   fat: 50,  carb: 22,  fibre: 12,  density: 0.4 },
  'cashew pieces':            { cal: 553, protein: 18,   fat: 44,  carb: 30,  fibre: 3.3, density: 0.5 },
  'vegetable stock':          { cal: 5,   protein: 0.4,  fat: 0,   carb: 0.4, fibre: 0,   density: 1.0 },
  'anchovy stock':            { cal: 12,  protein: 1.8,  fat: 0.4, carb: 0.6, fibre: 0,   density: 1.0 },
  'fish stock':               { cal: 12,  protein: 1.8,  fat: 0.4, carb: 0.6, fibre: 0,   density: 1.0 },
  'dashi':                    { cal: 8,   protein: 1,    fat: 0,   carb: 0.7, fibre: 0,   density: 1.0 },
  'bone broth':               { cal: 12,  protein: 2.5,  fat: 0.3, carb: 0,   fibre: 0,   density: 1.0 },
  'cajun seasoning':          { cal: 290, protein: 12,   fat: 8,   carb: 60,  fibre: 22 },
  'taco seasoning':           { cal: 290, protein: 11,   fat: 6,   carb: 65,  fibre: 6 },
  'italian seasoning':        { cal: 296, protein: 11,   fat: 7,   carb: 55,  fibre: 35,  density: 0.4 },
  'creole seasoning':         { cal: 290, protein: 12,   fat: 8,   carb: 60,  fibre: 22 },
  'old bay seasoning':        { cal: 240, protein: 7,    fat: 8,   carb: 41,  fibre: 12,  density: 0.45 },
  'old bay':                  { cal: 240, protein: 7,    fat: 8,   carb: 41,  fibre: 12,  density: 0.45 },
  'jerk seasoning':           { cal: 280, protein: 11,   fat: 7,   carb: 60,  fibre: 22 },
  'herbs de provence':        { cal: 280, protein: 9,    fat: 7,   carb: 50,  fibre: 30,  density: 0.4 },

  // ── SUGARS / SWEETENERS ──
  'sugar':                    { cal: 387, protein: 0,    fat: 0,   carb: 100, fibre: 0,   fdcId: 169655, density: 0.85 },
  'granulated sugar':         { cal: 387, protein: 0,    fat: 0,   carb: 100, fibre: 0,   density: 0.85 },
  'white sugar':              { cal: 387, protein: 0,    fat: 0,   carb: 100, fibre: 0,   density: 0.85 },
  'brown sugar':              { cal: 380, protein: 0.1,  fat: 0,   carb: 98,  fibre: 0,   density: 0.93 },
  'palm sugar':               { cal: 380, protein: 0.1,  fat: 0,   carb: 98,  fibre: 0,   density: 0.93 },
  'powdered sugar':           { cal: 387, protein: 0,    fat: 0,   carb: 100, fibre: 0,   density: 0.56 },
  'honey':                    { cal: 304, protein: 0.3,  fat: 0,   carb: 82,  fibre: 0.2, fdcId: 169640, density: 1.42 },
  'maple syrup':              { cal: 260, protein: 0,    fat: 0.2, carb: 67,  fibre: 0,   density: 1.32 },
  'molasses':                 { cal: 290, protein: 0,    fat: 0.1, carb: 75,  fibre: 0,   density: 1.45 },
  'agave':                    { cal: 310, protein: 0.1,  fat: 0.5, carb: 76,  fibre: 0.2, density: 1.36 },
  'agave nectar':             { cal: 310, protein: 0.1,  fat: 0.5, carb: 76,  fibre: 0.2, density: 1.36 },

  // ── NUTS / SEEDS ──
  'almonds':                  { cal: 579, protein: 21,   fat: 50,  carb: 22,  fibre: 12.5, fdcId: 170567 },
  'cashews':                  { cal: 553, protein: 18,   fat: 44,  carb: 30,  fibre: 3.3, fdcId: 170162 },
  'cashew nuts':              { cal: 553, protein: 18,   fat: 44,  carb: 30,  fibre: 3.3 },
  'peanuts':                  { cal: 567, protein: 26,   fat: 49,  carb: 16,  fibre: 8.5, fdcId: 172430 },
  'walnuts':                  { cal: 654, protein: 15,   fat: 65,  carb: 14,  fibre: 6.7 },
  'pecans':                   { cal: 691, protein: 9,    fat: 72,  carb: 14,  fibre: 9.6 },
  'pine nuts':                { cal: 673, protein: 14,   fat: 68,  carb: 13,  fibre: 3.7 },
  'sesame seeds':             { cal: 573, protein: 18,   fat: 50,  carb: 23,  fibre: 12,  density: 0.65 },
  'sunflower seeds':          { cal: 584, protein: 21,   fat: 51,  carb: 20,  fibre: 8.6 },
  'pumpkin seeds':            { cal: 559, protein: 30,   fat: 49,  carb: 11,  fibre: 6 },
  'tahini':                   { cal: 595, protein: 17,   fat: 54,  carb: 21,  fibre: 9.3, density: 1.07 },
  'peanut butter':            { cal: 588, protein: 25,   fat: 50,  carb: 20,  fibre: 6,   fdcId: 172470, density: 1.05 },
  'almond butter':            { cal: 614, protein: 21,   fat: 56,  carb: 19,  fibre: 10.5, density: 1.05 },
  'khus khus':                { cal: 525, protein: 18,   fat: 42,  carb: 28,  fibre: 19,  note: 'poppy seeds' },
  'poppy seeds':              { cal: 525, protein: 18,   fat: 42,  carb: 28,  fibre: 19 },
  'granola':                  { cal: 471, protein: 10,   fat: 20,  carb: 64,  fibre: 7,   density: 0.5 },
  'muesli':                   { cal: 362, protein: 10,   fat: 5.9, carb: 67,  fibre: 8,   density: 0.5 },
  'ground flaxseed':          { cal: 534, protein: 18,   fat: 42,  carb: 29,  fibre: 27,  density: 0.5 },
  'flaxseed':                 { cal: 534, protein: 18,   fat: 42,  carb: 29,  fibre: 27,  density: 0.5 },
  'flax seeds':               { cal: 534, protein: 18,   fat: 42,  carb: 29,  fibre: 27,  density: 0.5 },
  'chia seeds':               { cal: 486, protein: 17,   fat: 31,  carb: 42,  fibre: 34,  density: 0.7 },
  'hemp seeds':               { cal: 553, protein: 31,   fat: 49,  carb: 8.7, fibre: 4 },
  'hemp hearts':              { cal: 553, protein: 31,   fat: 49,  carb: 8.7, fibre: 4 },

  // ── SPICES (per 100g — only matters at large quantities) ──
  'salt':                     { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.2, countWeight: 0 },
  'sea salt':                 { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.2, countWeight: 0 },
  'kosher salt':              { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.0, countWeight: 0 },
  'salt and pepper':          { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.2, countWeight: 0 },
  'salt and black pepper':    { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.2, countWeight: 0 },
  'salt and pepper to taste': { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.2, countWeight: 0 },
  'pepper':                   { cal: 251, protein: 10,   fat: 3.3, carb: 64,  fibre: 25,  density: 0.5 },
  'black pepper':             { cal: 251, protein: 10,   fat: 3.3, carb: 64,  fibre: 25,  density: 0.5 },
  'white pepper':             { cal: 296, protein: 10,   fat: 2.1, carb: 69,  fibre: 26,  density: 0.5 },
  'cumin':                    { cal: 375, protein: 18,   fat: 22,  carb: 44,  fibre: 11,  density: 0.45 },
  'cumin seeds':              { cal: 375, protein: 18,   fat: 22,  carb: 44,  fibre: 11,  density: 0.45 },
  'ground cumin':             { cal: 375, protein: 18,   fat: 22,  carb: 44,  fibre: 11,  density: 0.45 },
  'coriander seeds':          { cal: 298, protein: 12,   fat: 18,  carb: 55,  fibre: 42,  density: 0.45 },
  'paprika':                  { cal: 282, protein: 14,   fat: 13,  carb: 54,  fibre: 35,  density: 0.45 },
  'smoked paprika':           { cal: 282, protein: 14,   fat: 13,  carb: 54,  fibre: 35,  density: 0.45 },
  'cinnamon':                 { cal: 247, protein: 4,    fat: 1.2, carb: 81,  fibre: 53,  density: 0.5 },
  'cinnamon stick':           { cal: 247, protein: 4,    fat: 1.2, carb: 81,  fibre: 53,  countWeight: 2 },
  'turmeric':                 { cal: 312, protein: 9.7,  fat: 3.3, carb: 67,  fibre: 23,  density: 0.55 },
  'cardamom':                 { cal: 311, protein: 11,   fat: 7,   carb: 68,  fibre: 28,  countWeight: 0.5 },
  'cardamom pods':            { cal: 311, protein: 11,   fat: 7,   carb: 68,  fibre: 28,  countWeight: 0.5 },
  'cloves':                   { cal: 274, protein: 6,    fat: 13,  carb: 66,  fibre: 34,  countWeight: 0.06, note: 'when used as spice not garlic' },
  'star anise':               { cal: 337, protein: 18,   fat: 16,  carb: 50,  fibre: 14,  countWeight: 1 },
  'nutmeg':                   { cal: 525, protein: 6,    fat: 36,  carb: 49,  fibre: 21 },
  'allspice':                 { cal: 263, protein: 6,    fat: 9,   carb: 72,  fibre: 22 },
  'cayenne pepper':           { cal: 318, protein: 12,   fat: 17,  carb: 57,  fibre: 27,  density: 0.4 },
  'chili powder':             { cal: 282, protein: 14,   fat: 14,  carb: 50,  fibre: 35,  density: 0.45 },
  'red chilli powder':        { cal: 318, protein: 12,   fat: 17,  carb: 57,  fibre: 27,  density: 0.45 },
  'gochugaru':                { cal: 318, protein: 12,   fat: 17,  carb: 57,  fibre: 27,  density: 0.45 },
  'garlic powder':            { cal: 331, protein: 17,   fat: 0.7, carb: 73,  fibre: 9,   density: 0.65 },
  'onion powder':             { cal: 341, protein: 10,   fat: 1,   carb: 79,  fibre: 15,  density: 0.65 },
  'saffron':                  { cal: 310, protein: 11,   fat: 6,   carb: 65,  fibre: 4 },
  'vanilla extract':          { cal: 288, protein: 0,    fat: 0,   carb: 13,  fibre: 0,   density: 0.88 },

  // ── MISC ──
  'ranch seasoning':          { cal: 250, protein: 6,    fat: 7,   carb: 50,  fibre: 4 },
  'ranch dressing':            { cal: 484, protein: 0.7, fat: 50,  carb: 4,   fibre: 0,   density: 0.96 },
  'caesar dressing':           { cal: 460, protein: 4,   fat: 47,  carb: 4,   fibre: 0,   density: 0.96 },
  'hummus':                   { cal: 166, protein: 7.9,  fat: 9.6, carb: 14,  fibre: 6,   density: 1.0 },
  'pesto':                    { cal: 418, protein: 5,    fat: 41,  carb: 4,   fibre: 1,   density: 1.0 },
  'guacamole':                { cal: 150, protein: 2,    fat: 14,  carb: 8,   fibre: 7,   density: 1.0 },
  'cocoa powder':             { cal: 228, protein: 20,   fat: 14,  carb: 58,  fibre: 33,  density: 0.45 },
  'chocolate chips':          { cal: 480, protein: 4.2,  fat: 30,  carb: 63,  fibre: 3,   density: 0.7 },
  'baking powder':            { cal: 53,  protein: 0,    fat: 0,   carb: 28,  fibre: 0.2, density: 0.8 },
  'baking soda':              { cal: 0,   protein: 0,    fat: 0,   carb: 0,   fibre: 0,   density: 1.2 },
  'yeast':                    { cal: 325, protein: 41,   fat: 7.6, carb: 41,  fibre: 27,  density: 0.6 },
  'cornflakes':               { cal: 357, protein: 7.5,  fat: 0.4, carb: 84,  fibre: 3,   density: 0.13 },
  'soya milk':                { cal: 54,  protein: 3.3,  fat: 1.8, carb: 6.3, fibre: 0.6, density: 1.04 },
  'soy milk':                 { cal: 54,  protein: 3.3,  fat: 1.8, carb: 6.3, fibre: 0.6, density: 1.04 },
  'almond milk':              { cal: 17,  protein: 0.6,  fat: 1.2, carb: 0.6, fibre: 0.4, density: 1.03 },
  'oat milk':                 { cal: 47,  protein: 1,    fat: 1.5, carb: 7,   fibre: 0.8, density: 1.04 },
  'protein powder':           { cal: 380, protein: 80,   fat: 5,   carb: 7,   fibre: 0,   density: 0.5 },
  'whey protein':             { cal: 380, protein: 80,   fat: 5,   carb: 7,   fibre: 0,   density: 0.5 },

  // ── COUNT-BASED GAP FIXES (2026-06-26) ──────────────────────────────────────
  // These matched a gap-fill entry by name but had NO countWeight, so a count
  // quantity ("8 sardines", "1 baguette") converted to null grams and the whole
  // ingredient was dropped — making mains read as near-zero-calorie/protein.
  // Per-100g values are USDA raw; countWeight = grams per 1 piece/slice/loaf.
  // PROTEINS (count-based)
  'bacon':                    { cal: 417, protein: 13,   fat: 39,  carb: 1.4, fibre: 0,   countWeight: 12,  note: '1 raw US slice' },
  'bacon strips':             { cal: 417, protein: 13,   fat: 39,  carb: 1.4, fibre: 0,   countWeight: 12 },
  'streaky bacon':            { cal: 417, protein: 13,   fat: 39,  carb: 1.4, fibre: 0,   countWeight: 12 },
  'sausage':                  { cal: 301, protein: 12,   fat: 27,  carb: 1.3, fibre: 0,   countWeight: 75,  note: '1 pork link' },
  'sausages':                 { cal: 301, protein: 12,   fat: 27,  carb: 1.3, fibre: 0,   countWeight: 75 },
  'pork sausage':             { cal: 301, protein: 12,   fat: 27,  carb: 1.3, fibre: 0,   countWeight: 90 },
  'cocktail sausages':        { cal: 301, protein: 12,   fat: 27,  carb: 1.3, fibre: 0,   countWeight: 15 },
  'sardines':                 { cal: 165, protein: 25,   fat: 8.6, carb: 0,   fibre: 0,   countWeight: 45,  note: 'whole, edible portion' },
  'sardine':                  { cal: 165, protein: 25,   fat: 8.6, carb: 0,   fibre: 0,   countWeight: 45 },
  'lamb loin chops':          { cal: 232, protein: 18,   fat: 17,  carb: 0,   fibre: 0,   countWeight: 75,  note: 'edible meat per chop' },
  'lamb loin chop':           { cal: 232, protein: 18,   fat: 17,  carb: 0,   fibre: 0,   countWeight: 75 },
  'lamb chop':                { cal: 232, protein: 18,   fat: 17,  carb: 0,   fibre: 0,   countWeight: 75 },
  'lamb chops':               { cal: 232, protein: 18,   fat: 17,  carb: 0,   fibre: 0,   countWeight: 75 },
  'lamb kidney':              { cal: 97,  protein: 17,   fat: 2.9, carb: 0.8, fibre: 0,   countWeight: 60 },
  'king prawns':              { cal: 85,  protein: 20,   fat: 0.5, carb: 0.2, fibre: 0,   countWeight: 18 },
  'king prawn':               { cal: 85,  protein: 20,   fat: 0.5, carb: 0.2, fibre: 0,   countWeight: 18 },
  'tiger prawns':             { cal: 85,  protein: 20,   fat: 0.5, carb: 0.2, fibre: 0,   countWeight: 20 },
  'tiger prawn':              { cal: 85,  protein: 20,   fat: 0.5, carb: 0.2, fibre: 0,   countWeight: 20 },
  'white fish':               { cal: 82,  protein: 18,   fat: 0.7, carb: 0,   fibre: 0,   countWeight: 150, note: 'cod/haddock fillet' },
  'mackerel':                 { cal: 205, protein: 19,   fat: 13.9, carb: 0,  fibre: 0,   countWeight: 100, note: 'fillet' },
  'mussels':                  { cal: 86,  protein: 12,   fat: 2.2, carb: 3.7, fibre: 0,   countWeight: 7,   note: 'meat per mussel' },
  'large sea scallops':       { cal: 69,  protein: 12,   fat: 0.5, carb: 3.2, fibre: 0,   countWeight: 30 },
  'sea scallops':             { cal: 69,  protein: 12,   fat: 0.5, carb: 3.2, fibre: 0,   countWeight: 30 },
  'scallops':                 { cal: 69,  protein: 12,   fat: 0.5, carb: 3.2, fibre: 0,   countWeight: 30 },
  'prosciutto':               { cal: 250, protein: 26,   fat: 16,  carb: 0.3, fibre: 0,   countWeight: 15,  note: '1 slice' },
  'parma ham':                { cal: 250, protein: 26,   fat: 16,  carb: 0.3, fibre: 0,   countWeight: 15 },
  'serrano ham':              { cal: 250, protein: 26,   fat: 16,  carb: 0.3, fibre: 0,   countWeight: 15 },
  'pork belly':               { cal: 518, protein: 9.3,  fat: 53,  carb: 0,   fibre: 0,   countWeight: 150 },
  'duck confit thighs or legs': { cal: 310, protein: 19, fat: 26,  carb: 0,   fibre: 0,   countWeight: 130 },
  'duck confit':              { cal: 310, protein: 19,   fat: 26,  carb: 0,   fibre: 0,   countWeight: 130 },
  'canned tuna in olive oil': { cal: 198, protein: 25,   fat: 10,  carb: 0,   fibre: 0,   countWeight: 120, note: 'drained can' },
  'canned salmon':            { cal: 167, protein: 22,   fat: 8,   carb: 0,   fibre: 0,   countWeight: 200, note: 'can' },
  'rotisserie chicken':       { cal: 190, protein: 25,   fat: 9,   carb: 0,   fibre: 0,   countWeight: 500, note: 'meat yield' },
  'beef tomatoes':            { cal: 18,  protein: 0.9,  fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 180 },
  'beef tomato':              { cal: 18,  protein: 0.9,  fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 180 },
  // BREADS / STARCHES (count-based; "X or Y bread" resolves to its left/head noun)
  'baguette':                 { cal: 270, protein: 9,    fat: 1.3, carb: 57,  fibre: 2.5, countWeight: 250, sliceWeight: 30, note: 'whole baguette / 30g per slice' },
  'french baguette':          { cal: 270, protein: 9,    fat: 1.3, carb: 57,  fibre: 2.5, countWeight: 250, sliceWeight: 30 },
  'french bread':             { cal: 270, protein: 9,    fat: 1.3, carb: 57,  fibre: 2.5, countWeight: 250, sliceWeight: 30 },
  'cuban bread':              { cal: 270, protein: 9,    fat: 1.3, carb: 57,  fibre: 2.5, countWeight: 250, sliceWeight: 30 },
  'bread':                    { cal: 265, protein: 9,    fat: 3.2, carb: 49,  fibre: 2.7, countWeight: 35,  note: '1 slice' },
  'crusty bread':             { cal: 265, protein: 9,    fat: 3.2, carb: 49,  fibre: 2.7, countWeight: 50 },
  'sandwich bread':           { cal: 265, protein: 9,    fat: 3.2, carb: 49,  fibre: 2.7, countWeight: 35 },
  'rye bread':                { cal: 259, protein: 8.5,  fat: 3.3, carb: 48,  fibre: 5.8, countWeight: 35 },
  'wholegrain bread':         { cal: 252, protein: 12,   fat: 3.5, carb: 43,  fibre: 6,   countWeight: 35 },
  'pita':                     { cal: 275, protein: 9,    fat: 1.2, carb: 56,  fibre: 2.2, countWeight: 60 },
  'pita bread':               { cal: 275, protein: 9,    fat: 1.2, carb: 56,  fibre: 2.2, countWeight: 60 },
  'naan':                     { cal: 290, protein: 9,    fat: 5.7, carb: 50,  fibre: 2.2, countWeight: 90 },
  'naan bread':               { cal: 290, protein: 9,    fat: 5.7, carb: 50,  fibre: 2.2, countWeight: 90 },
  'flatbread':                { cal: 290, protein: 8,    fat: 6,   carb: 49,  fibre: 2.5, countWeight: 80 },
  'lavash flatbread':         { cal: 290, protein: 8,    fat: 6,   carb: 49,  fibre: 2.5, countWeight: 80 },
  'ciabatta':                 { cal: 270, protein: 9,    fat: 3,   carb: 52,  fibre: 2.4, countWeight: 85,  sliceWeight: 40, note: 'roll / 40g per slice' },
  'bun':                      { cal: 280, protein: 10,   fat: 4,   carb: 49,  fibre: 2,   countWeight: 50 },
  'brioche loaf':             { cal: 330, protein: 8,    fat: 13,  carb: 45,  fibre: 2,   countWeight: 400, sliceWeight: 40 },
  'tortilla':                 { cal: 310, protein: 8,    fat: 8,   carb: 51,  fibre: 3,   countWeight: 70,  note: 'large flour' },
  'italian sub roll':         { cal: 280, protein: 10,   fat: 4,   carb: 50,  fibre: 2.5, countWeight: 85 },
  'crescent roll dough':      { cal: 300, protein: 6,    fat: 14,  carb: 38,  fibre: 1,   countWeight: 28 },
  'rice paper sheets':        { cal: 330, protein: 0.5,  fat: 0,   carb: 81,  fibre: 1.6, countWeight: 10 },
  'rice paper wrappers':      { cal: 330, protein: 0.5,  fat: 0,   carb: 81,  fibre: 1.6, countWeight: 10 },
  'instant ramen noodles':    { cal: 440, protein: 9,    fat: 17,  carb: 63,  fibre: 2,   countWeight: 85,  note: 'packet' },
  // ── RESOLVER-GROUNDED (2026-06-26): count/slice/volume weights for ingredients the calc dropped ──
  "green olives": { cal: 145, protein: 1, fat: 15, carb: 4, fibre: 3.3, countWeight: 4 },
  "roasted red peppers": { cal: 31, protein: 1, fat: 0.3, carb: 6, fibre: 2.1, countWeight: 100 },
  "anchovies": { cal: 210, protein: 29, fat: 10, carb: 0, fibre: 0, countWeight: 4 },
  "chicken stock cube": { cal: 198, protein: 16.7, fat: 4.7, carb: 21.6, fibre: 0.5, countWeight: 4, note: 'USDA bouillon cube dry; 1 cube ~4g' },
  "lettuce leaves": { cal: 15, protein: 1.4, fat: 0.2, carb: 2.9, fibre: 1.3, countWeight: 10, note: 'USDA green leaf lettuce raw; 1 leaf ~10g' },
  "cream of mushroom soup": { cal: 79, protein: 1.4, fat: 5, carb: 7.4, fibre: 0.4, countWeight: 298, note: 'USDA condensed cream of mushroom soup; 1 can ~298g' },
  "ripe tomatoes": { cal: 18, protein: 0.9, fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 123, note: 'USDA red tomato raw; 1 medium ~123g' },
  "butter lettuce or iceberg lettuce": { cal: 13, protein: 1.4, fat: 0.2, carb: 2.2, fibre: 1.1, countWeight: 160, note: 'Use butter (Boston/bibb) lettuce raw; 1 head ~160g' },
  "white cabbage": { cal: 25, protein: 1.3, fat: 0.1, carb: 5.8, fibre: 2.5, countWeight: 900, note: 'USDA green/white cabbage raw; 1 medium head ~900g' },
  "green cabbage": { cal: 25, protein: 1.3, fat: 0.1, carb: 5.8, fibre: 2.5, countWeight: 900, note: 'USDA raw green cabbage. 1 medium head ~900g; recipes also list by c...' },
  "ranch dressing mix": { cal: 380, protein: 7, fat: 8, carb: 70, fibre: 3, note: 'Dry ranch seasoning powder; high-carb (buttermilk solids, starch, s...' },
  "bagels": { cal: 250, protein: 10, fat: 1.5, carb: 49, fibre: 2.1, countWeight: 100, note: 'USDA plain bagel. ~100g per medium bagel.' },
  "pear or apple": { cal: 57, protein: 0.4, fat: 0.1, carb: 15.2, fibre: 3.1, countWeight: 178, note: '\'X or Y\' -> use pear. USDA raw pear; 1 medium ~178g edible.' },
  "pear": { cal: 57, protein: 0.4, fat: 0.1, carb: 15.2, fibre: 3.1, countWeight: 178, note: 'USDA raw pear. 1 medium ~178g edible.' },
  "butter lettuce or romaine leaves": { cal: 13, protein: 1.4, fat: 0.2, carb: 2.2, fibre: 1.1, countWeight: 8, note: '\'X or Y\' -> use butter lettuce. USDA butterhead lettuce; ~8g per leaf.' },
  "icing sugar": { cal: 389, protein: 0, fat: 0, carb: 99.8, fibre: 0, density: 0.56, note: 'Powdered/confectioners sugar. Loose-packed density ~0.56 g/ml.' },
  "fresh tomato": { cal: 18, protein: 0.9, fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 123, note: 'USDA raw red tomato. 1 medium ~123g.' },
  "dried shiitake mushrooms": { cal: 296, protein: 9.6, fat: 1, carb: 75.4, fibre: 11.5, note: 'USDA dried shiitake (as-purchased dry). Usually given by g/piece; ~...' },
  "canned chipotle peppers in adobo": { cal: 78, protein: 2.5, fat: 2, carb: 13.5, fibre: 5, countWeight: 200, note: 'Chipotles in adobo sauce, ~78 kcal/100g. 1 can ~200g (7 oz).' },
  "butter lettuce or romaine lettuce": { cal: 13, protein: 1.4, fat: 0.2, carb: 2.2, fibre: 1, countWeight: 160, note: 'Use butter lettuce (X of X-or-Y). USDA butterhead ~13 kcal/100g. 1 ...' },
  "cream of chicken soup": { cal: 90, protein: 1.8, fat: 5.5, carb: 8, fibre: 0.2, countWeight: 298, note: 'Condensed cream of chicken soup (undiluted), ~90 kcal/100g. 1 can ~...' },
  "butter lettuce or romaine lettuce leaves": { cal: 13, protein: 1.4, fat: 0.2, carb: 2.2, fibre: 1, countWeight: 8, note: 'Use butter lettuce leaves. USDA butterhead ~13 kcal/100g. 1 leaf ~8...' },
  "chipotle peppers in adobo": { cal: 78, protein: 2.5, fat: 2, carb: 13.5, fibre: 5, countWeight: 15, note: 'Chipotles in adobo, ~78 kcal/100g. 1 pepper ~15g when counted indiv...' },
  "ladyfinger biscuits (savoiardi)": { cal: 392, protein: 8.8, fat: 7.5, carb: 72, fibre: 1.5, countWeight: 12, note: 'Savoiardi ladyfingers, ~392 kcal/100g. 1 biscuit ~12g.' },
  "custard": { cal: 122, protein: 3.5, fat: 4.5, carb: 17, fibre: 0, density: 1.07, note: 'Baked/egg custard, USDA ~122 kcal/100g. Density ~1.07 g/ml; often m...' },
  "butter lettuce or iceberg lettuce leaves": { cal: 13, protein: 1.4, fat: 0.2, carb: 2.2, fibre: 1, countWeight: 8, note: 'Use butter lettuce leaves. USDA butterhead ~13 kcal/100g. 1 leaf ~8g.' },
  "fresh tomatoes": { cal: 18, protein: 0.88, fat: 0.2, carb: 3.89, fibre: 1.2, countWeight: 123, note: 'USDA tomatoes, red, ripe, raw. 1 medium tomato approx 123g.' },
  "spam": { cal: 196, protein: 15.2, fat: 13.9, carb: 1.35, fibre: 0, countWeight: 340, note: 'USDA luncheon meat, pork+chicken, canned (Spam). 1 standard can = 1...' },
  "american cheese": { cal: 375, protein: 17.5, fat: 31.1, carb: 6.35, fibre: 0, countWeight: 21, note: 'USDA cheese, American, restaurant. 1 slice approx 21g.' },
  "meringue nests": { cal: 394, protein: 5.3, fat: 0, carb: 93, fibre: 0, countWeight: 13, note: 'Dried egg-white + sugar meringue; mostly sugar. 1 small nest approx...' },
  "pak choi": { cal: 13, protein: 1.5, fat: 0.2, carb: 2.18, fibre: 1, countWeight: 170, note: 'USDA pak choi/bok choy, raw. 1 medium head approx 170g.' },
  "canned pineapple chunks": { cal: 60, protein: 0.43, fat: 0.1, carb: 15.7, fibre: 0.8, countWeight: 250, note: 'USDA pineapple, canned in juice (drained). 1 can approx 250g drained.' },
  "canned tomato sauce": { cal: 24, protein: 1.2, fat: 0.3, carb: 5.3, fibre: 1.5, countWeight: 425, note: 'USDA tomato sauce, canned. 1 standard can approx 15oz/425g.' },
  "dried limes (or 2 tbsp lemon juice)": { cal: 22, protein: 0.35, fat: 0.24, carb: 6.9, fibre: 0.3, density: 1.03, note: 'Per \'X or Y\' rule use first item; dried lime steeps like juice — us...' },
  "canned tomatillos in juice": { cal: 32, protein: 1, fat: 1, carb: 5.4, fibre: 1.9, countWeight: 300, note: 'Tomatillo raw ~32 kcal/100g. Canned in juice similar drained. 1 can...' },
  "sharp cheddar cheese": { cal: 403, protein: 24.9, fat: 33.1, carb: 1.3, fibre: 0, note: 'USDA cheddar cheese ~403 kcal/100g. Usually given by weight (oz/cup...' , density: 0.42 },
  "crusty white or wholemeal bread": { cal: 265, protein: 9, fat: 3.2, carb: 49, fibre: 2.7, countWeight: 40, sliceWeight: 40, note: 'White/crusty bread ~265 kcal/100g (used X = white). Crusty loaf sli...' },
  "hard taco shells": { cal: 468, protein: 7.7, fat: 21.8, carb: 61.5, fibre: 5, countWeight: 13, note: 'Baked corn taco shell ~468 kcal/100g; 1 hard shell ~13g.' },
  "hearts of palm": { cal: 28, protein: 2.5, fat: 0.6, carb: 4.6, fibre: 2.4, countWeight: 400, note: 'Hearts of palm canned ~28 kcal/100g. 1 can ~400g.' },
  "canned pitted cherries": { cal: 50, protein: 1, fat: 0.3, carb: 12, fibre: 1.6, countWeight: 425, note: 'Cherries, canned in water/light ~50 kcal/100g. 1 can ~425g.' },
  "kombu (dried kelp seaweed)": { cal: 43, protein: 1.7, fat: 0.6, carb: 9.6, fibre: 1.3, countWeight: 10, note: 'Kelp (kombu) raw ~43 kcal/100g per USDA. Used by piece for dashi; 1...' },
  "squash": { cal: 45, protein: 1, fat: 0.1, carb: 11.7, fibre: 1.8, countWeight: 1000, note: 'Winter squash (butternut) raw ~45 kcal/100g. 1 medium squash ~1000g...' },
  "fresh kale": { cal: 35, protein: 2.9, fat: 1.5, carb: 4.4, fibre: 4.1, countWeight: 200, note: 'USDA kale raw ~35 kcal/100g. 1 bunch ~200g.' },
  "2 lemons": { cal: 29, protein: 1.1, fat: 0.3, carb: 9.3, fibre: 2.8, countWeight: 60, note: 'USDA lemon raw ~29 kcal/100g. 1 lemon ~60g edible (input is per-lem...' },
  "trader joe's bruschetta": { cal: 80, protein: 1.5, fat: 5.5, carb: 6, fibre: 1.5, density: 1, note: 'Tomato-based bruschetta topping in oil (jarred). ~0.95-1.0 g/ml den...' },
  "canned young green jackfruit in brine": { cal: 40, protein: 1, fat: 0.3, carb: 9, fibre: 4, countWeight: 280, note: 'Young/green jackfruit in brine, drained. Lower-cal than ripe jackfr...' },
  "colby jack cheese": { cal: 393, protein: 24, fat: 32, carb: 2, fibre: 0, note: 'Colby-Monterey Jack blend; close to colby/cheddar. Usually shredded...' , density: 0.42 },
  "diced tomato": { cal: 18, protein: 0.9, fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 123, note: 'Raw tomato, diced. 1 medium tomato ~123g.' },
  "green mangoes": { cal: 60, protein: 0.8, fat: 0.4, carb: 15, fibre: 1.6, countWeight: 200, note: 'Unripe (green) mango; similar macros to mango, slightly lower sugar...' },
  "filo pastry": { cal: 299, protein: 7.5, fat: 4, carb: 56, fibre: 2, countWeight: 19, note: 'Phyllo dough. Usually used by sheet count; 1 sheet ~19g.' },
  "beef gravy": { cal: 53, protein: 3.7, fat: 2.3, carb: 4.4, fibre: 0.3, density: 1.05, note: 'Canned/ready beef gravy. Measured by cup/ladle; density ~1.05 g/ml.' },
  "bok choi": { cal: 13, protein: 1.5, fat: 0.2, carb: 2.2, fibre: 1, countWeight: 250, note: 'Pak choi (Chinese cabbage, pak-choi), raw. 1 medium head ~250g.' },
  "coleslaw mix": { cal: 25, protein: 1.3, fat: 0.1, carb: 5.8, fibre: 2, note: 'Shredded cabbage+carrot slaw mix, raw, undressed. Usually by weight...' },
  "shortcrust pastry": { cal: 450, protein: 6, fat: 28, carb: 45, fibre: 1.5, note: 'Shortcrust pie pastry (uncooked, all-butter style). Usually by weig...' },
  "noodles": { cal: 371, protein: 13, fat: 4.4, carb: 71, fibre: 3.3, note: 'Dry egg/wheat noodles, uncooked (as-purchased). Often by weight/nest.' },
  "canned pigeon peas": { cal: 121, protein: 7, fat: 0.4, carb: 23, fibre: 6, countWeight: 250, note: 'Pigeon peas, canned, drained. 1 can ~250g drained edible.' },
  "bread (white, wheat, or sourdough)": { cal: 270, protein: 9, fat: 3.3, carb: 49, fibre: 2.7, countWeight: 32, sliceWeight: 32, note: 'White bread (use X of \'X or Y\'). ~32g per sandwich slice.' },
  "tomato, ripe": { cal: 18, protein: 0.9, fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 123, note: 'Red ripe tomato, raw. 1 medium ≈ 123g.' },
  "iceberg or romaine lettuce": { cal: 14, protein: 0.9, fat: 0.1, carb: 3, fibre: 1.2, countWeight: 300, note: 'Iceberg (use X of \'X or Y\'). 1 head ≈ 300g; iceberg raw values.' },
  "littleneck clams": { cal: 74, protein: 12.8, fat: 1, carb: 2.6, fibre: 0, note: 'Clams, mixed species, raw (USDA). Edible meat values; given by weig...' },
  "beef stock concentrate": { cal: 200, protein: 10, fat: 2, carb: 35, fibre: 0, density: 1.1, note: 'Concentrated beef base/bouillon paste; high sodium, modest macros. ...' },
  "live mud crabs": { cal: 83, protein: 18, fat: 1, carb: 0, fibre: 0, countWeight: 120, note: 'Crab meat raw — EDIBLE YIELD per crab (~30% of shell-in weight)' },
  "roasted red peppers (jarred)": { cal: 28, protein: 1.1, fat: 0.2, carb: 5.5, fibre: 1.4, note: 'Jarred roasted red peppers, drained. Similar to red bell pepper raw...' },
  "mixed peppers": { cal: 26, protein: 1, fat: 0.3, carb: 6, fibre: 2.1, countWeight: 120, note: 'Mixed bell peppers, raw (avg of red/green/yellow). 1 medium pepper ...' },
  "little gem lettuce": { cal: 17, protein: 1.2, fat: 0.3, carb: 3.3, fibre: 2.1, countWeight: 90, note: 'Little gem (romaine-type) lettuce, raw. 1 small head ≈ 90g.' },
  "dried chipotle chilli in adobo sauce": { cal: 110, protein: 4, fat: 2.5, carb: 20, fibre: 8, countWeight: 15, note: 'Chipotle in adobo (smoked dried jalapeño + sauce). 1 chilli with sa...' },
  "fresh peaches": { cal: 39, protein: 0.9, fat: 0.3, carb: 9.5, fibre: 1.5, countWeight: 150, note: 'Peach, raw (USDA). 1 medium ≈ 150g.' },
  "tabasco sauce": { cal: 12, protein: 1.3, fat: 0.8, carb: 0.8, fibre: 0.5, density: 1, note: 'Tabasco/hot pepper sauce (USDA). Used in tiny dashes; density ~1.0 ...' },
  "prunes": { cal: 240, protein: 2.2, fat: 0.4, carb: 63.9, fibre: 7.1, countWeight: 10, note: 'Dried plums; 1 prune approx 10g pitted. USDA SR dried plums.' },
  "chayote squash": { cal: 19, protein: 0.8, fat: 0.1, carb: 4.5, fibre: 1.7, countWeight: 200, note: 'Raw chayote; 1 medium fruit approx 200g edible.' },
  "baked beans": { cal: 94, protein: 5.2, fat: 0.4, carb: 15.6, fibre: 4.1, countWeight: 415, note: 'Canned baked beans in tomato sauce; 1 standard can approx 415g.' },
  "fromage frais": { cal: 72, protein: 7.5, fat: 3.4, carb: 3.5, fibre: 0, note: 'Plain fromage frais (approx half-fat); typically measured by weight...' },
  "canned refried beans": { cal: 91, protein: 5.5, fat: 1.5, carb: 15.4, fibre: 5, countWeight: 440, note: 'Canned refried pinto beans; 1 standard can approx 440g (16 oz).' },
  "smoky aïoli": { cal: 680, protein: 1, fat: 74, carb: 3, fibre: 0, density: 0.94, note: 'Garlic-mayo condiment; mayonnaise-based macros, density approx 0.94...' },
  "refried beans (canned)": { cal: 91, protein: 5.5, fat: 1.5, carb: 15.4, fibre: 5, countWeight: 440, note: 'Canned refried pinto beans; 1 standard can approx 440g (16 oz).' },
  "canned hominy": { cal: 72, protein: 1.5, fat: 0.9, carb: 14.3, fibre: 2.5, countWeight: 435, note: 'Canned white/yellow hominy drained; 1 standard can approx 435g (15....' },
  "butter lettuce leaves": { cal: 13, protein: 1.4, fat: 0.2, carb: 2.2, fibre: 1.1, countWeight: 8, note: 'Butterhead/Boston lettuce; 1 leaf approx 8g raw.' },
  "condensed cream of mushroom soup": { cal: 80, protein: 1.4, fat: 5, carb: 8, fibre: 0.4, countWeight: 298, note: 'Condensed (undiluted) cream of mushroom soup; 1 can approx 298g (10...' },
  "honeydew melon": { cal: 36, protein: 0.5, fat: 0.1, carb: 9.1, fibre: 0.8, countWeight: 900, note: 'Raw honeydew; 1 medium melon approx 900g edible flesh.' },
  "galangal": { cal: 71, protein: 1, fat: 0.5, carb: 15, fibre: 2, countWeight: 30, note: 'Aromatic rhizome similar to ginger; 1 thumb-size piece approx 30g.' },
  "cabbage leaves": { cal: 25, protein: 1.3, fat: 0.1, carb: 5.8, fibre: 2.5, countWeight: 40, note: 'Raw green cabbage; 1 large outer leaf approx 40g (edible, not a wra...' },
  "canned bamboo shoots": { cal: 11, protein: 1.5, fat: 0.2, carb: 1.8, fibre: 1.2, countWeight: 225, note: 'USDA canned bamboo shoots, drained; 1 can drained ~225g' },
  "peaches": { cal: 39, protein: 0.9, fat: 0.25, carb: 9.5, fibre: 1.5, countWeight: 150, note: 'USDA peach, raw; 1 medium peach ~150g edible' },
  "cornichons (pickles)": { cal: 12, protein: 0.5, fat: 0.2, carb: 2.3, fibre: 1, countWeight: 5, note: 'USDA cucumber pickle, sour; 1 cornichon ~5g' },
  "canned artichoke hearts": { cal: 47, protein: 2.9, fat: 0.3, carb: 10.5, fibre: 5.4, countWeight: 240, note: 'USDA artichokes, canned; 1 can drained ~240g' },
  "jalapeã±os": { cal: 29, protein: 0.9, fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14, note: 'jalapeños (mojibake); USDA jalapeno raw; 1 pepper ~14g' },
  "green onion, cut into 1-inch pieces": { cal: 32, protein: 1.8, fat: 0.2, carb: 7.3, fibre: 2.6, countWeight: 15, note: 'USDA scallions/green onions raw; 1 stalk ~15g' },
  "whole crab": { cal: 84, protein: 18, fat: 0.7, carb: 0, fibre: 0, countWeight: 120, note: 'USDA blue crab raw — EDIBLE MEAT YIELD per crab (~15% of ~700g shell-in)' },
  "pepperoncini peppers": { cal: 21, protein: 1.1, fat: 0.4, carb: 3.7, fibre: 1.7, countWeight: 10, note: 'pepperoncini, pickled; 1 pepper ~10g' },
  "grape jelly": { cal: 258, protein: 0.1, fat: 0, carb: 67.9, fibre: 0.9, density: 1.33, note: 'USDA jelly (~67% carb, mostly sugar); density ~1.33 g/ml as it\'s me...' },
  "endive (chicory)": { cal: 17, protein: 1.25, fat: 0.2, carb: 3.35, fibre: 3.1, countWeight: 50, note: 'USDA raw endive/chicory greens; 1 head endive ~50-100g, typical rec...' },
  "wonton skin": { cal: 290, protein: 9.7, fat: 1.5, carb: 58, fibre: 2, countWeight: 8, note: 'Wonton wrapper, USDA-style; 1 square skin ~8g' },
  "iceberg or butter lettuce leaves": { cal: 14, protein: 0.9, fat: 0.14, carb: 3, fibre: 1.2, countWeight: 10, note: 'Iceberg (first of X-or-Y) raw; 1 lettuce leaf ~10g' },
  "sliced bread (white or wheat)": { cal: 266, protein: 9, fat: 3.3, carb: 49, fibre: 2.4, countWeight: 28, sliceWeight: 28, note: 'White bread (first of X-or-Y), USDA commercial; 1 slice ~28g' },
  "lettuce leaves (romaine or iceberg)": { cal: 17, protein: 1.2, fat: 0.3, carb: 3.3, fibre: 2.1, countWeight: 10, note: 'Romaine (first of X-or-Y) raw; 1 leaf ~10g' },
  "kimchi": { cal: 15, protein: 1.1, fat: 0.5, carb: 2.4, fibre: 1.6, density: 1, note: 'USDA kimchi; commonly measured by cup, density ~1.0 g/ml' },
  "mirim": { cal: 230, protein: 0.2, fat: 0, carb: 40, fibre: 0, density: 1.05, note: 'Mirin (sweet rice cooking wine); measured by tbsp, density ~1.05 g/...' },
  "packet of instant beef bone soup or beef bone broth coins": { cal: 230, protein: 10, fat: 13, carb: 18, fibre: 0, countWeight: 10, note: 'Instant beef bone soup base (first of X-or-Y), concentrated paste/c...' },
  "herring": { cal: 158, protein: 18, fat: 9, carb: 0, fibre: 0, countWeight: 150, note: 'USDA raw Atlantic herring; 1 fillet ~150g' },
  "jalapeã±o": { cal: 29, protein: 0.9, fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14, note: 'Mojibake = jalapeño; USDA raw jalapeno pepper; 1 pepper ~14g' },
  "mars bar": { cal: 449, protein: 3.8, fat: 17, carb: 70, fibre: 1.3, countWeight: 51, note: 'Mars/Milky Way-style chocolate caramel nougat bar; 1 standard bar ~51g' },
  "turkey thighs": { cal: 144, protein: 18.9, fat: 7, carb: 0, fibre: 0, countWeight: 250, note: 'USDA raw turkey thigh meat with skin; 1 thigh ~250g' },
  "fresh lettuce leaves (oak leaf or butter lettuce)": { cal: 13, protein: 1.35, fat: 0.22, carb: 2.2, fibre: 1.1, countWeight: 10, note: 'Butter/oak leaf lettuce (first usable, oak leaf ~ butterhead) raw; ...' },
  "pretzels": { cal: 380, protein: 10, fat: 3.5, carb: 80, fibre: 3, note: 'USDA hard plain pretzels; typically given by weight/oz' },
  "tomato puree": { cal: 38, protein: 1.65, fat: 0.21, carb: 8.98, fibre: 1.9, density: 1.05, note: 'USDA canned tomato puree; measured by cup/tbsp, density ~1.05 g/ml' },
  "butter lettuce or romaine": { cal: 13, protein: 1.2, fat: 0.2, carb: 2.2, fibre: 1.1, countWeight: 150, note: '\'X or Y\' rule -> butter (Boston/bibb) lettuce values; 1 head butter...' },
  "spaghetti squash": { cal: 31, protein: 0.6, fat: 0.6, carb: 7, fibre: 1.5, countWeight: 900, note: 'raw spaghetti squash; 1 medium whole squash ~900g as-purchased' },
  "canned tomatillos in brine": { cal: 32, protein: 1, fat: 1, carb: 5.8, fibre: 1.9, countWeight: 300, note: 'tomatillo values (canned in brine ~ raw); 1 can drained ~300g' },
  "ripe tomatoes, medium": { cal: 18, protein: 0.9, fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 123, note: 'raw red tomato; 1 medium tomato ~123g' },
  "cornbread mix": { cal: 418, protein: 7, fat: 11, carb: 73, fibre: 2.5, note: 'dry cornbread mix; measured by weight/box, no per-unit count' },
  "canned corn": { cal: 81, protein: 2.7, fat: 1, carb: 18.6, fibre: 2.4, countWeight: 250, note: 'canned sweet corn drained; 1 standard can drained ~250g' },
  "sweet peppadew peppers": { cal: 38, protein: 1, fat: 0.3, carb: 8.5, fibre: 1.5, countWeight: 8, note: 'sweet pickled mini peppers; 1 peppadew ~8g' },
  "duck sauce": { cal: 160, protein: 0.4, fat: 0.1, carb: 40, fibre: 0.3, density: 1.3, note: 'sweet plum/apricot Chinese condiment; ~1.3 g/ml density' },
  "plum sauce": { cal: 184, protein: 0.5, fat: 0.2, carb: 45, fibre: 0.5, density: 1.32, note: 'sweet plum sauce condiment; ~1.32 g/ml density' },
  "dried lime (or fresh lemon juice)": { cal: 22, protein: 0.4, fat: 0.2, carb: 6.9, fibre: 0.3, density: 1.03, note: '\'X or Y\' -> dried lime, but recipe substitutes lemon juice by volum...' },
  "whole wheat": { cal: 340, protein: 13.2, fat: 2.5, carb: 72, fibre: 10.7, note: 'whole wheat flour/grain; measured by weight, no per-unit count' },
  "celeriac": { cal: 42, protein: 1.5, fat: 0.3, carb: 9.2, fibre: 1.8, countWeight: 350, note: 'raw celery root; 1 medium celeriac bulb ~350g edible' },
  "canned palmetto hearts": { cal: 28, protein: 2.5, fat: 0.6, carb: 4.6, fibre: 2.4, countWeight: 220, note: 'hearts of palm, canned drained; 1 can drained ~220g' },
  "provolone or swiss cheese": { cal: 351, protein: 25.6, fat: 26.6, carb: 2.1, fibre: 0, countWeight: 28, note: '\'X or Y\' -> provolone values; 1 slice ~28g' },
  "cauliflower head": { cal: 25, protein: 1.9, fat: 0.3, carb: 5, fibre: 2, countWeight: 600, note: '1 medium cauliflower head, raw, trimmed edible portion ~600g' },
  "truffle oil": { cal: 884, protein: 0, fat: 100, carb: 0, fibre: 0, density: 0.92, note: 'olive-oil-based; treat as oil, density 0.92 g/ml' },
  "black pudding": { cal: 379, protein: 14.6, fat: 31.6, carb: 11.4, fibre: 0, note: 'blood sausage, raw/as-purchased; usually given by weight' },
  "butter lettuce or leaf lettuce": { cal: 13, protein: 1.4, fat: 0.2, carb: 2.2, fibre: 1.1, countWeight: 160, note: 'butterhead lettuce; 1 head ~160g edible' },
  "juniper berries": { cal: 280, protein: 2, fat: 7, carb: 56, fibre: 30, note: 'dried spice; used in tiny amounts, dried-berry estimate' },
  "crushed pineapple in juice": { cal: 60, protein: 0.4, fat: 0.1, carb: 15.7, fibre: 0.7, countWeight: 225, note: 'canned pineapple in juice; 1 can drained+juice portion ~225g (8 oz)' },
  "sport peppers or jalapeã±os": { cal: 29, protein: 0.9, fat: 0.4, carb: 6.5, fibre: 2.8, countWeight: 14, note: 'jalapeños (X used); 1 medium pepper ~14g' },
  "large flour tortillas or pita breads": { cal: 312, protein: 8.2, fat: 7.4, carb: 51, fibre: 3, countWeight: 72, note: 'flour tortilla (X used); 1 large burrito-size ~72g' },
  "glutinous rice (sticky rice)": { cal: 370, protein: 6.8, fat: 0.6, carb: 82, fibre: 2.8, note: 'raw/uncooked glutinous rice, as-purchased' },
  "canned chipotle in adobo sauce": { cal: 79, protein: 2.7, fat: 1.6, carb: 15, fibre: 5, countWeight: 200, note: 'smoked jalapeños in adobo; 1 small can ~200g' },
  "tomato, fresh": { cal: 18, protein: 0.9, fat: 0.2, carb: 3.9, fibre: 1.2, countWeight: 123, note: 'USDA raw red ripe tomato; 1 medium ~123g' },
  "hominy (canned, drained)": { cal: 72, protein: 1.5, fat: 0.9, carb: 14.3, fibre: 2.5, countWeight: 425, note: 'USDA canned white hominy, drained; 1 can (15 oz drained) ~425g' },
  "ice cream": { cal: 207, protein: 3.5, fat: 11, carb: 24, fibre: 0.7, density: 0.55, note: 'USDA vanilla ice cream; density ~0.55 g/ml (aerated)' },
  "roasted red peppers in jar": { cal: 20, protein: 0.8, fat: 0.2, carb: 4.4, fibre: 1.5, countWeight: 340, note: 'Roasted red bell peppers in jar, drained; 1 jar ~340g' },
  "marinated artichoke hearts": { cal: 108, protein: 2.3, fat: 7, carb: 9, fibre: 4.5, countWeight: 170, note: 'Marinated artichoke hearts in oil, drained; 1 jar ~170g' },
  "red enchilada sauce": { cal: 53, protein: 1.3, fat: 2.9, carb: 6.4, fibre: 1.3, countWeight: 283, note: 'Canned red enchilada sauce; 1 can (10 oz) ~283g; density ~1.04 g/ml...' },
};

// ─────────────────────────────────────────────────────────────────────────────
// UNIT PARSER
// ─────────────────────────────────────────────────────────────────────────────
const VOLUME_ML = {
  'tsp': 5, 'teaspoon': 5, 'teaspoons': 5,
  'tbsp': 15, 'tablespoon': 15, 'tablespoons': 15, 'tbs': 15,
  'cup': 240, 'cups': 240, 'c': 240,
  'ml': 1, 'milliliter': 1, 'milliliters': 1,
  'liter': 1000, 'liters': 1000, 'litre': 1000, 'litres': 1000, 'l': 1000,
  'pint': 473, 'pints': 473,
  'quart': 946, 'quarts': 946, 'qt': 946,
  'gallon': 3785, 'gallons': 3785, 'gal': 3785,
  'fl oz': 29.57, 'fl. oz': 29.57, 'fluid oz': 29.57,
};
const WEIGHT_G = {
  'g': 1, 'gram': 1, 'grams': 1,
  'kg': 1000, 'kilo': 1000, 'kilogram': 1000, 'kilograms': 1000,
  'oz': 28.35, 'ounce': 28.35, 'ounces': 28.35,
  'lb': 453.59, 'lbs': 453.59, 'pound': 453.59, 'pounds': 453.59,
  'mg': 0.001,
};
const COUNT_UNITS = new Set([
  '', 'whole', 'medium', 'large', 'small', 'piece', 'pieces',
  'clove', 'cloves', 'slice', 'slices', 'sprig', 'sprigs',
  'leaf', 'leaves', 'head', 'stalk', 'stalks',
  'can', 'cans', 'jar', 'jars', 'bunch', 'bunches', 'pinch',
  'fillet', 'fillets', 'sheet', 'sheets', 'package', 'packages',
  'bottle', 'bottles', 'box', 'boxes',
  'steak', 'steaks', 'chop', 'chops', 'cutlet', 'cutlets',
  'tail', 'tails', 'leg', 'legs', 'wing', 'wings', 'breast', 'breasts',
  'rib', 'ribs', 'thigh', 'thighs', 'drumstick', 'drumsticks',
  'link', 'links', 'patty', 'patties', 'roll', 'rolls',
  'tortilla', 'tortillas', 'bun', 'buns', 'roll', 'rolls', 'wrap', 'wraps',
  'kernel', 'kernels', 'ear', 'ears',
]);
const SIZE_MULTIPLIER = { small: 0.7, medium: 1.0, large: 1.3, jumbo: 1.5 };

function parseQuantity(q) {
  if (q == null) return null;
  const s = String(q).trim().toLowerCase();
  if (!s) return null;
  if (s === 'pinch' || s === 'to taste' || s === 'as needed' || s === 'optional') return null;
  // Mixed: "1 1/2"
  const mixed = s.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseFloat(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  // Fraction: "1/2"
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  // Range: "1-2" or "1 to 2" → pick midpoint
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-to]\s*(\d+(?:\.\d+)?)$/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  // Decimal or integer
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

// Detect "(14 oz)" / "(5-7 lb)" / "14oz" patterns inside unit/name and return grams.
// Range like "5-7 lb" → midpoint (6 lb).
function extractCanWeight(text) {
  const t = String(text).toLowerCase();
  // Try range first: "5-7 lb" or "5 to 7 lb"
  const rng = t.match(/\(?\s*(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|lb|lbs?|pounds?)\s*\)?/);
  if (rng) {
    const mid = (parseFloat(rng[1]) + parseFloat(rng[2])) / 2;
    const u = rng[3];
    const w = WEIGHT_G[u] || WEIGHT_G[u.replace(/s$/, '')];
    return w ? mid * w : null;
  }
  // Single weight
  const m = t.match(/\(?\s*(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|lb|lbs?|pounds?)\s*\)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2];
  const w = WEIGHT_G[u] || WEIGHT_G[u.replace(/s$/, '')];
  return w ? n * w : null;
}

// Some recipe data has the unit packed into the quantity field, e.g.
// quantity="2 cups", unit="". Split it so the rest of the parser works.
function extractInlineUnit(quantity, unit) {
  if (unit && unit.trim()) return { quantity, unit };
  const s = String(quantity || '').trim().toLowerCase();
  if (!s) return { quantity, unit };
  // Match leading number/fraction + unit word.
  // Patterns: "2 cups", "1 1/2 cups", "1/2 cup", "2.5 lb", "3 tbsp"
  const m = s.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+([a-z]+\.?)$/);
  if (!m) return { quantity, unit };
  const numericPart = m[1];
  const unitPart = m[2].replace(/\.$/, '');
  return { quantity: numericPart, unit: unitPart };
}

function toGrams(quantity, unit, ingredientName, usdaEntry) {
  // Handle inline-unit quantity strings ("2 cups" with empty unit)
  ({ quantity, unit } = extractInlineUnit(quantity, unit));
  const qty = parseQuantity(quantity);
  if (qty == null) return null;
  // Strip trailing punctuation from abbreviations ("tbsp." -> "tbsp") but
  // preserve decimal points inside numbers ("1.5 lb" must stay "1.5 lb").
  let u = String(unit || '').trim().toLowerCase()
    .replace(/(?<=\D)\.(?=\D|$)/g, '')   // period not between digits
    .replace(/,/g, '');                   // strip commas
  const ing = String(ingredientName || '').toLowerCase();

  // Special: unit string contains a parenthesized weight like "can (14 oz)"
  const inUnitWeight = extractCanWeight(u);
  if (inUnitWeight != null) {
    return qty * inUnitWeight;
  }
  // Special: ingredient name contains a parenthesized weight
  const inNameWeight = extractCanWeight(ing);
  if (inNameWeight != null && (u === 'can' || u === 'cans' || u === 'jar' || u === 'jars' || u === '')) {
    return qty * inNameWeight;
  }

  // Direct weight
  if (WEIGHT_G[u] != null) {
    // "oz" is ambiguous — fluid for liquids, weight for solids
    if (u === 'oz' && /\b(broth|stock|wine|cream|milk|juice|sauce|water|vinegar|extract)\b/.test(ing)) {
      return qty * 29.57; // fluid oz to grams
    }
    return qty * WEIGHT_G[u];
  }
  // Volume → mass
  if (VOLUME_ML[u] != null) {
    const density = usdaEntry?.density ?? 1.0;
    return qty * VOLUME_ML[u] * density;
  }
  // Count units
  if (COUNT_UNITS.has(u)) {
    // A loaf-weight item measured in slices (e.g. "12 slices baguette") uses its per-slice weight,
    // not the whole-loaf countWeight — otherwise slices × loaf-weight massively over-counts.
    if ((u === 'slice' || u === 'slices') && usdaEntry?.sliceWeight != null) {
      return qty * usdaEntry.sliceWeight;
    }
    let cw = usdaEntry?.countWeight;
    if (cw == null) return null;
    // Apply size multiplier if unit is small/medium/large
    const m = SIZE_MULTIPLIER[u];
    if (m) cw = cw * m;
    return qty * cw;
  }
  // "<size> <countunit>" e.g. "medium head", "large clove" → size multiplier × the count weight.
  const sized = u.match(/^(small|medium|large|jumbo)\s+(.+)$/);
  if (sized && COUNT_UNITS.has(sized[2]) && usdaEntry?.countWeight != null) {
    return qty * usdaEntry.countWeight * (SIZE_MULTIPLIER[sized[1]] || 1);
  }
  // Plurals and other variants
  const usingular = u.replace(/s$/, '');
  if (WEIGHT_G[usingular] != null) return qty * WEIGHT_G[usingular];
  if (VOLUME_ML[usingular] != null) return qty * VOLUME_ML[usingular] * (usdaEntry?.density ?? 1.0);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// USDA API + DISK CACHE
// ─────────────────────────────────────────────────────────────────────────────
const USDA_CACHE_PATH = resolve(process.cwd(), 'scripts/.cache/usda-api-cache.json');
let usdaCache = {};
function ensureCacheDir() {
  const dir = resolve(process.cwd(), 'scripts/.cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function loadCache() {
  ensureCacheDir();
  if (existsSync(USDA_CACHE_PATH)) {
    try { usdaCache = JSON.parse(readFileSync(USDA_CACHE_PATH, 'utf8')); } catch { usdaCache = {}; }
  }
}

// Gap-fill cache (Haiku-estimated entries for ingredients not in hardcoded
// table or live USDA API). Merged into USDA dict at startup so the matcher
// finds them naturally — but only if a hardcoded entry doesn't already exist.
const GAP_FILL_PATH = resolve(process.cwd(), 'scripts/.cache/usda-gap-fill.json');
function loadGapFill() {
  if (!existsSync(GAP_FILL_PATH)) return 0;
  try {
    const gap = JSON.parse(readFileSync(GAP_FILL_PATH, 'utf8'));
    let added = 0;
    for (const [k, v] of Object.entries(gap)) {
      if (!USDA[k]) { USDA[k] = v; added++; }
    }
    return added;
  } catch { return 0; }
}
function saveCache() {
  ensureCacheDir();
  writeFileSync(USDA_CACHE_PATH, JSON.stringify(usdaCache, null, 2));
}

const NUTRIENT_ID = { calories: 1008, protein: 1003, fat: 1004, carb: 1005, fibre: 1079 };
function nutrientsFromFdc(food) {
  const out = { cal: null, protein: null, fat: null, carb: null, fibre: null };
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const v  = n.value ?? n.amount;
    if (id === NUTRIENT_ID.calories && out.cal     == null) out.cal     = v;
    if (id === NUTRIENT_ID.protein  && out.protein == null) out.protein = v;
    if (id === NUTRIENT_ID.fat      && out.fat     == null) out.fat     = v;
    if (id === NUTRIENT_ID.carb     && out.carb    == null) out.carb    = v;
    if (id === NUTRIENT_ID.fibre    && out.fibre   == null) out.fibre   = v;
  }
  return out;
}
function fdcScore(food) {
  const t = food.dataType || '';
  if (t === 'Foundation') return 100;
  if (t === 'SR Legacy')  return 80;
  if (t === 'Survey (FNDDS)') return 60;
  if (t === 'Branded')    return 30;
  return 50;
}
async function usdaApiSearch(query) {
  if (!USDA_API_KEY) return null;
  const cacheKey = query.toLowerCase().trim();
  if (usdaCache[cacheKey] !== undefined) return usdaCache[cacheKey];
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=10`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 429) console.warn(`  USDA rate limit hit for "${query}"`);
      usdaCache[cacheKey] = null; saveCache(); return null;
    }
    const data = await res.json();
    const foods = (data.foods || []).filter(f => f.dataType !== 'Branded'); // skip brands
    if (foods.length === 0) { usdaCache[cacheKey] = null; saveCache(); return null; }
    foods.sort((a, b) => fdcScore(b) - fdcScore(a));
    const best = foods[0];
    const n = nutrientsFromFdc(best);
    if (n.cal == null) { usdaCache[cacheKey] = null; saveCache(); return null; }
    const result = { cal: n.cal, protein: n.protein || 0, fat: n.fat || 0, carb: n.carb || 0, fibre: n.fibre || 0, fdcId: best.fdcId, dataType: best.dataType, description: best.description };
    usdaCache[cacheKey] = result; saveCache();
    return result;
  } catch (err) {
    console.warn(`  USDA API error for "${query}": ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INGREDIENT MATCHING
// ─────────────────────────────────────────────────────────────────────────────
// Single words that could refer to many different foods. We only match these
// when the input is EXACTLY that single word — never as a partial of a
// compound. Prevents "butter beans" → "butter", "roasted pepper" → "pepper",
// "almond milk" → "milk", "rice noodles" → "rice", etc.
const AMBIGUOUS_BARE_WORDS = new Set([
  'butter', 'pepper', 'beans', 'cream', 'rice', 'milk', 'oil', 'cheese',
  'noodles', 'sauce', 'flour', 'sugar', 'bread', 'dough', 'paste', 'powder',
  'seeds', 'nuts', 'leaves', 'leaf', 'sprout', 'sprouts', 'greens', 'salad',
  'fish', 'meat', 'pork', 'beef', 'chicken', 'lamb', 'duck', 'turkey',
  'wine', 'broth', 'stock', 'juice', 'water', 'syrup', 'jam', 'jelly',
  'berries', 'fruit', 'vegetables', 'mushrooms', 'olives', 'pickles',
  'tomato', 'tomatoes', 'anchovy', 'anchovies',
  // ambiguous because they appear in compound names that mean different foods
  // e.g. "tomato ketchup", "anchovy paste", "anchovy stock" should NOT degrade
  // to bare tomato/anchovy. "tomato sauce" / "tomato paste" already have own entries.
]);
function safePartial(partial, fullName) {
  // Allow the partial to match if the full input was exactly this word
  // (so "butter" → "butter" is fine, but "butter beans" → "butter" is not).
  if (partial === fullName) return true;
  if (!AMBIGUOUS_BARE_WORDS.has(partial)) return true;
  return false;
}

function matchHardcoded(rawName) {
  const original = String(rawName || '').trim().toLowerCase()
    .replace(/\s+/g, ' ');
  // Try EXACT original first (gap-fill cached entries use the full original name)
  if (USDA[original]) return { key: original, entry: USDA[original], source: 'hardcoded' };
  let name = original.replace(/[(),]/g, ' ').replace(/\s+/g, ' ');
  if (!name) return null;
  // Handle "X or Y" / "X/Y" alternatives: keep the LEFT half + the head noun.
  // "ground beef or pork" → "ground beef"
  // "vegetable or anchovy stock" → "vegetable stock"
  // "spaghetti or linguine" → "spaghetti"
  if (/\bor\b/.test(name)) {
    name = name.replace(/\bor\b\s+\w+(\s+|$)/, '$1').replace(/\s+/g, ' ').trim();
  }
  if (name.includes('/')) {
    name = name.split('/')[0].trim();
  }
  if (USDA[name]) return { key: name, entry: USDA[name], source: 'hardcoded' };
  const stripped = name
    .replace(/\b(fresh|dried|whole|raw|cooked|peeled|chopped|minced|diced|sliced|grated|ground|boneless|skinless|extra virgin|free.range|organic|low.fat|reduced.fat|unsweetened|sweetened|finely|roughly|coarsely|thinly|thickly|to taste)\b/g, '')
    .replace(/\s+/g, ' ').trim();
  if (USDA[stripped] && safePartial(stripped, name)) return { key: stripped, entry: USDA[stripped], source: 'hardcoded' };
  // Try stripping plural 's' on the whole input
  const singularName = stripped.replace(/s\b/g, ($) => '').replace(/\s+/g, ' ').trim();
  // (the above is too aggressive — better: just try the last-word de-pluralized)
  const words = stripped.split(' ').filter(Boolean);
  const lastDepluralized = words.slice();
  if (lastDepluralized.length > 0 && lastDepluralized[lastDepluralized.length - 1].endsWith('s')) {
    lastDepluralized[lastDepluralized.length - 1] = lastDepluralized[lastDepluralized.length - 1].replace(/s$/, '');
    const candidate = lastDepluralized.join(' ');
    if (USDA[candidate] && safePartial(candidate, name)) return { key: candidate, entry: USDA[candidate], source: 'hardcoded' };
  }
  // Last-N words first (longest suffix) — biases toward head noun in English
  // compounds: "tomato ketchup" → ketchup (not tomato), "red bell pepper" → bell pepper.
  for (let i = words.length; i >= 1; i--) {
    const partial = words.slice(words.length - i).join(' ');
    if (USDA[partial] && safePartial(partial, name)) return { key: partial, entry: USDA[partial], source: 'hardcoded' };
    // de-plural the last word in the partial
    const partialDp = partial.replace(/s\b$/, '');
    if (partialDp !== partial && USDA[partialDp] && safePartial(partialDp, name)) return { key: partialDp, entry: USDA[partialDp], source: 'hardcoded' };
  }
  // First-N words (longest prefix) — fallback for compounds where the head
  // is at the start: "ground beef or pork" → ground beef.
  for (let i = words.length; i > 0; i--) {
    const partial = words.slice(0, i).join(' ');
    if (USDA[partial] && safePartial(partial, name)) return { key: partial, entry: USDA[partial], source: 'hardcoded' };
    const partialDp = partial.replace(/s\b$/, '');
    if (partialDp !== partial && USDA[partialDp] && safePartial(partialDp, name)) return { key: partialDp, entry: USDA[partialDp], source: 'hardcoded' };
  }
  // No substring fallback — too permissive (matched "anchovy" inside
  // "vegetable or anchovy stock"). Better to fall through to USDA API.
  return null;
}
async function matchIngredient(rawName) {
  const hc = matchHardcoded(rawName);
  if (hc) return hc;
  const api = await usdaApiSearch(String(rawName || ''));
  if (api) {
    return {
      key: rawName,
      entry: { cal: api.cal, protein: api.protein, fat: api.fat, carb: api.carb, fibre: api.fibre, fdcId: api.fdcId },
      source: 'api',
      apiMeta: { fdcId: api.fdcId, dataType: api.dataType, description: api.description },
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECIPE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────
// ── FRYING OIL ABSORPTION ────────────────────────────────────────────────────
// Recipes commonly list "2 cups vegetable oil" for shallow/deep frying without
// saying "for frying" in the ingredient name — the intent is implicit in the
// quantity. Heuristic: sauté/stir-fry uses ≤30g oil per serving; anything
// above that is frying excess that gets discarded. USDA / Crit Rev Food Sci
// Nutr 2014 puts deep-fry absorption at ~10%, shallow-fry ~15%.
//
// Rule: if a fat ingredient is >30g per serving, treat the EXCESS as frying
// oil at 15% absorption. Below threshold → counted in full (real cooking fat).
const PER_SERVING_FAT_CAP_G = 30;
const FRY_ABSORPTION = 0.15;
const FRY_QUALIFIERS = [
  'for frying', 'for deep frying', 'for deep-frying', 'for shallow frying',
  'for shallow-frying', 'for the fryer', 'for pan frying', 'for pan-frying',
];
const FAT_INGREDIENTS = new Set([
  'vegetable oil', 'canola oil', 'olive oil', 'extra virgin olive oil',
  'extra-virgin olive oil', 'evoo', 'sesame oil', 'peanut oil', 'sunflower oil',
  'safflower oil', 'avocado oil', 'coconut oil', 'corn oil', 'grapeseed oil',
  'rice bran oil', 'mustard oil', 'cooking oil', 'oil', 'rapeseed oil',
  'lard', 'shortening', 'ghee', 'tallow', 'duck fat', 'beef tallow',
  'duck fat or lard', 'bacon fat', 'chicken fat', 'schmaltz',
]);
function isFatIngredient(usdaKey) { return FAT_INGREDIENTS.has(usdaKey); }

/**
 * Returns adjusted grams + a note describing the discount (or '' if none).
 *  - Explicit "for frying" qualifier in the name → discount whole amount to 15%
 *  - Quantity exceeds 30g per serving → discount the excess to 15%
 *  - Otherwise: no change.
 */
function applyFryingDiscount(rawName, usdaKey, grams, servings) {
  if (!isFatIngredient(usdaKey)) return { grams, note: '' };
  const lower = String(rawName).toLowerCase();
  for (const q of FRY_QUALIFIERS) {
    if (lower.includes(q)) {
      const before = grams;
      const after = grams * FRY_ABSORPTION;
      return { grams: after, note: ` [fry-qualifier 85% of ${Math.round(before)}g]` };
    }
  }
  const cap = PER_SERVING_FAT_CAP_G * servings;
  if (grams > cap) {
    const excess = grams - cap;
    const consumedExcess = excess * FRY_ABSORPTION;
    const after = cap + consumedExcess;
    return { grams: after, note: ` [fry-cap ${Math.round(grams)}g→${Math.round(after)}g]` };
  }
  return { grams, note: '' };
}

async function computeRecipeMacros(recipe) {
  const ings = recipe.ingredients || [];
  const servings = Math.max(1, recipe.servings || 4);
  let totals = { cal: 0, protein: 0, fat: 0, carb: 0, fibre: 0 };
  let matched = 0, total = 0;
  let viaHc = 0, viaApi = 0;
  const detail = [];
  const misses = [];
  for (const ing of ings) {
    total++;
    const match = await matchIngredient(ing.name);
    if (!match) {
      detail.push({ name: ing.name, status: 'no-match' });
      misses.push({ name: ing.name, reason: 'no-match' });
      continue;
    }
    let grams = toGrams(ing.quantity, ing.unit, String(ing.name).toLowerCase(), match.entry);
    if (grams == null) {
      detail.push({ name: ing.name, status: 'no-grams', usdaKey: match.key, source: match.source });
      misses.push({ name: ing.name, reason: 'no-grams', quantity: ing.quantity, unit: ing.unit });
      continue;
    }
    const fry = applyFryingDiscount(ing.name, match.key, grams, servings);
    grams = fry.grams;
    const fryNote = fry.note;
    const factor = grams / 100;
    totals.cal     += match.entry.cal * factor;
    totals.protein += match.entry.protein * factor;
    totals.fat     += match.entry.fat * factor;
    totals.carb    += match.entry.carb * factor;
    totals.fibre   += match.entry.fibre * factor;
    matched++;
    if (match.source === 'hardcoded') viaHc++; else viaApi++;
    detail.push({ name: ing.name, status: 'matched', usdaKey: match.key, grams: Math.round(grams), cals: Math.round(match.entry.cal * factor), source: match.source, fdcId: match.entry.fdcId, fryNote });
  }
  const macros = {
    calories:      Math.round(totals.cal / servings),
    protein:       Math.round(totals.protein / servings * 10) / 10,
    carbohydrates: Math.round(totals.carb / servings * 10) / 10,
    fat:           Math.round(totals.fat / servings * 10) / 10,
    fibre:         Math.round(totals.fibre / servings * 10) / 10,
    isEstimated:   true,
  };
  // Absurdity bounds — flag values that are physically implausible for ANY
  // reasonable single dish. Soups, salads, condiments can legitimately be
  // <100 cal, so we only flag truly-broken lows (<30 cal). Pork belly,
  // confit, etc. can legitimately be very high in fat — bumped to 200g.
  const warns = [];
  if (macros.calories > 2500) warns.push(`cal>${macros.calories}`);
  if (macros.calories < 30 && total > 0 && matched / total >= 0.8) warns.push(`cal<${macros.calories}`);
  if (macros.fat > 200) warns.push(`fat>${macros.fat}g`);
  if (macros.protein > 200) warns.push(`protein>${macros.protein}g`);
  if (macros.carbohydrates > 300) warns.push(`carb>${macros.carbohydrates}g`);
  return {
    macros,
    coverage: total > 0 ? matched / total : 0,
    matched, total, viaHc, viaApi,
    detail, misses,
    warns,
  };
}

function csvEscape(v) { if (v == null) return ''; const s = String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`compute-macros-from-usda — mode: ${APPLY ? 'LIVE WRITE' : 'DRY-RUN'}\n`);
  loadCache();
  const gapAdded = loadGapFill();
  console.log(`USDA cache loaded: ${Object.keys(usdaCache).length} entries`);
  console.log(`Gap-fill loaded:   ${gapAdded} entries merged into hardcoded table`);
  console.log(`USDA API: ${USDA_API_KEY ? 'enabled' : 'DISABLED (no key)'}\n`);

  // Fetch recipes
  const PAGE = 500;
  let offset = 0;
  const all = [];
  while (true) {
    const { data, error } = await sb.from('recipes')
      .select('id, title, servings, macros, ingredients')
      .order('id').range(offset, offset + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data); if (data.length < PAGE) break; offset += PAGE;
  }
  let filtered = all.filter(r => Array.isArray(r.ingredients) && r.ingredients.length > 0);
  if (ONLY_ID) filtered = filtered.filter(r => r.id === ONLY_ID);
  if (ONLY_TITLE) filtered = filtered.filter(r => r.title.toLowerCase().includes(ONLY_TITLE));
  const recipes = isFinite(LIMIT) ? filtered.slice(0, LIMIT) : filtered;
  console.log(`Computing for ${recipes.length} recipes\n`);

  const results = [];
  const allMisses = new Map();
  let totalIngredients = 0, totalMatched = 0;
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    process.stdout.write(`[${i + 1}/${recipes.length}] ${r.title.slice(0, 50).padEnd(50)} `);
    try {
      const computed = await computeRecipeMacros(r);
      results.push({ recipe: r, computed });
      totalIngredients += computed.total;
      totalMatched += computed.matched;
      const old = r.macros?.calories ?? '?';
      console.log(`cov=${(computed.coverage * 100).toFixed(0)}% (hc=${computed.viaHc},api=${computed.viaApi}) old=${old}cal new=${computed.macros.calories}cal/${computed.macros.protein}g`);
      if (VERBOSE) for (const d of computed.detail) console.log(`     ${d.status.padEnd(10)} ${d.name}${d.usdaKey && d.usdaKey !== d.name ? ` → ${d.usdaKey}` : ''}${d.grams != null ? ` (${d.grams}g, ${d.cals}cal)` : ''}${d.fryNote || ''}`);
      for (const m of computed.misses) {
        const key = m.name.toLowerCase();
        const e = allMisses.get(key) || { name: m.name, count: 0, reason: m.reason, recipes: [] };
        e.count++;
        if (e.recipes.length < 10) e.recipes.push(r.title);
        allMisses.set(key, e);
      }
    } catch (err) {
      console.log(`ERR: ${err.message.slice(0, 80)}`);
    }
  }

  // Summary
  console.log(`\n── Summary ──`);
  console.log(`  Recipes computed:        ${results.length}`);
  console.log(`  Total ingredient lookups: ${totalIngredients}`);
  console.log(`  Matched:                 ${totalMatched} (${(totalMatched / totalIngredients * 100).toFixed(1)}%)`);
  console.log(`  Unique missed ingredients: ${allMisses.size}`);

  // Write CSV
  const REPORT_DIR = resolve(process.cwd(), 'scripts/reports');
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const CSV_PATH = resolve(REPORT_DIR, `macros-computed-${APPLY ? 'applied' : 'dryrun'}-${ts}.csv`);
  const lines = ['id,title,servings,coverage_pct,old_cal,new_cal,cal_delta,old_protein,new_protein,old_fat,new_fat,old_carb,new_carb,old_fibre,new_fibre,warns'];
  for (const r of results) {
    const o = r.recipe.macros || {};
    const n = r.computed.macros;
    const delta = (typeof o.calories === 'number') ? n.calories - o.calories : '';
    lines.push([
      r.recipe.id, csvEscape(r.recipe.title), r.recipe.servings ?? '',
      (r.computed.coverage * 100).toFixed(0),
      o.calories ?? '', n.calories, delta,
      o.protein ?? '', n.protein,
      o.fat ?? '', n.fat,
      o.carbohydrates ?? '', n.carbohydrates,
      o.fibre ?? '', n.fibre,
      csvEscape((r.computed.warns || []).join(';')),
    ].join(','));
  }
  writeFileSync(CSV_PATH, lines.join('\n'));
  console.log(`  CSV: ${CSV_PATH}`);

  // Write misses CSV
  const MISSES_PATH = resolve(REPORT_DIR, `macros-coverage-misses-${ts}.csv`);
  const sortedMisses = [...allMisses.values()].sort((a, b) => b.count - a.count);
  const missLines = ['ingredient_name,reason,count'];
  for (const m of sortedMisses) missLines.push(`${csvEscape(m.name)},${m.reason},${m.count}`);
  writeFileSync(MISSES_PATH, missLines.join('\n'));
  console.log(`  Misses CSV: ${MISSES_PATH} (top 5):`);
  for (const m of sortedMisses.slice(0, 5)) console.log(`    ${m.count}x [${m.reason}] ${m.name}`);

  // ── Needs-review report ── specialty ingredients the calculator can't resolve and that are
  // CALORIE-SIGNIFICANT (excludes salt/herbs/spices noise). These would otherwise be silently
  // dropped → wrong macros, so they're surfaced here for a human to add to the USDA table.
  const needsReview = sortedMisses.filter((m) => !isNegligibleMiss(m.name));
  const affectedRecipes = new Set(needsReview.flatMap((m) => m.recipes || []));
  const REVIEW_PATH = resolve(REPORT_DIR, `macros-needs-review-${ts}.csv`);
  const reviewLines = ['ingredient_name,reason,recipe_count,sample_recipes'];
  for (const m of needsReview) reviewLines.push(`${csvEscape(m.name)},${m.reason},${m.count},${csvEscape((m.recipes || []).join(' | '))}`);
  writeFileSync(REVIEW_PATH, reviewLines.join('\n'));
  console.log(`\n  ⚠ NEEDS REVIEW: ${needsReview.length} unknown calorie-significant ingredient(s) across ~${affectedRecipes.size} recipe(s)`);
  console.log(`     (negligible seasonings excluded). Review CSV: ${REVIEW_PATH}`);
  for (const m of needsReview.slice(0, 15)) console.log(`     ${String(m.count).padStart(3)}x [${m.reason}] ${m.name}`);

  // ── Apply gate ── decide which changed recipes are safe to write (no regressions)
  const decisions = results.map((r) => ({ r, d: applyDecision(r.recipe, r.computed) }));
  const toApply = decisions.filter((x) => x.d.apply);
  const skipReasons = {};
  for (const s of decisions.filter((x) => !x.d.apply)) {
    const k = s.d.reason.replace(/\(.*/, '');
    skipReasons[k] = (skipReasons[k] || 0) + 1;
  }
  console.log(`\n── Apply gate ${NO_GATE ? '(DISABLED via --no-gate)' : ''} ──`);
  console.log(`  Would write: ${toApply.length}`);
  for (const [k, v] of Object.entries(skipReasons)) console.log(`  Skipped (${k}): ${v}`);
  const APPLY_CSV = resolve(REPORT_DIR, `macros-to-apply-${ts}.csv`);
  const al = ['id,title,coverage_pct,old_cal,new_cal,old_protein,new_protein,reason'];
  for (const { r, d } of decisions.filter((x) => x.d.apply)) {
    const o = r.recipe.macros || {}; const n = r.computed.macros;
    al.push([r.recipe.id, csvEscape(r.recipe.title), (r.computed.coverage * 100).toFixed(0), o.calories ?? '', n.calories, o.protein ?? '', n.protein, d.reason].join(','));
  }
  writeFileSync(APPLY_CSV, al.join('\n'));
  console.log(`  To-apply CSV: ${APPLY_CSV}`);

  // Apply
  if (!APPLY) {
    console.log(`\n[DRY-RUN] No DB writes. Re-run with --apply (gate would write ${toApply.length}; --no-gate writes all changed).`);
    return;
  }
  console.log(`\nApplying ${toApply.length} gated macro updates to Supabase...`);
  let ok = 0, fail = 0;
  for (let i = 0; i < toApply.length; i++) {
    const r = toApply[i].r;
    const { error } = await sb.from('recipes').update({ macros: r.computed.macros }).eq('id', r.recipe.id);
    if (error) { console.error(`  ${r.recipe.id}: ${error.message}`); fail++; }
    else ok++;
    if ((i + 1) % 50 === 0) process.stdout.write(`  Wrote ${ok}/${toApply.length}\r`);
  }
  console.log(`\n  Updated: ${ok}\n  Failed:  ${fail}`);
}

main().catch(err => { console.error(err); process.exit(1); });
