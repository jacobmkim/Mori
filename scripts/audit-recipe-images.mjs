/**
 * audit-recipe-images.mjs
 *
 * Visual audit of every recipe image using Claude Haiku vision.
 * For each recipe with an image_url, sends the image + title to Haiku and asks:
 *   "Does this image correctly represent the dish?"
 *
 * Recipes that fail (confidence < threshold) have their image_url nulled so
 * generate-images.mjs --missing will regenerate them.
 *
 * Usage:
 *   node scripts/audit-recipe-images.mjs --dry-run          # preview, no writes
 *   node scripts/audit-recipe-images.mjs --limit 50         # test on 50
 *   node scripts/audit-recipe-images.mjs --offset 500       # resume
 *   node scripts/audit-recipe-images.mjs --verbose          # show issue text
 *   node scripts/audit-recipe-images.mjs                    # full run (~2600 recipes)
 *
 * Cost estimate: ~$4-6 for full run (Haiku vision, ~1600 tokens/image).
 * After this: run `node scripts/generate-images.mjs --missing` to regenerate flagged recipes.
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ───────────────────────────────────────────────────────────────────────
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

const sb        = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── CLI args ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const VERBOSE   = args.includes('--verbose');
const LIMIT     = (() => { const i = args.indexOf('--limit');  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const START_OFF = (() => { const i = args.indexOf('--offset'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();
const THRESHOLD = (() => { const i = args.indexOf('--threshold'); return i >= 0 ? parseInt(args[i + 1], 10) : 80; })();

const CONFIDENCE_THRESHOLD = THRESHOLD;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fetch image + sniff actual MIME (Supabase mislabels PNG as JPEG) ──────────
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

// ── Haiku vision audit ────────────────────────────────────────────────────────
async function auditImage(title, imageUrl) {
  const { base64, mediaType } = await fetchImage(imageUrl);

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: `Recipe title: "${title}"

Does this image correctly show the dish described by the title?

Consider:
- Does the main protein/ingredient match? (e.g. if title says "steak", image must show steak not tofu)
- Does the cooking style match? (e.g. "pasta salad" should be cold/assembled, not a hot sauced pasta)
- Does the sauce/base match? (e.g. "creamy" dish should show a cream sauce, not a red tomato sauce)
- Is it clearly food and not a stock photo of something unrelated?

Respond ONLY with JSON, no prose:
{"confidence":85,"match":true,"issue":null}
or
{"confidence":42,"match":false,"issue":"Image shows tofu bowl, title says steak bowl"}`,
        },
      ],
    }],
  });

  const raw     = msg.content[0].text.trim();
  const cleaned = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON in response: ${raw.slice(0, 100)}`);
    parsed = JSON.parse(match[0]);
  }

  return {
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    match:      parsed.match === true,
    issue:      parsed.issue ?? null,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`audit-recipe-images — threshold: ${CONFIDENCE_THRESHOLD} | mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  const PAGE = 200;
  let offset = START_OFF;
  const all  = [];

  while (true) {
    const { data, error } = await sb
      .from('recipes')
      .select('id, title, image_url')
      .not('image_url', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`Fetched ${all.length} recipes with images${START_OFF > 0 ? ` (from offset ${START_OFF})` : ''}`);

  const recipes = isFinite(LIMIT) ? all.slice(0, LIMIT) : all;
  console.log(`Auditing ${recipes.length} images...\n`);

  let passed = 0, flagged = 0, errored = 0;
  const flaggedIds = [];

  for (let i = 0; i < recipes.length; i++) {
    const { id, title, image_url } = recipes[i];
    const label = `[${i + 1}/${recipes.length}] ${title.slice(0, 55).padEnd(55)}`;
    process.stdout.write(label);

    try {
      const result = await auditImage(title, image_url);

      if (result.match && result.confidence >= CONFIDENCE_THRESHOLD) {
        console.log(` ✓ ${result.confidence}`);
        passed++;
      } else {
        const issue = result.issue ?? `confidence ${result.confidence}`;
        console.log(` ✗ ${result.confidence} — ${issue}`);
        flaggedIds.push({ id, title, issue });

        if (!DRY_RUN) {
          const { error } = await sb
            .from('recipes')
            .update({ image_url: null, needs_image_review: true })
            .eq('id', id);
          if (error) console.log(`    (failed to null image_url: ${error.message})`);
        }
        flagged++;
      }
    } catch (err) {
      console.log(` ERROR: ${err.message.slice(0, 80)}`);
      errored++;
    }

    // Rate limit: ~3 req/s safe for Haiku, but image fetching adds latency
    if ((i + 1) % 20 === 0) await sleep(500);
  }

  console.log(`\n── Summary ──`);
  console.log(`  Passed              : ${passed}`);
  console.log(`  Flagged (nulled)    : ${flagged}`);
  console.log(`  Errors              : ${errored}`);

  if (flaggedIds.length > 0) {
    console.log(`\n── Flagged recipes ──`);
    flaggedIds.forEach(r => console.log(`  ✗ ${r.title}\n    ${r.issue}`));
    if (!DRY_RUN) {
      console.log(`\nimage_url nulled for all flagged recipes.`);
      console.log(`Next: node scripts/generate-images.mjs --missing`);
    }
  }

  if (DRY_RUN) console.log('\nDry run — no writes made.');
}

main();
