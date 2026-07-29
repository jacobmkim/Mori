import { useMealPlanStore } from '@/stores/mealPlanStore';

jest.mock('@/lib/api', () => ({
  getMealPlanForWeek: jest.fn(),
  saveMealPlan: jest.fn(),
}));

import { getMealPlanForWeek, saveMealPlan } from '@/lib/api';

const mockGetMealPlan = getMealPlanForWeek as jest.Mock;
const mockSaveMealPlan = saveMealPlan as jest.Mock;

const MOCK_PLAN = {
  id: 'plan-1',
  user_id: 'user-1',
  week_start_date: '2026-04-07',
  is_public: false,
  slots: [],
  created_at: '',
};

beforeEach(() => {
  useMealPlanStore.setState({ plan: null, isLoading: false, error: null });
  jest.clearAllMocks();
});

// ─── savePlan ─────────────────────────────────────────────────────────────────

describe('mealPlanStore — savePlan', () => {
  it('clears error on successful save', async () => {
    // loadedWeek must match — savePlan refuses to write a week it never read.
    useMealPlanStore.setState({ error: 'Failed to save meal plan', loadedWeek: '2026-04-07' });
    mockSaveMealPlan.mockResolvedValueOnce(MOCK_PLAN);

    await useMealPlanStore.getState().savePlan('user-1', '2026-04-07');

    expect(useMealPlanStore.getState().error).toBeNull();
    expect(useMealPlanStore.getState().plan).toEqual(MOCK_PLAN);
  });

  it('sets error on failed save', async () => {
    useMealPlanStore.setState({ plan: MOCK_PLAN, loadedWeek: '2026-04-07' });
    mockSaveMealPlan.mockRejectedValueOnce(new Error('network error'));

    await useMealPlanStore.getState().savePlan('user-1', '2026-04-07');

    expect(useMealPlanStore.getState().error).toBe('Failed to save meal plan');
  });

  // Regression: a FAILED load left plan:null, the UI rendered a real week as empty, and the
  // next edit persisted that empty week over the user's actual meals.
  it('REFUSES to save a week whose load failed (never overwrites an unread week)', async () => {
    useMealPlanStore.setState({ plan: null, loadedWeek: null });
    const ok = await useMealPlanStore.getState().savePlan('user-1', '2026-04-07');
    expect(ok).toBe(false);
    expect(mockSaveMealPlan).not.toHaveBeenCalled();
  });

  it('REFUSES to save when the store holds a DIFFERENT week', async () => {
    useMealPlanStore.setState({ plan: MOCK_PLAN, loadedWeek: '2026-03-31' });
    const ok = await useMealPlanStore.getState().savePlan('user-1', '2026-04-07');
    expect(ok).toBe(false);
    expect(mockSaveMealPlan).not.toHaveBeenCalled();
  });

  it('a failed load marks the week unknown', async () => {
    mockGetMealPlan.mockRejectedValueOnce(new Error('network'));
    await useMealPlanStore.getState().loadPlan('user-1', '2026-04-07');
    expect(useMealPlanStore.getState().plan).toBeNull();
    expect(useMealPlanStore.getState().loadedWeek).toBeNull();
  });
});

// ─── loadPlan ─────────────────────────────────────────────────────────────────

describe('mealPlanStore — loadPlan', () => {
  it('clears stale error on success', async () => {
    useMealPlanStore.setState({ error: 'stale error' });
    mockGetMealPlan.mockResolvedValueOnce(MOCK_PLAN);

    await useMealPlanStore.getState().loadPlan('user-1', '2026-04-07');

    expect(useMealPlanStore.getState().error).toBeNull();
  });

  it('sets plan and clears loading on success', async () => {
    mockGetMealPlan.mockResolvedValueOnce(MOCK_PLAN);

    await useMealPlanStore.getState().loadPlan('user-1', '2026-04-07');

    expect(useMealPlanStore.getState().plan).toEqual(MOCK_PLAN);
    expect(useMealPlanStore.getState().isLoading).toBe(false);
  });

  it('sets error and clears loading on failure', async () => {
    mockGetMealPlan.mockRejectedValueOnce(new Error('DB unavailable'));

    await useMealPlanStore.getState().loadPlan('user-1', '2026-04-07');

    expect(useMealPlanStore.getState().error).toBe('Failed to load meal plan');
    expect(useMealPlanStore.getState().isLoading).toBe(false);
  });
});

