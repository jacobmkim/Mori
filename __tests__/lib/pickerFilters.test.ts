import { filterPickerRecipes, type PickerChip } from '@/lib/pickerFilters';
import type { Recipe, SkillLevel } from '@/types';

function r(overrides: Partial<Recipe>): Recipe {
  return {
    id: overrides.id ?? 'id',
    title: overrides.title ?? 'Untitled',
    description: null,
    cuisine: overrides.cuisine ?? null,
    source_type: 'curated',
    ingredients: [],
    steps: [],
    prep_time_mins: overrides.prep_time_mins ?? null,
    cook_time_mins: overrides.cook_time_mins ?? null,
    servings: null,
    cost_per_serving: null,
    dietary_tags: overrides.dietary_tags ?? [],
    meal_prep_friendly: overrides.meal_prep_friendly,
    skill_level: overrides.skill_level ?? null,
    macros: null,
    badge: 'none',
    avg_rating: 0,
    save_count: 0,
    image_url: null,
    ...overrides,
  } as Recipe;
}

const noFilters = {
  search: '',
  chips: new Set<PickerChip>(),
  cuisines: [],
  timeBucket: null,
  skill: null as SkillLevel | null,
};

describe('filterPickerRecipes — search', () => {
  const recipes = [
    r({ id: 'a', title: 'Chicken Teriyaki', cuisine: 'Japanese' }),
    r({ id: 'b', title: 'Pad Thai', cuisine: 'Thai' }),
    r({ id: 'c', title: 'Carbonara', cuisine: 'Italian' }),
  ];

  it('returns all when search is empty', () => {
    expect(filterPickerRecipes(recipes, noFilters)).toHaveLength(3);
  });

  it('matches title (case-insensitive)', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, search: 'CHICKEN' });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });

  it('matches cuisine', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, search: 'thai' });
    expect(out.map((x) => x.id)).toEqual(['b']);
  });

  it('returns empty when no match', () => {
    expect(filterPickerRecipes(recipes, { ...noFilters, search: 'sushi' })).toEqual([]);
  });

  it('trims whitespace', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, search: '   ' });
    expect(out).toHaveLength(3);
  });
});

describe('filterPickerRecipes — cuisines (multi-select OR, fusion split)', () => {
  const recipes = [
    r({ id: 'a', title: 'A', cuisine: 'Japanese' }),
    r({ id: 'b', title: 'B', cuisine: 'Korean' }),
    r({ id: 'c', title: 'C', cuisine: 'Cajun,Italian' }), // fusion
    r({ id: 'd', title: 'D', cuisine: null }),
  ];

  it('single cuisine matches exact', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, cuisines: ['Japanese'] });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });

  it('multi-cuisine OR: returns recipes matching any selected', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, cuisines: ['Japanese', 'Korean'] });
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('matches fusion cuisine via split', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, cuisines: ['Italian'] });
    expect(out.map((x) => x.id)).toEqual(['c']);
  });

  it('case-insensitive', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, cuisines: ['JAPANESE'] });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });

  it('null cuisine never matches', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, cuisines: ['Japanese', 'Korean', 'Italian'] });
    expect(out.map((x) => x.id)).not.toContain('d');
  });
});

describe('filterPickerRecipes — chips (single)', () => {
  const recipes = [
    r({ id: 'mp', title: 'MP', meal_prep_friendly: true }),
    r({ id: 'nomp', title: 'NoMP', meal_prep_friendly: false }),
    r({ id: 'unmp', title: 'UnMP', meal_prep_friendly: undefined }),
    r({ id: 'q', title: 'Q', prep_time_mins: 10, cook_time_mins: 15 }), // 25 ≤ 30
    r({ id: 'slow', title: 'Slow', prep_time_mins: 20, cook_time_mins: 40 }), // 60 > 30
    r({ id: 'hp', title: 'HP', dietary_tags: ['high_protein'] }),
    r({ id: 'veg', title: 'Veg', dietary_tags: ['vegetarian'] }),
    r({ id: 'vgn', title: 'Vgn', dietary_tags: ['vegan'] }),
    r({ id: 'plain', title: 'Plain', dietary_tags: [] }),
  ];

  it('meal_prep keeps only meal_prep_friendly === true', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, chips: new Set(['meal_prep']) });
    expect(out.map((x) => x.id)).toEqual(['mp']);
  });

  it('quick keeps only prep+cook ≤ 30', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, chips: new Set(['quick']) });
    expect(out.map((x) => x.id)).toContain('q');
    expect(out.map((x) => x.id)).not.toContain('slow');
  });

  it('high_protein requires the tag', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, chips: new Set(['high_protein']) });
    expect(out.map((x) => x.id)).toEqual(['hp']);
  });

  it('vegetarian matches both vegetarian and vegan tags', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, chips: new Set(['vegetarian']) });
    expect(out.map((x) => x.id).sort()).toEqual(['veg', 'vgn']);
  });

  it('vegan only matches vegan tag', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, chips: new Set(['vegan']) });
    expect(out.map((x) => x.id)).toEqual(['vgn']);
  });
});

