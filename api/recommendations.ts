import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// POST /api/recommendations
// Claude Sonnet ranks recipes for a user based on all available signals.
// Called when the Discover screen needs a new deck.
// Cold start (<10 swipes): uses cohort affinity scores instead of personal history.
//
// Body: { userId: string, mode: 'meal_prep' | 'spontaneous', limit?: number }
// Returns: { recipeIds: string[], source: 'personalised' | 'cohort' | 'default' }

interface RecommendRequest {
  userId: string;
  mode: 'meal_prep' | 'spontaneous';
  limit?: number;
}

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, mode, limit = 40 } = req.body as RecommendRequest;
  if (!userId) return res.status(400).json({ error: 'userId required' });

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

    // Fetch candidate recipes (all, dietary filtering happens client-side)
    const { data: candidates } = await sb
      .from('recipes')
      .select('id, title, cuisine, dietary_tags, macros')
      .not('external_id', 'is', null)
      .limit(200);

    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ recipeIds: [], source: 'default' });
    }

    // Build left swipe set to exclude already-seen disliked recipes
    const leftSwipeIds = new Set(swipes.filter((s) => s.direction === 'left').map((s) => s.recipe_id));
    const filteredCandidates = candidates.filter((r) => !leftSwipeIds.has(r.id));

    // ── 4. Ask Claude to rank ──────────────────────────────────────────────────

    const client = new Anthropic({ apiKey });

    const prompt = `You are a recipe recommendation engine for Mise, a personalised recipe discovery app.

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
Right-swiped recipes (liked): ${contextRecipes?.filter((r) => rightSwipeIds.includes(r.id)).map((r) => r.title).join(', ') || 'none yet'}

Grocery-listed (strongest signal — cooks these regularly):
${Object.entries(interactionCounts).filter(([, c]) => c.grocery_add > 1).map(([id, c]) => {
  const r = contextRecipes?.find((r) => r.id === id);
  return r ? `  ${r.title} (grocery-listed ${c.grocery_add}×)` : null;
}).filter(Boolean).join('\n') || '  none yet'}

Marked as cooked:
${Object.entries(interactionCounts).filter(([, c]) => c.cooked > 0).map(([id]) => {
  const r = contextRecipes?.find((r) => r.id === id);
  return r ? `  ${r.title}` : null;
}).filter(Boolean).join('\n') || '  none yet'}

## Candidate Recipes (id | title | cuisine)
${filteredCandidates.slice(0, 100).map((r) => `${r.id} | ${r.title} | ${r.cuisine || 'unknown'}`).join('\n')}

## Task
Return the ${limit} recipe IDs that best match this user, ranked from best to worst match.
- Prioritise cuisines they've liked and their eating style
- Respect dietary goals strictly (e.g. vegan users must not see meat recipes)
- Exclude any recipes with disliked ingredients if detectable from the title
- For "${mode}" mode: ${mode === 'meal_prep' ? 'prefer variety across cuisines for a full week' : 'prefer quick meals matching the current context'}
- Introduce 1-2 "adjacent" cuisines they haven't seen yet if they have enough signal

Respond with a JSON array of recipe IDs only — no explanation:
["id1", "id2", "id3", ...]`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    let recipeIds: string[];
    try {
      recipeIds = JSON.parse(raw);
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      recipeIds = JSON.parse(match?.[0] ?? '[]');
    }

    // Validate — only return IDs that exist in our candidates
    const validIds = new Set(filteredCandidates.map((r) => r.id));
    const filtered = recipeIds.filter((id) => validIds.has(id));

    return res.status(200).json({ recipeIds: filtered, source: 'personalised' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Recommendation failed';
    console.error('[recommendations]', message);
    return res.status(500).json({ error: message });
  }
}
