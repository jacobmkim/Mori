/**
 * Rate limiting utility for Vercel serverless functions.
 * Supports both Vercel KV (recommended for production) and in-memory fallback.
 *
 * In production, set up Vercel KV:
 * 1. Create a Vercel KV database at https://vercel.com/docs/storage/vercel-kv
 * 2. Vercel will automatically inject KV_URL and KV_REST_API_TOKEN environment variables
 * 3. Rate limiting will be distributed across all instances
 *
 * In development, uses in-memory Map (local to each instance).
 */

type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
};

interface RateLimitStore {
  // Atomically increment the window counter, setting the TTL when the key is
  // created. Returns the post-increment count, or -1 when the store failed —
  // the limiter fails CLOSED on -1 (an uncounted request must not pass).
  // Atomicity matters: the previous get()-then-set() implementation let N
  // concurrent requests all read the same stale count and ALL pass the limit
  // (2026-07-04 audit — the AI-budget race is bounded by THIS limiter, so the
  // limiter itself racing defeated both layers).
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
}

// ─── In-Memory Store (Development / per-instance Fallback) ───────────────────

class InMemoryStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetAt: number }>();

  // Synchronous read-modify-write with no awaits — atomic within the JS event
  // loop, so concurrent handlers on THIS instance serialize correctly. Note:
  // per-instance only; cross-instance limiting needs the KV store.
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const nowMs = Date.now();
    const entry = this.store.get(key);
    if (!entry || nowMs > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: nowMs + ttlSeconds * 1000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
}

// ─── Vercel KV Store (Production) ────────────────────────────────────────

class KVStore implements RateLimitStore {
  private client: any;

  constructor() {
    // Dynamically require Vercel KV only if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const { kv } = require('@vercel/kv');
      this.client = kv;
    } catch {
      this.client = null;
    }
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (!this.client) return -1;
    try {
      // Redis INCR is atomic; the TTL is attached when the key is first created.
      const count: number = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    } catch {
      return -1; // caller fails closed
    }
  }

  isConnected(): boolean {
    // Require BOTH the package and the store's env vars. With the package
    // installed but no KV store provisioned, every call would throw → -1 →
    // fail-closed 429s on EVERY endpoint. Fall back to in-memory instead
    // until the store actually exists.
    return !!this.client && !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
  }
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────

let store: RateLimitStore | null = null;

function getStore(): RateLimitStore {
  if (store) return store;

  // Try Vercel KV first (production)
  const kvStore = new KVStore();
  if (kvStore.isConnected()) {
    store = kvStore;
    return store;
  }

  // Fall back to in-memory (development)
  store = new InMemoryStore();
  return store;
}

async function rateLimitByKey(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const s = getStore();
    const count = await s.incrWithTtl(key, windowSeconds);
    if (count < 0) {
      // Store failure — fail closed to prevent abuse during outages.
      return { success: false, remaining: 0, resetAt: Date.now() + windowSeconds * 1000 };
    }
    if (count > limit) {
      return {
        success: false,
        remaining: 0,
        resetAt: Date.now() + windowSeconds * 1000,
        retryAfter: windowSeconds,
      };
    }
    return {
      success: true,
      remaining: limit - count,
      resetAt: Date.now() + windowSeconds * 1000,
    };
  } catch {
    // Rate store failure — fail closed to prevent abuse during outages
    return { success: false, remaining: 0, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

export async function rateLimitUser(
  userId: string,
  endpoint: string,
  limit: number,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  return rateLimitByKey(`rl:${endpoint}:${userId}`, limit, windowSeconds);
}

export async function rateLimitIP(
  ip: string,
  endpoint: string,
  limit: number,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  return rateLimitByKey(`rl:${endpoint}:ip:${ip}`, limit, windowSeconds);
}

// Helper to extract IP from request (works behind Vercel proxy)
export function getClientIP(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
