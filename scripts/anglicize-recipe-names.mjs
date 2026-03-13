// One-time script: anglicizes recipe titles that are in a foreign language.
// Fetches all curated (Claude-generated) recipes, uses Haiku to produce an
// English-first title, updates Supabase. Safe to re-run — skips titles that
// are already English.
//
// Usage: node scripts/anglicize-recipe-names.mjs
// Optional: node scripts/anglicize-recipe-names.mjs --dry-run

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env ─────────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const ANTHROPIC_KEY = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing env vars. Need EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const isDryRun = process.argv.includes('--dry-run');
const DELAY_MS = 400;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Detect if a title likely needs anglicizing — heuristic check for non-English words
function likelyForeign(title) {
  // Common foreign patterns: accented chars, Italian/French/Spanish connectors
  return /[àáâãäåèéêëìíîïòóôõöùúûüýÿæœç]/i.test(title) ||
    /\b(alla|al|del|della|di|con|en|au|aux|à|le|la|les|des|du|el|los|las|de|dos|das)\b/i.test(title) ||
    /\b(pollo|carne|pesce|arroz|poulet|boeuf|agneau|cerdo|bacalao|maiale|manzo|vitello|anatra)\b/i.test(title);
}

async function anglicize(title, cuisine) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    messages: [{
      role: 'user',
      content: `Convert this ${cuisine} recipe title to an English-first format.
Rule: English name first, original name in parentheses if well-known. If already English, return it unchanged.
Examples:
  "Pollo alla Cacciatora" → "Hunter's Chicken (Pollo alla Cacciatora)"
  "Osso Buco alla Milanese" → "Braised Veal Shanks (Osso Buco)"
  "Arroz con Leche" → "Creamy Rice Pudding (Arroz con Leche)"
  "Grilled Salmon" → "Grilled Salmon"

Title: "${title}"
Return the new title only, no explanation:`
    }],
  });
  return msg.content[0].text.trim().replace(/^["']|["']$/g, '');
}

async function main() {
  // Fetch all curated (generated) recipes
  const { data: recipes, error } = await sb
    .from('recipes')
    .select('id, title, cuisine')
    .eq('source_type', 'curated')
    .order('created_at', { ascending: false });

  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
  if (!recipes.length) { console.log('No curated recipes found.'); return; }

  const needsWork = recipes.filter(r => likelyForeign(r.title));
  const alreadyEnglish = recipes.length - needsWork.length;

  console.log(`\nFound ${recipes.length} curated recipes`);
  console.log(`Already English: ${alreadyEnglish}`);
  console.log(`Needs anglicizing: ${needsWork.length}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

  let updated = 0;
  let skipped = 0;

  for (const recipe of needsWork) {
    const newTitle = await anglicize(recipe.title, recipe.cuisine);

    if (newTitle === recipe.title) {
      console.log(`  = ${recipe.title} (unchanged)`);
      skipped++;
    } else {
      console.log(`  ✓ "${recipe.title}"`);
      console.log(`    → "${newTitle}"`);
      if (!isDryRun) {
        const { error: updateErr } = await sb
          .from('recipes')
          .update({ title: newTitle })
          .eq('id', recipe.id);
        if (updateErr) console.warn(`    ✗ Update failed: ${updateErr.message}`);
        else updated++;
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${updated} updated, ${skipped} already English.`);
  if (isDryRun) console.log('(Dry run — no changes written)');
}

main().catch(console.error);
