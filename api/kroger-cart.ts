/**
 * Searches Kroger products and (when the user has connected their Kroger account)
 * adds matched items directly to their Kroger cart.
 *
 * Flow:
 *   action='search'      — product search only (client credentials). Returns prices + connected flag.
 *   action='add_to_cart' — search products for UPCs, then add to cart using user's Kroger token.
 *
 * Security:
 * - Kroger user tokens are stored in Supabase, never returned to client
 * - Token refresh is handled server-side transparently
 * - JWT auth + rate limiting on every call
 *
 * POST /api/kroger-cart
 * Body: { items: string[], action: 'search' | 'add_to_cart' }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireAuth, AuthError } from './_apiAuth';
import { rateLimitUser } from './_rateLimit';
import { validate, ValidationError, formatValidationError } from '../lib/validation';

// ─── Schema ───────────────────────────────────────────────────────────────────

const KrogerCartSchema = z.object({
  items:  z.array(z.string().min(1).max(100)).min(1).max(50),
  action: z.enum(['search', 'add_to_cart']).default('search'),
});

// ─── Supabase ────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

// ─── Kroger helpers ───────────────────────────────────────────────────────────

const KROGER_BASE = process.env.KROGER_ENVIRONMENT === 'production'
  ? 'https://api.kroger.com/v1'
  : 'https://api-ce.kroger.com/v1';

// Module-level cache — Kroger client tokens are valid 30 min; we refresh after 25 min.
let _clientTokenCache: { token: string; expiresAt: number } | null = null;

/** Get a short-lived client credentials token for product search (no user context needed). */
async function getClientToken(): Promise<string> {
  const now = Date.now();
  if (_clientTokenCache && _clientTokenCache.expiresAt > now) {
    return _clientTokenCache.token;
  }
  const id     = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Kroger credentials not configured');

  const credentials = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[getClientToken] ${res.status} | base=${KROGER_BASE} | id=${id?.slice(0, 6)}… | body=${errBody}`);
    throw new Error(`Kroger client auth failed: ${res.status}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  _clientTokenCache = { token: data.access_token, expiresAt: now + 25 * 60_000 };
  return data.access_token;
}

/** Load the user's stored Kroger token. Refreshes it automatically if expired. */
async function getUserToken(userId: string): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from('kroger_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  // Still valid — return as-is
  if (new Date(data.expires_at) > new Date(Date.now() + 60_000)) {
    return data.access_token;
  }

  // Expired — refresh using the refresh_token
  const id     = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) return null;

  const credentials = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(`${KROGER_BASE}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: data.refresh_token,
    }).toString(),
  });

  if (!res.ok) {
    // Refresh failed (token revoked) — remove stale row
    await sb.from('kroger_tokens').delete().eq('user_id', userId);
    return null;
  }

  const refreshed = await res.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  // Persist the new tokens
  await sb.from('kroger_tokens').update({
    access_token:  refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at:    expiresAt,
    updated_at:    new Date().toISOString(),
  }).eq('user_id', userId);

  return refreshed.access_token;
}

interface KrogerProduct {
  query:     string;
  found:     boolean;
  name:      string | null;
  upc:       string | null;
  productId: string | null;
  price:     number | null;
  size:      string | null;
}

async function searchProduct(token: string, term: string): Promise<KrogerProduct> {
  const notFound: KrogerProduct = { query: term, found: false, name: null, upc: null, productId: null, price: null, size: null };

  const url = new URL(`${KROGER_BASE}/products`);
  url.searchParams.set('filter.term', term);
  url.searchParams.set('filter.limit', '1');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return notFound;
  const data = await res.json() as any;
  const product = data.data?.[0];
  if (!product) return notFound;

  return {
    query:     term,
    found:     true,
    name:      product.description as string,
    upc:       product.upc as string ?? null,
    productId: product.productId as string,
    price:     (product.items?.[0]?.price?.regular as number) ?? null,
    size:      (product.items?.[0]?.size as string) ?? null,
  };
}

/** Add products to the user's Kroger cart. Returns the number of items added. */
async function addToCart(userToken: string, products: KrogerProduct[]): Promise<number> {
  const cartItems = products
    .filter((p) => p.upc)
    .map((p) => ({ upc: p.upc!, quantity: 1, modality: 'DELIVERY' }));

  if (cartItems.length === 0) return 0;

  const res = await fetch(`${KROGER_BASE}/cart/add`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items: cartItems }),
  });

  // 204 = success with no body; 200 = success with body
  if (res.ok) return cartItems.length;

  throw new Error(`Cart add failed: ${res.status}`);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = await requireAuth(req);

    const rl = await rateLimitUser(userId, 'kroger-cart', 20, 3600);
    if (!rl.success) {
      res.setHeader('Retry-After', rl.retryAfter ?? 3600);
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const body = await validate(KrogerCartSchema, req.body);

    // ── Search products ───────────────────────────────────────────────────────
    // For 'search', use cheaper client credentials (no user token needed).
    // For 'add_to_cart', we need the user's token for the cart call anyway, so load it first.

    let userToken: string | null = null;
    let krogerConnected = false;
    let searchToken: string;

    if (body.action === 'add_to_cart') {
      userToken = await getUserToken(userId);
      if (!userToken) {
        return res.status(200).json({ krogerConnected: false, needsReconnect: true });
      }
      krogerConnected = true;
      searchToken = userToken; // user token has product.compact scope too
    } else {
      // Check connection status in parallel with fetching the client token
      const [clientToken, storedToken] = await Promise.all([
        getClientToken(),
        getSupabase().from('kroger_tokens').select('user_id').eq('user_id', userId).single(),
      ]);
      searchToken = clientToken;
      krogerConnected = storedToken.data !== null;
    }

    const products = await Promise.all(body.items.map((item) => searchProduct(searchToken, item)));
    const foundProducts = products.filter((p) => p.found);
    const estimatedTotal = foundProducts.reduce((sum, p) => sum + (p.price ?? 0), 0);

    // ── Add to cart ───────────────────────────────────────────────────────────
    if (body.action === 'add_to_cart' && userToken) {
      const itemsAdded = await addToCart(userToken, foundProducts);
      return res.status(200).json({
        products,
        estimatedTotal: estimatedTotal > 0 ? Math.round(estimatedTotal * 100) / 100 : null,
        krogerConnected: true,
        cartAdded:  true,
        itemsAdded,
        itemsMissed: foundProducts.length - itemsAdded,
      });
    }

    // ── Search-only response ──────────────────────────────────────────────────
    return res.status(200).json({
      products,
      estimatedTotal: estimatedTotal > 0 ? Math.round(estimatedTotal * 100) / 100 : null,
      krogerConnected,
    });

  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json(formatValidationError(err));
    if (err instanceof AuthError)       return res.status(err.statusCode).json({ error: err.message });
    console.error('[kroger-cart]', err instanceof Error ? err.stack : err);
    return res.status(500).json({ error: 'Failed to search Kroger products' });
  }
}
