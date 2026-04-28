/**
 * Deep-link URL validation — phishing regression guard.
 *
 * The previous handler used String.includes('mori://reset-password'), which
 * matched the substring anywhere in the URL. A malicious page could open
 * `https://evil.com?x=mori://reset-password#access_token=…` and route the
 * user to the reset-password screen with attacker-controlled fragments.
 * isResetPasswordUrl validates scheme + hostname/path strictly via WHATWG URL.
 *
 * Three shapes are accepted (matching what `Linking.createURL` returns across
 * runtimes): `mori://reset-password`, `mori:///reset-password`, and (only in
 * __DEV__) `exp://<host>/--/reset-password`.
 */

import { isResetPasswordUrl } from '@/lib/deepLink';

describe('isResetPasswordUrl — accepts legitimate Mori reset-password links', () => {
  it('accepts mori://reset-password with access/refresh token fragment', () => {
    expect(isResetPasswordUrl('mori://reset-password#access_token=abc&refresh_token=def')).toBe(true);
  });

  it('accepts mori://reset-password with no fragment or query', () => {
    expect(isResetPasswordUrl('mori://reset-password')).toBe(true);
  });

  it('accepts mori://reset-password with trailing slash', () => {
    expect(isResetPasswordUrl('mori://reset-password/')).toBe(true);
  });

  it('accepts path-based mori:///reset-password (Linking.createURL output)', () => {
    expect(isResetPasswordUrl('mori:///reset-password')).toBe(true);
  });

  it('accepts path-based mori:///reset-password with token fragment', () => {
    expect(isResetPasswordUrl('mori:///reset-password#access_token=abc&refresh_token=def')).toBe(true);
  });

  it('accepts path-based mori:///reset-password/ with trailing slash', () => {
    expect(isResetPasswordUrl('mori:///reset-password/')).toBe(true);
  });
});

describe('isResetPasswordUrl — Expo Go (exp:) URLs', () => {
  // Tests run with __DEV__ === true under jest-expo. exp:// URLs are accepted
  // only in dev so production builds never trust the Expo Go scheme.
  it('accepts exp://host:port/--/reset-password in dev', () => {
    expect(isResetPasswordUrl('exp://192.168.1.5:8081/--/reset-password#access_token=abc&refresh_token=def')).toBe(true);
  });

  it('accepts exp://host:port/--/reset-password without tokens', () => {
    expect(isResetPasswordUrl('exp://192.168.1.5:8081/--/reset-password')).toBe(true);
  });

  it('rejects exp:// URLs that point to a different path', () => {
    expect(isResetPasswordUrl('exp://192.168.1.5:8081/--/profile')).toBe(false);
  });
});

describe('isResetPasswordUrl — rejects phishing payloads', () => {
  it('rejects https URLs with mori://reset-password embedded as a query param', () => {
    expect(isResetPasswordUrl('https://evil.com/?x=mori://reset-password')).toBe(false);
  });

  it('rejects https URLs with mori://reset-password in the path', () => {
    expect(isResetPasswordUrl('https://evil.com/mori://reset-password')).toBe(false);
  });

  it('rejects https URLs with mori://reset-password in the fragment', () => {
    expect(isResetPasswordUrl('https://evil.com/#mori://reset-password')).toBe(false);
  });

  it('rejects http URLs (only mori: / exp: are allowed)', () => {
    expect(isResetPasswordUrl('http://reset-password')).toBe(false);
  });

  it('rejects mori URLs pointing to a different host', () => {
    expect(isResetPasswordUrl('mori://other-host')).toBe(false);
  });

  it('rejects mori URLs pointing to a host that contains reset-password as a substring', () => {
    expect(isResetPasswordUrl('mori://reset-password.evil.com')).toBe(false);
  });

  it('rejects mori URLs with a different path', () => {
    expect(isResetPasswordUrl('mori:///profile')).toBe(false);
  });

  it('rejects mori URLs whose path merely contains reset-password', () => {
    expect(isResetPasswordUrl('mori:///foo/reset-password')).toBe(false);
  });
});

describe('isResetPasswordUrl — rejects malformed input', () => {
  it('rejects an empty string', () => {
    expect(isResetPasswordUrl('')).toBe(false);
  });

  it('rejects a non-string input', () => {
    expect(isResetPasswordUrl(undefined as any)).toBe(false);
    expect(isResetPasswordUrl(null as any)).toBe(false);
    expect(isResetPasswordUrl(42 as any)).toBe(false);
  });

  it('rejects URLs that fail to parse', () => {
    expect(isResetPasswordUrl('not a url')).toBe(false);
    expect(isResetPasswordUrl('://broken')).toBe(false);
  });

  it('accepts uppercase MORI: scheme (WHATWG lowercases the protocol)', () => {
    // WHATWG URL parser lowercases the protocol, so `MORI:` becomes `mori:` —
    // this case actually passes through. Document the behavior explicitly.
    expect(isResetPasswordUrl('MORI://reset-password')).toBe(true);
  });

  it('rejects unrelated custom schemes', () => {
    expect(isResetPasswordUrl('myapp://reset-password')).toBe(false);
  });
});
