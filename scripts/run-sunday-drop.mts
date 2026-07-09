// Local runner for the Sunday Drop cron — invoke the real handler against real Supabase
// without deploying. Requires `tsx` (installed) — run with: npx tsx scripts/run-sunday-drop.mts [userId]
//
//   npx tsx scripts/run-sunday-drop.mts <PREMIUM_USER_ID>   → force a single user (dev override)
//   npx tsx scripts/run-sunday-drop.mts                     → full premium sweep (time-gated)
//
// Prereqs in .env (repo root): EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// CRON_SECRET is NOT in .env by default — this script supplies a local value and sends the
// matching Bearer header. Point this at a DEV Supabase project, never prod: it performs real
// writes (meal_plans + sunday_drops) and sends a REAL Expo push to the user's push_token.
//
// NOTE: ?userId=&force=1 is honored ONLY when NODE_ENV !== 'production' (the handler's dev gate),
// so we delete NODE_ENV below. `force` bypasses the Sunday/hour/idempotency gates but STILL
// requires an active-premium profile with a push_token.

import 'dotenv/config';

process.env.CRON_SECRET ??= 'local-dev-secret'; // any value; the Bearer header below must match
delete (process.env as any).NODE_ENV;            // ensure force/userId dev override is allowed

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const { default: handler } = await import('../api/cron/sunday-drop.ts');

const userId = process.argv[2];
const req: any = {
  method: 'GET',
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  query: userId ? { userId, force: '1' } : {},
};
const res: any = {
  statusCode: 200,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { console.log('HTTP', this.statusCode, JSON.stringify(body)); return this; },
  end() { console.log('HTTP', this.statusCode, '(end)'); return this; },
};

console.log(userId ? `Forcing Sunday Drop for user ${userId}…` : 'Running full premium sweep (time-gated)…');
await handler(req, res);