// ─── addSlot ──────────────────────────────────────────────────────────────────

describe('mealPlanStore — addSlot', () => {
  const slot = { day: 1, meal_type: 'lunch' as const, recipe_id: 'r1', servings_multiplier: 1 };

  it('adds a slot to an existing plan', () => {
    useMealPlanStore.setState({ plan: MOCK_PLAN });

    useMealPlanStore.getState().addSlot(slot);

    expect(useMealPlanStore.getState().plan?.slots).toHaveLength(1);
    expect(useMealPlanStore.getState().plan?.slots[0]).toEqual(slot);
  });

  it('creates a plan from scratch when plan is null', () => {
    useMealPlanStore.getState().addSlot(slot);

    expect(useMealPlanStore.getState().plan).not.toBeNull();
    expect(useMealPlanStore.getState().plan?.slots).toHaveLength(1);
  });

  it('replaces an existing slot for the same day + mealType', () => {
    const updated = { ...slot, recipe_id: 'r2' };
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot] } });

    useMealPlanStore.getState().addSlot(updated);

    const slots = useMealPlanStore.getState().plan?.slots ?? [];
    expect(slots).toHaveLength(1);
    expect(slots[0].recipe_id).toBe('r2');
  });

  it('adds a second slot for a different day', () => {
    const slot2 = { day: 2, meal_type: 'dinner' as const, recipe_id: 'r2', servings_multiplier: 1 };
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot] } });

    useMealPlanStore.getState().addSlot(slot2);

    expect(useMealPlanStore.getState().plan?.slots).toHaveLength(2);
  });
});

// ─── removeSlot ───────────────────────────────────────────────────────────────

describe('mealPlanStore — removeSlot', () => {
  const slot = { day: 1, meal_type: 'lunch' as const, recipe_id: 'r1', servings_multiplier: 1 };

  it('removes the slot for the given day + mealType', () => {
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot] } });

    useMealPlanStore.getState().removeSlot(1, 'lunch');

    expect(useMealPlanStore.getState().plan?.slots).toHaveLength(0);
  });

  it('does not affect other slots', () => {
    const slot2 = { day: 2, meal_type: 'dinner' as const, recipe_id: 'r2', servings_multiplier: 1 };
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot, slot2] } });

    useMealPlanStore.getState().removeSlot(1, 'lunch');

    expect(useMealPlanStore.getState().plan?.slots).toHaveLength(1);
    expect(useMealPlanStore.getState().plan?.slots[0].recipe_id).toBe('r2');
  });

  it('is a no-op when plan is null', () => {
    useMealPlanStore.getState().removeSlot(1, 'lunch');
    expect(useMealPlanStore.getState().plan).toBeNull();
  });
});

// ─── setSlotCooked ────────────────────────────────────────────────────────────

describe('mealPlanStore — setSlotCooked', () => {
  const slot = { day: 1, meal_type: 'lunch' as const, recipe_id: 'r1', servings_multiplier: 1 };

  it('sets cooked_at on the matching slot', () => {
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot] } });

    useMealPlanStore.getState().setSlotCooked(1, 'lunch', '2026-05-28T12:00:00Z');

    expect(useMealPlanStore.getState().plan?.slots[0].cooked_at).toBe('2026-05-28T12:00:00Z');
  });

  it('clears cooked_at when passed null', () => {
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [{ ...slot, cooked_at: '2026-05-28T12:00:00Z' }] } });

    useMealPlanStore.getState().setSlotCooked(1, 'lunch', null);

    expect(useMealPlanStore.getState().plan?.slots[0].cooked_at).toBeNull();
  });

  it('does not touch other slots', () => {
    const slot2 = { day: 2, meal_type: 'dinner' as const, recipe_id: 'r2', servings_multiplier: 1 };
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot, slot2] } });

    useMealPlanStore.getState().setSlotCooked(1, 'lunch', '2026-05-28T12:00:00Z');

    const slots = useMealPlanStore.getState().plan?.slots ?? [];
    expect(slots.find((s) => s.day === 2)?.cooked_at).toBeUndefined();
  });

  it('is a no-op when plan is null', () => {
    useMealPlanStore.getState().setSlotCooked(1, 'lunch', '2026-05-28T12:00:00Z');
    expect(useMealPlanStore.getState().plan).toBeNull();
  });
});

