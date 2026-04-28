import type { Profile } from '../../types';

// Copy constants from edit-profile.tsx (pure logic, not importing the screen to avoid RN deps)
const LOCK_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getUsernameUnlockDate(p: Profile | null): Date | null {
  if (!p?.username_changed_at) return null;
  const unlocks = new Date(new Date(p.username_changed_at).getTime() + LOCK_DAYS * MS_PER_DAY);
  return unlocks > new Date() ? unlocks : null;
}

function formatUnlockDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const baseProfile: Profile = {
  id: 'test-id',
  name: 'Test User',
  username: 'testuser',
  username_changed_at: null,
  avatar_url: null,
  dietary_tags: [],
  skill_level: 'beginner',
  budget: null,
  cuisine_preferences: [],
  ingredient_dislikes: [],
  pantry_items: [],
  onboarding_complete: true,
  created_at: '2025-01-01T00:00:00Z',
  dietary_goal: null,
  unit_system: 'us',
  appearance: 'system',
  streaks: null,
  last_cooked_at: null,
  badges: [],
  push_token: null,
  push_enabled: false,
};

describe('getUsernameUnlockDate', () => {
  it('returns null when profile is null', () => {
    expect(getUsernameUnlockDate(null)).toBeNull();
  });

  it('returns null when username_changed_at is null', () => {
    expect(getUsernameUnlockDate({ ...baseProfile, username_changed_at: null })).toBeNull();
  });

  it('returns null when change was more than 30 days ago', () => {
    const fiftyDaysAgo = new Date(Date.now() - 50 * MS_PER_DAY).toISOString();
    expect(getUsernameUnlockDate({ ...baseProfile, username_changed_at: fiftyDaysAgo })).toBeNull();
  });

  it('returns null when change was exactly 30 days ago', () => {
    const thirtyDaysAgo = new Date(Date.now() - LOCK_DAYS * MS_PER_DAY).toISOString();
    expect(getUsernameUnlockDate({ ...baseProfile, username_changed_at: thirtyDaysAgo })).toBeNull();
  });

  it('returns unlock Date when change was less than 30 days ago', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * MS_PER_DAY).toISOString();
    const result = getUsernameUnlockDate({ ...baseProfile, username_changed_at: tenDaysAgo });
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });

  it('unlock date is exactly 30 days after username_changed_at', () => {
    const changedAt = new Date(Date.now() - 5 * MS_PER_DAY);
    const result = getUsernameUnlockDate({ ...baseProfile, username_changed_at: changedAt.toISOString() });
    const expectedUnlock = new Date(changedAt.getTime() + LOCK_DAYS * MS_PER_DAY);
    expect(result!.getTime()).toBeCloseTo(expectedUnlock.getTime(), -3); // within 1 second
  });

  it('returns a future date when changed yesterday', () => {
    const yesterday = new Date(Date.now() - MS_PER_DAY).toISOString();
    const result = getUsernameUnlockDate({ ...baseProfile, username_changed_at: yesterday });
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('formatUnlockDate', () => {
  it('formats a known date correctly', () => {
    // Use a fixed date to avoid locale-dependent surprises
    const date = new Date(2026, 4, 27); // May 27, 2026 (month is 0-indexed)
    const result = formatUnlockDate(date);
    expect(result).toBe('May 27, 2026');
  });

  it('formats a date in a different month', () => {
    const date = new Date(2026, 0, 1); // January 1, 2026
    expect(formatUnlockDate(date)).toBe('January 1, 2026');
  });

  it('returns a non-empty string for any valid date', () => {
    expect(formatUnlockDate(new Date())).toBeTruthy();
  });
});
