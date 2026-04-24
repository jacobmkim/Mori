/**
 * Creates an Instacart shopping list link from the user's grocery items.
 *
 * Flow:
 *   Client sends cleaned item names + display texts →
 *   We POST to Instacart /products_link →
 *   Instacart returns a URL →
 *   Client opens URL in browser (user lands on pre-filled Instacart list)
 *
 * No OAuth required — Instacart uses a link-generation model.
 *
 * POST /api/instacart-cart
 * Body: { items: Array<{ name, displayText?, measurement?: { quantity, unit } }>, title? }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth, AuthError } from './_apiAuth';
import { rateLimitUser } from './_rateLimit';
import { captureException } from './_sentry';
import { validate, ValidationError, formatValidationError } from '../lib/validation';

// ─── Schema ───────────────────────────────────────────────────────────────────

const MeasurementSchema = z.object({
  quantity: z.number().positive(),
  unit:     z.string().min(1).max(50),
});

const LineItemSchema = z.object({
  name:        z.string().min(1).max(100),
  displayText: z.string().max(200).optional(),
  measurement: MeasurementSchema.optional(),
});

const InstacartCartSchema = z.object({
  items: z.array(LineItemSchema).min(1).max(100),
  title: z.string().max(200).optional(),
});

// ─── Instacart helpers ────────────────────────────────────────────────────────

const IS_PROD = process.env.INSTACART_ENVIRONMENT === 'production';
const INSTACART_BASE = IS_PROD
  ? 'https://connect.instacart.com'
  : 'https://connect.dev.instacart.tools';

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = await requireAuth(req);

    const rl = await rateLimitUser(userId, 'instacart-cart', 20, 3600);
    if (!rl.success) {
      res.setHeader('Retry-After', rl.retryAfter ?? 3600);
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const body = await validate(InstacartCartSchema, req.body);

    const apiKey = IS_PROD
      ? process.env.INSTACART_API_KEY
      : (process.env.INSTACART_API_KEY_SANDBOX ?? process.env.INSTACART_API_KEY);
    if (!apiKey) return res.status(500).json({ error: 'Instacart not configured' });

    const lineItems = body.items.map((item) => ({
      name:         item.name,
      display_text: item.displayText ?? item.name,
      ...(item.measurement ? {
        line_item_measurements: [{ quantity: item.measurement.quantity, unit: item.measurement.unit }],
      } : {}),
    }));

    const instacartRes = await fetch(`${INSTACART_BASE}/idp/v1/products/products_link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title:      body.title ?? 'Mori Grocery List',
        line_items: lineItems,
        link_type:  'shopping_list',
      }),
    });

    if (!instacartRes.ok) {
      const errBody = await instacartRes.text().catch(() => '');
      if (process.env.NODE_ENV === 'development') console.error(`[instacart-cart] ${instacartRes.status}`);
      return res.status(502).json({ error: 'Failed to create Instacart list' });
    }

    const data = await instacartRes.json() as { products_link_url: string };
    let url = data.products_link_url;
    const partnerId = process.env.INSTACART_PARTNER_ID;
    if (partnerId) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}utm_campaign=instacart-idp&utm_medium=affiliate&utm_source=instacart_idp&utm_term=partnertype-mediapartner&utm_content=campaignid-20313_partnerid-${partnerId}`;
    }
    return res.status(200).json({ url });

  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json(formatValidationError(err));
    if (err instanceof AuthError)       return res.status(err.statusCode).json({ error: err.message });
    captureException(err);
    if (process.env.NODE_ENV === 'development') console.error('[instacart-cart]', err instanceof Error ? err.message : 'Unknown error');
    return res.status(500).json({ error: 'Failed to create Instacart list' });
  }
}
