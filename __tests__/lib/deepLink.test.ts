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

import { isResetPasswordUrl, isVerifyEmailUrl, extractVerifyToken, isRecipeUrl, extractRecipeId, isPlanUrl, extractPlanWeek } from '@/lib/deepLink';

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

describe('isVerifyEmailUrl — accepts legitimate Mori verify-email links', () => {
  it('accepts mori://verify-email with token query', () => {
    expect(isVerifyEmailUrl('mori://verify-email?token=11111111-2222-3333-4444-555555555555')).toBe(true);
  });

  it('accepts mori://verify-email with no query', () => {
    expect(isVerifyEmailUrl('mori://verify-email')).toBe(true);
  });

  it('accepts path-based mori:///verify-email', () => {
    expect(isVerifyEmailUrl('mori:///verify-email?token=11111111-2222-3333-4444-555555555555')).toBe(true);
  });

  it('accepts mori:///verify-email/ trailing slash', () => {
    expect(isVerifyEmailUrl('mori:///verify-email/')).toBe(true);
  });

  it('accepts exp://host:port/--/verify-email in dev', () => {
    expect(isVerifyEmailUrl('exp://192.168.1.5:8081/--/verify-email?token=abc')).toBe(true);
  });
});

describe('isVerifyEmailUrl — rejects phishing / wrong-shape payloads', () => {
  it('rejects https URL embedding the deep link as a query', () => {
    expect(isVerifyEmailUrl('https://evil.com/?x=mori://verify-email')).toBe(false);
  });

  it('rejects mori host that contains verify-email as a substring', () => {
    expect(isVerifyEmailUrl('mori://verify-email.evil.com')).toBe(false);
  });

  it('rejects mori URLs with a different path', () => {
    expect(isVerifyEmailUrl('mori:///profile')).toBe(false);
  });

  it('rejects empty / non-string / unparseable input', () => {
    expect(isVerifyEmailUrl('')).toBe(false);
    expect(isVerifyEmailUrl(null as any)).toBe(false);
    expect(isVerifyEmailUrl('not a url')).toBe(false);
  });

  it('rejects reset-password URLs', () => {
    expect(isVerifyEmailUrl('mori://reset-password')).toBe(false);
  });
});

describe('extractVerifyToken — pulls + validates UUID-shaped token', () => {
  it('extracts a valid UUID token', () => {
    const url = 'mori://verify-email?token=11111111-2222-3333-4444-555555555555';
    expect(extractVerifyToken(url)).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('rejects missing token', () => {
    expect(extractVerifyToken('mori://verify-email')).toBeNull();
  });

  it('rejects malformed (too short) token', () => {
    expect(extractVerifyToken('mori://verify-email?token=abc')).toBeNull();
  });

  it('rejects token with non-hex chars', () => {
    expect(extractVerifyToken('mori://verify-email?token=zzzzzzzz-2222-3333-4444-555555555555')).toBeNull();
  });

  it('rejects non-string / unparseable input', () => {
    expect(extractVerifyToken(null as any)).toBeNull();
    expect(extractVerifyToken('not a url')).toBeNull();
  });
});

// ── Recipe share links ──────────────────────────────────────────────────────

describe('isRecipeUrl', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts mori://r/<uuid>', () => {
    expect(isRecipeUrl(`mori://r/${UUID}`)).toBe(true);
  });

  it('accepts mori://r/<uuid>/ trailing slash', () => {
    expect(isRecipeUrl(`mori://r/${UUID}/`)).toBe(true);
  });

  it('accepts path-based mori:///r/<uuid>', () => {
    expect(isRecipeUrl(`mori:///r/${UUID}`)).toBe(true);
  });

  it('accepts Universal Link https://getmori.app/r/<uuid>', () => {
    expect(isRecipeUrl(`https://getmori.app/r/${UUID}`)).toBe(true);
  });

  it('rejects Universal-Link-shaped path on a non-Mori domain (phishing guard)', () => {
    expect(isRecipeUrl(`https://evil.com/r/${UUID}`)).toBe(false);
  });

  it('rejects https URLs that merely contain the recipe path (phishing guard)', () => {
    expect(isRecipeUrl(`https://evil.com?x=mori://r/${UUID}`)).toBe(false);
  });

  it('rejects mori:// scheme with a wrong host', () => {
    expect(isRecipeUrl('mori://reset-password')).toBe(false);
  });

  it('rejects malformed uuid', () => {
    expect(isRecipeUrl('mori://r/not-a-uuid')).toBe(false);
  });

  it('rejects non-string / empty / unparseable input', () => {
    expect(isRecipeUrl(null as any)).toBe(false);
    expect(isRecipeUrl('')).toBe(false);
    expect(isRecipeUrl('not a url')).toBe(false);
  });
});

describe('isPlanUrl', () => {
  it('accepts mori://plan and trailing slash', () => {
    expect(isPlanUrl('mori://plan')).toBe(true);
    expect(isPlanUrl('mori://plan/')).toBe(true);
  });
  it('accepts path-based mori:///plan', () => {
    expect(isPlanUrl('mori:///plan')).toBe(true);
  });
  it('accepts a ?week=YYYY-MM-DD query (host match ignores the query)', () => {
    expect(isPlanUrl('mori://plan?week=2026-06-29')).toBe(true);
  });
  it('rejects a wrong mori host', () => {
    expect(isPlanUrl('mori://reset-password')).toBe(false);
    expect(isPlanUrl('mori://r/550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
  it('rejects https / phishing-shaped input', () => {
    expect(isPlanUrl('https://evil.com/plan')).toBe(false);
    expect(isPlanUrl('https://getmori.app?x=mori://plan')).toBe(false);
  });
  it('rejects non-string / empty / unparseable input', () => {
    expect(isPlanUrl(null as any)).toBe(false);
    expect(isPlanUrl('')).toBe(false);
    expect(isPlanUrl('not a url')).toBe(false);
  });
});

describe('extractPlanWeek', () => {
  it('pulls a valid YYYY-MM-DD week param', () => {
    expect(extractPlanWeek('mori://plan?week=2026-06-29')).toBe('2026-06-29');
    expect(extractPlanWeek('mori:///plan?week=2026-06-29')).toBe('2026-06-29');
  });
  it('returns null when the param is absent or malformed', () => {
    expect(extractPlanWeek('mori://plan')).toBeNull();
    expect(extractPlanWeek('mori://plan?week=next')).toBeNull();
    expect(extractPlanWeek('mori://plan?week=2026-6-9')).toBeNull();
  });
  it('returns null on non-string / unparseable input', () => {
    expect(extractPlanWeek(null as any)).toBeNull();
    expect(extractPlanWeek('not a url')).toBeNull();
  });
});

describe('extractRecipeId', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('extracts the uuid from mori://r/<uuid>', () => {
    expect(extractRecipeId(`mori://r/${UUID}`)).toBe(UUID);
  });

  it('extracts the uuid from path-based mori:///r/<uuid>', () => {
    expect(extractRecipeId(`mori:///r/${UUID}`)).toBe(UUID);
  });

  it('extracts the uuid from a Universal Link https://getmori.app/r/<uuid>', () => {
    expect(extractRecipeId(`https://getmori.app/r/${UUID}`)).toBe(UUID);
  });

  it('returns null when path is not a uuid', () => {
    expect(extractRecipeId('mori://r/nope')).toBeNull();
  });

  it('returns null for non-string / empty input', () => {
    expect(extractRecipeId(null as any)).toBeNull();
    expect(extractRecipeId('')).toBeNull();
  });
});
