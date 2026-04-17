import { useLeftoversStore } from '@/stores/leftoversStore';

jest.mock('@/lib/api', () => ({
  getLeftovers: jest.fn(),
  addLeftovers: jest.fn(),
  dismissLeftover: jest.fn(),
  extendLeftover: jest.fn(),
  clearDiscoverCache: jest.fn(),
}));

import {
  getLeftovers,
  addLeftovers as apiAddLeftovers,
  dismissLeftover as apiDismissLeftover,
  extendLeftover as apiExtendLeftover,
  clearDiscoverCache,
} from '@/lib/api';

const mockGetLeftovers = getLeftovers as jest.Mock;
const mockAddLeftovers = apiAddLeftovers as jest.Mock;
const mockDismiss = apiDismissLeftover as jest.Mock;
const mockExtend = apiExtendLeftover as jest.Mock;
const mockClearCache = clearDiscoverCache as jest.Mock;

const FUTURE = new Date(Date.now() + 3 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 1 * 86_400_000).toISOString();

function makeLeftover(overrides: Partial<{ id: string; ingredient_name: string; spoils_at: string; dismissed_at: string | null }> = {}) {
  return {
    id: 'left-1',
    user_id: 'user-1',
    ingredient_id: null,
    ingredient_name: 'chicken',
    added_at: new Date().toISOString(),
    storage_method: 'fridge',
    spoils_at: FUTURE,
    dismissed_at: null,
    extended_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useLeftoversStore.setState({ leftovers: [], loading: false, error: null });
  jest.clearAllMocks();
});

// ─── loadLeftovers ────────────────────────────────────────────────────────────

describe('leftoversStore.loadLeftovers', () => {
  it('populates leftovers on success', async () => {
    const rows = [makeLeftover()];
    mockGetLeftovers.mockResolvedValueOnce(rows);
    await useLeftoversStore.getState().loadLeftovers('user-1');
    expect(useLeftoversStore.getState().leftovers).toEqual(rows);
    expect(useLeftoversStore.getState().loading).toBe(false);
  });

  it('sets error on failure', async () => {
    mockGetLeftovers.mockRejectedValueOnce(new Error('DB error'));
    await useLeftoversStore.getState().loadLeftovers('user-1');
    expect(useLeftoversStore.getState().error).toBe('Failed to load leftovers');
    expect(useLeftoversStore.getState().leftovers).toHaveLength(0);
  });
});

// ─── addLeftovers ────────────────────────────────────────────────────────────

describe('leftoversStore.addLeftovers', () => {
  it('optimistically adds rows before API resolves', async () => {
    mockAddLeftovers.mockResolvedValueOnce([makeLeftover({ id: 'real-1' })]);
    const p = useLeftoversStore.getState().addLeftovers('user-1', [{ name: 'chicken', spoilsAt: FUTURE }]);
    // Check optimistic row is present immediately (before await)
    const optimistic = useLeftoversStore.getState().leftovers;
    expect(optimistic).toHaveLength(1);
    expect(optimistic[0].id).toMatch(/^optimistic-/);
    await p;
    // After resolve, replaced by real rows
    const final = useLeftoversStore.getState().leftovers;
    expect(final).toHaveLength(1);
    expect(final[0].id).toBe('real-1');
  });

  it('rolls back optimistic rows on API failure', async () => {
    mockAddLeftovers.mockRejectedValueOnce(new Error('Network'));
    await useLeftoversStore.getState().addLeftovers('user-1', [{ name: 'salmon', spoilsAt: FUTURE }]);
    expect(useLeftoversStore.getState().leftovers).toHaveLength(0);
  });

  it('does nothing when items array is empty', async () => {
    await useLeftoversStore.getState().addLeftovers('user-1', []);
    expect(mockAddLeftovers).not.toHaveBeenCalled();
    expect(useLeftoversStore.getState().leftovers).toHaveLength(0);
  });

  it('calls clearDiscoverCache on add', async () => {
    mockAddLeftovers.mockResolvedValueOnce([makeLeftover()]);
    await useLeftoversStore.getState().addLeftovers('user-1', [{ name: 'steak', spoilsAt: FUTURE }]);
    expect(mockClearCache).toHaveBeenCalled();
  });

  it('does not remove existing real leftovers when replacing optimistic rows', async () => {
    const existing = makeLeftover({ id: 'pre-existing', ingredient_name: 'broccoli' });
    useLeftoversStore.setState({ leftovers: [existing] });
    mockAddLeftovers.mockResolvedValueOnce([makeLeftover({ id: 'real-2', ingredient_name: 'salmon' })]);
    await useLeftoversStore.getState().addLeftovers('user-1', [{ name: 'salmon', spoilsAt: FUTURE }]);
    const ids = useLeftoversStore.getState().leftovers.map((l) => l.id);
    expect(ids).toContain('pre-existing');
    expect(ids).toContain('real-2');
  });
});

