import { partitionForInstacart } from '@/lib/staples';

type Item = { ingredient_name: string };

const mk = (names: string[]): Item[] => names.map((ingredient_name) => ({ ingredient_name }));

describe('partitionForInstacart', () => {
  it('sends everything when no staples and empty pantry', () => {
    const items = mk(['chicken breast', 'broccoli', 'soy sauce']);
    const result = partitionForInstacart(items, new Set());
    expect(result.sendable.map((i) => i.ingredient_name)).toEqual([
      'chicken breast', 'broccoli', 'soy sauce',
    ]);
    expect(result.skippedStaples).toBe(0);
    expect(result.pantryHints.size).toBe(0);
  });

  it('buckets staples under skippedStaples', () => {
    const items = mk(['salt', 'olive oil', 'chicken breast']);
    const result = partitionForInstacart(items, new Set());
    expect(result.sendable.map((i) => i.ingredient_name)).toEqual(['chicken breast']);
    expect(result.skippedStaples).toBe(2);
    expect(result.pantryHints.size).toBe(0);
  });

  it('includes pantry matches in sendable, names them in pantryHints', () => {
    const items = mk(['soy sauce', 'rice vinegar', 'chicken breast']);
    const result = partitionForInstacart(items, new Set(['soy sauce', 'rice vinegar']));
    expect(result.sendable.map((i) => i.ingredient_name)).toEqual([
      'soy sauce', 'rice vinegar', 'chicken breast',
    ]);
    expect(result.skippedStaples).toBe(0);
    expect(Array.from(result.pantryHints).sort()).toEqual(['rice vinegar', 'soy sauce']);
  });

  it('counts an item only once when it is both a staple and in pantry', () => {
    const items = mk(['salt', 'chicken breast']);
    const result = partitionForInstacart(items, new Set(['salt']));
    expect(result.sendable.map((i) => i.ingredient_name)).toEqual(['chicken breast']);
    expect(result.skippedStaples).toBe(1);
    expect(result.pantryHints.has('salt')).toBe(false);
  });

  it('pantryHints excludes staples even when both match', () => {
    const items = mk(['salt', 'soy sauce']);
    const result = partitionForInstacart(items, new Set(['salt', 'soy sauce']));
    expect(result.sendable.map((i) => i.ingredient_name)).toEqual(['soy sauce']);
    expect(result.skippedStaples).toBe(1);
    expect(Array.from(result.pantryHints)).toEqual(['soy sauce']);
  });

  it('pantry match is case- and whitespace-insensitive', () => {
    const items = mk(['  Soy Sauce ', 'TAHINI']);
    const result = partitionForInstacart(items, new Set(['soy sauce', 'tahini']));
    expect(result.sendable.map((i) => i.ingredient_name)).toEqual(['  Soy Sauce ', 'TAHINI']);
    expect(Array.from(result.pantryHints).sort()).toEqual(['soy sauce', 'tahini']);
  });

  it('returns all-zero counts on empty input', () => {
    const result = partitionForInstacart([], new Set(['soy sauce']));
    expect(result.sendable).toEqual([]);
    expect(result.skippedStaples).toBe(0);
    expect(result.pantryHints.size).toBe(0);
  });

  it('preserves original item references in sendable (not copies)', () => {
    const a = { ingredient_name: 'chicken breast', quantity: '1 lb' };
    const b = { ingredient_name: 'salt' };
    const result = partitionForInstacart([a, b], new Set());
    expect(result.sendable[0]).toBe(a);
  });
});
