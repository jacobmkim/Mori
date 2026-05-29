import { canShareRecipe, recipeShareUrl } from '@/lib/shareRecipe';

describe('recipeShareUrl', () => {
  it('uses supabase_id when present', () => {
    expect(recipeShareUrl({ id: 'ext-1', supabase_id: 'uuid-1' } as any))
      .toBe('https://getmori.app/r/uuid-1');
  });

  it('falls back to id when supabase_id is missing', () => {
    expect(recipeShareUrl({ id: 'ext-1', supabase_id: undefined } as any))
      .toBe('https://getmori.app/r/ext-1');
  });
});

describe('canShareRecipe', () => {
  it('blocks private community drafts (would 404 on web)', () => {
    expect(canShareRecipe({ source_type: 'community', is_public: false } as any)).toBe(false);
  });

  it('allows public community recipes', () => {
    expect(canShareRecipe({ source_type: 'community', is_public: true } as any)).toBe(true);
  });

  it('allows curated recipes', () => {
    expect(canShareRecipe({ source_type: 'curated', is_public: true } as any)).toBe(true);
  });
});
