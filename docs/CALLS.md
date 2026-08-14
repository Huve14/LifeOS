# Live video call

Built on [LiveKit](https://livekit.io) rather than raw `RTCPeerConnection`.

## The constraint this is built around

The UAE blocks WhatsApp and FaceTime calling at the network layer, with deep
packet inspection on Etisalat and du. A call that negotiates its way to a
direct peer to peer UDP connection will be blocked, and the only symptom is a
call that never connects.

So the media has to relay over TURN on TCP 443, wrapped in TLS, and look like
ordinary HTTPS. Signalling has to be WSS on 443 for the same reason.

Two things enforce that here rather than leaving it to chance:

1. **Relay only, always.** The room connects with
   `rtcConfig: { iceTransportPolicy: 'relay' }`, so the browser never gathers a
   host or server-reflexive candidate. There is no path where it works over
   UDP in testing and fails on her network. This costs some latency on a good
   connection, which is the right trade for two people, one of whom is behind
   the DPI.

   Note that `rtcConfig` belongs on `Room.connect()` options in livekit-client
   v2, not on the `Room` constructor. Setting it on the constructor typechecks
   in some versions and silently does nothing.

2. **The signalling URL is validated, not trusted.** `validateServerUrl` in
   `src/lifeos/call.ts` refuses anything that is not `wss:` on port 443, so a
   misconfigured URL fails loudly at the call screen instead of producing a
   call that works for you in Johannesburg and never connects for her.

## Verifying it actually happened

Configuring relay is not the same as getting it, so the call screen reads back
what the connection negotiated and says so plainly. `src/lifeos/ice.ts` polls
`getStats()` every five seconds, finds the nominated candidate pair, and
classifies it:

| Classification | Meaning | Survives the DPI |
|---|---|---|
| `relay-tls-443` | TURN over TLS on 443 | Yes |
| `relay-tls` | TURN over TLS, other port | Unlikely |
| `relay-tcp` | TURN over plain TCP | No |
| `relay-udp` | TURN over UDP | No |
| `direct` | Peer to peer | No |

Only `relay-tls-443` is treated as compliant. Anything else shows a warning
strip on the call screen naming what it actually got.

The peer connections belong to livekit-client, and reaching into its internals
would break on any upgrade, so the `RTCPeerConnection` constructor is wrapped
for the duration of a call and the instances it creates are tracked. That is
purely diagnostic and changes nothing about how the connection behaves.

**What I could not verify from here.** Whether this defeats Etisalat and du DPI
in practice can only be established from a connection in the UAE. The code
forces the right transport and reports honestly on what it got; the last step
is her opening the call screen on her own network and reading the strip. If it
says "Relayed over TLS on port 443" and the video works, the constraint is met.

To sanity check the relay path from anywhere before that, block UDP outbound on
a test machine and confirm the call still connects. Under relay-only it should
be unaffected, because it was never using UDP.

## Setup

### 1. LiveKit Cloud project

Create a project at [cloud.livekit.io](https://cloud.livekit.io). LiveKit Cloud
terminates signalling on WSS 443 and publishes `turns:` on TCP 443 by default,
which is what makes this work without running your own TURN server.

Self-hosting is possible but you would have to front both signalling and TURN
on 443 yourself, which is most of the work.

From the project settings, take the WebSocket URL and an API key and secret.

### 2. Environment variables

Client, at build time:

```
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Server, on Vercel, never exposed to the browser:

```
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
SUPABASE_URL=https://snpgmoedtkstbcpbtpcc.supabase.co
SUPABASE_ANON_KEY=...
```

The API secret is what mints a seat in the room, so it stays server side.
`api/livekit-token.js` is the only thing that can issue one, and it verifies
the caller's Supabase session and checks the `lifeos_members` allowlist before
signing. Without that check anyone who found the URL could join the call.

Tokens last 15 minutes, long enough to join and not to hoard.

### 3. iOS

`UIBackgroundModes` already includes `audio`, so call audio keeps running when
the phone locks mid-call. Camera and microphone permissions come from the same
Info.plist entries the video journal uses.

## What is in the call

Two people, one fixed room (`lifeos-two`). Mute, camera toggle, hang up, and a
connection quality indicator driven by LiveKit's own `ConnectionQualityChanged`
events.

Video is deliberately modest: 540p capture with simulcast layers at 180p and
360p. Both ends are on phone networks and every byte goes through a relay, so
chasing resolution buys stalls rather than quality.

## Falling back to a video note

When quality stays poor or lost for twelve continuous seconds, the screen
offers to send a video note instead, which hangs up and opens the Phase 1
recorder.

The threshold matters: a single bad sample is a blip, not a broken call. Once
suggested, it does not nag again until the connection recovers and degrades
afresh. That logic is pure and tested in `src/lifeos/call.test.ts`.

## Troubleshooting

**"Calling is not set up".** `VITE_LIVEKIT_URL` is missing or is not `wss:` on
443. The message names which.

**Token request returns 403.** The signed-in account is not in
`lifeos_members`. Run `0001_lifeos_members.sql`.

**Token request returns 503.** `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` is
missing from the Vercel environment.

**Connects, but the strip says "Direct peer to peer".** Relay-only was not
applied. Check `rtcConfig` is on the `connect()` call and not the constructor.

**Video but no sound.** Their microphone is a separate publication from their
camera. `onRemoteAudio` attaches it; if that element is not in the document it
will not play.
