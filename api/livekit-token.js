// Mints a LiveKit access token.
//
// The API secret never reaches the browser, so this endpoint is the only thing
// that can grant a seat in the room. It verifies the caller's Supabase session
// and resolves their room from trusted membership data before signing anything.
// Without that check, anyone who found the URL could join a call.

import { createClient } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import { resolveCallContext } from './livekit-context.js';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function requestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function safeParticipantName(value) {
  if (typeof value !== 'string') return 'Guest';
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
  return cleaned || 'Guest';
}

async function issueToken({ identity, name, room, ttl = '10m' }) {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl,
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
    roomCreate: false,
    roomList: false,
  });

  return token.toJwt();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return sendJson(res, 503, {
      error: 'Calling is not configured. Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
    });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return sendJson(res, 503, { error: 'Calling services are not configured.' });
  }

  const body = requestBody(req);
  const inviteToken = typeof body.inviteToken === 'string'
    ? body.inviteToken.trim().toLowerCase()
    : '';

  // A browser invitation is deliberately account-free. The raw 256-bit token
  // is the bearer credential; Supabase stores only its digest and atomically
  // checks expiry, revocation, and the reconnect allowance.
  if (inviteToken) {
    if (!/^[0-9a-f]{64}$/.test(inviteToken)) {
      return sendJson(res, 403, { error: 'This call link is invalid or has expired.' });
    }

    try {
      const publicSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await publicSupabase.rpc('lifeos_redeem_call_invite', {
        input_token: inviteToken,
      });
      const invitation = Array.isArray(data) ? data[0] : data;

      if (error || !invitation?.invite_room) {
        if (error) {
          console.error('livekit invite redemption failed', {
            code: error.code,
            message: error.message,
          });
        }
        return sendJson(res, 403, { error: 'This call link is invalid or has expired.' });
      }

      const identity = `guest-${randomUUID()}`;
      const name = safeParticipantName(body.guestName);
      return sendJson(res, 200, {
        token: await issueToken({ identity, name, room: invitation.invite_room }),
        identity,
        room: invitation.invite_room,
        mode: invitation.invite_mode,
        hostName: invitation.creator_name,
      });
    } catch (err) {
      console.error('livekit invite token error:', err.message);
      return sendJson(res, 500, { error: 'Could not join this call right now.' });
    }
  }

  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) {
    return sendJson(res, 401, { error: 'Not signed in' });
  }

  try {
    // The caller's own token, so RLS applies exactly as it does in the app.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return sendJson(res, 401, { error: 'Session is not valid' });
    }

    const user = userData.user;

    // Membership is the gate. This supports both the legacy two-person
    // allowlist and the spaces schema introduced by migration 0009.
    const callContext = await resolveCallContext(supabase, user);
    if (callContext.error) {
      console.error('livekit membership lookup failed', {
        code: callContext.error.code,
        message: callContext.error.message,
        details: callContext.error.details,
      });
      return sendJson(res, 503, {
        error: 'Calling could not verify this account. Try again shortly.',
      });
    }
    if (!callContext.member) {
      return sendJson(res, 403, { error: 'This account does not have a call space' });
    }

    return sendJson(res, 200, {
      token: await issueToken({
        identity: user.id,
        name: callContext.displayName,
        room: callContext.room,
        ttl: '15m',
      }),
      identity: user.id,
      room: callContext.room,
    });
  } catch (err) {
    console.error('livekit-token error:', err.message);
    return sendJson(res, 500, { error: 'Could not issue a call token' });
  }
}
