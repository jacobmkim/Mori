import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser, getClientIP } from './rateLimit';
import { validate, RecommendationsRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth, handleAuthError } from './apiAuth';

// POST /api/recommendations
// Claude Sonnet ranks recipes for a user based on all available signals.
// Called when the Discover screen needs a new deck.
// Cold start (<10 swipes): uses cohort affinity scores instead of personal history.
//
// Auth: Required (JWT bearer token)
// Rate limit: 10 requests per user per day
//
// Body: { userId: string, mode: 'meal_prep' | 'spontaneous', limit?: number }
// Returns: { recipeIds: string[], source: 'personalised' | 'cohort' | 'default' }

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Authentication ────────────────────────────────────────────────────
    const authUserId = await requireAuth(req);

    // ── Input Validation ──────────────────────────────────────────────────
    const body = await validate(RecommendationsRequestSchema, req.body);
    const { userId, mode, limit } = body;

    // Ensure user can only request recommendations for themselves
    if (userId !== authUserId) {
      return res.status(403).json({ error: 'Cannot request recommendations for another user' });
    }

    // ── Rate Limiting ─────────────────────────────────────────────────────
    const rateLimitResult = await rateLimitUser(userId, 'recommendations', 10, 86400); // 10/day
    if (!rateLimitResult.success) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter || 3600);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt,
      });
    }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const sb = getSupabase();

  try {
    // ── 1. Fetch user context ──────────────────────────────────────────────────

    const [profileRes, swipesRes, interactionsRes, pantryRes, cohortRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).single(),
      sb.from('swipe_events')
        .select('recipe_id, direction, mode, time_of_day, day_of_week, swiped_at')
        .eq('user_id', userId)
        .order('swiped_at', { ascending: false })
        .limit(50),
      // Count interactions per recipe — frequency is the signal
      sb.from('recipe_interactions')
        .select('recipe_id, interaction_type')
        .eq('user_id', userId),
      sb.from('pantry_items')
        .select('ingredient_name')
        .eq('user_id', userId),
      sb.from('user_cohorts')
        .select('cohort_key')
        .eq('user_id', userId)
        .order('assigned_at', { ascending: false })
        .limit(1),
    ]);

    const profile = profileRes.data;
    const swipes = swipesRes.data ?? [];
    const interactions = interactionsRes.data ?? [];
    const pantry = pantryRes.data ?? [];
    const cohortKey = cohortRes.data?.[0]?.cohort_key ?? null;

    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const swipeCount = swipes.length;
    const isColdStart = swipeCount < 10;

    // ── 2. Cold start: use cohort affinity scores ──────────────────────────────

    if (isColdStart && cohortKey) {
      const { data: affinities } = await sb
        .from('recipe_cohort_affinities')
        .select('recipe_id, affinity_score')
        .eq('cohort_key', cohortKey)
        .order('affinity_score', { ascending: false })
        .limit(limit * 3); // over-fetch to allow dietary filtering client-side

      if (affinities && affinities.length > 0) {
        // Shuffle top tier (score > 0.7) to avoid identical stacks for same cohort
        const topTier = affinities.filter((a) => a.affinity_score > 0.7);
        const rest = affinities.filter((a) => a.affinity_score <= 0.7);
        const shuffled = [...topTier.sort(() => Math.random() - 0.5), ...rest];
        const recipeIds = shuffled.slice(0, limit).map((a) => a.recipe_id);
        return res.status(200).json({ recipeIds, source: 'cohort' });
      }
    }

    // ── 3. Personalised: build signal summary for Claude ──────────────────────

    // Aggregate interaction counts per recipe
    const interactionCounts: Record<string, { grocery_add: number; view: number; cooked: number }> = {};
    for (const i of interactions) {
      if (!interactionCounts[i.recipe_id]) {
        interactionCounts[i.recipe_id] = { grocery_add: 0, view: 0, cooked: 0 };
      }
      interactionCounts[i.recipe_id][i.interaction_type as keyof typeof interactionCounts[string]]++;
    }

    // Fetch recipe titles for context (right swipes + top interactions)
    const rightSwipeIds = swipes.filter((s) => s.direction === 'right').map((s) => s.recipe_id);
    const highInteractionIds = Object.entries(interactionCounts)
      .filter(([, c]) => c.grocery_add > 0 || c.cooked > 0)
      .map(([id]) => id);
    const contextIds = [...new Set([...rightSwipeIds.slice(0, 15), ...highInteractionIds])];

    const { data: contextRecipes } = await sb
      .from('recipes')
      .select('id, title, cuisine, dietary_tags')
      .in('id', contextIds.slice(0, 20));

    // Fetch candidate recipes — TheMealDB only (verified ingredients + real images)
    const { data: candidates } = await sb
      .from('recipes')
      .select('id, title, cuisine, dietary_tags, macros, external_id, source_type')
      .not('external_id', 'is', null)
      .limit(300);

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ recipeIds: [], source: 'default' });
    }

    // Build left swipe set to exclude already-seen disliked recipes
    const leftSwipeIds = new Set(swipes.filter((s) => s.direction === 'left').map((s) => s.recipe_id));
    const filteredCandidates = candidates.filter((r) => !leftSwipeIds.has(r.id));

    // ── 4. Ask Claude to rank ──────────────────────────────────────────────────
    // Use numbered indices instead of UUIDs — Sonnet reliably outputs small
    // integers; we map back to Supabase IDs server-side after parsing.

    const pool = filteredCandidates.slice(0, 150);

    const client = new Anthropic({ apiKey });

    const prompt = `You are a recipe recommendation engine for Mori, a personalised recipe discovery app.

## User Profile
- Dietary goals: ${profile.dietary_goals?.join(', ') || 'none set'}
- Extra preferences: ${profile.dietary_extra_preferences || 'none'}
- Ingredient dislikes: ${profile.ingredient_dislikes?.join(', ') || 'none'}
- Cuisine preferences: ${profile.cuisine_preferences?.join(', ') || 'any'}
- Eating style: ${profile.eating_style || 'not set'}
- Skill level: ${profile.skill_level || 'not set'}
- App mode: ${mode}
- Pantry items: ${pantry.slice(0, 20).map((p) => p.ingredient_name).join(', ') || 'unknown'}

## Behaviour Signals
Liked recipes: ${contextRecipes?.filter((r) => rightSwipeIds.includes(r.id)).map((r) => r.title).join(', ') || 'none yet'}

Grocery-listed (strongest signal):
${Object.entries(interactionCounts).filter(([, c]) => c.grocery_add > 1).map(([id, c]) => {
  const r = contextRecipes?.find((r) => r.id === id);
  return r ? `  ${r.title} (${c.grocery_add}×)` : null;
}).filter(Boolean).join('\n') || '  none yet'}

Marked as cooked:
${Object.entries(interactionCounts).filter(([, c]) => c.cooked > 0).map(([id]) => {
  const r = contextRecipes?.find((r) => r.id === id);
  return r ? `  ${r.title}` : null;
}).filter(Boolean).join('\n') || '  none yet'}

## Candidate Recipes (number | title | cuisine)
${pool.map((r, i) => `${i + 1}. ${r.title} | ${r.cuisine || 'unknown'}`).join('\n')}

## Task
Pick the ${limit} best-matching recipes for this user, ranked best to worst.
- Prioritise cuisines and dishes they have liked
- Respect dietary goals strictly
- Exclude recipes with disliked ingredients (detectable from title)
- For "${mode}" mode: ${mode === 'meal_prep' ? 'prefer variety across cuisines for a full week' : 'prefer quick familiar meals'}
- Mix in 1-2 adjacent cuisines they haven't tried yet

Respond with JSON only — no other text:
{"indices": [3, 17, 42, ...], "reasoning": "2-3 sentence summary"}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    let indices: number[] = [];
    let reasoning: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      indices = parsed.indices ?? [];
      reasoning = parsed.reasoning ?? null;
    } catch {
      const match = raw.match(/\[[\s\S]*?\]/);
      try { indices = JSON.parse(match?.[0] ?? '[]'); } catch { indices = []; }
    }

    // Map 1-based indices back to Supabase UUIDs
    const filtered = indices
      .filter((n) => n >= 1 && n <= pool.length)
      .map((n) => pool[n - 1].id)
      .filter(Boolean)
      .slice(0, limit);

    const debug = {
      swipes: swipeCount,
      pool: pool.length,
      sonnet_returned: indices.length,
      valid: filtered.length,
    };

    if (reasoning && process.env.NODE_ENV === 'development') {
      console.log('[recommendations] reasoning:', reasoning);
    }

    return res.status(200).json({ recipeIds: filtered, source: 'personalised', reasoning, debug });
  } catch (err: unknown) {
    // Handle validation errors
    if (err instanceof ValidationError) {
      return res.status(400).json(formatValidationError(err));
    }

    // Handle auth errors (already formatted)
    if (err instanceof Error && err.name === 'AuthError') {
      return handleAuthError(err, res);
    }

    // Log to external service in production (not console)
    if (process.env.NODE_ENV === 'development') {
      const message = err instanceof Error ? err.message : 'Recommendation failed';
      console.error('[recommendations]', message);
    }

    return res.status(500).json({ error: 'Failed to generate recommendations' });
  }
}
