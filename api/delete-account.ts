/**
 * Account deletion endpoint — Apple Guideline 5.1.1(v) compliance.
 *
 * POST /api/delete-account
 *   Authed (JWT). Body: { password: string }.
 *   Re-verifies the user's password (anti-theft guard), then hard-deletes:
 *     - All private user data (swipes, saves, pantry, plans, interactions, etc.)
 *     - User-submitted public recipes are de-attributed and soft-deleted (avoids
 *       breaking referential integrity for OTHER users who saved/cooked them,
 *       while removing the submitter's identity from public view)
 *     - profiles row
 *     - auth.users row (via service-role admin API)
 *
 * Order matters — child rows must go before parents (we don't have ON DELETE
 * CASCADE on the schema-public foreign keys today). The supabase/add-account-
 * deletion.sql migration adds CASCADE to make this redundant; the explicit
 * deletes here remain as a defense-in-depth so this function works regardless
 * of whether that migration has been applied yet.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, AuthError } from './_apiAuth';
import { rateLimitUser } from './_rateLimit';
import { captureException } from './_sentry';

function getServiceClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getAnonClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Tables that store private user data — wiped on account deletion.
// Ordered so children precede parents; missing tables are tolerated (some
// migrations may not have been applied to every environment yet).
const USER_OWNED_TABLES = [
  'recipe_notes',
  'recipe_reviews',
  'recipe_flags',
  'recipe_interactions',
  'swipe_events',
  'saved_recipes',
  'pantry_items',
  'grocery_lists',
  'meal_plans',
  'collections',
  'user_cohorts',
  'user_leftovers',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    captureException(err);
    return res.status(500).json({ error: 'Authentication failed' });
  }

  const rl = await rateLimitUser(userId, 'delete-account', 5, 86400);
  if (!rl.success) {
    res.setHeader('Retry-After', rl.retryAfter ?? 3600);
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const body = (req.body ?? {}) as { password?: unknown };
  const password = typeof body.password === 'string' ? body.password : null;
  if (!password || password.length < 1) {
    return res.status(400).json({ error: 'Password required' });
  }

  const service = getServiceClient();
  const anon = getAnonClient();
  if (!service || !anon) {
    return res.status(500).json({ error: 'Service not configured' });
  }

  // Re-verify password against the user's email — anti-theft guard.
  const { data: userData, error: userErr } = await service.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userErr || !email) {
    captureException(userErr ?? new Error('delete-account: user has no email'));
    return res.status(500).json({ error: 'Account verification failed' });
  }

  const { error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Hard-delete private user data. Errors are logged but don't abort the
  // deletion — the user-facing promise is "your data is gone", and a partial
  // failure on a child row shouldn't block removing the auth user.
  for (const table of USER_OWNED_TABLES) {
    const { error } = await service.from(table).delete().eq('user_id', userId);
    if (error && error.code !== '42P01') {
      // 42P01 = relation does not exist (table not present in this env)
      captureException(new Error(`delete-account: ${table} delete failed — ${error.message}`));
    }
  }

  // De-attribute + soft-delete community recipes the user submitted. Hard-
  // deleting would orphan saved/cooked records for OTHER users. Apple accepts
  // de-attribution as removal of user-identifying content.
  {
    const { error } = await service
      .from('recipes')
      .update({ submitted_by: null, deleted_at: new Date().toISOString() })
      .eq('submitted_by', userId);
    if (error && error.code !== '42P01') {
      captureException(new Error(`delete-account: recipes de-attribution failed — ${error.message}`));
    }
  }

  // Delete waitlist entries by email (in case user joined waitlist before signup).
  {
    const { error } = await service.from('waitlist').delete().eq('email', email);
    if (error && error.code !== '42P01') {
      captureException(new Error(`delete-account: waitlist delete failed — ${error.message}`));
    }
  }

  // Profiles row — explicit delete in case the auth.users FK doesn't cascade.
  {
    const { error } = await service.from('profiles').delete().eq('id', userId);
    if (error && error.code !== '42P01') {
      captureException(new Error(`delete-account: profiles delete failed — ${error.message}`));
    }
  }

  // Finally, the auth user. After this the JWT is invalid.
  const { error: authDeleteErr } = await service.auth.admin.deleteUser(userId);
  if (authDeleteErr) {
    captureException(authDeleteErr);
    return res.status(500).json({ error: 'Account deletion failed. Contact hello@getmori.app.' });
  }

  return res.status(200).json({ ok: true });
}
