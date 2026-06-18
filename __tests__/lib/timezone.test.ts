import { isValidTimeZone, localSundayFor } from '@/lib/timezone';

// Anchor: 2026-06-17 is a Wednesday (confirmed from a real webhook Date header during
// I-loop testing), so 2026-06-21 is Sunday, 06-24 Wed, 06-20 Sat. 2026-03-08 is the
// US spring-forward Sunday (2nd Sunday of March), 03-11 the Wed after it.

describe('isValidTimeZone', () => {
  it('accepts real IANA zones', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects junk / empty / nullish', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe('localSundayFor', () => {
  it('Sunday 08:00 local resolves to that Sunday', () => {
    // 2026-06-21T15:00Z = Sun 08:00 PDT (UTC-7) in Los Angeles
    expect(localSundayFor('America/Los_Angeles', new Date('2026-06-21T15:00:00Z'))).toBe('2026-06-21');
  });

  it('uses the LOCAL date, not the UTC date, across the midnight boundary (west of UTC)', () => {
    // 2026-06-22T03:00Z = Sun 20:00 PDT — still Sunday locally, but Monday in UTC
    expect(localSundayFor('America/Los_Angeles', new Date('2026-06-22T03:00:00Z'))).toBe('2026-06-21');
  });

  it('uses the LOCAL date east of UTC (UTC Saturday, local Sunday)', () => {
    // 2026-06-20T20:00Z = Sun 05:00 JST (Tokyo, UTC+9) — UTC is still Saturday
    expect(localSundayFor('Asia/Tokyo', new Date('2026-06-20T20:00:00Z'))).toBe('2026-06-21');
  });

  it('a midweek instant rolls back to the local Sunday', () => {
    // 2026-06-24T12:00Z = Wed 05:00 PDT → previous Sunday is 2026-06-21
    expect(localSundayFor('America/Los_Angeles', new Date('2026-06-24T12:00:00Z'))).toBe('2026-06-21');
  });

  it('is DST-safe across the spring-forward week', () => {
    // 2026-03-11T12:00Z = Wed 05:00 PDT (week after DST began 2026-03-08) → Sun 2026-03-08
    expect(localSundayFor('America/Los_Angeles', new Date('2026-03-11T12:00:00Z'))).toBe('2026-03-08');
    // The transition Sunday itself, mid-morning local
    expect(localSundayFor('America/Los_Angeles', new Date('2026-03-08T17:00:00Z'))).toBe('2026-03-08');
  });

  it('UTC passthrough', () => {
    expect(localSundayFor('UTC', new Date('2026-06-24T12:00:00Z'))).toBe('2026-06-21'); // Wed → Sun
    expect(localSundayFor('UTC', new Date('2026-06-21T00:30:00Z'))).toBe('2026-06-21'); // Sun, early
  });

  it('falls back to UTC for an invalid zone (never throws)', () => {
    expect(localSundayFor('Not/AZone', new Date('2026-06-24T12:00:00Z'))).toBe('2026-06-21');
  });
});
