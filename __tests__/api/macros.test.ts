/**
 * macros.ts — sparse-ingredient gate + sanity-bound rejection
 *
 * Verifies the two guardrails added to prevent Claude from hallucinating
 * implausible macros (e.g. 18g protein for a single clove of garlic):
 *
 *   1. Pre-flight gate skips Claude entirely when ingredients are too sparse.
 *   2. Sanity bounds reject Claude output when protein-calorie math is wrong
 *      OR confidence is low + no protein source + non-trivial protein.
 */

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: jest.fn().mockResolvedValue({ data: null }),
        }),
      }),
      update: () => ({ eq: jest.fn().mockResolvedValue({}) }),
    }),
  }),
}));

jest.mock('@/api/_rateLimit', () => ({
  rateLimitUser: jest.fn().mockResolvedValue({ success: true, remaining: 30, resetAt: 0 }),
}));

jest.mock('@/api/_apiAuth', () => ({
  requireAuth: jest.fn().mockResolvedValue('user-1'),
}));

jest.mock('@/api/_sentry', () => ({
  captureException: jest.fn(),
}));

let mockBody: any = {};
jest.mock('@/lib/validation', () => ({
  validate: jest.fn().mockImplementation(async () => mockBody),
  MacrosRequestSchema: {},
  ValidationError: class extends Error {},
  formatValidationError: jest.fn(),
}));

jest.mock('@/lib/macrosOwnership', () => ({
  canWriteMacros: jest.fn().mockReturnValue(false),
}));

import handler from '@/api/macros';

const makeReq = () => ({ method: 'POST', headers: {}, body: {} });
const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  return { status, json, setHeader };
};

const claudeReply = (payload: object) => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  mockCreate.mockReset();
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe('macros: sparse-ingredient gate', () => {
  it('returns macros: null with reason="insufficient_ingredients" for a single ingredient', async () => {
    mockBody = {
      recipeTitle: 'Garlic',
      ingredients: [{ name: 'garlic', quantity: '1', unit: 'clove' }],
    };

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ macros: null, reason: 'insufficient_ingredients' });
  });

  it('returns null when most ingredients lack quantities', async () => {
    mockBody = {
      recipeTitle: 'Vague soup',
      ingredients: [
        { name: 'onion', quantity: '', unit: '' },
        { name: 'carrot', quantity: '', unit: '' },
        { name: 'celery', quantity: '', unit: '' },
        { name: 'salt', quantity: '1', unit: 'tsp' },
      ],
    };

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ macros: null, reason: 'insufficient_ingredients' });
  });

  it('proceeds to Claude when at least 3 ingredients are quantified', async () => {
    mockBody = {
      recipeTitle: 'Tomato pasta',
      servings: 2,
      ingredients: [
        { name: 'pasta', quantity: '200', unit: 'g' },
        { name: 'tomato sauce', quantity: '1', unit: 'cup' },
        { name: 'parmesan', quantity: '30', unit: 'g' },
      ],
    };
    mockCreate.mockResolvedValue(
      claudeReply({ calories: 480, protein: 18, carbohydrates: 70, fat: 10, fibre: 4, confidence: 'high' })
    );

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        macros: expect.objectContaining({ calories: 480, protein: 18, isEstimated: true }),
      })
    );
  });
});

describe('macros: sanity bounds', () => {
  const fullIngredients = [
    { name: 'flour', quantity: '200', unit: 'g' },
    { name: 'water', quantity: '1', unit: 'cup' },
    { name: 'olive oil', quantity: '2', unit: 'tbsp' },
  ];

  it('rejects output where protein calories exceed total calories', async () => {
    mockBody = { recipeTitle: 'Garlic bread', ingredients: fullIngredients };
    // 50 protein × 4 = 200 kcal > 100 kcal total — impossible
    mockCreate.mockResolvedValue(
      claudeReply({ calories: 100, protein: 50, carbohydrates: 5, fat: 2, fibre: 1, confidence: 'high' })
    );

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ macros: null, reason: 'estimate_unavailable' });
  });

  it('rejects low-confidence high-protein output when no protein source is listed', async () => {
    mockBody = {
      recipeTitle: 'Mystery dish',
      ingredients: [
        { name: 'garlic', quantity: '3', unit: 'clove' },
        { name: 'olive oil', quantity: '1', unit: 'tbsp' },
        { name: 'salt', quantity: '1', unit: 'tsp' },
      ],
    };
    // Garlic + oil + salt cannot yield 18g protein. Confidence "low" → reject.
    mockCreate.mockResolvedValue(
      claudeReply({ calories: 200, protein: 18, carbohydrates: 5, fat: 14, fibre: 1, confidence: 'low' })
    );

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ macros: null, reason: 'estimate_unavailable' });
  });

  it('accepts high-confidence output even without obvious protein source (e.g. legit oil + flour dish)', async () => {
    mockBody = { recipeTitle: 'Olive oil bread', ingredients: fullIngredients };
    mockCreate.mockResolvedValue(
      claudeReply({ calories: 280, protein: 5, carbohydrates: 40, fat: 11, fibre: 2, confidence: 'high' })
    );

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        macros: expect.objectContaining({ calories: 280, protein: 5 }),
      })
    );
  });

  it('rejects output where Atwater-summed kcal far exceeds reported calories', async () => {
    mockBody = { recipeTitle: 'Bread', ingredients: fullIngredients };
    // 30P + 50C + 20F → 30×4 + 50×4 + 20×9 = 500 kcal vs reported 200
    mockCreate.mockResolvedValue(
      claudeReply({ calories: 200, protein: 30, carbohydrates: 50, fat: 20, fibre: 1, confidence: 'high' })
    );

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ macros: null, reason: 'estimate_unavailable' });
  });
});

describe('macros: prompt construction', () => {
  it('passes the user-provided servings count into the prompt', async () => {
    mockBody = {
      recipeTitle: 'Big batch chili',
      servings: 8,
      ingredients: [
        { name: 'ground beef', quantity: '2', unit: 'lb' },
        { name: 'kidney beans', quantity: '2', unit: 'cup' },
        { name: 'tomato', quantity: '1', unit: 'can' },
      ],
    };
    mockCreate.mockResolvedValue(
      claudeReply({ calories: 350, protein: 25, carbohydrates: 22, fat: 16, fibre: 6, confidence: 'high' })
    );

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const promptArg = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptArg).toContain('Servings: 8');
    expect(promptArg).toContain('Divide by 8');
  });

  it('defaults to 4 servings when not provided', async () => {
    mockBody = {
      recipeTitle: 'Default servings',
      ingredients: [
        { name: 'rice', quantity: '1', unit: 'cup' },
        { name: 'chicken', quantity: '1', unit: 'lb' },
        { name: 'soy sauce', quantity: '2', unit: 'tbsp' },
      ],
    };
    mockCreate.mockResolvedValue(
      claudeReply({ calories: 400, protein: 30, carbohydrates: 30, fat: 12, fibre: 1, confidence: 'high' })
    );

    const req = makeReq() as any;
    const res = makeRes() as any;
    await handler(req, res);

    const promptArg = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(promptArg).toContain('Servings: 4');
  });
});
