interface PushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

export interface PushResult {
  ok: boolean;               // true only when Expo accepted the ticket (status !== 'error')
  deviceNotRegistered: boolean; // token is dead (app uninstalled / reinstalled) — caller should clear it
}

/**
 * Send one Expo push. Returns a result so callers that care (Sunday Drop) can gate a
 * "notified" write on success and clear a dead push_token. Never throws — network/JSON
 * failures resolve to { ok: false }. Existing fire-and-forget callers can ignore the result.
 */
export async function sendExpoPush(payload: PushPayload): Promise<PushResult> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({ sound: 'default', ...payload }),
    });
    if (!res.ok) return { ok: false, deviceNotRegistered: false };
    const json = await res.json().catch(() => null);
    // Single send returns { data: { status, id, details?: { error } } }; tolerate the array shape too.
    const ticket = Array.isArray(json?.data) ? json?.data?.[0] : json?.data;
    if (ticket?.status === 'error') {
      return { ok: false, deviceNotRegistered: ticket?.details?.error === 'DeviceNotRegistered' };
    }
    return { ok: true, deviceNotRegistered: false };
  } catch {
    return { ok: false, deviceNotRegistered: false };
  }
}
