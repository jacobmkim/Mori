/**
 * Sends the welcome email to a freshly-signed-up user.
 *
 * Email + display name come from auth.users / profiles via the service-role
 * client — never from the request body, so a malicious client can't trigger
 * sends to arbitrary recipients.
 *
 * POST /api/send-welcome-email   (no body required)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, AuthError } from './_apiAuth';
import { rateLimitUser } from './_rateLimit';
import { captureException } from './_sentry';

const FROM_ADDRESS = 'Mori <hello@getmori.app>';

function getServiceClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function buildHtml(displayName: string | null): string {
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

function buildText(displayName: string | null): string {
  const greeting = displayName ? `Hey ${displayName},` : 'Hey,';
  return `Welcome to Mori 🌲

${greeting}

Glad you're here. Mori is a calm place to find recipes you'll actually cook — swipe through, save what looks good, send the grocery list to Instacart when you're ready.

A few things worth knowing:
- Your taste profile starts to form after about 5 swipes — it gets sharper as you go.
- Long-press any saved recipe to multi-select and clean up your library.
- Tap a recipe and hit "Cook" to launch step-by-step mode with timers.

— The Mori team`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const userId = await requireAuth(req);

    // 3 sends per user per day — welcome email is one-shot, but allow a small
    // retry budget for transient delivery failures or repeated signup attempts.
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
        html: buildHtml(displayName),
        text: buildText(displayName),
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
  } catch (err) {
    if (err instanceof AuthError) return res.status(err.statusCode).json({ error: err.message });
    captureException(err);
    if (process.env.NODE_ENV === 'development') {
      console.error('[send-welcome-email]', err instanceof Error ? err.message : 'Unknown error');
    }
    return res.status(500).json({ error: 'Failed to send welcome email' });
  }
}
