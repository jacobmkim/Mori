import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// POST /api/waitlist
// Saves a waitlist email to Supabase.
// Body: { email: string }
// Returns: { success: true } or { error: string }
//
// Requires this table in Supabase:
//   create table waitlist (
//     id uuid primary key default gen_random_uuid(),
//     email text not null unique,
//     created_at timestamp with time zone default now()
//   );

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server misconfigured' });

  const sb = createClient(url, key);
  const { error } = await sb
    .from('waitlist')
    .insert({ email: email.toLowerCase().trim() })
    .single();

  if (error) {
    // Duplicate email — treat as success so we don't leak whether they're on the list
    if (error.code === '23505') return res.status(200).json({ success: true });
    return res.status(500).json({ error: 'Failed to save email' });
  }

  return res.status(200).json({ success: true });
}
