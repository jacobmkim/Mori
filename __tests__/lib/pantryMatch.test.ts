/**
 * rankByPantryCoverage — the pure core of "Cook with what I have" (M8 stage 1).
 * Coverage over NON-staple ingredients, scorer-compatible containment matching,
 * hard dietary/dislike/skill filters, leftover urgency ranking, taste tie-break.
 */
import { rankByPantryCoverage } from '@/lib/pantryMatch';
import type { Recipe } from '@/types';

const NOW = new Date('2026-07-04T12:00:00Z').getTime();
const inDays = (d: number) => new Date(NOW + d * 24 * 60 * 60 * 1000).toISOString();

const R = (title: string, ings: string[], extra: Record<string, unknown> = {}): Recipe =>
  ({ id: title, supabase_id: title, title, ingredients: ings.map((name) => ({ name })), steps: [], ...extra } as unknown as Recipe);

// Non-staple ingredients per recipe (rice/spaghetti/olive oil/salt/basil are staples):
const chickenRice = R('Chicken Rice', ['chicken breast', 'rice', 'soy sauce', 'olive oil', 'salt']); // chicken breast, soy sauce
const pasta = R('Tomato Pasta', ['spaghetti', 'tomato', 'basil']);                                    // tomato
const beefStew = R('Beef Stew', ['beef chuck', 'carrot', 'onion', 'potato']);                         // all four
const salmonBowl = R('Salmon Bowl', ['salmon fillet', 'rice', 'spinach']);                            // salmon fillet, spinach

