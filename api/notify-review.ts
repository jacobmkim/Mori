/**
 * POST /api/notify-review
 *
 * Transactional push fired after a user submits a review on a recipe whose
 * submitter is a different Mori user. Called fire-and-forget by submitReview
 * in lib/api.ts. Idempotency guard: we look up the review by id and only fire
 * when it was just created (created_at within the last 60s) — so a malicious
 * client can't replay this against old reviews to spam a creator.
 *
 * Auth: JWT (review.user_id must match the authenticated user — IDOR guard).
 * Rate-limit: 30 calls/hour/user — generous; bounded so a script kiddie can't
 * burn through Expo's push budget.
 *
 * Opt-out: respects the submitter's `notify_creator_events` flag (the same
 * flag that gates creator-milestones pushes).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, handleAuthError, AuthError } from './_apiAuth';
import { rateLimitUser } from './_rateLimit';
import { sendExpoPush } from './_pushUtils';

// Window during which a freshly-submitted review can fire a push. Anything
// older is presumed to have already been notified or was edited later, in
// which case we don't want to re-spam the creator.
const FRESH_WINDOW_MS = 60_000;

function getServiceRoleSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    return handleAuthError(err, res);
  }

  const rl = await rateLimitUser(userId, 'notify-review', 30, 3600);
  if (!rl.success) return res.status(429).json({ error: 'Rate limit exceeded' });

  const reviewId = typeof req.body?.reviewId === 'string' ? req.body.reviewId : null;
  if (!reviewId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId)) {
    return res.status(400).json({ error: 'Invalid reviewId' });
  }

  const sb = getServiceRoleSupabase();

  const { data: review, error: reviewErr } = await sb
    .from('recipe_reviews')
    .select('id, user_id, recipe_id, rating, review_text, created_at, reviewer:profiles_public!recipe_reviews_user_id_fkey(name, username)')
    .eq('id', reviewId)
    .maybeSingle();

  if (reviewErr || !review) return res.status(404).json({ error: 'Review not found' });

  // IDOR — only the review's author can trigger its push. Without this an
  // attacker with a valid JWT could fire pushes for any review id they guess.
  if (review.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

  // Replay guard. Editing a review (updated_at moves forward but created_at
  // stays) won't refire because the freshness check is against created_at.
  const createdMs = new Date(review.created_at).getTime();
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > FRESH_WINDOW_MS) {
    return res.status(200).json({ skipped: 'stale' });
  }

  const { data: recipe, error: recipeErr } = await sb
    .from('recipes')
    .select('id, title, submitted_by')
    .eq('id', review.recipe_id)
    .maybeSingle();

  if (recipeErr || !recipe || !recipe.submitted_by) {
    return res.status(200).json({ skipped: 'no_submitter' });
  }

  // Self-review (creator reviews their own recipe). Don't push.
  if (recipe.submitted_by === userId) {
    return res.status(200).json({ skipped: 'self_review' });
  }

  const { data: creator } = await sb
    .from('profiles')
    .select('push_token, notify_creator_events')
    .eq('id', recipe.submitted_by)
    .maybeSingle();

  if (!creator?.push_token || creator.notify_creator_events === false) {
    return res.status(200).json({ skipped: 'opted_out' });
  }

  // Reviewer display name — prefer @username, fall back to name, fall back to
  // a generic "Someone" so we never leak `null` into the push body.
  const reviewerRel = Array.isArray(review.reviewer) ? review.reviewer[0] : review.reviewer;
  const reviewerLabel = reviewerRel?.username
    ? `@${reviewerRel.username}`
    : reviewerRel?.name
      ? reviewerRel.name
      : 'Someone';

  const stars = '★'.repeat(Math.max(1, Math.min(5, review.rating)));
  const title = `${stars} ${reviewerLabel} reviewed your recipe`;
  const body = review.review_text
    ? `"${review.review_text.slice(0, 90)}${review.review_text.length > 90 ? '…' : ''}" — ${recipe.title}`
    : `Tap to see what ${reviewerLabel} said about ${recipe.title}.`;

  await sendExpoPush({
    to: creator.push_token,
    title,
    body,
    data: { type: 'review_received', recipe_id: recipe.id, review_id: review.id },
  });

  return res.status(200).json({ sent: 1 });
}
