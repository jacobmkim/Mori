/**
 * Tests the community visibility gate and submitter field mapping in
 * fetchDiscoverRecipes.
 *
 * As of 2026-05-11 the DB-side PostgREST .or() only enforces: community
 * recipes appear when is_public = true. The moderation_status gate was
 * dropped (audit cron deleted). Curated/imported rows always pass through.
 * We verify:
 *   1. The exact .or() string is passed to Supabase (regression guard).
 *   2. The submitter join is mapped correctly to submitter_name/avatar/username.
 *   3. is_public / moderation_status land on the Recipe object.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
}));

import { fetchDiscoverRecipes } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

type Submitter = { name: string | null; avatar_url: string | null; username: string | null } | null;

function makeRow(overrides: {
  id?: string;
  title?: string;
  source_type?: string;
  is_public?: boolean | null;
  moderation_status?: string | null;
  submitted_by?: string | null;
  submitter?: Submitter;
}) {
  return {
    id: overrides.id ?? 'uuid-1',
    external_id: null,
    title: overrides.title ?? 'Test Recipe',
    description: null,
    cuisine: 'American',
    source_type: overrides.source_type ?? 'curated',
    dietary_tags: [],
    badge: 'none',
    avg_rating: 0,
    save_count: 0,
    image_url: null,
    prep_time_mins: 20,
    cook_time_mins: 15,
    servings: 2,
    cost_per_serving: null,
    macros: null,
    ingredients: [],
    steps: [],
    meal_prep_friendly: null,
    skill_level: null,
    is_public: overrides.is_public ?? true,
    moderation_status: overrides.moderation_status ?? null,
    submitted_by: overrides.submitted_by ?? null,
    submitter: overrides.submitter ?? null,
  };
}

let orCapture: string | undefined;

// fetchDiscoverRecipes now pages via fetchAllCatalogRows: select → or → is → order → range.
// The .or() string must stay byte-identical (this is the regression guard), so it's still
// captured here from the same position in the chain.
function setupDB(rows: ReturnType<typeof makeRow>[]) {
  orCapture = undefined;
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      or: jest.fn((str: string) => {
        orCapture = str;
        return {
          is: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn((from: number, to: number) =>
                Promise.resolve({ data: rows.slice(from, to + 1), error: null })),
            }),
          }),
        };
      }),
    }),
  });
}

// Advance clock past 30-min deck cache TTL on each test.
let mockNow = 2_000_000_000_000;
const THIRTY_ONE_MINUTES = 31 * 60 * 1_000;

beforeEach(() => {
  mockNow += THIRTY_ONE_MINUTES;
  jest.spyOn(Date, 'now').mockReturnValue(mockNow);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── .or() filter string ──────────────────────────────────────────────────────

describe('fetchDiscoverRecipes — community .or() gate', () => {
  it('passes the correct filter string to .or()', async () => {
    setupDB([]);
    await fetchDiscoverRecipes([]);
    expect(orCapture).toBe(
      'source_type.neq.community,and(source_type.eq.community,is_public.eq.true)'
    );
  });
});

// ─── Submitter field mapping ──────────────────────────────────────────────────

describe('fetchDiscoverRecipes — submitter field mapping', () => {
  it('maps submitter join to submitter_name, submitter_avatar, submitter_username', async () => {
    setupDB([
      makeRow({
        id: 'c1',
        source_type: 'community',
        submitted_by: 'user-abc',
        submitter: { name: 'Alice', avatar_url: 'https://cdn.example.com/alice.jpg', username: 'alice42' },
      }),
    ]);
    const [recipe] = await fetchDiscoverRecipes([]);
    expect(recipe.submitter_name).toBe('Alice');
    expect(recipe.submitter_avatar).toBe('https://cdn.example.com/alice.jpg');
    expect(recipe.submitter_username).toBe('alice42');
    expect(recipe.submitted_by).toBe('user-abc');
  });

  it('sets submitter fields to null when join returns null (anonymous submitter)', async () => {
    setupDB([
      makeRow({
        id: 'c2',
        source_type: 'community',
        submitted_by: 'user-deleted',
        submitter: null,
      }),
    ]);
    const [recipe] = await fetchDiscoverRecipes([]);
    expect(recipe.submitter_name).toBeNull();
    expect(recipe.submitter_avatar).toBeNull();
    expect(recipe.submitter_username).toBeNull();
  });

  it('sets submitter fields to null for curated recipes (no submitted_by)', async () => {
    setupDB([makeRow({ id: 'r1', source_type: 'curated' })]);
    const [recipe] = await fetchDiscoverRecipes([]);
    expect(recipe.submitter_name).toBeNull();
    expect(recipe.submitter_avatar).toBeNull();
    expect(recipe.submitter_username).toBeNull();
  });
});

// ─── is_public / moderation_status mapping ───────────────────────────────────

describe('fetchDiscoverRecipes — visibility field mapping', () => {
  it('maps is_public: true onto the Recipe object', async () => {
    setupDB([makeRow({ id: 'r1', source_type: 'community', is_public: true, moderation_status: 'approved' })]);
    const [recipe] = await fetchDiscoverRecipes([]);
    expect(recipe.is_public).toBe(true);
  });

  it('maps moderation_status onto the Recipe object', async () => {
    setupDB([makeRow({ id: 'r1', source_type: 'community', is_public: true, moderation_status: 'approved' })]);
    const [recipe] = await fetchDiscoverRecipes([]);
    expect(recipe.moderation_status).toBe('approved');
  });

  it('defaults is_public to true when DB returns null', async () => {
    setupDB([makeRow({ id: 'r2', source_type: 'curated', is_public: null })]);
    const [recipe] = await fetchDiscoverRecipes([]);
    expect(recipe.is_public).toBe(true);
  });

  it('defaults moderation_status to null when DB returns null', async () => {
    setupDB([makeRow({ id: 'r3', source_type: 'curated', moderation_status: null })]);
    const [recipe] = await fetchDiscoverRecipes([]);
    expect(recipe.moderation_status).toBeNull();
  });
});
