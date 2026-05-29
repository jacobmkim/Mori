/**
 * Tests for /api/recipe-page — the public HTML preview at getmori.app/r/{id}.
 *
 * Key invariants:
 *  - Bad/missing uuid → 404 (no DB call). Avoids SSRF-style probe traffic.
 *  - Private recipe (is_public === false) → 404 (privacy guard).
 *  - Missing Supabase env → 500 (config error surfaced, not silent 200).
 *  - Successful render includes the OG meta tags shares depend on for unfurl
 *    (og:title, og:url, twitter:card, apple-itunes-app smart banner) and the
 *    mori:// deep link in the CTA. These are the load-bearing user-visible
 *    contract that's easy to break with HTML template edits.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Jest hoists jest.mock() above imports, so any closed-over variables must be
// prefixed with `mock` to bypass the out-of-scope reference guard.
let mockRecipeResult: { data: any; error: any } = { data: null, error: { message: 'not found' } };
let mockReviewsResult: { data: any[]; error: any } = { data: [], error: null };

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockImplementation(() => Promise.resolve(mockRecipeResult)),
            })),
          })),
        };
      }
      if (table === 'recipe_reviews') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn().mockImplementation(() => Promise.resolve(mockReviewsResult)),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  })),
}));

import handler from '@/api/recipe-page';

const VALID_ID = '12345678-1234-1234-1234-123456789012';

const makeReq = (id: string | undefined, headers: Record<string, string> = {}) =>
  ({
    method: 'GET',
    query: id === undefined ? {} : { id },
    headers: { host: 'getmori.app', ...headers },
  } as any);

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const FULL_RECIPE = {
  id: VALID_ID,
  title: 'Lemon Pepper Salmon',
  description: 'A weeknight 20-minute fish dish.',
  cuisine: 'mediterranean',
  image_url: 'https://example.com/salmon.jpg',
  ingredients: [
    { name: 'salmon', quantity: '1', unit: 'lb' },
    { name: 'lemon', quantity: '1', unit: 'whole' },
  ],
  prep_time_mins: 5,
  cook_time_mins: 15,
  servings: 2,
  dietary_tags: ['pescatarian', 'high_protein'],
  macros: { calories: 420, protein: 38, carbohydrates: 8, fat: 22, isEstimated: true },
  is_public: true,
  save_count: 12,
  cook_count: 4,
  avg_rating: 4.7,
  rating_count: 9,
  submitter: { name: 'Jane Doe', username: 'jane' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRecipeResult ={ data: null, error: { message: 'not found' } };
  mockReviewsResult ={ data: [], error: null };
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
});

// ─── ID validation ────────────────────────────────────────────────────────────

describe('recipe-page — id validation', () => {
  it('returns 404 when the id query param is missing', async () => {
    const res = makeRes();
    await handler(makeReq(undefined) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 for a non-uuid id (regex guard)', async () => {
    const res = makeRes();
    await handler(makeReq('not-a-uuid') as any, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
    // Should short-circuit before any DB call.
    const lastSendCall = res.send.mock.calls[res.send.mock.calls.length - 1][0];
    expect(lastSendCall).toContain('Recipe not found');
  });

  it('returns 404 for a uuid-shaped id that the DB doesn\'t resolve', async () => {
    mockRecipeResult ={ data: null, error: { message: 'PGRST116' } };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─── Privacy gate ─────────────────────────────────────────────────────────────

describe('recipe-page — privacy gate', () => {
  it('returns 404 when the recipe row has is_public === false', async () => {
    mockRecipeResult ={ data: { ...FULL_RECIPE, is_public: false }, error: null };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('renders normally when is_public is null (legacy curated rows have null, not true)', async () => {
    mockRecipeResult ={ data: { ...FULL_RECIPE, is_public: null }, error: null };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─── Config / env ─────────────────────────────────────────────────────────────

describe('recipe-page — env config', () => {
  it('returns 500 when Supabase env vars are missing', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── Successful render contract ───────────────────────────────────────────────

describe('recipe-page — success render', () => {
  beforeEach(() => {
    mockRecipeResult ={ data: FULL_RECIPE, error: null };
  });

  it('returns 200 with text/html and cache headers', async () => {
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      expect.stringContaining('max-age='),
    );
  });

  it('includes OG meta tags that iMessage / Slack rely on for unfurl', async () => {
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).toContain('<meta property="og:title" content="Lemon Pepper Salmon"');
    expect(html).toContain('<meta property="og:image" content="https://example.com/salmon.jpg"');
    expect(html).toContain('<meta property="og:url"');
    expect(html).toContain(`/r/${VALID_ID}`);
    expect(html).toContain('twitter:card');
    // Smart App Banner for iOS — opens App Store sheet in Safari.
    expect(html).toContain('apple-itunes-app');
    expect(html).toContain('app-id=6761498088');
  });

  it('falls back to summary card when the recipe has no image', async () => {
    mockRecipeResult ={ data: { ...FULL_RECIPE, image_url: null }, error: null };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).toContain('twitter:card" content="summary"');
    expect(html).not.toContain('og:image');
  });

  it('includes the mori:// deep link in the Open in Mori CTA', async () => {
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).toContain(`mori://r/${VALID_ID}`);
    expect(html).toContain('Open in Mori');
  });

  it('escapes HTML in the recipe title to prevent injection', async () => {
    mockRecipeResult ={
      data: { ...FULL_RECIPE, title: '<script>alert(1)</script> Tacos' },
      error: null,
    };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders the submitter line with @username when available', async () => {
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).toContain('By @jane on Mori');
  });

  it('falls back to "From Mori" when neither name nor username is set', async () => {
    mockRecipeResult ={ data: { ...FULL_RECIPE, submitter: null }, error: null };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).toContain('From Mori');
  });

  it('hides the rating pill when rating_count < 3 (avg-of-1 is misleading)', async () => {
    mockRecipeResult ={ data: { ...FULL_RECIPE, rating_count: 2, avg_rating: 5 }, error: null };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    // The class name appears in the CSS rules regardless — assert on the
    // element-level marker that only renders inside the conditional pill.
    expect(html).not.toContain('class="rating-summary"');
    expect(html).not.toContain('class="rating-value"');
  });

  it('renders the reviews section when reviews exist', async () => {
    mockReviewsResult ={
      data: [
        {
          rating: 5,
          review_text: 'So good!',
          created_at: '2026-05-01T12:00:00Z',
          reviewer: { name: 'Alex K', username: 'alex', avatar_url: null },
        },
      ],
      error: null,
    };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).toContain('<h2>Reviews</h2>');
    expect(html).toContain('So good!');
    expect(html).toContain('@alex');
  });

  it('omits the reviews section entirely when there are none', async () => {
    mockReviewsResult ={ data: [], error: null };
    const res = makeRes();
    await handler(makeReq(VALID_ID) as any, res as any);
    const html: string = res.send.mock.calls[0][0];
    expect(html).not.toContain('<h2>Reviews</h2>');
  });
});
