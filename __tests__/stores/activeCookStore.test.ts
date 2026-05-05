import {
  useActiveCookStore,
  isActiveCookStale,
  ACTIVE_COOK_STALE_MS,
} from '@/stores/activeCookStore';

beforeEach(() => {
  useActiveCookStore.getState().reset();
  jest.useRealTimers();
});

describe('activeCookStore.startCook', () => {
  it('sets recipeId, ratio, stepIndex=0, and timestamps', () => {
    const before = Date.now();
    useActiveCookStore.getState().startCook('recipe-abc', 1.5);
    const s = useActiveCookStore.getState();
    expect(s.recipeId).toBe('recipe-abc');
    expect(s.ratio).toBe(1.5);
    expect(s.stepIndex).toBe(0);
    expect(s.startedAt).toBeGreaterThanOrEqual(before);
    expect(s.lastTickAt).toBe(s.startedAt);
  });

  it('overwrites a prior session', () => {
    useActiveCookStore.getState().startCook('recipe-1', 1);
    useActiveCookStore.getState().setStep(3);
    useActiveCookStore.getState().startCook('recipe-2', 2);
    const s = useActiveCookStore.getState();
    expect(s.recipeId).toBe('recipe-2');
    expect(s.stepIndex).toBe(0);
    expect(s.ratio).toBe(2);
  });
});

describe('activeCookStore.setStep', () => {
  it('updates stepIndex and lastTickAt', () => {
    useActiveCookStore.getState().startCook('recipe-1', 1);
    const t0 = useActiveCookStore.getState().lastTickAt;
    // Spin briefly so lastTickAt advances at least 1ms.
    const target = t0 + 1;
    while (Date.now() < target) { /* noop */ }
    useActiveCookStore.getState().setStep(4);
    const s = useActiveCookStore.getState();
    expect(s.stepIndex).toBe(4);
    expect(s.lastTickAt).toBeGreaterThan(t0);
  });
});

describe('activeCookStore.endCook', () => {
  it('clears the session back to initial', () => {
    useActiveCookStore.getState().startCook('recipe-1', 1);
    useActiveCookStore.getState().setStep(2);
    useActiveCookStore.getState().endCook();
    const s = useActiveCookStore.getState();
    expect(s.recipeId).toBeNull();
    expect(s.stepIndex).toBe(0);
    expect(s.ratio).toBe(1);
    expect(s.startedAt).toBe(0);
    expect(s.lastTickAt).toBe(0);
  });
});

describe('isActiveCookStale', () => {
  it('treats lastTickAt=0 as stale', () => {
    expect(isActiveCookStale(0)).toBe(true);
  });

  it('returns false for a tick within the window', () => {
    const now = 1_000_000_000;
    const tick = now - (ACTIVE_COOK_STALE_MS - 1000); // 1 sec inside window
    expect(isActiveCookStale(tick, now)).toBe(false);
  });

  it('returns true for a tick past the window', () => {
    const now = 1_000_000_000;
    const tick = now - (ACTIVE_COOK_STALE_MS + 1000); // 1 sec past window
    expect(isActiveCookStale(tick, now)).toBe(true);
  });

  it('returns false at the exact window boundary', () => {
    const now = 1_000_000_000;
    const tick = now - ACTIVE_COOK_STALE_MS;
    expect(isActiveCookStale(tick, now)).toBe(false);
  });
});