describe('rankByPantryCoverage', () => {
  it('full pantry match → coverage 1, nothing missing (plural containment matches)', () => {
    const out = rankByPantryCoverage({ catalog: [chickenRice], pantry: ['chicken breasts', 'soy sauce'] });
    expect(out).toHaveLength(1);
    expect(out[0].coverage).toBe(1);
    expect(out[0].missing).toEqual([]);
  });

  it('staples are never counted and never missing', () => {
    // rice / olive oil / salt are auto-assumed on hand — only the two real ingredients count
    const out = rankByPantryCoverage({ catalog: [chickenRice], pantry: ['chicken breast', 'soy sauce'] });
    expect(out[0].missing).toEqual([]);
    expect(out[0].coverage).toBe(1);
  });

  it('partial match reports the exact shopping gap', () => {
    const out = rankByPantryCoverage({ catalog: [beefStew], pantry: ['carrots', 'onions'] });
    expect(out).toHaveLength(1);
    expect(out[0].coverage).toBe(0.5);
    expect(out[0].missing).toEqual(['beef chuck', 'potato']);
  });

  it('drops recipes missing more than maxMissing', () => {
    const three = rankByPantryCoverage({ catalog: [beefStew], pantry: ['carrot'] }); // missing 3, default cap 3
    expect(three).toHaveLength(1);
    const two = rankByPantryCoverage({ catalog: [beefStew], pantry: ['carrot'], maxMissing: 2 });
    expect(two).toHaveLength(0);
  });

  it('drops recipes that use NOTHING on hand, even within the missing cap', () => {
    const out = rankByPantryCoverage({ catalog: [chickenRice], pantry: ['tofu'] });
    expect(out).toHaveLength(0);
  });

  it('empty pantry + no leftovers → [] (caller shows the setup state)', () => {
    expect(rankByPantryCoverage({ catalog: [chickenRice, pasta], pantry: [] })).toEqual([]);
  });

  it('leftovers count as on-hand; spoiling ones rank their recipes first', () => {
    const out = rankByPantryCoverage({
      catalog: [chickenRice, salmonBowl],
      pantry: ['chicken breast', 'soy sauce', 'salmon fillet'],
      leftovers: [{ name: 'spinach', spoilsAt: inDays(1) }],
      now: NOW,
    });
    expect(out).toHaveLength(2);
    // Both are full matches; the salmon bowl uses the spoiling spinach → ranks first.
    expect(out[0].recipe.title).toBe('Salmon Bowl');
    expect(out[0].usesLeftovers).toEqual(['spinach']);
    expect(out[0].urgentLeftovers).toEqual(['spinach']);
    expect(out[1].urgentLeftovers).toEqual([]);
  });

  it('a leftover spoiling far out is on-hand but not urgent', () => {
    const out = rankByPantryCoverage({
      catalog: [salmonBowl],
      pantry: ['salmon fillet'],
      leftovers: [{ name: 'spinach', spoilsAt: inDays(10) }],
      now: NOW,
    });
    expect(out[0].usesLeftovers).toEqual(['spinach']);
    expect(out[0].urgentLeftovers).toEqual([]);
  });

  it('an ALREADY-spoiled leftover is never labelled urgent ("use it before it spoils" would be a lie)', () => {
    const out = rankByPantryCoverage({
      catalog: [salmonBowl],
      pantry: ['salmon fillet'],
      leftovers: [{ name: 'spinach', spoilsAt: inDays(-1) }],
      now: NOW,
    });
    expect(out[0].urgentLeftovers).toEqual([]);
  });

  it('staple pantry terms never match — "pepper" must not cover "red bell pepper", "salt" must not cover "salted butter"', () => {
    const fajitas = R('Fajitas', ['chicken breast', 'red bell pepper']);
    const cookies = R('Cookies', ['salted butter', 'chocolate chips']);
    const out = rankByPantryCoverage({
      catalog: [fajitas, cookies],
      pantry: ['chicken breast', 'pepper', 'salt', 'chocolate chips'],
    });
    const fj = out.find((m) => m.recipe.title === 'Fajitas');
    expect(fj?.missing).toEqual(['red bell pepper']); // "pepper" (staple term) didn't cover it
    const ck = out.find((m) => m.recipe.title === 'Cookies');
    expect(ck?.missing).toEqual(['salted butter']);   // "salt" (staple term) didn't cover it
  });

  it('a staple-only pantry matches nothing (never fake a cookable list from salt + oil)', () => {
    const out = rankByPantryCoverage({ catalog: [chickenRice], pantry: ['salt', 'olive oil', 'rice'] });
    expect(out).toEqual([]);
  });

  it('fewer missing beats higher urgency: cook-tonight sections stay honest', () => {
    const out = rankByPantryCoverage({
      catalog: [beefStew, chickenRice],
      pantry: ['chicken breast', 'soy sauce', 'carrot', 'onion', 'potato'],
      leftovers: [{ name: 'carrot', spoilsAt: inDays(1) }],
      now: NOW,
    });
    // chickenRice: missing 0. beefStew: missing 1 (beef chuck) but uses the urgent carrot.
    expect(out[0].recipe.title).toBe('Chicken Rice');
    expect(out[1].recipe.title).toBe('Beef Stew');
  });

  it('hard dietary filter: a vegetarian never sees meat pantry matches', () => {
    const out = rankByPantryCoverage({
      catalog: [chickenRice, pasta, salmonBowl],
      pantry: ['chicken breast', 'soy sauce', 'tomato', 'salmon fillet', 'spinach'],
      dietaryGoals: ['vegetarian'],
    });
    expect(out.map((m) => m.recipe.title)).toEqual(['Tomato Pasta']);
  });

  it('hard dislike filter: disliked ingredient excludes the recipe entirely', () => {
    const out = rankByPantryCoverage({
      catalog: [pasta],
      pantry: ['tomato'],
      ingredientDislikes: ['tomato'],
    });
    expect(out).toHaveLength(0);
  });

  it('skill cap: a beginner never sees confident_chef recipes', () => {
    const fancy = R('Duck Confit', ['duck legs'], { skill_level: 'confident_chef' });
    const out = rankByPantryCoverage({ catalog: [fancy], pantry: ['duck legs'], skillLevel: 'beginner' });
    expect(out).toHaveLength(0);
  });

  it('taste tie-break: equal coverage/urgency ranks by scoreFn', () => {
    const a = R('Alpha Chicken', ['chicken breast']);
    const b = R('Beta Chicken', ['chicken breast']);
    const out = rankByPantryCoverage({
      catalog: [a, b],
      pantry: ['chicken breast'],
      scoreFn: (r) => (r.title === 'Beta Chicken' ? 10 : 1),
    });
    expect(out.map((m) => m.recipe.title)).toEqual(['Beta Chicken', 'Alpha Chicken']);
  });

  it('deterministic without a scoreFn (title order)', () => {
    const a = R('Alpha Chicken', ['chicken breast']);
    const b = R('Beta Chicken', ['chicken breast']);
    expect(rankByPantryCoverage({ catalog: [b, a], pantry: ['chicken breast'] }).map((m) => m.recipe.title))
      .toEqual(['Alpha Chicken', 'Beta Chicken']);
  });

  it('string-shaped ingredients (legacy rows) still match', () => {
    const legacy = { ...R('Legacy', []), ingredients: ['chicken breast', 'soy sauce'] } as unknown as Recipe;
    const out = rankByPantryCoverage({ catalog: [legacy], pantry: ['chicken breast', 'soy sauce'] });
    expect(out).toHaveLength(1);
    expect(out[0].coverage).toBe(1);
  });
});
