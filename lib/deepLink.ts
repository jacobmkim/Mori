// Deep-link URL validation. Kept as a pure function so the security-critical
// matching logic is tested independently of the React Native router.
//
// The previous implementation used `url.includes('mori://reset-password')`,
// which matched the substring anywhere — letting a malicious page route the
// user via `https://evil.com?x=mori://reset-password#access_token=…`. This
// helper uses strict scheme + hostname matching via the WHATWG URL parser.

export function isResetPasswordUrl(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== 'mori:') return false;
  if (url.hostname !== 'reset-password') return false;
  return true;
}
