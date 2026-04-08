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
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number>;
}

// ─── In-Memory Store (Development Fallback) ───────────────────────────────

class InMemoryStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetAt: number }>();

  async get(key: string): Promise<number | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.resetAt) {
      this.store.delete(key);
      return null;
    }
    return entry.count;
  }

  async set(key: string, value: number, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      count: value,
      resetAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async incr(key: string): Promise<number> {
    const current = this.store.get(key);
    const newCount = (current?.count ?? 0) + 1;
    const resetAt = current?.resetAt ?? Date.now() + 3600000; // 1 hour default
    this.store.set(key, { count: newCount, resetAt });
    return newCount;
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

  async get(key: string): Promise<number | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? Number(value) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: number, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, ttlSeconds, value);
    } catch {
      // Silently fail — fallback to in-memory
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.client) return -1;
    try {
      return await this.client.incr(key);
    } catch {
      return -1;
    }
  }
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────

let store: RateLimitStore | null = null;

function getStore(): RateLimitStore {
  if (store) return store;

  // Try Vercel KV first (production)
  const kvStore = new KVStore();
  if (kvStore.client) {
    store = kvStore;
    return store;
  }

  // Fall back to in-memory (development)
  store = new InMemoryStore();
  return store;
}

export async function rateLimitUser(
  userId: string,
  endpoint: string,
  limit: number,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  const key = `rl:${endpoint}:${userId}`;
  const s = getStore();

  const current = await s.get(key);
  if (current === null) {
    // First request in window
    await s.set(key, 1, windowSeconds);
    return { success: true, remaining: limit - 1, resetAt: Date.now() + windowSeconds * 1000 };
  }

  const count = (current ?? 0) + 1;
  if (count > limit) {
    const resetAt = Math.ceil((Date.now() + windowSeconds * 1000) / 1000);
    return {
      success: false,
      remaining: 0,
      resetAt,
      retryAfter: windowSeconds,
    };
  }

  await s.set(key, count, windowSeconds);
  return {
    success: true,
    remaining: limit - count,
    resetAt: Math.ceil((Date.now() + windowSeconds * 1000) / 1000),
  };
}

export async function rateLimitIP(
  ip: string,
  endpoint: string,
  limit: number,
  windowSeconds: number = 3600
): Promise<RateLimitResult> {
  const key = `rl:${endpoint}:ip:${ip}`;
  const s = getStore();

  const current = await s.get(key);
  if (current === null) {
    await s.set(key, 1, windowSeconds);
    return { success: true, remaining: limit - 1, resetAt: Date.now() + windowSeconds * 1000 };
  }

  const count = (current ?? 0) + 1;
  if (count > limit) {
    const resetAt = Math.ceil((Date.now() + windowSeconds * 1000) / 1000);
    return {
      success: false,
      remaining: 0,
      resetAt,
      retryAfter: windowSeconds,
    };
  }

  await s.set(key, count, windowSeconds);
  return {
    success: true,
    remaining: limit - count,
    resetAt: Math.ceil((Date.now() + windowSeconds * 1000) / 1000),
  };
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
