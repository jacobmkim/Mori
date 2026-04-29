const FALLBACK = 'https://getmori.app';

export function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  return env && env.trim().length > 0 ? env : FALLBACK;
}
