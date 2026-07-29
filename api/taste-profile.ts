import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { rateLimitUser } from './_rateLimit';
import { validate, TasteProfileRequestSchema, ValidationError, formatValidationError } from '../lib/validation';
import { requireAuth } from './_apiAuth';
import { isPremiumUserId } from './_requirePremium';
import { checkAiBudget, incrementAiUsage } from './_aiUsage';
import { captureException, flushSentry } from './_sentry';

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

    // ── AI budget (free: 1 refresh/month — the manual button's credit; the monthly cron
    // regenerates stale profiles server-side without touching it, and the client auto-
    // refresh is premium-only so it can't spend this in the background). Checked before
    // any data fetch or Claude spend; the not_enough_data early-return below never
    // increments. premium === null (lookup failed) skips the gate — never 402 a possible
    // payer on a transient read; rate limits still bound it.
    const premium = await isPremiumUserId(userId);
    if (premium !== null) {
      const budget = await checkAiBudget(userId, 'taste-profile', premium);
      if (!budget.allowed) {
        return res.status(402).json({
          error: 'Monthly free AI limit reached',
          code: 'ai_budget_exhausted',
          limit: budget.limit,
        });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const sb = getSupabase();

    // Fetch signal data in parallel
    const [profileRes, swipesRes, interactionsRes, savedRes] = await Promise.all([
      sb.from('profiles').select('dietary_goals, cuisine_preferences, eating_style, skill_level').eq('id', userId).single(),
      sb.from('swipe_events')
        .select('recipe_id, direction')
        .eq('user_id', userId)
        .order('swiped_at', { ascending: false })
        .limit(100),
      sb.from('recipe_interactions')
        .select('recipe_id, interaction_type')
        .eq('user_id', userId),
      // Saves live in saved_recipes — there is no 'save' interaction_type (the CHECK allows
      // only view/grocery_add/cooked/unsave), so filtering interactions for it always returned
      // an empty list and EVERY user's follow-through read "0 of 0 saved recipes / 0%".
      sb.from('saved_recipes').select('recipe_id').eq('user_id', userId),
    ]);

    const profile = profileRes.data;
    const swipes = swipesRes.data ?? [];
    const interactions = interactionsRes.data ?? [];
    const savedRows = savedRes.data ?? [];

    if (swipes.length < 5) {
      return res.status(200).json({ tasteProfile: null, reason: 'not_enough_data' });
    }

    // Fetch titles for liked/cooked/skipped recipes
    const rightSwipeIds = swipes.filter((s) => s.direction === 'right').map((s) => s.recipe_id);
    const leftSwipeIds = swipes.filter((s) => s.direction === 'left').map((s) => s.recipe_id);
    const cookedIds = interactions.filter((i) => i.interaction_type === 'cooked').map((i) => i.recipe_id);
    const groceryIds = interactions.filter((i) => i.interaction_type === 'grocery_add').map((i) => i.recipe_id);
    const savedIds = savedRows.map((r: any) => r.recipe_id).filter(Boolean);

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

    const followThroughPct = savedIds.length > 0 ? Math.round((cookedIds.length / savedIds.length) * 100) : 0;

    const client = new Anthropic({ apiKey });

    const prompt = `You are writing a taste profile for Mori, a recipe discovery app. It will be shared as an image on social media — write something people want to screenshot and send to a friend.

Tone: casual, specific, a little funny. Spotify Wrapped energy — sharp and true.

User behaviour signals:
- Cuisines they prefer: ${profile?.cuisine_preferences?.join(', ') || 'not specified'}
- Dietary goals: ${profile?.dietary_goals?.join(', ') || 'none'}
- Eating style: ${profile?.eating_style || 'not set'}
- Skill level: ${profile?.skill_level || 'not set'}
- Recipes liked: ${likedTitles.slice(0, 8).join(', ') || 'none yet'}
- Actually cooked: ${cookedTitles.slice(0, 5).join(', ') || 'none yet'}
- Added to grocery list: ${groceryTitles.slice(0, 5).join(', ') || 'none yet'}
- Consistently skipped: ${leftTitles.slice(0, 5).join(', ') || 'none'}
- Distinct cuisines liked: ${uniqueCuisines}
- Total saves: ${savedIds.length} | Total cooks: ${cookedIds.length} | Grocery adds: ${groceryIds.length}
- Follow-through rate: ${followThroughPct}% of saved recipes actually cooked

Write exactly 1 sentence for "tasteProfile". Max 12 words. Second person. Punchy, funny, true — the "mori says" punchline. Name a specific dish, cuisine, or behaviour pattern. No em-dashes, no colons, no "you are someone who."

Examples (do NOT copy): "Japanese food, but only the noodle section." / "The pasta always wins." / "Saves everything. Cooks selectively." / "Meal prep Sunday is not a joke."

Also return a Cook DNA object with 5 behaviour-based dimensions — these work for every diet.

Return ONLY valid JSON, no markdown:
{
  "tasteProfile": "<1-sentence punchline>",
  "flavourDna": {
    "explorer":     { "score": <0-100>, "note": "<max 7 words, lowercase, wry>" },
    "committed":    { "score": <0-100>, "note": "<max 7 words>" },
    "speed":        { "score": <0-100>, "note": "<max 7 words>" },
    "planner":      { "score": <0-100>, "note": "<max 7 words>" },
    "devoted":      { "score": <0-100>, "note": "<max 7 words>" }
  }
}

Dimension scoring:
- explorer: cuisine breadth. 1 cuisine = ~15, 3 = ~50, 5+ = ~85. Note names the range or obsession.
- committed: follow-through. ${followThroughPct}% cooked/saved → score proportionally. Note references the ratio wryly.
- speed: preference for fast cooking. quick_simple style + short recipes → high. elaborate cooking → low.
- planner: grocery list + meal prep signals. ${groceryIds.length} grocery adds, meal_prep saves → higher.
- devoted: depth on one cuisine vs. wide ranging. Inverse of explorer — narrow = high, wide = low.

Note style: "5 cuisines, no loyalty" / "cooks 1 in 4 saves" / "30 min or nothing" / "the grocery list is a diary" / "miso soup era, ongoing"`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let tasteProfile: string;
    let flavourDna: Record<string, { score: number; note: string }> | undefined;
    try {
      const parsed = JSON.parse(cleaned);
      tasteProfile = parsed.tasteProfile ?? cleaned;
      flavourDna = parsed.flavourDna;
    } catch {
      tasteProfile = cleaned;
    }

    // Save to profile. supabase-js does NOT throw — the error rides in the result.
    const { error: saveErr } = await sb.from('profiles').update({
      taste_profile: { text: tasteProfile, flavourDna, generated_at: new Date().toISOString() },
    }).eq('id', userId);

    if (saveErr) {
      // The gen never persisted — do NOT bill it. A free user's single monthly credit
      // must survive a failed save so a retry can actually land the profile. Still
      // return the text so this session isn't degraded.
      captureException(new Error(`taste-profile save failed: ${saveErr.code ?? 'unknown'}`));
      await flushSentry();
      return res.status(200).json({ tasteProfile, flavourDna });
    }

    // Count the successful gen (never on failure — and only once SAVED). Premium usage
    // goes into a separate ':premium' bucket (fair-use accounting) so a mid-month
    // downgrader's free bucket stays clean; unknown premium isn't counted. A failed
    // count never blocks the profile we already generated + saved.
    if (premium !== null) {
      try {
        await incrementAiUsage(userId, premium ? 'taste-profile:premium' : 'taste-profile');
      } catch (e) {
        captureException(e);
        await flushSentry();
      }
    }

    return res.status(200).json({ tasteProfile, flavourDna });
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
