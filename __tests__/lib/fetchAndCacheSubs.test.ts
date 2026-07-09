/**
 * fetchAndCacheSubs — the /api/substitutions client. Contract (2026-07-04 gate-audit fixes):
 *  - 402 → budgetExhausted: true (the UI must say "free AI swaps used", never the false
 *    "No common substitutions found")
 *  - 429 → rateLimited: true (pre-existing)
 *  - 200 → the answer is cached EVEN WHEN EMPTY — each 200 burned a monthly budget
 *    credit server-side, so re-tapping the same ingredient must hit the cache, not re-bill.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAndCacheSubs, getCachedSubs } from '@/lib/substitutions';

const BASE = 'https://test.example';

function mockFetchOnce(status: number, body: any) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
  return AsyncStorage.clear();
});

describe('fetchAndCacheSubs', () => {
  it('402 → budgetExhausted (distinct from a genuine empty answer), nothing cached', async () => {
    mockFetchOnce(402, { error: 'Monthly free AI limit reached', code: 'ai_budget_exhausted' });
    const r = await fetchAndCacheSubs('saffron', 'token', BASE);
    expect(r).toEqual({ swaps: [], rateLimited: false, budgetExhausted: true, failed: false });
    expect(await getCachedSubs('saffron')).toBeNull(); // a cap is not an answer — retry next month
  });

  it('429 → rateLimited (pre-existing behavior kept)', async () => {
    mockFetchOnce(429, { error: 'Rate limit exceeded' });
    const r = await fetchAndCacheSubs('saffron', 'token', BASE);
    expect(r).toEqual({ swaps: [], rateLimited: true, budgetExhausted: false, failed: false });
  });

  it('200 with swaps → returned and cached', async () => {
    mockFetchOnce(200, { swaps: [{ substitute: 'turmeric', reason: 'colour match' }] });
    const r = await fetchAndCacheSubs('saffron', 'token', BASE);
    expect(r.swaps).toHaveLength(1);
    expect(r.failed).toBe(false);
    expect(await getCachedSubs('saffron')).toEqual([{ substitute: 'turmeric', reason: 'colour match' }]);
  });

  it('200 with an EMPTY answer is cached too — a re-tap must not burn another credit', async () => {
    mockFetchOnce(200, { swaps: [] });
    const r = await fetchAndCacheSubs('unicorn dust', 'token', BASE);
    expect(r).toEqual({ swaps: [], rateLimited: false, budgetExhausted: false, failed: false });
    expect(await getCachedSubs('unicorn dust')).toEqual([]); // cached [] = real "no subs" answer
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a billed 200 survives a cache-write failure — the answer is never discarded', async () => {
    mockFetchOnce(200, { swaps: [{ substitute: 'turmeric', reason: 'colour match' }] });
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
    const r = await fetchAndCacheSubs('saffron', 'token', BASE);
    expect(r.swaps).toHaveLength(1);   // the user still gets what they were billed for
    expect(r.failed).toBe(false);
    spy.mockRestore();
  });

  it('server error (500) → failed, so the UI says "couldn\'t check", never "none found"', async () => {
    mockFetchOnce(500, { error: 'Failed' });
    const r = await fetchAndCacheSubs('saffron', 'token', BASE);
    expect(r).toEqual({ swaps: [], rateLimited: false, budgetExhausted: false, failed: true });
  });

  it('network failure → failed, nothing cached', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const r = await fetchAndCacheSubs('saffron', 'token', BASE);
    expect(r).toEqual({ swaps: [], rateLimited: false, budgetExhausted: false, failed: true });
    expect(await getCachedSubs('saffron')).toBeNull();
  });
});
