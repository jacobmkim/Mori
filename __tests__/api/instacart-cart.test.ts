import handler from '@/api/instacart-cart';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRequireAuth  = jest.fn();
const mockRateLimitUser = jest.fn();
const mockValidate     = jest.fn();

jest.mock('@/api/_apiAuth', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(msg: string, code: number) { super(msg); this.name = 'AuthError'; this.statusCode = code; }
  },
}));

jest.mock('@/api/_rateLimit', () => ({
  rateLimitUser: (...args: any[]) => mockRateLimitUser(...args),
}));

jest.mock('@/lib/validation', () => ({
  validate: (...args: any[]) => mockValidate(...args),
  ValidationError: class ValidationError extends Error { constructor(msg: string) { super(msg); this.name = 'ValidationError'; } },
  formatValidationError: jest.fn((e: Error) => ({ error: e.message })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SANDBOX_BASE = 'https://connect.dev.instacart.tools';
const PROD_BASE    = 'https://connect.instacart.com';
const DEFAULT_URL  = 'https://www.instacart.com/store/s?products_link_token=abc123';

const VALID_ITEMS = [{ name: 'chicken breast', displayText: 'chicken breast 1 lb' }];

let fetchMock: jest.Mock;

const makeReq = (overrides: Record<string, any> = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer test-token' },
  body: { items: VALID_ITEMS },
  ...overrides,
});

const makeRes = () => {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  return { status, json, setHeader };
};

const okInstacartResponse = (url = DEFAULT_URL) => ({
  ok: true,
  json: async () => ({ products_link_url: url }),
});

const errInstacartResponse = () => ({
  ok: false,
  status: 500,
  text: async () => 'Internal Server Error',
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Fresh fetch mock every test — avoids once-queue leakage between tests
  fetchMock = jest.fn().mockResolvedValue(okInstacartResponse());
  (global as any).fetch = fetchMock;

  mockRequireAuth.mockResolvedValue('user-123');
  mockRateLimitUser.mockResolvedValue({ success: true, remaining: 19, resetAt: 0 });
  mockValidate.mockResolvedValue({ items: VALID_ITEMS });

  process.env.INSTACART_API_KEY         = 'prod-key';
  process.env.INSTACART_API_KEY_SANDBOX = 'sandbox-key';
  delete process.env.INSTACART_ENVIRONMENT;
  delete process.env.INSTACART_PARTNER_ID;
});

afterEach(() => {
  delete process.env.INSTACART_API_KEY;
  delete process.env.INSTACART_API_KEY_SANDBOX;
  delete process.env.INSTACART_ENVIRONMENT;
  delete process.env.INSTACART_PARTNER_ID;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('instacart-cart', () => {
  // ── Method guard ────────────────────────────────────────────────────────────

  it('returns 405 for GET', async () => {
    const res = makeRes() as any;
    await handler(makeReq({ method: 'GET' }) as any, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when no valid JWT', async () => {
    const { AuthError } = jest.requireMock('@/api/_apiAuth');
    mockRequireAuth.mockRejectedValue(new AuthError('Unauthorized', 401));
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  // ── Rate limit ──────────────────────────────────────────────────────────────

  it('returns 429 when rate limit exceeded', async () => {
    mockRateLimitUser.mockResolvedValue({ success: false, retryAfter: 3600 });
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 3600);
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it('returns 400 when validation fails', async () => {
    const { ValidationError } = jest.requireMock('@/lib/validation');
    mockValidate.mockRejectedValue(new ValidationError('items is required'));
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── Missing API key ─────────────────────────────────────────────────────────

  it('returns 500 when no API key configured', async () => {
    delete process.env.INSTACART_API_KEY;
    delete process.env.INSTACART_API_KEY_SANDBOX;
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ── Sandbox vs prod routing (env-level, module-level const) ─────────────────
  // IS_PROD is evaluated once at module load; we test key selection behavior
  // via the auth header rather than trying to reload the module mid-suite.

  it('uses INSTACART_API_KEY_SANDBOX when sandbox key is present and env is unset', async () => {
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer sandbox-key');
  });

  it('falls back to INSTACART_API_KEY when sandbox key is missing', async () => {
    delete process.env.INSTACART_API_KEY_SANDBOX;
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer prod-key');
  });

  it('hits the Instacart API endpoint', async () => {
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/idp/v1/products/products_link');
    expect(url).toContain(SANDBOX_BASE);
  });

  // ── Successful response ─────────────────────────────────────────────────────

  it('returns the Instacart URL on success', async () => {
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    expect(res.json).toHaveBeenCalledWith({ url: DEFAULT_URL });
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(502);
  });

  it('returns 502 when Instacart API returns non-ok', async () => {
    fetchMock.mockResolvedValue(errInstacartResponse());
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  // ── Partner ID ──────────────────────────────────────────────────────────────

  it('appends partner UTM params when INSTACART_PARTNER_ID is set', async () => {
    process.env.INSTACART_PARTNER_ID = 'mori123';
    const baseUrl = 'https://www.instacart.com/store/s?products_link_token=abc';
    fetchMock.mockResolvedValue(okInstacartResponse(baseUrl));
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const { url } = (res.json as jest.Mock).mock.calls[0][0];
    expect(url).toContain('utm_campaign=instacart-idp');
    expect(url).toContain('partnerid-mori123');
  });

  it('does not append UTM params when INSTACART_PARTNER_ID is unset', async () => {
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const { url } = (res.json as jest.Mock).mock.calls[0][0];
    expect(url).not.toContain('utm_campaign');
  });

  // ── Request body shape ──────────────────────────────────────────────────────

  it('sends line_items with display_text to Instacart', async () => {
    mockValidate.mockResolvedValue({
      items: [{ name: 'chicken breast', displayText: 'chicken breast 1 lb' }],
      title: 'Mori: Grilled Chicken',
    });
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.line_items[0].display_text).toBe('chicken breast 1 lb');
    expect(body.title).toBe('Mori: Grilled Chicken');
  });

  it('defaults title to "Mori Grocery List" when not provided', async () => {
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.title).toBe('Mori Grocery List');
  });

  it('sends link_type as shopping_list', async () => {
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.link_type).toBe('shopping_list');
  });

  it('includes line_item_measurements when measurement provided', async () => {
    mockValidate.mockResolvedValue({
      items: [{ name: 'milk', displayText: 'milk 2 cups', measurement: { quantity: 2, unit: 'cup' } }],
    });
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.line_items[0].line_item_measurements).toEqual([{ quantity: 2, unit: 'cup' }]);
  });

  it('omits line_item_measurements when no measurement', async () => {
    const res = makeRes() as any;
    await handler(makeReq() as any, res);
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.line_items[0].line_item_measurements).toBeUndefined();
  });
});
