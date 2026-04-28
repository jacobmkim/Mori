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

// Vercel serverless functions exit immediately after the response is sent, so
// async event delivery is killed mid-flight unless we explicitly drain the
// Sentry queue first. Call `await flushSentry()` before responding when you
// need to guarantee an event was delivered (verification endpoints, error
// paths in cron jobs).
export async function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!initialized) return true;
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}
