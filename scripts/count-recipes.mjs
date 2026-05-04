// Reports live recipe counts from Supabase.
//
// Usage:
//   node scripts/count-recipes.mjs
//
// Reports:
//   - Total recipes
//   - Curated (submitted_by IS NULL)
//   - Community public+approved (user-visible)
//   - Community pending/rejected/private (not user-visible)

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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ────────────────────────────────────────────────────────────────────

async function countWith(builderFn) {
  // builderFn receives the base query and applies filters; we use head + count: 'exact'
  const base = sb.from('recipes').select('*', { count: 'exact', head: true });
  const { count, error } = await builderFn(base);
  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }
  return count ?? 0;
}

// ── Counts ─────────────────────────────────────────────────────────────────────

const total = await countWith(q => q);

const curated = await countWith(q => q.is('submitted_by', null));

const communityVisible = await countWith(q =>
  q.not('submitted_by', 'is', null).eq('is_public', true).eq('moderation_status', 'approved')
);

const communityHidden = await countWith(q =>
  q.not('submitted_by', 'is', null).or('is_public.eq.false,moderation_status.neq.approved')
);

// Sanity: communityVisible + communityHidden should equal total community
const communityAll = await countWith(q => q.not('submitted_by', 'is', null));

// ── Report ─────────────────────────────────────────────────────────────────────

console.log('');
console.log('Mori recipes — live counts');
console.log('──────────────────────────────────────');
console.log(`Total recipes:                 ${total}`);
console.log(`  Curated (submitted_by NULL): ${curated}`);
console.log(`  Community (all):             ${communityAll}`);
console.log(`    Public + approved:         ${communityVisible}`);
console.log(`    Pending/rejected/private:  ${communityHidden}`);
console.log('──────────────────────────────────────');
console.log('');
