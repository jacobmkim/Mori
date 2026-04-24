import * as Sentry from '@sentry/react-native';

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.1,
    environment: 'production',
  });
}

export { Sentry };
