/**
 * backfill-images.mjs
 * Replaces ALL image_url values on generated recipes using Unsplash.
 * Uses cleaned title (strips parentheticals) + cuisine for better accuracy.
 *
 * Usage: node scripts/backfill-images.mjs
 *
 * Unsplash free tier: 50 req/hour. Script auto-pauses at limit and resumes.
 * Safe to kill and re-run — replaces all images.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL  = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY   = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const UNSPLASH_KEY  = envVars['UNSPLASH_ACCESS_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }
if (!UNSPLASH_KEY) { console.error('Missing UNSPLASH_ACCESS_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Rate limiter: 50 req/hour ──────────────────────────────────────────────────
const UNSPLASH_LIMIT  = 48; // stay under 50
const UNSPLASH_WINDOW = 60 * 60 * 1000;
const unsplashCalls   = [];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Strip parenthetical foreign names: "Mapo Tofu (Spicy Tofu in Chili Oil)" → "Mapo Tofu"
// Also strip very long descriptive subtitles after a comma
function cleanTitle(title) {
  return title
    .replace(/\s*\(.*?\)\s*/g, '')  // remove (...)
    .replace(/,.*$/, '')             // remove everything after first comma
    .trim();
}

async function fetchUnsplashImage(title, cuisine) {
  const now = Date.now();
  // Remove calls outside the window
  while (unsplashCalls.length && now - unsplashCalls[0] > UNSPLASH_WINDOW) unsplashCalls.shift();

  if (unsplashCalls.length >= UNSPLASH_LIMIT) {
    const waitMs = UNSPLASH_WINDOW - (now - unsplashCalls[0]) + 2000;
    const mins = Math.ceil(waitMs / 60000);
    process.stdout.write(`  [Unsplash] Rate limit — waiting ${mins}m...\n`);
    await sleep(waitMs);
    unsplashCalls.shift();
  }

  try {
    const clean = cleanTitle(title);
    // Search with dish name — more specific than adding "food dish"
    const query = encodeURIComponent(clean);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=3&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    unsplashCalls.push(Date.now());
    if (!res.ok) return null;
    const data = await res.json();

    // Pick the result with the highest relevance (first result)
    return data.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const { data: recipes, error } = await sb
    .from('recipes')
    .select('id, title, cuisine')
    .is('external_id', null)
    .order('created_at', { ascending: true });

  if (error) { console.error('DB error:', error.message); process.exit(1); }

  console.log(`\nBackfilling images for ${recipes.length} generated recipes via Unsplash...\n`);

  let updated = 0;
  let failed  = 0;

  for (const recipe of recipes) {
    const imageUrl = await fetchUnsplashImage(recipe.title, recipe.cuisine);

    if (imageUrl) {
      await sb.from('recipes').update({ image_url: imageUrl }).eq('id', recipe.id);
      console.log(`  ✓ ${recipe.title} 📷`);
      updated++;
    } else {
      console.log(`  ✗ ${recipe.title}`);
      failed++;
    }
  }

  console.log(`\nDone — ${updated} updated, ${failed} no image found.`);
}

main().catch(err => { console.error(err); process.exit(1); });
