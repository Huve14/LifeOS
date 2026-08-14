// Mints a LiveKit access token.
//
// The API secret never reaches the browser, so this endpoint is the only thing
// that can grant a seat in the room. It verifies the caller's Supabase session
// and checks they are on the lifeos_members allowlist before signing anything.
// Without that check, anyone who found the URL could join the call.

import { createClient } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const ALLOWED_ROOMS = new Set(['lifeos-two']);

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
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
    return sendJson(res, 503, { error: 'Supabase is not configured on the server.' });
  }

  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) {
    return sendJson(res, 401, { error: 'Not signed in' });
  }

  const room = (req.body && req.body.room) || 'lifeos-two';
  if (!ALLOWED_ROOMS.has(room)) {
    return sendJson(res, 400, { error: 'Unknown room' });
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

    // Membership is the gate. The select is subject to the same policy as the
    // app, so a non-member simply gets no row back.
    const { data: member, error: memberError } = await supabase
      .from('lifeos_members')
      .select('user_id, display_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return sendJson(res, 500, { error: 'Could not check membership' });
    }
    if (!member) {
      return sendJson(res, 403, { error: 'This account is not on the list' });
    }

    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: user.id,
      name: member.display_name,
      // Short lived. Long enough to join, not to hoard.
      ttl: '15m',
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      // Two people, one room. Nobody needs to enumerate or create rooms.
      canPublishData: false,
      roomCreate: false,
      roomList: false,
    });

    return sendJson(res, 200, { token: await token.toJwt(), identity: user.id });
  } catch (err) {
    console.error('livekit-token error:', err.message);
    return sendJson(res, 500, { error: 'Could not issue a call token' });
  }
}
