/**
 * moriPlusEntry — the ProfileSheet "Mori+" row presentation logic.
 *
 * Two gates govern it: the kill switch (enabled) decides whether the row exists
 * at all, and isPremium decides upgrade-vs-manage. The row must be completely
 * hidden when the kill switch is off (Mori+ stays dark pre-launch), regardless
 * of premium state.
 */

import { moriPlusEntry } from '@/lib/moriPlusEntry';

describe('moriPlusEntry — kill switch governs visibility', () => {
  it('returns null when disabled, even if premium', () => {
    expect(moriPlusEntry(false, true)).toBeNull();
  });

  it('returns null when disabled and not premium', () => {
    expect(moriPlusEntry(false, false)).toBeNull();
  });
});

describe('moriPlusEntry — enabled', () => {
  it('shows the upgrade row for a free user', () => {
    const entry = moriPlusEntry(true, false);
    expect(entry).toEqual({
      label: 'Upgrade to Mori+',
      icon: 'sparkles-outline',
      mode: 'upgrade',
    });
  });

  it('shows the manage row for a premium user', () => {
    const entry = moriPlusEntry(true, true);
    expect(entry).toEqual({
      label: 'Mori+ · Active',
      icon: 'sparkles',
      mode: 'manage',
    });
  });

  it('mode flips with premium state at the same enabled flag', () => {
    expect(moriPlusEntry(true, false)?.mode).toBe('upgrade');
    expect(moriPlusEntry(true, true)?.mode).toBe('manage');
  });
});
