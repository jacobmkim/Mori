import * as Sentry from '@sentry/node';

let initialized = false;

function init() {
  if (initialized || !process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.05,
  });
  initialized = true;
}

export function captureException(err: unknown) {
  init();
  if (!initialized) return;
  Sentry.captureException(err);
}
