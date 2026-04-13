/**
 * substitutions.ts bug tests
 *
 * Bug: getStaticSubs uses n.includes(key) || key.includes(n) for partial matching.
 * This is a substring check with no word-boundary enforcement, so:
 *   - "cream" (not in table) matches key "cream cheese" via key.includes(n) → WRONG
 *   - "almond butter spread" matches key "butter" via n.includes(key) before
 *     it can match "almond butter" (sorted longest-first mitigates this, but
 *     any unlisted compound containing a listed key can still mismatch)
 *
 * test.failing() = documents a KNOWN BUG
 */
import { getStaticSubs } from '@/lib/substitutions';

describe('getStaticSubs — exact match', () => {
  it('returns subs for an exact key', () => {
    const result = getStaticSubs('buttermilk');
    expect(result).not.toBeNull();
    // Should be buttermilk-specific subs, not butter subs
    expect(result?.[0].substitute).toMatch(/milk|vinegar|plant/i);
  });

  it('returns null for unknown ingredient with no related key', () => {
    expect(getStaticSubs('unobtainium powder')).toBeNull();
  });

  it('is case-insensitive', () => {
    const lower = getStaticSubs('buttermilk');
    const upper = getStaticSubs('BUTTERMILK');
    expect(upper).toEqual(lower);
  });
});

describe('getStaticSubs — partial match', () => {
  // INTENDED behavior: "unsalted butter" should hit the "butter" entry
  it('matches compound ingredient to base key (intended behavior)', () => {
    const result = getStaticSubs('unsalted butter');
    expect(result).not.toBeNull();
  });

  // BUG: key.includes(n) — a short term like "cream" that is a substring of a table key
  // ("cream cheese") incorrectly returns subs for that key.
  // Fix: use word-boundary matching (e.g. split into tokens and check full words).
  test.failing('does not match "cream" to "cream cheese" subs (word boundary bug)', () => {
    // "cream" is not in the table, but "cream cheese" is.
    // key.includes("cream") → "cream cheese".includes("cream") → true → WRONG match
    const result = getStaticSubs('cream');
    // If the bug is present, result will be the cream cheese subs instead of null
    expect(result).toBeNull();
  });

  // BUG: same issue — "egg" is a substring of "egg white" or similar table keys.
  // Searching for a short base word can pull in subs for a more specific compound.
  test.failing('does not match short base word to longer compound key subs', () => {
    // "egg" by itself should either return its own subs (if in table) or null —
    // not the subs for "egg white" / "egg yolk" if those are in the table
    const eggResult = getStaticSubs('egg');
    const eggWhiteResult = getStaticSubs('egg white');

    if (eggResult !== null && eggWhiteResult !== null) {
      // If both exist, they should be different entries
      expect(eggResult).not.toEqual(eggWhiteResult);
    }
    // If egg is not in table, it should not accidentally return egg white subs
    if (eggWhiteResult !== null) {
      expect(eggResult).toBeNull();
    }
  });
});
