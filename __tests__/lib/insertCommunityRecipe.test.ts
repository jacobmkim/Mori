/**
 * Tests for insertCommunityRecipe — the Supabase insert that persists a
 * community recipe submission.
 *
 * Key invariants:
 *  - Always sets source_type: 'community' and moderation_status: 'approved'
 *    (the moderation gate was removed 2026-05-11 — see audit-cron deletion).
 *  - Persists the is_public flag from the caller.
 *  - Passes image_url through (null or URL string).
 *  - Returns the newly inserted UUID.
 *  - Throws on Supabase error (lets the wizard surface the failure).
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

import { insertCommunityRecipe } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

type InsertPayload = Record<string, unknown>;
let capturedPayload: InsertPayload | null = null;

function setupInsert(returnId: string | null = 'new-uuid-abc', dbError: unknown = null) {
  capturedPayload = null;
  mockFrom.mockReturnValue({
    insert: jest.fn((payload: InsertPayload) => {
      capturedPayload = payload;
      return {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: returnId ? { id: returnId } : null,
            error: dbError,
          }),
        }),
      };
    }),
  });
}

import type { CommunityRecipeInput } from '@/lib/api';

// Minimal valid input — reused across tests with spread overrides.
const BASE_INPUT: CommunityRecipeInput = {
  title: 'Test Recipe',
  description: null,
  cuisine: 'Italian',
  ingredients: [{ name: 'pasta', quantity: '200', unit: 'g' }],
  steps: [{ order: 1, instruction: 'Cook pasta.' }],
  prep_time_mins: 5,
  cook_time_mins: 10,
  servings: 2,
  dietary_tags: [],
  submitted_by: 'user-uuid-1',
  image_url: null,
  is_public: true,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Mandatory fields ─────────────────────────────────────────────────────────

describe('insertCommunityRecipe — mandatory fields', () => {
  it('always sets source_type to community', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT });
    expect(capturedPayload).toMatchObject({ source_type: 'community' });
  });

  it('always sets moderation_status to approved (gate removed 2026-05-11)', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT });
    expect(capturedPayload).toMatchObject({ moderation_status: 'approved' });
  });

  it('always initialises badge to none', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT });
    expect(capturedPayload).toMatchObject({ badge: 'none' });
  });

  it('always initialises avg_rating to 0', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT });
    expect(capturedPayload).toMatchObject({ avg_rating: 0 });
  });
});

// ─── Caller-supplied fields ───────────────────────────────────────────────────

describe('insertCommunityRecipe — caller-supplied fields', () => {
  it('persists is_public: false', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT, is_public: false });
    expect(capturedPayload).toMatchObject({ is_public: false });
  });

  it('persists is_public: true', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT, is_public: true });
    expect(capturedPayload).toMatchObject({ is_public: true });
  });

  it('persists image_url when provided', async () => {
    const url = 'https://storage.supabase.co/recipe-images/user-1/photo.jpg';
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT, image_url: url });
    expect(capturedPayload).toMatchObject({ image_url: url });
  });

  it('persists image_url as null when not provided', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT, image_url: null });
    expect(capturedPayload).toMatchObject({ image_url: null });
  });

  it('persists submitted_by from the caller', async () => {
    setupInsert();
    await insertCommunityRecipe({ ...BASE_INPUT, submitted_by: 'user-xyz' });
    expect(capturedPayload).toMatchObject({ submitted_by: 'user-xyz' });
  });

  it('round-trips structured timer_minutes on each step', async () => {
    setupInsert();
    await insertCommunityRecipe({
      ...BASE_INPUT,
      steps: [
        { order: 1, instruction: 'Boil pasta.', timer_minutes: 8 },
        { order: 2, instruction: 'Drain and toss.', timer_minutes: null },
      ],
    });
    expect(capturedPayload).toMatchObject({
      steps: [
        { order: 1, instruction: 'Boil pasta.', timer_minutes: 8 },
        { order: 2, instruction: 'Drain and toss.', timer_minutes: null },
      ],
    });
  });
});

// ─── Return value + error handling ───────────────────────────────────────────

describe('insertCommunityRecipe — return value and error handling', () => {
  it('returns the UUID from the inserted row', async () => {
    setupInsert('recipe-uuid-999');
    const id = await insertCommunityRecipe({ ...BASE_INPUT });
    expect(id).toBe('recipe-uuid-999');
  });

  it('throws when Supabase returns an error', async () => {
    setupInsert(null, new Error('unique constraint violation'));
    await expect(insertCommunityRecipe({ ...BASE_INPUT })).rejects.toThrow(
      'unique constraint violation'
    );
  });
});
