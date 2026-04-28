/**
 * Cron auth — regression guard for the SEED_SECRET fallback removal.
 *
 * Background: both /api/cron/streak-reminders and /api/cron/taste-notifications
 * previously accepted EITHER `CRON_SECRET` OR `SEED_SECRET`. Collapsing both
 * capabilities onto one secret meant a leaked dev SEED_SECRET could trigger
 * push-notification floods to every user. CRON_SECRET is now the only
 * accepted credential, with timingSafeEqual to avoid string-comparison
 * timing leaks.
 */

import { verifyCronAuth } from '@/api/cron/_auth';

const VALID_CRON = 'cron-secret-abcdef1234567890ab';
const VALID_SEED = 'seed-secret-aaaaaaaaaaaaaaaaaa';

const makeReq = (auth?: string | string[]) =>
  ({ headers: auth !== undefined ? { authorization: auth } : {} } as any);

describe('verifyCronAuth', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = VALID_CRON;
    process.env.SEED_SECRET = VALID_SEED;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.SEED_SECRET;
  });

  it('accepts a valid Bearer CRON_SECRET', () => {
    expect(verifyCronAuth(makeReq(`Bearer ${VALID_CRON}`))).toBe(true);
  });

  it('rejects SEED_SECRET (regression for the fallback removal)', () => {
    // Even though SEED_SECRET is configured, presenting it on a cron endpoint
    // must fail. This is the fix for the audit finding.
    expect(verifyCronAuth(makeReq(`Bearer ${VALID_SEED}`))).toBe(false);
  });

  it('rejects requests with no Authorization header', () => {
    expect(verifyCronAuth(makeReq())).toBe(false);
  });

  it('rejects an empty Authorization header', () => {
    expect(verifyCronAuth(makeReq(''))).toBe(false);
  });

  it('rejects a header missing the Bearer prefix', () => {
    expect(verifyCronAuth(makeReq(VALID_CRON))).toBe(false);
  });

  it('rejects a wrong-length Bearer token (avoids the timingSafeEqual length throw)', () => {
    expect(verifyCronAuth(makeReq(`Bearer ${VALID_CRON}x`))).toBe(false);
    expect(verifyCronAuth(makeReq(`Bearer ${VALID_CRON.slice(0, -1)}`))).toBe(false);
  });

  it('rejects a same-length but different-content token', () => {
    const wrong = 'Z'.repeat(VALID_CRON.length);
    expect(verifyCronAuth(makeReq(`Bearer ${wrong}`))).toBe(false);
  });

  it('rejects when CRON_SECRET env var is missing', () => {
    delete process.env.CRON_SECRET;
    expect(verifyCronAuth(makeReq(`Bearer ${VALID_CRON}`))).toBe(false);
  });

  it('rejects an array-typed Authorization header (forwards-compat)', () => {
    // Vercel can theoretically pass headers as string | string[]; the auth
    // helper requires a string and rejects everything else.
    expect(verifyCronAuth(makeReq([`Bearer ${VALID_CRON}`]))).toBe(false);
  });
});