describe('filterPickerRecipes — chips (multi, AND)', () => {
  const recipes = [
    r({ id: 'a', title: 'A', meal_prep_friendly: true, dietary_tags: ['high_protein'] }),
    r({ id: 'b', title: 'B', meal_prep_friendly: true, dietary_tags: [] }),
    r({ id: 'c', title: 'C', meal_prep_friendly: false, dietary_tags: ['high_protein'] }),
  ];

  it('meal_prep AND high_protein: only recipes that are both', () => {
    const out = filterPickerRecipes(recipes, {
      ...noFilters,
      chips: new Set(['meal_prep', 'high_protein']),
    });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
});

describe('filterPickerRecipes — timeBucket', () => {
  const recipes = [
    r({ id: 'a', title: 'A', prep_time_mins: 5, cook_time_mins: 10 }),  // 15
    r({ id: 'b', title: 'B', prep_time_mins: 5, cook_time_mins: 11 }),  // 16
    r({ id: 'c', title: 'C', prep_time_mins: null, cook_time_mins: null }), // (99+99)
  ];

  it('null bucket allows all', () => {
    expect(filterPickerRecipes(recipes, noFilters)).toHaveLength(3);
  });

  it('15 cuts off recipe whose total = 16', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, timeBucket: 15 });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });

  it('null prep/cook is treated as 99+99 and excluded by any bucket', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, timeBucket: 45 });
    expect(out.map((x) => x.id)).not.toContain('c');
  });
});

describe('filterPickerRecipes — skill', () => {
  const recipes = [
    r({ id: 'beg', title: 'Beg', skill_level: 'beginner' }),
    r({ id: 'home', title: 'Home', skill_level: 'home_cook' }),
    r({ id: 'chef', title: 'Chef', skill_level: 'confident_chef' }),
    r({ id: 'none', title: 'None', skill_level: null }),
  ];

  it('null skill returns all', () => {
    expect(filterPickerRecipes(recipes, noFilters)).toHaveLength(4);
  });

  it('beginner returns only beginner', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, skill: 'beginner' });
    expect(out.map((x) => x.id)).toEqual(['beg']);
  });

  it('null-skill recipes are excluded when filter is set', () => {
    const out = filterPickerRecipes(recipes, { ...noFilters, skill: 'home_cook' });
    expect(out.map((x) => x.id)).toEqual(['home']);
  });
});

describe('filterPickerRecipes — combined', () => {
  const recipes = [
    r({
      id: 'win',
      title: 'Korean Bibimbap',
      cuisine: 'Korean',
      meal_prep_friendly: true,
      dietary_tags: ['high_protein'],
      prep_time_mins: 10,
      cook_time_mins: 15,
      skill_level: 'home_cook',
    }),
    r({
      id: 'almost',
      title: 'Korean Bulgogi',
      cuisine: 'Korean',
      meal_prep_friendly: true,
      dietary_tags: ['high_protein'],
      prep_time_mins: 30,
      cook_time_mins: 30,
      skill_level: 'home_cook',
    }),
    r({
      id: 'wrong_cuisine',
      title: 'Japanese Bento',
      cuisine: 'Japanese',
      meal_prep_friendly: true,
      dietary_tags: ['high_protein'],
      prep_time_mins: 10,
      cook_time_mins: 15,
      skill_level: 'home_cook',
    }),
  ];

  it('every dimension active simultaneously narrows correctly', () => {
    const out = filterPickerRecipes(recipes, {
      search: 'Bibim',
      chips: new Set(['meal_prep', 'high_protein']),
      cuisines: ['Korean'],
      timeBucket: 30,
      skill: 'home_cook',
    });
    expect(out.map((x) => x.id)).toEqual(['win']);
  });
});