// ─── dismissLeftover ─────────────────────────────────────────────────────────

describe('leftoversStore.dismissLeftover', () => {
  it('sets dismissed_at immediately (optimistic)', () => {
    mockDismiss.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1' })] });
    useLeftoversStore.getState().dismissLeftover('left-1');
    const row = useLeftoversStore.getState().leftovers.find((l) => l.id === 'left-1');
    expect(row?.dismissed_at).not.toBeNull();
  });

  it('fires API dismiss call', async () => {
    mockDismiss.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1' })] });
    useLeftoversStore.getState().dismissLeftover('left-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(mockDismiss).toHaveBeenCalledWith('left-1');
  });

  it('calls clearDiscoverCache on dismiss', () => {
    mockDismiss.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1' })] });
    useLeftoversStore.getState().dismissLeftover('left-1');
    expect(mockClearCache).toHaveBeenCalled();
  });

  it('does not modify other leftovers', () => {
    mockDismiss.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({
      leftovers: [makeLeftover({ id: 'left-1' }), makeLeftover({ id: 'left-2' })],
    });
    useLeftoversStore.getState().dismissLeftover('left-1');
    const other = useLeftoversStore.getState().leftovers.find((l) => l.id === 'left-2');
    expect(other?.dismissed_at).toBeNull();
  });
});

// ─── extendLeftover ──────────────────────────────────────────────────────────

describe('leftoversStore.extendLeftover', () => {
  it('extends spoils_at by N days immediately', () => {
    mockExtend.mockResolvedValueOnce(undefined);
    const spoilsAt = FUTURE;
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1', spoils_at: spoilsAt })] });
    useLeftoversStore.getState().extendLeftover('left-1', 2);
    const row = useLeftoversStore.getState().leftovers.find((l) => l.id === 'left-1')!;
    const diff = new Date(row.spoils_at).getTime() - new Date(spoilsAt).getTime();
    expect(diff).toBeCloseTo(2 * 86_400_000, -3);
  });

  it('increments extended_count', () => {
    mockExtend.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1' })] });
    useLeftoversStore.getState().extendLeftover('left-1', 2);
    const row = useLeftoversStore.getState().leftovers.find((l) => l.id === 'left-1')!;
    expect(row.extended_count).toBe(1);
  });

  it('fires API extend call', async () => {
    mockExtend.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1' })] });
    useLeftoversStore.getState().extendLeftover('left-1', 3);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockExtend).toHaveBeenCalledWith('left-1', expect.any(String), 1);
  });

  it('calls clearDiscoverCache on extend', () => {
    mockExtend.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1' })] });
    useLeftoversStore.getState().extendLeftover('left-1', 2);
    expect(mockClearCache).toHaveBeenCalled();
  });

  it('can extend a past-expiry leftover back into valid range', () => {
    mockExtend.mockResolvedValueOnce(undefined);
    useLeftoversStore.setState({ leftovers: [makeLeftover({ id: 'left-1', spoils_at: PAST })] });
    useLeftoversStore.getState().extendLeftover('left-1', 5);
    const row = useLeftoversStore.getState().leftovers.find((l) => l.id === 'left-1')!;
    expect(new Date(row.spoils_at).getTime()).toBeGreaterThan(Date.now());
  });
});
