// Pure timezone helpers — NO external imports, so both the client and the Vercel crons
// (e.g. Sunday Drop) can use them. Sunday Drop must fire at each user's LOCAL Sunday
// morning, so we derive the local week-start (Sunday) for a given IANA zone + instant.
//
// All functions are pure and never throw: an invalid/unknown zone falls back to UTC.

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** True if `tz` is an IANA timezone the runtime can resolve (e.g. 'America/Los_Angeles'). */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    // Throws RangeError for an unknown zone.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The local calendar parts (year/month/day + day-of-week) of `now` in `tz`. UTC fallback. */
function localParts(tz: string, now: Date): { y: number; m: number; d: number; dow: number } {
  const zone = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    dow: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

/**
 * The local Sunday (week-start) for `tz` at instant `now`, as an ISO 'YYYY-MM-DD' date.
 * If `now` is Sunday 08:00 in America/Los_Angeles, returns that Sunday's date even when
 * the UTC clock has already rolled to Monday. Pure + DST-safe: we extract the local
 * calendar date via Intl (DST-correct), then do whole-day arithmetic in UTC-epoch space
 * (immune to wall-clock shifts). UTC fallback for an invalid zone.
 */
export function localSundayFor(tz: string, now: Date): string {
  const { y, m, d, dow } = localParts(tz, now);
  // Treat the extracted local Y/M/D as a UTC midnight, then step back `dow` whole days
  // to land on the local Sunday. Working in UTC-epoch space keeps this DST-immune.
  const localMidnightUtc = Date.UTC(y, m - 1, d);
  const sunday = new Date(localMidnightUtc - dow * 86_400_000);
  const yy = sunday.getUTCFullYear();
  const mm = String(sunday.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(sunday.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
