// Suppress Supabase init and store hooks — urgentLeftover is a pure function
jest.mock('@/lib/api', () => ({
  getLeftovers: jest.fn(),
  addLeftovers: jest.fn(),
  dismissLeftover: jest.fn(),
  extendLeftover: jest.fn(),
  clearDiscoverCache: jest.fn(),
}));

jest.mock('@/stores/leftoversStore', () => ({
  useLeftoversStore: jest.fn(() => ({ leftovers: [], dismissLeftover: jest.fn(), extendLeftover: jest.fn() })),
}));

import { urgentLeftover } from '@/components/LeftoversReminderCard';
import type { UserLeftover } from '@/types';

const DAY_MS = 86_400_000;

function make(overrides: Partial<UserLeftover> = {}): UserLeftover {
  return {
    id: 'left-1',
    user_id: 'user-1',
    ingredient_id: null,
    ingredient_name: 'chicken',
    added_at: new Date().toISOString(),
    storage_method: 'fridge',
    spoils_at: new Date(Date.now() + DAY_MS).toISOString(), // 1 day from now
    dismissed_at: null,
    extended_count: 0,
    ...overrides,
  };
}

// ─── Window logic ─────────────────────────────────────────────────────────────

describe('urgentLeftover — date window', () => {
  it('returns null for empty array', () => {
    expect(urgentLeftover([])).toBeNull();
  });

  it('returns leftover expiring today (within 24h)', () => {
    const l = make({ spoils_at: new Date(Date.now() + 6 * 3600_000).toISOString() });
    expect(urgentLeftover([l])).toEqual(l);
  });

  it('returns leftover expiring in 1 day', () => {
    const l = make({ spoils_at: new Date(Date.now() + DAY_MS).toISOString() });
    expect(urgentLeftover([l])).toEqual(l);
  });

  it('returns leftover expiring in 2 days', () => {
    const l = make({ spoils_at: new Date(Date.now() + 2 * DAY_MS).toISOString() });
    expect(urgentLeftover([l])).toEqual(l);
  });

  it('returns null for leftover expiring in 3+ days (outside window)', () => {
    const l = make({ spoils_at: new Date(Date.now() + 3 * DAY_MS).toISOString() });
    expect(urgentLeftover([l])).toBeNull();
  });

  it('returns leftover expired up to 2 days ago (still within past window)', () => {
    const l = make({ spoils_at: new Date(Date.now() - DAY_MS).toISOString() });
    expect(urgentLeftover([l])).toEqual(l);
  });

  it('returns null for leftover expired more than 2 days ago', () => {
    const l = make({ spoils_at: new Date(Date.now() - 3 * DAY_MS).toISOString() });
    expect(urgentLeftover([l])).toBeNull();
  });

  it('returns the most urgent (earliest spoils_at) when multiple candidates', () => {
    const soon = make({ id: 'a', spoils_at: new Date(Date.now() + 1 * 3600_000).toISOString() });
    const later = make({ id: 'b', spoils_at: new Date(Date.now() + 2 * DAY_MS).toISOString() });
    expect(urgentLeftover([later, soon])?.id).toBe('a');
  });
});

// ─── Dismissed filter ────────────────────────────────────────────────────────

describe('urgentLeftover — dismissed filter', () => {
  it('skips dismissed leftovers', () => {
    const dismissed = make({ dismissed_at: new Date().toISOString() });
    expect(urgentLeftover([dismissed])).toBeNull();
  });

  it('returns the non-dismissed one when mixed', () => {
    const dismissed = make({ id: 'a', dismissed_at: new Date().toISOString() });
    const active = make({ id: 'b' });
    expect(urgentLeftover([dismissed, active])?.id).toBe('b');
  });

  it('returns null when all leftovers are dismissed', () => {
    const ts = new Date().toISOString();
    const all = [
      make({ id: 'a', dismissed_at: ts }),
      make({ id: 'b', dismissed_at: ts }),
    ];
    expect(urgentLeftover(all)).toBeNull();
  });
});

// ─── NaN date guard ───────────────────────────────────────────────────────────

describe('urgentLeftover — NaN date guard', () => {
  it('does not crash on invalid date string', () => {
    const bad = make({ spoils_at: 'not-a-date' });
    expect(() => urgentLeftover([bad])).not.toThrow();
  });

  it('silently excludes row with invalid date', () => {
    const bad = make({ id: 'bad', spoils_at: 'not-a-date' });
    expect(urgentLeftover([bad])).toBeNull();
  });

  it('still returns valid rows when mixed with invalid-date row', () => {
    const bad = make({ id: 'bad', spoils_at: 'not-a-date' });
    const good = make({ id: 'good' });
    expect(urgentLeftover([bad, good])?.id).toBe('good');
  });

  it('does not crash on empty spoils_at string', () => {
    const bad = make({ spoils_at: '' });
    expect(() => urgentLeftover([bad])).not.toThrow();
    expect(urgentLeftover([bad])).toBeNull();
  });
});
