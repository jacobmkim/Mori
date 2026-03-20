import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// POST /api/describe-recipe
// Generates a one-sentence recipe description using Claude Haiku.
// Called once per recipe — result is stored in recipes.description in Supabase.
// Replaces TheMealDB instruction-sentence blurbs (which are often cooking steps, not descriptions).
//
// Body: { externalId: string, title: string, cuisine: string, category: string, ingredients: string[] }
// Returns: { description: string }

interface DescribeRequest {
  externalId: string;
  title: string;
  cuisine?: string;
  category?: string;
  ingredients: string[]; // ingredient names only
}

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { externalId, title, cuisine, category, ingredients } = req.body as DescribeRequest;
  if (!title || !externalId) return res.status(400).json({ error: 'title and externalId required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const client = new Anthropic({ apiKey });

  const origin = cuisine && cuisine !== 'Unknown' ? `${cuisine} ` : (category ? `${category} ` : '');
  const ingList = ingredients.slice(0, 5).join(', ');

  const prompt = `Write a single appetising sentence describing this recipe. Be specific and make it sound delicious. Do not start with the recipe name. Do not use the word "delicious". Keep it under 20 words.

Recipe: ${title}
${origin ? `Origin: ${origin.trim()}` : ''}
Key ingredients: ${ingList}

One sentence only:`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    });

    const description = (message.content[0] as { text: string }).text.trim()
      .replace(/^["']|["']$/g, ''); // strip surrounding quotes if any

    // Persist to Supabase so this never needs to be called again for this recipe
    const sb = getSupabase();
    if (sb && externalId) {
      void sb.from('recipes')
        .update({ description })
        .eq('external_id', externalId);
    }

    return res.status(200).json({ description });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Claude request failed';
    return res.status(500).json({ error: message });
  }
}
