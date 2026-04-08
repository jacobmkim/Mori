import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser } from '../lib/rateLimit';
import { validate, TasteProfileRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from '../lib/apiAuth';

// POST /api/taste-profile
// Reads a user's swipe + interaction history and generates a 2-3 sentence
// taste profile paragraph. Saves the result to profiles.taste_profile.
//
// Auth: Required (JWT bearer token)
// Rate limit: 5 requests per user per day
//
// Body: { userId: string }
// Returns: { tasteProfile: string }

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
    const body = await validate(TasteProfileRequestSchema, req.body);
    const { userId } = body;

    // Ensure user can only request taste profile for themselves
    if (userId !== authUserId) {
      return res.status(403).json({ error: 'Cannot request taste profile for another user' });
    }

    // ── Rate Limiting (5 calls per user per day) ──────────────────────────
    const rateLimitResult = await rateLimitUser(userId, 'taste-profile', 5, 86400);
    if (!rateLimitResult.success) {
      res.setHeader('Retry-After', rateLimitResult.retryAfter || 3600);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const sb = getSupabase();

    // Fetch signal data in parallel
    const [profileRes, swipesRes, interactionsRes] = await Promise.all([
      sb.from('profiles').select('dietary_goals, cuisine_preferences, eating_style, skill_level').eq('id', userId).single(),
      sb.from('swipe_events')
        .select('recipe_id, direction')
        .eq('user_id', userId)
        .order('swiped_at', { ascending: false })
        .limit(100),
      sb.from('recipe_interactions')
        .select('recipe_id, interaction_type')
        .eq('user_id', userId),
    ]);

    const profile = profileRes.data;
    const swipes = swipesRes.data ?? [];
    const interactions = interactionsRes.data ?? [];

    if (swipes.length < 5) {
      return res.status(200).json({ tasteProfile: null, reason: 'not_enough_data' });
    }

    // Fetch titles for liked/cooked recipes
    const rightSwipeIds = swipes.filter((s) => s.direction === 'right').map((s) => s.recipe_id);
    const cookedIds = interactions.filter((i) => i.interaction_type === 'cooked').map((i) => i.recipe_id);
    const groceryIds = interactions.filter((i) => i.interaction_type === 'grocery_add').map((i) => i.recipe_id);

    const allSignalIds = [...new Set([...rightSwipeIds.slice(0, 20), ...cookedIds, ...groceryIds])];

    const { data: signalRecipes } = await sb
      .from('recipes')
      .select('id, title, cuisine')
      .in('id', allSignalIds.slice(0, 30));

    const likedTitles = signalRecipes
      ?.filter((r) => rightSwipeIds.includes(r.id))
      .map((r) => r.title) ?? [];
    const cookedTitles = signalRecipes
      ?.filter((r) => cookedIds.includes(r.id))
      .map((r) => r.title) ?? [];
    const groceryTitles = signalRecipes
      ?.filter((r) => groceryIds.includes(r.id))
      .map((r) => r.title) ?? [];

    const client = new Anthropic({ apiKey });

    const prompt = `You are summarising a home cook's taste profile for a recipe discovery app called Mori.

User data:
- Dietary goals: ${profile?.dietary_goals?.join(', ') || 'none set'}
- Favourite cuisines: ${profile?.cuisine_preferences?.join(', ') || 'not specified'}
- Eating style: ${profile?.eating_style || 'not set'}
- Skill level: ${profile?.skill_level || 'not set'}
- Total swipes: ${swipes.length} (${rightSwipeIds.length} liked, ${swipes.length - rightSwipeIds.length} passed)
- Recipes saved/liked: ${likedTitles.slice(0, 10).join(', ') || 'none yet'}
- Recipes added to grocery list: ${groceryTitles.slice(0, 8).join(', ') || 'none yet'}
- Recipes marked as cooked: ${cookedTitles.slice(0, 8).join(', ') || 'none yet'}

Write a 2-3 sentence taste profile in second person ("You tend to...") that captures:
1. What cuisines and flavour profiles they love
2. Their cooking style (quick weeknight meals? weekend cook? comfort food fan?)
3. Any pattern in what they actually cook vs just save

Be warm, specific, and conversational — like a friend describing their cooking personality.
Do NOT just list the data back. Synthesise it into a genuine description.
Keep it under 60 words.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const tasteProfile = (message.content[0] as { text: string }).text.trim();

    // Save to profile
    await sb.from('profiles').update({ taste_profile: { text: tasteProfile, generated_at: new Date().toISOString() } }).eq('id', userId);

    return res.status(200).json({ tasteProfile });
  } catch (err: unknown) {
    // Handle validation errors
    if (err instanceof ValidationError) {
      return res.status(400).json(formatValidationError(err));
    }

    // Handle auth errors
    if (err instanceof Error && err.name === 'AuthError') {
      const statusCode = (err as any).statusCode || 401;
      return res.status(statusCode).json({ error: err.message });
    }

    // Log to external service in production (not console)
    if (process.env.NODE_ENV === 'development') {
      const message = err instanceof Error ? err.message : 'Failed to generate taste profile';
      console.error('[taste-profile]', message);
    }

    return res.status(500).json({ error: 'Failed to generate taste profile' });
  }
}
