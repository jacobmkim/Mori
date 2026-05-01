jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

import { getEffectiveStreak } from '@/lib/api';

describe('getEffectiveStreak', () => {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('en-CA');
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toLocaleDateString('en-CA');

  it('returns the current streak when last cook was today', () => {
    expect(getEffectiveStreak(10, today)).toBe(10);
  });

  it('returns the current streak when last cook was yesterday (still salvageable)', () => {
    expect(getEffectiveStreak(10, yesterday)).toBe(10);
  });

  it('returns 0 when last cook was 2 days ago (streak broken)', () => {
    expect(getEffectiveStreak(10, twoDaysAgo)).toBe(0);
  });

  it('returns 0 when last cook was 10 days ago (long-broken stale streak)', () => {
    expect(getEffectiveStreak(10, tenDaysAgo)).toBe(0);
  });

  it('returns 0 when current_streak is null', () => {
    expect(getEffectiveStreak(null, today)).toBe(0);
  });

  it('returns 0 when last_cooked_date is null', () => {
    expect(getEffectiveStreak(10, null)).toBe(0);
  });

  it('returns 0 when both are null/undefined', () => {
    expect(getEffectiveStreak(undefined, undefined)).toBe(0);
  });
});
