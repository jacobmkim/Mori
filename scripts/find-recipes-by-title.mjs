// Find recipes by title (case-insensitive, fuzzy via ilike).
// Outputs id, title, and image_url for each match.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const sb = createClient(envVars['EXPO_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY']);

const TITLES = [
  'High Protein Chicken Caesar Lettuce Wraps',
  '15-Minute Asian Chicken Salad',
  'Air Fryer Miso Glazed Cod',
  '15-Minute Salmon Rice Bowls',
  'Crunchy Cabbage and Edamame Salad',
];

for (const title of TITLES) {
  // Try exact (case-insensitive) first.
  let { data, error } = await sb
    .from('recipes')
    .select('id, title, image_url')
    .ilike('title', title)
    .limit(5);

  // Fallback: fuzzy match on a distinctive substring.
  if ((!data || data.length === 0)) {
    const key = title.split(' ').slice(-2).join(' '); // last two words
    ({ data, error } = await sb
      .from('recipes')
      .select('id, title, image_url')
      .ilike('title', `%${key}%`)
      .limit(5));
  }

  console.log(`\n=== ${title} ===`);
  if (error) { console.log('  ERROR:', error.message); continue; }
  if (!data || data.length === 0) { console.log('  (no match)'); continue; }
  for (const r of data) {
    console.log(`  ${r.title}`);
    console.log(`    id: ${r.id}`);
    console.log(`    image_url: ${r.image_url || '(none)'}`);
  }
}
