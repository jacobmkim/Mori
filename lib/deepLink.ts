// Deep-link URL validation. Kept as a pure function so the security-critical
// matching logic is tested independently of the React Native router.
//
// The previous implementation used `url.includes('mori://reset-password')`,
// which matched the substring anywhere — letting a malicious page route the
// user via `https://evil.com?x=mori://reset-password#access_token=…`. This
// helper uses strict scheme + hostname matching via the WHATWG URL parser.
//
// We accept three URL shapes so `Linking.createURL('/reset-password')` works
// in every runtime:
//   1. `mori://reset-password`         — host-based, what Supabase has been
//      sending all along (`redirectTo: 'mori://reset-password'` literal)
//   2. `mori:///reset-password`        — path-based, what `Linking.createURL`
//      returns inside a dev-built or release build of the app
//   3. `exp://<host>:<port>/--/reset-password` — Expo Go, only honoured in
//      __DEV__ so a release build never trusts the Expo Go scheme

declare const __DEV__: boolean | undefined;

export function isResetPasswordUrl(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }

  if (url.protocol === 'mori:') {
    if (url.hostname === 'reset-password') return true;
    if (url.hostname === '' && (url.pathname === '/reset-password' || url.pathname === '/reset-password/')) return true;
    return false;
  }

  // Expo Go fallback. Restricted to __DEV__ so a production build can never be
  // tricked into routing on an `exp://` link.
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (isDev && url.protocol === 'exp:') {
    return url.pathname === '/--/reset-password' || url.pathname === '/--/reset-password/';
  }

  return false;
}
