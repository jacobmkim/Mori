/**
 * reaudit-errored.mjs
 *
 * Re-audits only the recipes that errored during the previous audit run
 * (Supabase Storage transient fetch failures). Reads errored titles from
 * C:/tmp/errored-titles.json (produced by extract step). Same logic as
 * audit-recipe-images.mjs but scoped to those titles.
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envVars = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: envVars['ANTHROPIC_API_KEY'] });

const THRESHOLD = 70;
const titles = JSON.parse(readFileSync('C:/tmp/errored-titles.json', 'utf8'));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sniffMime(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  return 'image/jpeg';
}

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return { base64: Buffer.from(buffer).toString('base64'), mediaType: sniffMime(bytes) };
}

async function auditImage(title, imageUrl) {
  const { base64, mediaType } = await fetchImage(imageUrl);
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: `Recipe title: "${title}"

Does this image correctly show the dish described by the title?

Respond ONLY with JSON, no prose:
{"confidence":85,"match":true,"issue":null}
or
{"confidence":42,"match":false,"issue":"Image shows tofu bowl, title says steak bowl"}` },
      ],
    }],
  });
  const raw = msg.content[0].text.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { confidence: 0, match: false, issue: 'parse failure' };
  }
  return { confidence: parsed.confidence ?? 0, match: parsed.match === true, issue: parsed.issue ?? null };
}

async function main() {
  console.log(`reaudit-errored — threshold: ${THRESHOLD} | titles: ${titles.length}`);
  // Chunk the IN clause to stay under URL length limits
  const recipes = [];
  const CHUNK = 50;
  for (let i = 0; i < titles.length; i += CHUNK) {
    const slice = titles.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, image_url')
      .in('title', slice)
      .not('image_url', 'is', null);
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (data) recipes.push(...data);
  }
  console.log(`Found ${recipes.length} matching recipes with images\n`);

  let passed = 0, flagged = 0, errored = 0;
  for (let i = 0; i < recipes.length; i++) {
    const { id, title, image_url } = recipes[i];
    process.stdout.write(`[${i + 1}/${recipes.length}] ${title.slice(0, 55).padEnd(55)}`);
    try {
      const result = await auditImage(title, image_url);
      if (result.match && result.confidence >= THRESHOLD) {
        console.log(` ✓ ${result.confidence}`);
        passed++;
      } else {
        console.log(` ✗ ${result.confidence} — ${result.issue ?? 'low confidence'}`);
        await sb.from('recipes').update({ image_url: null, needs_image_review: true }).eq('id', id);
        flagged++;
      }
    } catch (err) {
      console.log(` ERROR: ${err.message.slice(0, 80)}`);
      errored++;
    }
    if ((i + 1) % 20 === 0) await sleep(500);
  }
  console.log(`\n── Summary ──\n  Passed:  ${passed}\n  Flagged: ${flagged}\n  Errored: ${errored}`);
}

main();
