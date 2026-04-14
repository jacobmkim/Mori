// Polishes recipe titles to be more evocative and ingredient-forward.
// Fetches recipes from Supabase, calls Claude Haiku with title + ingredients,
// and updates recipes with rewritten titles.
//
// Usage:
//   node scripts/polish-recipe-titles.mjs                   # polish all
//   node scripts/polish-recipe-titles.mjs --limit 10        # first 10 only
//   node scripts/polish-recipe-titles.mjs --dry-run         # preview only
//   node scripts/polish-recipe-titles.mjs --recent 50       # last 50 added
//

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env ──────────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const API_KEY      = envVars['ANTHROPIC_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Args ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 1000;
const recentIdx = args.indexOf('--recent');
const recent = recentIdx >= 0 ? parseInt(args[recentIdx + 1], 10) : null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Identify titles that could be improved
function needsPolish(title) {
  if (!title || typeof title !== 'string') return false;
  const lowered = title.toLowerCase();
  // Skip titles that are already evocative or short + descriptive
  if (lowered.includes('with') || lowered.includes('&')) {
    // Has some descriptor already; check if it's bland
    return lowered.match(/^(beef|chicken|pork|fish|turkey|ground).*(with|&)/i) &&
           !lowered.match(/(sage|garlic|lemon|brown butter|caramel|honey|spice|herb)/i);
  }
  // Very simple titles like "Beef and Rice" or "Chicken Tacos"
  return lowered.match(/^(beef|chicken|pork|fish|turkey|ground).*(and|with|rice|tacos|bowls|skillet)$/i);
}

async function polishTitle(recipe) {
  const ingredientList = recipe.ingredients
    .slice(0, 5)
    .map(i => i.name)
    .join(', ');

  const prompt = `You are a food writer. Rewrite this recipe title to be more evocative, ingredient-forward, and appetizing.

Original title: ${recipe.title}
Key ingredients: ${ingredientList}

Return ONLY the new title (4-7 words max, no quotes, no explanation). Make it punchy and descriptive.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const newTitle = data.content[0].text.trim().replace(/^["']|["']$/g, '');
  return newTitle;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMori Recipe Title Polish`);
  console.log(`Mode:  ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit}`);
  if (recent) console.log(`Recent: last ${recent} recipes only`);
  console.log();

  // Fetch recipes
  let query = sb.from('recipes').select('id, title, ingredients');

  if (recent) {
    query = query.order('created_at', { ascending: false }).limit(recent);
  } else {
    query = query.limit(limit);
  }

  const { data: recipes, error } = await query;

  if (error) {
    console.error(`Failed to fetch recipes: ${error.message}`);
    process.exit(1);
  }

  if (!recipes || recipes.length === 0) {
    console.log('No recipes found.');
    return;
  }

  // Filter recipes that need polish
  const toCandidates = recipes.filter(needsPolish);
  console.log(`Fetched ${recipes.length} recipes`);
  console.log(`  ${toCandidates.length} candidates for polishing\n`);

  if (toCandidates.length === 0) {
    console.log('No recipes need polishing.');
    return;
  }

  if (isDryRun) {
    console.log('Recipes that would be polished:');
    toCandidates.slice(0, 10).forEach(r => console.log(`  [ ] ${r.title}`));
    if (toCandidates.length > 10) console.log(`  ... and ${toCandidates.length - 10} more`);
    console.log(`\nDry run complete.`);
    return;
  }

  let polished = 0;
  let failed = 0;
  const failedTitles = [];

  for (let i = 0; i < toCandidates.length; i++) {
    const recipe = toCandidates[i];
    try {
      const newTitle = await polishTitle(recipe);

      // Only update if title is different and reasonable length
      if (newTitle && newTitle !== recipe.title && newTitle.length > 5 && newTitle.length < 100) {
        const { error: updateErr } = await sb
          .from('recipes')
          .update({ title: newTitle })
          .eq('id', recipe.id);

        if (updateErr) {
          failed++;
          failedTitles.push(`${recipe.title}: ${updateErr.message}`);
          process.stdout.write(`  ✗ ${recipe.title}\n`);
        } else {
          polished++;
          process.stdout.write(`  ✓ "${recipe.title}" → "${newTitle}"\n`);
        }
      } else {
        process.stdout.write(`  ~ ${recipe.title} (no improvement)\n`);
      }

      // Rate limit Claude API calls
      if (i < toCandidates.length - 1) await sleep(500);
    } catch (err) {
      failed++;
      failedTitles.push(`${recipe.title}: ${err.message}`);
      process.stdout.write(`  ✗ ${recipe.title}: ${err.message}\n`);
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Polished: ${polished}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Skipped:  ${toCandidates.length - polished - failed} (no improvement)`);

  if (failedTitles.length > 0) {
    console.log(`\nFailed:`);
    failedTitles.forEach(t => console.log(`  ✗ ${t}`));
  }
}

main().catch(console.error);
