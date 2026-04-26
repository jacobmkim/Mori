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
  const savedIds = interactions.filter((i) => i.interaction_type === 'save').map((i) => i.recipe_id);
  const allSignalIds = [...new Set([...rightSwipeIds.slice(0, 20), ...cookedIds, ...groceryIds])];

  const { data: signalRecipes } = await sb
    .from('recipes').select('id, title, cuisine').in('id', allSignalIds.slice(0, 30));

  const likedTitles = signalRecipes?.filter((r) => rightSwipeIds.includes(r.id)).map((r) => r.title) ?? [];
  const cookedTitles = signalRecipes?.filter((r) => cookedIds.includes(r.id)).map((r) => r.title) ?? [];
  const groceryTitles = signalRecipes?.filter((r) => groceryIds.includes(r.id)).map((r) => r.title) ?? [];
  const uniqueCuisines = [...new Set(
    signalRecipes?.filter((r) => rightSwipeIds.includes(r.id) && r.cuisine).map((r) => r.cuisine) ?? []
  )].length;
  const followThroughPct = savedIds.length > 0 ? Math.round((cookedIds.length / savedIds.length) * 100) : 0;

  const prompt = `You are writing a taste profile for Mori, a recipe discovery app. It will be shared as an image on social media — write something people want to screenshot and send to a friend.

Tone: casual, specific, a little funny. Spotify Wrapped energy — sharp and true.

User behaviour signals:
- Cuisines they like: ${profile?.cuisine_preferences?.join(', ') || 'not specified'}
- Dietary goals: ${profile?.dietary_goals?.join(', ') || 'none'}
- Eating style: ${profile?.eating_style || 'not set'}
- Skill level: ${profile?.skill_level || 'not set'}
- Recipes liked: ${likedTitles.slice(0, 8).join(', ') || 'none yet'}
- Actually cooked: ${cookedTitles.slice(0, 5).join(', ') || 'none yet'}
- Added to grocery list: ${groceryTitles.slice(0, 5).join(', ') || 'none yet'}
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
- planner: grocery list + meal prep signals. ${groceryIds.length} grocery adds → higher.
- devoted: depth on one cuisine vs. wide ranging. Inverse of explorer — narrow = high, wide = low.

Note style: "5 cuisines, no loyalty" / "cooks 1 in 4 saves" / "30 min or nothing" / "the grocery list is a diary" / "miso soup era, ongoing"`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (message.content[0] as { text: string }).text.trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return { text: parsed.tasteProfile ?? cleaned, flavourDna: parsed.flavourDna };
  } catch {
    return { text: cleaned, flavourDna: undefined };
  }
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
      const result = await buildTasteProfileText(user.id, sb, anthropic);
      if (!result?.text) { results.skipped++; continue; }

      await sb.from('profiles').update({
        taste_profile: { text: result.text, flavourDna: result.flavourDna, generated_at: new Date().toISOString() },
      }).eq('id', user.id);

      results.updated++;
      await new Promise((resolve) => setTimeout(resolve, 1000)); // pace Claude calls
    } catch {
      results.errors++;
    }
  }

  return res.status(200).json(results);
}