// ─── clearSlots ───────────────────────────────────────────────────────────────

describe('mealPlanStore — clearSlots', () => {
  const slot = { day: 1, meal_type: 'lunch' as const, recipe_id: 'r1', servings_multiplier: 1 };

  it('removes all slots from the plan', () => {
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot] } });

    useMealPlanStore.getState().clearSlots();

    expect(useMealPlanStore.getState().plan?.slots).toHaveLength(0);
  });

  it('preserves plan metadata after clearing slots', () => {
    useMealPlanStore.setState({ plan: { ...MOCK_PLAN, slots: [slot] } });

    useMealPlanStore.getState().clearSlots();

    expect(useMealPlanStore.getState().plan?.id).toBe('plan-1');
  });

  it('is a no-op when plan is null', () => {
    useMealPlanStore.getState().clearSlots();
    expect(useMealPlanStore.getState().plan).toBeNull();
  });
});

// ─── Load ordering + save-refusal (2026-07-29 verification review) ────────────

describe('mealPlanStore — concurrent loads', () => {
  it('a slow LOSER load cannot overwrite the winner (Sunday Drop deep-link race)', async () => {
    // The Plan tab mounts on the current week, then `mori://plan?week=` switches it — two loads
    // are in flight. Without a sequence token the slow first one lands last, leaving loadedWeek
    // on the wrong week, and savePlan then refuses forever on a perfect connection.
    let resolveSlow: (v: any) => void = () => {};
    mockGetMealPlan
      .mockImplementationOnce(() => new Promise((r) => { resolveSlow = r; }))   // current week (slow)
      .mockResolvedValueOnce({ ...MOCK_PLAN, week_start_date: '2026-08-03' });  // dropped week (fast)

    const p1 = useMealPlanStore.getState().loadPlan('user-1', '2026-07-27');
    const p2 = useMealPlanStore.getState().loadPlan('user-1', '2026-08-03');
    await p2;
    resolveSlow({ ...MOCK_PLAN, week_start_date: '2026-07-27' });
    await p1;

    expect(useMealPlanStore.getState().loadedWeek).toBe('2026-08-03');
  });

  it('a superseded FAILING load cannot clear the winner', async () => {
    let rejectSlow: (e: any) => void = () => {};
    mockGetMealPlan
      .mockImplementationOnce(() => new Promise((_r, rej) => { rejectSlow = rej; }))
      .mockResolvedValueOnce({ ...MOCK_PLAN, week_start_date: '2026-08-03' });

    const p1 = useMealPlanStore.getState().loadPlan('user-1', '2026-07-27');
    const p2 = useMealPlanStore.getState().loadPlan('user-1', '2026-08-03');
    await p2;
    rejectSlow(new Error('network'));
    await p1;

    expect(useMealPlanStore.getState().loadedWeek).toBe('2026-08-03');
    expect(useMealPlanStore.getState().plan).not.toBeNull();
  });
});

describe('mealPlanStore — savePlan refuses an unknown week', () => {
  it('returns false and writes NOTHING when the week was never loaded', async () => {
    useMealPlanStore.setState({ loadedWeek: null });
    const ok = await useMealPlanStore.getState().savePlan('user-1', '2026-04-07');
    expect(ok).toBe(false);
    expect(mockSaveMealPlan).not.toHaveBeenCalled();
  });

  it('returns false when the loaded week is a DIFFERENT week (no cross-week write)', async () => {
    useMealPlanStore.setState({ loadedWeek: '2026-04-07' });
    const ok = await useMealPlanStore.getState().savePlan('user-1', '2026-04-14');
    expect(ok).toBe(false);
    expect(mockSaveMealPlan).not.toHaveBeenCalled();
  });

  it('a genuinely empty week still saves (loadedWeek set, plan null)', async () => {
    useMealPlanStore.setState({ plan: null, loadedWeek: '2026-04-07' });
    mockSaveMealPlan.mockResolvedValueOnce(MOCK_PLAN);
    const ok = await useMealPlanStore.getState().savePlan('user-1', '2026-04-07');
    expect(ok).toBe(true);
    expect(mockSaveMealPlan).toHaveBeenCalledWith('user-1', '2026-04-07', [], undefined);
  });
});
