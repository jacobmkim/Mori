/**
 * Welcome + email-verification endpoint.
 *
 * POST /api/send-welcome-email
 *   Authed (JWT). Generates a verification token, persists it on the user's
 *   profile, and sends the welcome email with a "Verify email" CTA. Used at
 *   signup and as the "Resend" action from the in-app banner.
 *
 * GET  /api/send-welcome-email?token=<uuid>
 *   Public. The token IS the auth — looked up against
 *   profiles.email_verification_token. On match, sets email_verified_at and
 *   clears the token. Idempotent for a single token (consumed on first hit).
 *
 * Two methods live in one file because Vercel Hobby caps function count at 12.
 *
 * Email + display name come from auth.users / profiles via the service-role
 * client — never from the request body, so a malicious client can't trigger
 * sends to arbitrary recipients.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { requireAuth, AuthError } from './_apiAuth';
import { rateLimitUser, rateLimitIP, getClientIP } from './_rateLimit';
import { captureException } from './_sentry';

const FROM_ADDRESS = 'Mori <hello@getmori.app>';
const VERIFY_URL = 'https://getmori.app/verify-email';
const TOKEN_TTL_HOURS = 24;

function getServiceClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function buildHtml(displayName: string | null, verifyUrl: string): string {
  const greeting = displayName ? `Hey ${displayName},` : 'Hey,';
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#F8F3EC;font-family:-apple-system,BlinkMacSystemFont,'SF Pro',Helvetica,Arial,sans-serif;color:#2E5438;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F3EC;">
      <tr><td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;padding:40px 32px;">
          <tr><td>
            <p style="font-family:Georgia,serif;font-style:italic;font-size:32px;color:#2E5438;margin:0 0 8px 0;">Welcome to Mori 🌲</p>
            <p style="font-size:16px;line-height:1.5;color:#2E5438;margin:24px 0 12px 0;">${greeting}</p>
            <p style="font-size:16px;line-height:1.5;color:#2E5438;margin:0 0 16px 0;">Glad you're here. Mori is a calm place to find recipes you'll actually cook — swipe through, save what looks good, send the grocery list to Instacart when you're ready.</p>
            <p style="font-size:16px;line-height:1.5;color:#2E5438;margin:0 0 12px 0;">When you have a moment, tap the button below to verify your email. Nothing's locked behind it — it just helps us keep your account secure.</p>
            <p style="margin:0 0 28px 0;">
              <a href="${verifyUrl}" style="display:inline-block;background-color:#2E5438;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:16px;">Verify email</a>
            </p>
            <p style="font-size:13px;line-height:1.5;color:#7A8073;margin:0 0 24px 0;">Or paste this link into your browser:<br /><a href="${verifyUrl}" style="color:#2E5438;word-break:break-all;">${verifyUrl}</a></p>
            <p style="font-size:16px;line-height:1.5;color:#2E5438;margin:0 0 16px 0;">A few things worth knowing:</p>
            <ul style="font-size:15px;line-height:1.6;color:#2E5438;margin:0 0 24px 0;padding-left:22px;">
              <li>Your taste profile starts to form after about 5 swipes — it gets sharper as you go.</li>
              <li>Long-press any saved recipe to multi-select and clean up your library.</li>
              <li>Tap a recipe and hit "Cook" to launch step-by-step mode with timers.</li>
            </ul>
            <p style="font-size:13px;color:#7A8073;line-height:1.5;margin:32px 0 0 0;">— The Mori team</p>
          </td></tr>
        </table>
        <p style="font-size:11px;color:#7A8073;margin:24px 0 0 0;">You're receiving this because you just signed up for Mori. Reply to this email if you have any questions.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function buildText(displayName: string | null, verifyUrl: string): string {
  const greeting = displayName ? `Hey ${displayName},` : 'Hey,';
  return `Welcome to Mori 🌲

${greeting}

Glad you're here. Mori is a calm place to find recipes you'll actually cook — swipe through, save what looks good, send the grocery list to Instacart when you're ready.

Verify your email when you have a moment (nothing's locked behind it — just helps keep your account secure):
${verifyUrl}

A few things worth knowing:
- Your taste profile starts to form after about 5 swipes — it gets sharper as you go.
- Long-press any saved recipe to multi-select and clean up your library.
- Tap a recipe and hit "Cook" to launch step-by-step mode with timers.

— The Mori team`;
}

// ─── GET: verify token ────────────────────────────────────────────────────

async function handleVerify(req: VercelRequest, res: VercelResponse) {
  const ip = getClientIP(req);
  const rl = await rateLimitIP(ip, 'verify-email', 20, 3600);
  if (!rl.success) {
    res.setHeader('Retry-After', rl.retryAfter ?? 3600);
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const tokenParam = req.query.token;
  const token = typeof tokenParam === 'string' ? tokenParam : null;
  if (!token || !/^[0-9a-fA-F-]{36}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const sb = getServiceClient();
  if (!sb) return res.status(500).json({ error: 'Service not configured' });

  const { data: profile, error: lookupErr } = await sb
    .from('profiles')
    .select('id, email_verification_sent_at, email_verified_at')
    .eq('email_verification_token', token)
    .maybeSingle();

  if (lookupErr) {
    captureException(lookupErr);
    return res.status(500).json({ error: 'Verification failed' });
  }
  if (!profile) {
    // Token not found — already consumed, never existed, or rotated by Resend.
    return res.status(404).json({ error: 'Token not found' });
  }

  // TTL: 24h since the token was issued.
  const sentAt = profile.email_verification_sent_at
    ? new Date(profile.email_verification_sent_at as string).getTime()
    : 0;
  const ageMs = Date.now() - sentAt;
  if (!sentAt || ageMs > TOKEN_TTL_HOURS * 3600 * 1000) {
    return res.status(410).json({ error: 'Token expired' });
  }

  const { error: updateErr } = await sb
    .from('profiles')
    .update({
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
    })
    .eq('id', profile.id);

  if (updateErr) {
    captureException(updateErr);
    return res.status(500).json({ error: 'Verification failed' });
  }

  return res.status(200).json({ ok: true });
}

// ─── POST: send welcome (with verify link) ────────────────────────────────

async function handleSend(req: VercelRequest, res: VercelResponse) {
  const userId = await requireAuth(req);

  // 3 sends per user per day — welcome email is one-shot, but allow a small
  // retry budget for transient delivery failures, repeated signup attempts,
  // and the in-app "Resend" button on the verification banner.
  const rl = await rateLimitUser(userId, 'send-welcome-email', 3, 86400);
  if (!rl.success) {
    res.setHeader('Retry-After', rl.retryAfter ?? 3600);
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email service not configured' });

  const sb = getServiceClient();
  if (!sb) return res.status(500).json({ error: 'Email service not configured' });

  const { data: userData, error: userErr } = await sb.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userErr || !email) {
    captureException(userErr ?? new Error('Welcome email: user has no email'));
    return res.status(500).json({ error: 'Failed to send welcome email' });
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  const displayName = (profile?.name as string | undefined)?.trim() || null;

  // Rotate the verification token on every send. Old tokens become orphaned
  // and will return 404 — intentional, so a stale email can't reactivate.
  const token = randomUUID();
  const { error: tokenErr } = await sb
    .from('profiles')
    .update({
      email_verification_token: token,
      email_verification_sent_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (tokenErr) {
    captureException(tokenErr);
    return res.status(500).json({ error: 'Failed to send welcome email' });
  }

  const verifyUrl = `${VERIFY_URL}?token=${token}`;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [email],
      subject: 'Welcome to Mori 🌲',
      html: buildHtml(displayName, verifyUrl),
      text: buildText(displayName, verifyUrl),
    }),
  });

  if (!resendRes.ok) {
    if (process.env.NODE_ENV === 'development') {
      const errBody = await resendRes.text().catch(() => '');
      console.error(`[send-welcome-email] resend ${resendRes.status}`, errBody);
    }
    captureException(new Error(`Resend returned ${resendRes.status}`));
    return res.status(502).json({ error: 'Failed to send welcome email' });
  }

  return res.status(200).json({ ok: true });
}

// ─── Router ───────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') return await handleVerify(req, res);
    if (req.method === 'POST') return await handleSend(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    captureException(err);
    if (process.env.NODE_ENV === 'development') {
      console.error('[send-welcome-email]', err instanceof Error ? err.message : 'Unknown error');
    }
    return res.status(500).json({ error: 'Failed to process request' });
  }
}
