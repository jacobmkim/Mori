/**
 * Explore tab dietary gate — source-level regression guard.
 *
 * Explore shipped with NO dietary or dislike filter: it queries `recipes` directly, and
 * `dietaryGoals` was only read to decide whether to SHOW a "High Protein" section. A vegan
 * browsing the editorial feed was served chicken; someone who declared a shellfish allergy was
 * served shellfish. Round 1 of the review refuted this; it was wrong.
 *
 * The fix needs INGREDIENTS in the query, because dietary_tags cannot gate this surface —
 * measured against prod: 0 recipes carry a 'nut_free' tag, and pescatarian tags cover 331 where
 * the real gate finds 967. These assertions fail if a future refactor drops either half.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/explore.tsx'), 'utf8');

describe('Explore fetches what the gate needs', () => {
  it('LIST_COLS includes ingredients', () => {
    const listCols = SRC.slice(SRC.indexOf('const LIST_COLS'), SRC.indexOf('function toRecipe'));
    expect(listCols).toContain('ingredients');
  });
});

describe('Explore applies the shared gate', () => {
  it('imports the single source of truth, not a local copy of the rules', () => {
    expect(SRC).toContain("from '@/lib/dietaryRules'");
    expect(SRC).toContain('violatesDietary');
    expect(SRC).toContain('matchesDislike');
  });

  it('reads the user dislikes, not just dietary goals', () => {
    expect(SRC).toContain('ingredient_dislikes');
  });

  it('fails closed on a recipe with no ingredient data', () => {
    expect(SRC).toContain('hasNoIngredientData');
  });

  it('routes chip filtering through the gate', () => {
    const fn = SRC.slice(SRC.indexOf('function applyFilter'), SRC.indexOf('// ── Search'));
    expect(fn).toContain('gateRecipes(recipes)');
  });

  it('gates search results at the source (they bypass applyFilter)', () => {
    expect(SRC).toContain('setSearchResults(gateRecipes(');
  });
});
