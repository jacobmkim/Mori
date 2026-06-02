/**
 * showPremiumRing — the AvatarButton premium-rim gate.
 *
 * Two gates: the kill switch (enabled) must be on AND the user must be premium.
 * The rim must stay hidden whenever Mori+ is dark pre-launch, regardless of
 * premium state, and must never show for a free user.
 */

import { showPremiumRing } from '@/lib/premiumRing';

describe('showPremiumRing — kill switch governs the rim', () => {
  it('hidden when disabled, even if premium', () => {
    expect(showPremiumRing(false, true)).toBe(false);
  });

  it('hidden when disabled and not premium', () => {
    expect(showPremiumRing(false, false)).toBe(false);
  });
});

describe('showPremiumRing — enabled', () => {
  it('shows the rim for a premium user', () => {
    expect(showPremiumRing(true, true)).toBe(true);
  });

  it('hidden for a free user', () => {
    expect(showPremiumRing(true, false)).toBe(false);
  });
});
