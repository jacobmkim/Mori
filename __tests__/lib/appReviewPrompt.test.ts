/**
 * Tests for the App Store review prompt eligibility logic.
 *
 * isEligible is the pure-function gatekeeper. We don't test the OS prompt
 * itself (StoreReview.requestReview is opaque) — only the conditions under
 * which we'd call it.
 */
import { isEligible, MIN_COOKS, MIN_ACCOUNT_AGE_DAYS, COOLDOWN_DAYS, MIN_STARS } from '@/lib/appReviewPrompt';

const NOW = Date.parse('2026-05-13T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86400_000).toISOString();

describe('isEligible — positive moment', () => {
  it('returns true on first prompt for a 4+ star, eligible user', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: MIN_COOKS,
      accountCreatedAt: daysAgo(MIN_ACCOUNT_AGE_DAYS + 1),
      lastPromptIso: null,
      now: NOW,
    })).toBe(true);
  });

  it('returns true at the 4-star boundary', () => {
    expect(isEligible({
      rating: 4,
      mealsCookedCount: 10,
      accountCreatedAt: daysAgo(30),
      lastPromptIso: null,
      now: NOW,
    })).toBe(true);
  });
});

describe('isEligible — negative-rating filter', () => {
  it('returns false when rating < MIN_STARS', () => {
    for (let r = 0; r < MIN_STARS; r++) {
      expect(isEligible({
        rating: r,
        mealsCookedCount: 10,
        accountCreatedAt: daysAgo(30),
        lastPromptIso: null,
        now: NOW,
      })).toBe(false);
    }
  });
});

describe('isEligible — usage gate', () => {
  it('returns false when mealsCookedCount < MIN_COOKS', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: MIN_COOKS - 1,
      accountCreatedAt: daysAgo(30),
      lastPromptIso: null,
      now: NOW,
    })).toBe(false);
  });
});

describe('isEligible — account age gate', () => {
  it('returns false for accounts younger than MIN_ACCOUNT_AGE_DAYS', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: 10,
      accountCreatedAt: daysAgo(MIN_ACCOUNT_AGE_DAYS - 1),
      lastPromptIso: null,
      now: NOW,
    })).toBe(false);
  });

  it('returns false when accountCreatedAt is null', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: 10,
      accountCreatedAt: null,
      lastPromptIso: null,
      now: NOW,
    })).toBe(false);
  });

  it('returns false for an unparseable accountCreatedAt', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: 10,
      accountCreatedAt: 'not-a-date',
      lastPromptIso: null,
      now: NOW,
    })).toBe(false);
  });
});

describe('isEligible — cooldown gate', () => {
  it('returns false when last prompt was inside the cooldown window', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: 10,
      accountCreatedAt: daysAgo(180),
      lastPromptIso: daysAgo(COOLDOWN_DAYS - 1),
      now: NOW,
    })).toBe(false);
  });

  it('returns true when last prompt is older than the cooldown', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: 10,
      accountCreatedAt: daysAgo(365),
      lastPromptIso: daysAgo(COOLDOWN_DAYS + 1),
      now: NOW,
    })).toBe(true);
  });

  it('tolerates a malformed lastPromptIso (treat as never asked)', () => {
    expect(isEligible({
      rating: 5,
      mealsCookedCount: 10,
      accountCreatedAt: daysAgo(30),
      lastPromptIso: 'garbage',
      now: NOW,
    })).toBe(true);
  });
});
