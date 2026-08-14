// Sends queued notifications to APNs.
//
// Triggers on lifeos_video_notes and lifeos_prompt_answers write rows into
// lifeos_notifications; this drains that queue. Nothing here is reachable
// without the service role, and it never reads message content: the trigger
// composes the text, so an unrevealed prompt answer cannot leak through a
// notification body.
//
// Invoke on a schedule (pg_cron or an external ping) every minute or two.
//
// Required secrets:
//   APNS_KEY_ID      the 10 character key id of the .p8
//   APNS_TEAM_ID     the 10 character Apple team id
//   APNS_BUNDLE_ID   app.lifeos.suveda
//   APNS_PRIVATE_KEY the .p8 contents, including the BEGIN and END lines
//   APNS_PRODUCTION  "true" for TestFlight and the App Store, otherwise sandbox
//
// See docs/IOS.md for where each of these comes from.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type PendingNotification = {
  id: string;
  recipient_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
};

const MAX_ATTEMPTS = 5;

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * APNs wants an ES256 JWT signed with the .p8 key. Tokens are valid for an
 * hour; Apple rejects one refreshed more often than every 20 minutes, so this
 * caches until it is genuinely stale.
 */
let cachedToken: { value: string; issuedAt: number } | null = null;

async function apnsToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < 2400) return cachedToken.value;

  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !privateKey) {
    throw new Error('APNs credentials are not configured');
  }

  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64Url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  const value = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  cachedToken = { value, issuedAt: now };
  return value;
}

type SendResult = { ok: true } | { ok: false; status: number; reason: string };

async function sendToDevice(
  deviceToken: string,
  notification: PendingNotification,
  jwt: string,
): Promise<SendResult> {
  const production = Deno.env.get('APNS_PRODUCTION') === 'true';
  const host = production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') ?? 'app.lifeos.suveda';

  const response = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    },
    body: JSON.stringify({
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: 'default',
        'thread-id': String(notification.data.screen ?? 'lifeos'),
      },
      ...notification.data,
    }),
  });

  if (response.ok) return { ok: true };

  let reason = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    if (payload?.reason) reason = payload.reason;
  } catch {
    // Body is not always JSON on a transport failure.
  }
  return { ok: false, status: response.status, reason };
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: pending, error } = await supabase
    .from('lifeos_notifications')
    .select('id, recipient_id, title, body, data, attempts')
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return Response.json({ sent: 0, pending: 0 });
  }

  let jwt: string;
  try {
    jwt = await apnsToken();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const notification of pending as PendingNotification[]) {
    const { data: devices } = await supabase
      .from('lifeos_devices')
      .select('token')
      .eq('user_id', notification.recipient_id);

    if (!devices || devices.length === 0) {
      // Nowhere to send it. Mark it done rather than retrying forever.
      await supabase
        .from('lifeos_notifications')
        .update({ sent_at: new Date().toISOString(), last_error: 'No registered device' })
        .eq('id', notification.id);
      continue;
    }

    const results = await Promise.all(
      devices.map((device) => sendToDevice(device.token, notification, jwt)),
    );

    // A token Apple rejects as gone is dead. Drop it so it stops being tried.
    await Promise.all(
      results.map((result, index) => {
        if (result.ok) return null;
        const stale =
          result.status === 410 ||
          result.reason === 'BadDeviceToken' ||
          result.reason === 'Unregistered';
        if (!stale) return null;
        return supabase.from('lifeos_devices').delete().eq('token', devices[index].token);
      }),
    );

    const delivered = results.some((result) => result.ok);
    if (delivered) {
      sent += 1;
      await supabase
        .from('lifeos_notifications')
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq('id', notification.id);
    } else {
      failed += 1;
      const first = results.find((result) => !result.ok);
      await supabase
        .from('lifeos_notifications')
        .update({
          attempts: notification.attempts + 1,
          last_error: first && !first.ok ? first.reason : 'Unknown error',
        })
        .eq('id', notification.id);
    }
  }

  return Response.json({ sent, failed });
});
