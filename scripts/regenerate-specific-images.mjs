/**
 * regenerate-specific-images.mjs
 *
 * One-shot script to regenerate images for specific recipe IDs with explicit prompts.
 * Run AFTER generate-images.mjs finishes (rate limit: 5 imgs/min on OpenAI tier 1).
 *
 * Usage:
 *   node scripts/regenerate-specific-images.mjs
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

const SUPABASE_URL = envVars['EXPO_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const OPENAI_KEY   = envVars['OPENAI_API_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env'); process.exit(1); }
if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Explicit prompts override the generic title-based prompt to correct wrong generations
const TARGETS = [
  {
    id: 'd5a5654c-e67b-4b37-93b5-f23411452d5b',
    title: 'Chipotle Copycat Steak Bowl',
    prompt: 'A close-up food photography shot of a Chipotle-style steak burrito bowl. Sliced grilled carne asada steak (charred, juicy slices) over cilantro lime white rice, black beans, chunky tomato pico de gallo, guacamole, shredded cheese, and sour cream, all arranged in a wide ceramic bowl. Casual dining style, hearty generous portion. 45-degree overhead angle, soft natural window light, shallow depth of field, warm tones. No text, no watermarks, no logos.',
  },
  {
    id: '746c92d7-21c5-4a9f-88b4-72a19a0ffc0d',
    title: 'Creamy Pasta with Boursin and Tomato',
    prompt: 'A close-up food photography shot of creamy Boursin cheese pasta. Short pasta (rigatoni or penne) coated in a silky, ivory-cream Boursin garlic herb sauce with burst cherry tomatoes scattered throughout and fresh basil on top. The sauce is creamy white, NOT red. Rustic wooden table, natural light. 45-degree overhead angle, soft natural window light, shallow depth of field, warm tones. No text, no watermarks, no logos.',
  },
  {
    id: '371cf404-8792-4be4-afa3-ab11cad3e8b8',
    title: 'Pasta Salad with Trader Joe\'s Bruschetta',
    prompt: 'A close-up food photography shot of a cold pasta salad featuring rotini or penne pasta tossed with Trader Joe\'s bruschetta sauce (chunky tomato-basil), fresh mozzarella balls, basil leaves, and a light olive oil dressing. Served cold, not saucy or hot — a fresh summer pasta salad. White marble surface, natural light. 45-degree overhead angle, soft natural window light, shallow depth of field. No text, no watermarks, no logos.',
  },
];

async function generateImage(prompt) {
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
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const item = data.data?.[0];
  if (!item) throw new Error('No image returned');
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error('No url or b64_json in response');
}

async function uploadToSupabase(imageUrl, recipeId) {
  let buffer;
  if (imageUrl.startsWith('data:image/png;base64,')) {
    buffer = Buffer.from(imageUrl.replace('data:image/png;base64,', ''), 'base64');
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`);
    buffer = await res.arrayBuffer();
  }
  const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const ext = isPng ? 'png' : 'jpg';
  const contentType = isPng ? 'image/png' : 'image/jpeg';

  const path = `generated/${recipeId}.${ext}`;
  const { error } = await sb.storage.from('recipe-images').upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: { publicUrl } } = sb.storage.from('recipe-images').getPublicUrl(path);
  return publicUrl;
}

async function main() {
  console.log(`Regenerating ${TARGETS.length} specific recipe images...\n`);
  let ok = 0, fail = 0;

  for (let i = 0; i < TARGETS.length; i++) {
    const { id, title, prompt } = TARGETS[i];
    process.stdout.write(`[${i + 1}/${TARGETS.length}] ${title}... `);
    try {
      const imageUrl = await generateImage(prompt);
      const permanentUrl = await uploadToSupabase(imageUrl, id);
      await sb.from('recipes').update({ image_url: permanentUrl, needs_image_review: false }).eq('id', id);
      process.stdout.write(`✓\n`);
      ok++;
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`);
      fail++;
    }
    if (i < TARGETS.length - 1) await sleep(13000);
  }

  console.log(`\nDone — ${ok} regenerated, ${fail} failed.`);
}

main().catch(console.error);
