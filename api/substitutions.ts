import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// POST /api/substitutions
// Given a recipe title and its ingredient list, returns practical swaps:
// alcohol-free alternatives, vegan swaps, allergen substitutes, availability subs.
//
// Body:    { title: string; ingredients: string[] }
// Returns: { swaps: { ingredient: string; substitute: string; reason: string }[] }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, ingredients } = req.body ?? {};
  if (!title || !Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'title and ingredients array required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });
  const ingredientList = ingredients.slice(0, 20).join(', ');

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `For the recipe "${title}", suggest practical ingredient substitutions.
Ingredients: ${ingredientList}

Return ONLY a JSON array (no markdown, no extra text) of up to 6 substitution objects:
[{"ingredient":"red wine","substitute":"red wine vinegar or grape juice","reason":"alcohol-free"},...]

Rules:
- Focus on: alcohol-free swaps, vegan alternatives, common allergen substitutes, hard-to-find ingredient swaps
- Only include ingredients that genuinely benefit from a swap — skip basic pantry staples (salt, pepper, water, oil)
- Keep "substitute" under 8 words and "reason" under 5 words
- If no meaningful swaps exist, return []`,
        },
      ],
    });

    const raw = (message.content[0] as { text: string }).text.trim();
    // Extract JSON array even if model adds surrounding text
    const match = raw.match(/\[[\s\S]*\]/);
    const swaps = match ? JSON.parse(match[0]) : [];
    return res.status(200).json({ swaps });
  } catch (err: any) {
    console.error('[substitutions] error:', err?.message ?? err);
    return res.status(500).json({ error: 'Failed to generate substitutions' });
  }
}
