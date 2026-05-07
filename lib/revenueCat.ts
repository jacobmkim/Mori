// No-op stub on main. The real RevenueCat wrapper lives on the mori-plus
// branch and supersedes this file when Mori+ merges to main for v1.1.
// Until then, _layout.tsx's initRevenueCat call is harmless.
export async function initRevenueCat(_userId: string | null): Promise<void> {
  return;
}
