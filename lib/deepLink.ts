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

// Mirrors `isResetPasswordUrl`. Verify links carry a `?token=<uuid>` query
// param that the app forwards to the server for consumption.
export function isVerifyEmailUrl(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }

  if (url.protocol === 'mori:') {
    if (url.hostname === 'verify-email') return true;
    if (url.hostname === '' && (url.pathname === '/verify-email' || url.pathname === '/verify-email/')) return true;
    return false;
  }

  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (isDev && url.protocol === 'exp:') {
    return url.pathname === '/--/verify-email' || url.pathname === '/--/verify-email/';
  }

  return false;
}

// Extract a `token` query param from a verify-email URL, validating shape
// (UUID v4-ish: 36 chars, hex + dashes). Returns null on missing or malformed.
export function extractVerifyToken(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const token = url.searchParams.get('token');
  if (!token) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return null;
  return token;
}

// Recipe-share links of the form `mori://r/<uuid>` (from the "Open in Mori"
// button on the web preview) and Universal Links of the form
// `https://getmori.app/r/<uuid>` (when iOS hands a tapped link directly to
// the app — see `public/.well-known/apple-app-site-association`).
//
// HTTPS hostname is hard-pinned to getmori.app so a malicious page can't
// claim a Mori-style recipe link on a different domain.
export function isRecipeUrl(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }

  if (url.protocol === 'mori:') {
    // mori://r/<uuid>  → hostname='r', pathname='/<uuid>'
    if (url.hostname === 'r' && /^\/[0-9a-fA-F-]{36}\/?$/.test(url.pathname)) return true;
    // mori:///r/<uuid> → hostname='',  pathname='/r/<uuid>'
    if (url.hostname === '' && /^\/r\/[0-9a-fA-F-]{36}\/?$/.test(url.pathname)) return true;
    return false;
  }

  if (url.protocol === 'https:' && url.hostname === 'getmori.app') {
    return /^\/r\/[0-9a-fA-F-]{36}\/?$/.test(url.pathname);
  }

  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (isDev && url.protocol === 'exp:') {
    return /^\/--\/r\/[0-9a-fA-F-]{36}\/?$/.test(url.pathname);
  }

  return false;
}

// Extract the recipe uuid from any of the supported recipe-link shapes.
// Returns null if the URL is malformed or the uuid doesn't match the 36-char
// hex+dash shape.
export function extractRecipeId(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const raw = url.protocol === 'mori:' && url.hostname === 'r'
    ? url.pathname.replace(/^\/+|\/+$/g, '')
    : url.pathname.replace(/^.*\/r\//, '').replace(/\/+$/, '');
  return /^[0-9a-fA-F-]{36}$/.test(raw) ? raw : null;
}
