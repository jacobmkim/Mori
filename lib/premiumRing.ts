// Decides whether the Mori+ premium ring shows on the avatar. Kept as a pure
// function so it's unit-testable without rendering AvatarButton.
//
// Gated on the kill switch first (Mori+ stays dark pre-launch) AND the user's
// premium state — so the rim only appears for a paid user once Mori+ is live.

export function showPremiumRing(enabled: boolean, isPremium: boolean): boolean {
  return enabled && isPremium;
}
