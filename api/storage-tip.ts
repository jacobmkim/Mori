import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// POST /api/storage-tip
// Given a list of leftover ingredients from a completed meal, returns
// storage and usage tips from Claude Haiku.
//
// Body: { ingredients: string[] }
// Returns: { tips: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ingredients } = req.body ?? {};
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  const client = new Anthropic({ apiKey });

  const ingredientList = ingredients.slice(0, 10).join(', ');

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Give me brief, practical storage and usage tips for these leftover ingredients: ${ingredientList}.

Format as 2-3 short tips. Be concise and specific. Focus on: how long they keep, best storage method, and one quick way to use them up. No intro sentence, just the tips.`,
        },
      ],
    });

    const tips = (message.content[0] as { text: string }).text.trim();
    return res.status(200).json({ tips });
  } catch (err: any) {
    console.error('[storage-tip] Claude error:', err?.message ?? err);
    return res.status(500).json({ error: 'Failed to generate tips' });
  }
}
