import { formatTime, formatCost, capitalize, getWeekStart, getTimeOfDay, scaleQuantityString, weekOffsetForDate } from '@/lib/utils';

describe('scaleQuantityString', () => {
  it('returns the quantity unchanged when factor is 1', () => {
    expect(scaleQuantityString('2', 1)).toBe('2');
  });
  it('scales an integer quantity', () => {
    expect(scaleQuantityString('2', 3)).toBe('6');
  });
  it('scales a decimal and trims trailing zeros', () => {
    expect(scaleQuantityString('1.5', 2)).toBe('3');
    expect(scaleQuantityString('0.5', 3)).toBe('1.5');
  });
  it('scales simple and mixed fractions', () => {
    expect(scaleQuantityString('1/2', 3)).toBe('1.5'); // not parseFloat("1/2")===1 ×3
    expect(scaleQuantityString('1/4', 2)).toBe('0.5');
    expect(scaleQuantityString('1 1/2', 2)).toBe('3');
  });
  it('leaves non-numeric quantities untouched', () => {
    expect(scaleQuantityString('to taste', 3)).toBe('to taste');
    expect(scaleQuantityString('', 3)).toBe('');
    expect(scaleQuantityString(null, 3)).toBe('');
    expect(scaleQuantityString(undefined, 3)).toBe('');
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns — when both inputs are null', () => {
    expect(formatTime(null, null)).toBe('—');
  });

  it('returns — when total is 0', () => {
    expect(formatTime(0, 0)).toBe('—');
  });

  it('returns minutes only when total is under 60', () => {
    expect(formatTime(20, 25)).toBe('45m');
  });

  it('returns minutes only for exactly 59 minutes', () => {
    expect(formatTime(30, 29)).toBe('59m');
  });

  it('returns whole hours with no remainder', () => {
    expect(formatTime(30, 30)).toBe('1h');
  });

  it('returns hours and minutes when there is a remainder', () => {
    expect(formatTime(60, 30)).toBe('1h 30m');
  });

  it('handles null prep time (treats as 0)', () => {
    expect(formatTime(null, 45)).toBe('45m');
  });

  it('handles null cook time (treats as 0)', () => {
    expect(formatTime(45, null)).toBe('45m');
  });
});

// ─── formatCost ───────────────────────────────────────────────────────────────

describe('formatCost', () => {
  it('returns — for null cost', () => {
    expect(formatCost(null)).toBe('—');
  });

  it('formats cost with 2 decimal places', () => {
    expect(formatCost(3.5)).toBe('$3.50/serving');
  });

  it('formats whole number cost', () => {
    expect(formatCost(5)).toBe('$5.00/serving');
  });

  it('formats a fractional cost', () => {
    expect(formatCost(12.99)).toBe('$12.99/serving');
  });
});

// ─── capitalize ───────────────────────────────────────────────────────────────

describe('capitalize', () => {
  it('capitalizes the first letter of a lowercase word', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('returns an empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });

  it('does not change an already-capitalized string', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('does not change the remaining characters', () => {
    expect(capitalize('hELLO')).toBe('HELLO');
  });
});

// ─── getWeekStart ─────────────────────────────────────────────────────────────

describe('getWeekStart', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    expect(getWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the same value for two calls with the same date', () => {
    const d = new Date();
    expect(getWeekStart(d)).toBe(getWeekStart(d));
  });

  it('returns a date that parses as a valid Date', () => {
    const result = getWeekStart();
    expect(isNaN(new Date(result).getTime())).toBe(false);
  });

  it('uses local date, not UTC (timezone safety)', () => {
    // 11:30 PM on Wednesday April 9 in UTC-5 = Thursday April 10 in UTC
    // getWeekStart should return Monday April 7, not April 8
    const lateWednesday = new Date(2026, 3, 9, 23, 30); // April 9, 11:30 PM local
    const result = getWeekStart(lateWednesday);
    expect(result).toBe('2026-04-06'); // Monday April 6
  });
});

// ─── weekOffsetForDate (Sunday Drop deep link → Plan tab weekOffset) ───────────

describe('weekOffsetForDate', () => {
  it('Sunday tap → next week (+1): drop populates the upcoming week', () => {
    // 2026-06-21 is a Sunday; this-week Monday = 2026-06-15; drop = next Monday 2026-06-22.
    expect(weekOffsetForDate('2026-06-22', new Date(2026, 5, 21, 9, 30))).toBe(1);
  });

  it('mid-week tap on the populated week → 0', () => {
    // Wed 2026-06-24; this-week Monday = 2026-06-22.
    expect(weekOffsetForDate('2026-06-22', new Date(2026, 5, 24, 12, 0))).toBe(0);
  });

  it('absorbs a DST-boundary week to a clean integer (round, never .5)', () => {
    // Wed 2026-03-04 (before US spring-forward 2026-03-08) → target Mon 2026-03-09; the
    // intervening week crosses the DST switch. round() must still yield exactly 1.
    expect(weekOffsetForDate('2026-03-09', new Date(2026, 2, 4, 12, 0))).toBe(1);
  });

  it('handles a year boundary', () => {
    // Sun 2026-12-27 → this-week Monday 2026-12-21 → target next Monday 2026-12-28 = +1.
    expect(weekOffsetForDate('2026-12-28', new Date(2026, 11, 27, 10, 0))).toBe(1);
  });

  it('returns a negative offset for a stale (past-week) tap', () => {
    // Wed 2026-06-24 (this-week Monday 2026-06-22) → target 2026-06-01 (3 weeks earlier).
    expect(weekOffsetForDate('2026-06-01', new Date(2026, 5, 24, 12, 0))).toBe(-3);
  });

  it('returns null on a malformed date', () => {
    expect(weekOffsetForDate('next')).toBeNull();
    expect(weekOffsetForDate('2026-6-9')).toBeNull();
    expect(weekOffsetForDate('')).toBeNull();
  });
});

// ─── getTimeOfDay ─────────────────────────────────────────────────────────────

describe('getTimeOfDay', () => {
  it('returns one of the four valid time-of-day labels', () => {
    const valid = ['morning', 'afternoon', 'evening', 'night'];
    expect(valid).toContain(getTimeOfDay());
  });
});
