import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser } from './_rateLimit';
import { validate, TasteProfileRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './_apiAuth';
import { captureException } from './_sentry';

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

    // Fetch titles for liked/cooked/skipped recipes
    const rightSwipeIds = swipes.filter((s) => s.direction === 'right').map((s) => s.recipe_id);
    const leftSwipeIds = swipes.filter((s) => s.direction === 'left').map((s) => s.recipe_id);
    const cookedIds = interactions.filter((i) => i.interaction_type === 'cooked').map((i) => i.recipe_id);
    const groceryIds = interactions.filter((i) => i.interaction_type === 'grocery_add').map((i) => i.recipe_id);
    const savedIds = interactions.filter((i) => i.interaction_type === 'save').map((i) => i.recipe_id);

    const allSignalIds = [...new Set([
      ...rightSwipeIds.slice(0, 20),
      ...leftSwipeIds.slice(0, 10),
      ...cookedIds,
      ...groceryIds,
    ])];

    const { data: signalRecipes } = await sb
      .from('recipes')
      .select('id, title, cuisine')
      .in('id', allSignalIds.slice(0, 40));

    const likedTitles = signalRecipes?.filter((r) => rightSwipeIds.includes(r.id)).map((r) => r.title) ?? [];
    const leftTitles = signalRecipes?.filter((r) => leftSwipeIds.includes(r.id)).map((r) => r.title) ?? [];
    const cookedTitles = signalRecipes?.filter((r) => cookedIds.includes(r.id)).map((r) => r.title) ?? [];
    const groceryTitles = signalRecipes?.filter((r) => groceryIds.includes(r.id)).map((r) => r.title) ?? [];

    const uniqueCuisines = [...new Set(
      signalRecipes?.filter((r) => rightSwipeIds.includes(r.id) && r.cuisine).map((r) => r.cuisine) ?? []
    )].length;
    const followThroughNote = cookedIds.length > 0 && savedIds.length > 0
      ? `followed through on ${cookedIds.length} of ${savedIds.length} saved recipes`
      : cookedIds.length > 0 ? `actually cooked ${cookedIds.length} recipe${cookedIds.length > 1 ? 's' : ''}` : null;

    const client = new Anthropic({ apiKey });

    const prompt = `You are writing a taste profile for a recipe discovery app called Mori. The tone: a sharp, warm friend who's been quietly watching your cooking habits — perceptive, specific, a little surprising. Never generic, never vague.

User signals:
- Cuisines they prefer: ${profile?.cuisine_preferences?.join(', ') || 'not specified'}
- Dietary goals: ${profile?.dietary_goals?.join(', ') || 'none'}
- Eating style: ${profile?.eating_style || 'not set'}
- Skill level: ${profile?.skill_level || 'not set'}
- Recipes they liked: ${likedTitles.slice(0, 8).join(', ') || 'none yet'}
- Actually cooked: ${cookedTitles.slice(0, 5).join(', ') || 'none yet'}
- Added to grocery list: ${groceryTitles.slice(0, 5).join(', ') || 'none yet'}
- Consistently skipped: ${leftTitles.slice(0, 5).join(', ') || 'none'}
- Cuisine variety score: ${uniqueCuisines} different cuisines liked
${followThroughNote ? `- Follow-through: ${followThroughNote}` : ''}

Write exactly 2 sentences, max 50 words, second person. Name actual dishes or cuisines from their data — never write vague things like "Asian food" or "healthy options." The first sentence should feel like a real observation someone made. The second should land like a quiet revelation — something they sensed but never named.

Rotate your angle each generation (pick one that fits the data best):
• What they quietly obsess over vs what they claimed to want
• What they consistently skip inside a cuisine they say they love
• The gap between what they save and what they actually cook
• A contradiction between two parts of their stated identity
• How narrow or surprisingly wide their real range is
• What their skipped recipes reveal that their preferences don't

Example tone (do NOT copy): "You've been slowly reverse-engineering every Thai noodle dish that exists, save by save. What's interesting is you've never once touched anything green curry adjacent — even when it's right there."`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      temperature: 1,
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

    captureException(err);
    return res.status(500).json({ error: 'Failed to generate taste profile' });
  }
}
