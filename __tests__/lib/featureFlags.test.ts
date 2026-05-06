/**
 * featureFlags — kill switch contract.
 *
 * The Mori+ surface ships dark in v1.1: every premium feature wraps in
 * `flags.moriPlusEnabled`. The flag must be true ONLY when the EAS env var
 * `EXPO_PUBLIC_MORI_PLUS_ENABLED` is the literal string "true". Any other
 * value (undefined, "false", "1", "TRUE", "true ") must read as false so we
 * never accidentally ship the surface on a typo.
 *
 * Flag is captured at module load — tests use jest.resetModules() to re-read
 * the env between cases.
 */

const ENV_KEY = 'EXPO_PUBLIC_MORI_PLUS_ENABLED';

function loadFlags(value: string | undefined) {
  jest.resetModules();
  const original = process.env[ENV_KEY];
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { flags } = require('@/lib/featureFlags');
  // restore so other tests don't see leakage
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
  return flags;
}

describe('flags.moriPlusEnabled — exact string match', () => {
  it('is true when env is the literal string "true"', () => {
    expect(loadFlags('true').moriPlusEnabled).toBe(true);
  });

  it('is false when env is the literal string "false"', () => {
    expect(loadFlags('false').moriPlusEnabled).toBe(false);
  });

  it('is false when env is undefined', () => {
    expect(loadFlags(undefined).moriPlusEnabled).toBe(false);
  });

  it('is false when env is empty string', () => {
    expect(loadFlags('').moriPlusEnabled).toBe(false);
  });
});

describe('flags.moriPlusEnabled — typo guard (anything-but-"true" is false)', () => {
  // EAS env is string-only; a misspelled or alternate-cased value must NOT
  // accidentally enable the entire premium surface in production.
  const NOT_TRUE = ['TRUE', 'True', 'tRue', '1', 'yes', 'on', 'enabled', 'true ', ' true'];

  it.each(NOT_TRUE)('reads "%s" as false', (val) => {
    expect(loadFlags(val).moriPlusEnabled).toBe(false);
  });
});
