import { isValidTimeZone, localSundayFor, localDayOfWeekFor, localHourFor } from '@/lib/timezone';

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

describe('localDayOfWeekFor', () => {
  it('returns 0 for Sunday in the local zone', () => {
    // 2026-06-21T16:00Z = Sun 09:00 PDT
    expect(localDayOfWeekFor('America/Los_Angeles', new Date('2026-06-21T16:00:00Z'))).toBe(0);
  });
  it('uses local date east of UTC (UTC Saturday, local Sunday at UTC+14)', () => {
    // 2026-06-20T19:00Z = Sun 09:00 in Kiritimati (UTC+14), UTC still Saturday
    expect(localDayOfWeekFor('Pacific/Kiritimati', new Date('2026-06-20T19:00:00Z'))).toBe(0);
  });
  it('returns 1 for Monday', () => {
    expect(localDayOfWeekFor('America/Los_Angeles', new Date('2026-06-22T16:00:00Z'))).toBe(1);
  });
});

describe('localHourFor', () => {
  it('reads the integer local hour (PDT)', () => {
    expect(localHourFor('America/Los_Angeles', new Date('2026-06-21T16:00:00Z'))).toBe(9);  // 09:00 PDT
    expect(localHourFor('America/Los_Angeles', new Date('2026-06-21T15:00:00Z'))).toBe(8);
    expect(localHourFor('America/Los_Angeles', new Date('2026-06-21T18:00:00Z'))).toBe(11);
  });
  it('is correct for fractional-offset zones (Asia/Kolkata +5:30)', () => {
    expect(localHourFor('Asia/Kolkata', new Date('2026-06-21T03:30:00Z'))).toBe(9); // 09:00 IST
  });
  it('reports 0 (not 24) at local midnight', () => {
    expect(localHourFor('Asia/Tokyo', new Date('2026-06-20T15:00:00Z'))).toBe(0); // 00:00 JST
  });
  it('falls back to UTC for an invalid zone', () => {
    expect(localHourFor('Not/AZone', new Date('2026-06-21T09:00:00Z'))).toBe(9);
  });
});
