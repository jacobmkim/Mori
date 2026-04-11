/**
 * Vercel Cron: /api/cron/taste-notifications
 * Runs on the 1st of each month at 09:00 UTC.
 *
 * Regenerates taste profiles for all eligible users so that
 * the next time they open the app, the in-app update modal fires.
 *
 * Trigger manually: GET /api/cron/taste-notifications
 * with Authorization: Bearer <SEED_SECRET>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

function verifyCronAuth(req: VercelRequest): boolean {
  const auth = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const seedSecret = process.env.SEED_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (seedSecret && auth === `Bearer ${seedSecret}`) return true;
  return false;
}

async function buildTasteProfileText(
  userId: string,
  sb: SupabaseClient,
  anthropic: Anthropic,
): Promise<string | null> {
  const [profileRes, swipesRes, interactionsRes] = await Promise.all([
    sb.from('profiles')
      .select('dietary_goals, cuisine_preferences, eating_style, skill_level')
      .eq('id', userId).single(),
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

  if (swipes.length < 5) return null;

  const rightSwipeIds = swipes.filter((s) => s.direction === 'right').map((s) => s.recipe_id);
  const cookedIds = interactions.filter((i) => i.interaction_type === 'cooked').map((i) => i.recipe_id);
  const groceryIds = interactions.filter((i) => i.interaction_type === 'grocery_add').map((i) => i.recipe_id);
  const allSignalIds = [...new Set([...rightSwipeIds.slice(0, 20), ...cookedIds, ...groceryIds])];

  const { data: signalRecipes } = await sb
    .from('recipes').select('id, title').in('id', allSignalIds.slice(0, 30));

  const likedTitles = signalRecipes?.filter((r) => rightSwipeIds.includes(r.id)).map((r) => r.title) ?? [];
  const cookedTitles = signalRecipes?.filter((r) => cookedIds.includes(r.id)).map((r) => r.title) ?? [];
  const groceryTitles = signalRecipes?.filter((r) => groceryIds.includes(r.id)).map((r) => r.title) ?? [];

  const prompt = `You are writing a punchy taste profile for a recipe discovery app called Mori.

User data:
- Cuisines they like: ${profile?.cuisine_preferences?.join(', ') || 'not specified'}
- Dietary goals: ${profile?.dietary_goals?.join(', ') || 'none'}
- Eating style: ${profile?.eating_style || 'not set'}
- Skill level: ${profile?.skill_level || 'not set'}
- Liked recipes: ${likedTitles.slice(0, 8).join(', ') || 'none yet'}
- Actually cooked: ${cookedTitles.slice(0, 5).join(', ') || 'none yet'}
- Added to grocery list: ${groceryTitles.slice(0, 5).join(', ') || 'none yet'}

Write 1-2 sentences (max 35 words) in second person. Be playful and specific — like a friend affectionately summing up their food personality. Focus on what makes them unique. No filler, no lists.

Example tone: "You're a weeknight Asian food obsessive who actually follows through — your grocery list doesn't lie."
Do NOT copy the example. Write something fresh based on their data.`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  });

  return (message.content[0] as { text: string }).text.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!verifyCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const sb = getSupabase();
  const anthropic = new Anthropic({ apiKey });

  // Users who haven't had their profile refreshed in 30+ days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: users, error } = await sb
    .from('profiles')
    .select('id, taste_profile')
    .or(`taste_profile->generated_at.is.null,taste_profile->>generated_at.lt.${thirtyDaysAgo}`);

  if (error) return res.status(500).json({ error: 'Failed to fetch users' });
  if (!users?.length) return res.status(200).json({ processed: 0, updated: 0 });

  const results = { processed: users.length, updated: 0, skipped: 0, errors: 0 };

  for (const user of users) {
    try {
      const newText = await buildTasteProfileText(user.id, sb, anthropic);
      if (!newText) { results.skipped++; continue; }

      await sb.from('profiles').update({
        taste_profile: { text: newText, generated_at: new Date().toISOString() },
      }).eq('id', user.id);

      results.updated++;
      await new Promise((resolve) => setTimeout(resolve, 1000)); // pace Claude calls
    } catch {
      results.errors++;
    }
  }

  return res.status(200).json(results);
}
