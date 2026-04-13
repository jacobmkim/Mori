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

  it('does not match bare "oil" to compound key like "coconut oil" (word boundary)', () => {
    // "oil" is not in the table, but "coconut oil", "olive oil", "vegetable oil" are.
    // Old code: "coconut oil".includes("oil") → true → WRONG match
    // Fixed code: keyWords ["coconut", "oil"] not all in nWords ["oil"] → no match
    const result = getStaticSubs('oil');
    expect(result).toBeNull();
  });

  it('does not match bare "sauce" to compound key like "soy sauce" (word boundary)', () => {
    // "sauce" is not in the table, but "soy sauce", "fish sauce", etc. are.
    const result = getStaticSubs('sauce');
    expect(result).toBeNull();
  });

  it('matches "egg white" to base "egg" subs (correct fallback)', () => {
    // "egg" is in the table; "egg white" is not.
    // keyWords ["egg"] all in nWords ["egg", "white"] → correct fallback match.
    const eggResult = getStaticSubs('egg');
    const eggWhiteResult = getStaticSubs('egg white');
    expect(eggResult).not.toBeNull();
    expect(eggWhiteResult).not.toBeNull();
  });
});
