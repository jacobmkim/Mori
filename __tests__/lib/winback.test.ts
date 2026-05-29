import { nextWinbackStage, pickWinbackRecipe, type SavedCandidate, type RecipePick } from '@/lib/winback';

describe('nextWinbackStage', () => {
  it('stage 0 → 1 once inactive ≥ 7 days', () => {
    expect(nextWinbackStage(0, 7, null)).toBe(1);
    expect(nextWinbackStage(0, 30, null)).toBe(1);
  });

  it('stage 0 → null when inactive < 7 days', () => {
    expect(nextWinbackStage(0, 6, null)).toBeNull();
  });

  it('stage 1 → 2 once inactive ≥ 14 days and spaced ≥ 6 days', () => {
    expect(nextWinbackStage(1, 14, 7)).toBe(2);
    expect(nextWinbackStage(1, 20, null)).toBe(2);
  });

  it('stage 1 → null when not yet 14 days', () => {
    expect(nextWinbackStage(1, 13, 7)).toBeNull();
  });

  it('stage 1 → null when last reminder too recent (spacing guard)', () => {
    expect(nextWinbackStage(1, 14, 2)).toBeNull();
  });

  it('stage 2 (capped) → null always', () => {
    expect(nextWinbackStage(2, 60, 30)).toBeNull();
  });
});

describe('pickWinbackRecipe', () => {
  const saved = (id: string, saved_at: string, cooked = false): SavedCandidate =>
    ({ recipe_id: id, title: `R${id}`, cuisine: 'italian', saved_at, cooked });
  const fb: RecipePick[] = [{ recipe_id: 'fb1', title: 'Fallback', cuisine: 'thai' }];

  it('prefers the most-recently-saved uncooked recipe', () => {
    const pick = pickWinbackRecipe(
      [saved('a', '2026-05-01'), saved('b', '2026-05-20'), saved('c', '2026-05-10')],
      fb,
    );
    expect(pick?.recipe_id).toBe('b');
  });

  it('skips cooked recipes', () => {
    const pick = pickWinbackRecipe([saved('a', '2026-05-25', true), saved('b', '2026-05-01')], fb);
    expect(pick?.recipe_id).toBe('b');
  });

  it('falls back to a cuisine pick when nothing saved-uncooked', () => {
    const pick = pickWinbackRecipe([saved('a', '2026-05-25', true)], fb);
    expect(pick?.recipe_id).toBe('fb1');
  });

  it('returns null when nothing to surface', () => {
    expect(pickWinbackRecipe([], [])).toBeNull();
  });
});
