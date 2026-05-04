/**
 * generate-images.mjs
 * Generates food photography for all generated recipes using DALL-E 3.
 * Passes title, cuisine, key ingredients, and cooking method to the prompt
 * so the image matches the actual dish.
 *
 * Cost: ~$0.04/image (1024x1024 standard) = ~$25 for 624 recipes
 *
 * Usage:
 *   node scripts/generate-images.mjs              # all generated recipes
 *   node scripts/generate-images.mjs --missing    # only recipes with no image
 *
 * Safe to kill and re-run — uses --missing flag to resume.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Env ────────────────────────────────────────────────────────────────────────
const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL  = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY   = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const OPENAI_KEY    = envVars['OPENAI_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1); }
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY in .env'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const args = process.argv.slice(2);
const MISSING_ONLY    = args.includes('--missing');
const TEST_MODE       = args.includes('--test');    // only process 10 random recipes
const CLEANSE         = args.includes('--cleanse'); // wipe all existing images first
const INCLUDE_MEALDB  = args.includes('--include-mealdb'); // also process recipes with external_id

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Build prompt from recipe description ──────────────────────────────────────
function buildPrompt(recipe) {
  const cuisineStyle = {
    italian:          'rustic Italian trattoria setting, marble surface',
    french:           'elegant French bistro presentation, white plate, fine dining',
    japanese:         'minimalist Japanese presentation, ceramic bowl, chopsticks alongside',
    korean:           'Korean stone bowl or ceramic plate, vibrant banchan colours',
    chinese:          'traditional Chinese serving bowl or plate, chopsticks nearby',
    indian:           'copper karahi or white bowl, warm spiced tones',
    thai:             'colourful Thai presentation, fresh herbs and chilli garnish',
    mexican:          'rustic ceramic plate, fresh lime and cilantro garnish',
    spanish:          'terracotta or white plate, warm Mediterranean tones',
    mediterranean:    'white plate, olive oil drizzle, fresh herbs',
    american:         'casual dining style, hearty generous portion',
    'middle eastern': 'mezze-style spread, warm flatbread alongside',
  }[recipe.cuisine?.toLowerCase()] ?? 'rustic wooden table, natural light';

  return `A close-up food photography shot of ${recipe.title}. ${recipe.description ?? ''} ${cuisineStyle}. The dish looks freshly plated and appetising — crispy edges where appropriate, vibrant colours, steam or sheen suggesting it is freshly cooked. Include authentic garnishes and any sauces or sides traditionally served alongside. 45-degree overhead angle, soft natural window light, shallow depth of field with a blurred background, warm tones, highly detailed textures. Clean composition, centred plate. No text, no watermarks, no logos.`;
}

// ── Generate image via DALL-E 3 ────────────────────────────────────────────────
async function generateImage(recipe) {
  const prompt = buildPrompt(recipe);

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // gpt-image-1 returns base64, DALL-E 3 returns url
  const item = data.data?.[0];
  if (!item) return null;
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return null;
}

// ── Upload to Supabase Storage (so URL doesn't expire) ─────────────────────────
// OpenAI image URLs expire after 1 hour — we need to save them somewhere permanent.
// Supabase Storage is the easiest option since we're already using it.
async function uploadToSupabase(imageUrl, recipeId) {
  let buffer;
  if (imageUrl.startsWith('data:image/png;base64,')) {
    const base64 = imageUrl.replace('data:image/png;base64,', '');
    buffer = Buffer.from(base64, 'base64');
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch generated image: ${res.status}`);
    buffer = await res.arrayBuffer();
  }

  // Sniff actual format — gpt-image-1 returns PNG. Anthropic vision strictly validates
  // magic bytes vs declared MIME, so we must label correctly.
  const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const ext = isPng ? 'png' : 'jpg';
  const contentType = isPng ? 'image/png' : 'image/jpeg';

  // Test mode uses a timestamped folder so CDN doesn't serve stale cached images
  const folder = TEST_MODE ? `test-${Date.now()}` : 'generated';
  const path = `${folder}/${recipeId}.${ext}`;

  const { data, error } = await sb.storage
    .from('recipe-images')
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) throw new Error(`Supabase upload error: ${error.message}`);

  const { data: { publicUrl } } = sb.storage
    .from('recipe-images')
    .getPublicUrl(path);

  return publicUrl;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  // ── Cleanse: wipe all existing Unsplash images ──────────────────────────────
  if (CLEANSE) {
    console.log('\nCleansing existing Unsplash images...');
    const { error: wipeErr } = await sb
      .from('recipes')
      .update({ image_url: null, needs_image_review: true })
      .is('external_id', null)
      .like('image_url', 'https://images.unsplash.com/%');
    if (wipeErr) { console.error('Cleanse error:', wipeErr.message); process.exit(1); }
    console.log('Done — all Unsplash images cleared.\n');
  }

  // ── Fetch recipes ────────────────────────────────────────────────────────────
  let query = sb
    .from('recipes')
    .select('id, title, cuisine, description, ingredients, steps');

  if (!INCLUDE_MEALDB) query = query.is('external_id', null);
  if (MISSING_ONLY || CLEANSE) query = query.is('image_url', null);
  if (TEST_MODE) query = query.limit(50);
  else query = query.order('created_at', { ascending: true });

  const { data: allRecipes, error } = await query;
  if (error) { console.error('DB error:', error.message); process.exit(1); }

  // Randomise for test mode so we get a diverse sample
  const recipes = TEST_MODE
    ? allRecipes.sort(() => Math.random() - 0.5).slice(0, 50)
    : allRecipes;

  console.log(`\nGenerating DALL-E 3 images for ${recipes.length} recipes...`);
  console.log(`Estimated cost: $${(recipes.length * 0.04).toFixed(2)}\n`);

  let generated = 0;
  let failed = 0;

  for (const recipe of recipes) {
    try {
      process.stdout.write(`  ⏳ ${recipe.title}...`);

      // Generate image
      const openaiUrl = await generateImage(recipe);
      if (!openaiUrl) throw new Error('No URL returned');

      // Upload to Supabase Storage (OpenAI URLs expire after 1hr)
      const permanentUrl = await uploadToSupabase(openaiUrl, recipe.id);

      // Update recipe
      await sb.from('recipes').update({
        image_url: permanentUrl,
        needs_image_review: false,
      }).eq('id', recipe.id);

      process.stdout.write(` ✓\n`);
      if (TEST_MODE) console.log(`    🔗 ${permanentUrl}`);
      generated++;

      // DALL-E 3 rate limit: 5 images/min on tier 1
      await sleep(13000); // ~4.5/min to stay safe

    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      failed++;
      await sleep(2000);
    }
  }

  console.log(`\nDone — ${generated} generated, ${failed} failed.`);
  console.log(`Total cost: ~$${(generated * 0.04).toFixed(2)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
