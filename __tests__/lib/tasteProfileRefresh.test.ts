/**
 * shouldAutoRefreshTasteProfile — the client-side policy that decides whether a
 * BACKGROUND taste-profile regeneration may fire. Free tier must NEVER auto-refresh
 * an existing profile: the free budget is 1 gen/month and that credit belongs to the
 * manual Refresh button (the monthly cron keeps free profiles fresh server-side at no
 * budget cost). Cardinal-rule guard — caught by the 2026-07-03 gate audit.
 */
import { shouldAutoRefreshTasteProfile } from '@/lib/tasteProfileRefresh';

const NOW = new Date('2026-07-04T12:00:00Z').getTime();
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

describe('shouldAutoRefreshTasteProfile', () => {
  it('free tier NEVER auto-refreshes an existing profile — stale or not, DNA or not', () => {
    expect(shouldAutoRefreshTasteProfile({ generatedAt: daysAgo(60), hasFlavourDna: false, isPremium: false, now: NOW })).toBe(false);
    expect(shouldAutoRefreshTasteProfile({ generatedAt: daysAgo(15), hasFlavourDna: true, isPremium: false, now: NOW })).toBe(false);
    expect(shouldAutoRefreshTasteProfile({ generatedAt: null, hasFlavourDna: false, isPremium: false, now: NOW })).toBe(false);
  });

  it('premium refreshes when stale (14+ days)', () => {
    expect(shouldAutoRefreshTasteProfile({ generatedAt: daysAgo(15), hasFlavourDna: true, isPremium: true, now: NOW })).toBe(true);
    expect(shouldAutoRefreshTasteProfile({ generatedAt: daysAgo(3), hasFlavourDna: true, isPremium: true, now: NOW })).toBe(false);
  });

  it('premium refreshes when flavourDna is missing (legacy / parse-failure profiles)', () => {
    expect(shouldAutoRefreshTasteProfile({ generatedAt: daysAgo(1), hasFlavourDna: false, isPremium: true, now: NOW })).toBe(true);
  });

  it('premium with an unparseable/missing timestamp treats it as stale', () => {
    expect(shouldAutoRefreshTasteProfile({ generatedAt: 'not-a-date', hasFlavourDna: true, isPremium: true, now: NOW })).toBe(true);
    expect(shouldAutoRefreshTasteProfile({ generatedAt: null, hasFlavourDna: true, isPremium: true, now: NOW })).toBe(true);
  });
});
