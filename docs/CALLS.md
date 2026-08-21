# Live group video and audio calls

> **Status: hidden by default.**
>
> The UAE reserves consumer voice and video over IP for licensed telecom
> operators, so Life OS ships with this feature switched off. Nothing below has
> been deleted — every entry point is gated on one flag, and the rest of this
> document describes the feature as it behaves once a deployment turns it back
> on. See [Switching calling on](#switching-calling-on).

Built on [LiveKit](https://livekit.io) rather than raw `RTCPeerConnection`.

## Switching calling on

Two flags, and both must be set. They are independent on purpose: the client
flag hides the surface, the server flag is what actually withholds a LiveKit
room grant.

| Flag | Where | Effect when unset |
|---|---|---|
| `VITE_ENABLE_CALLS=true` | client build | Every call entry point is hidden and `src/lifeos/call.ts` refuses to connect |
| `ENABLE_CALLS=true` | server (Vercel) | `POST /api/livekit-token` answers `404` before reading credentials, membership, or an invitation token |

Only the exact string `true` opts in; anything else — including `1` and `yes` —
leaves calling off. Set neither in a UAE deployment.

### What is hidden while the flags are unset

- the `call` route, its lazy bundle, and the developer `?preview-call` fixture;
- **Video call** and **Audio call** on the Home "Us, right now" card, which
  offers a video note instead;
- the **Calls** entry in the bottom navigation and the Quick Dock picker — the
  slot carries the video journal instead, so unwatched video notes keep a home;
- the **Call** button in the paired couple space;
- the browser invitation route `/join/<token>`, which answers with a plain
  "Calling is unavailable" notice instead of loading the call screen;
- call wording in the onboarding tour, the Home section list, and the life-mode
  presets.

A saved `call` shortcut or a push notification pointing at the call screen is
dropped rather than followed, so state stored by an earlier build cannot
resurrect the feature.

### What is not affected

Recording and sending **video notes** (`video-journal.jsx`) is a store-and-
forward feature, not realtime VoIP, and stays available. So do the shared
couple space, games, community, and everything else.

The LiveKit client is still emitted as a lazy chunk that nothing requests: it
is reachable only through the gated route, and it is excluded from the service
worker precache list, so a phone never downloads it. Dropping the chunk from
the build entirely would mean making `src/lifeos/index.ts` import `./call`
conditionally, which static ESM cannot express.

## Network design

The client follows [LiveKit Cloud's documented connectivity model](https://docs.livekit.io/deploy/admin/firewall/):

- secure WebSocket signalling uses TCP 443;
- WebRTC tries encrypted UDP first because it has the best latency and
  congestion behaviour;
- when UDP is not viable, LiveKit Cloud can fall back to TURN/TLS on TCP 443;
- the default Cloud hostname routes each participant to the closest available
  edge, including Middle East infrastructure.

The app does not set `iceTransportPolicy: 'relay'`. Forcing TURN on every call
adds latency and mobile-data overhead even when a better route is available,
and makes Wi-Fi-to-cellular transitions less flexible. LiveKit's normal ICE
selection and reconnect policy are left enabled instead, with a larger initial
retry/time-out budget for congested mobile networks.

The signalling URL is still validated, not trusted. `validateServerUrl` in
   `src/lifeos/call.ts` refuses anything that is not `wss:` on port 443, so a
misconfigured URL fails loudly at the call screen.

This is a standards-based resilient configuration, not a promise that calls
will be permitted by every carrier, managed Wi-Fi network, or local policy.
Availability must be tested on the actual UAE Wi-Fi and mobile networks where
the app will be used.

## Verifying it actually happened

The call screen reads back what the connection negotiated and says so plainly.
`src/lifeos/ice.ts` polls
`getStats()` every five seconds, finds the nominated candidate pair, and
classifies it:

| Classification | Meaning |
|---|---|
| `relay-tls-443` | Restricted-network TURN/TLS fallback on TCP 443 |
| `relay-tls` | TURN/TLS relay on another port |
| `relay-tcp` | TURN relay over TCP |
| `relay-udp` | TURN relay over UDP |
| `direct` | Direct encrypted WebRTC route to a LiveKit media edge |

Despite the label used by browser ICE statistics, `direct` is not a
participant-to-participant route: LiveKit is an SFU and media still terminates
at a LiveKit server. The strip remains diagnostic rather than deciding which
transport the browser is allowed to use.

The peer connections belong to livekit-client, and reaching into its internals
would break on any upgrade, so the `RTCPeerConnection` constructor is wrapped
for the duration of a call and the instances it creates are tracked. That is
purely diagnostic and changes nothing about how the connection behaves.

To sanity-check the restricted-network path, test once with outbound UDP
blocked and confirm the call reconnects using "Secure TURN/TLS fallback on port
443". Separately test Wi-Fi-to-cellular and cellular-to-Wi-Fi transitions on an
actual phone.

## Setup

### 1. LiveKit Cloud project

Create a project at [cloud.livekit.io](https://cloud.livekit.io). LiveKit Cloud
terminates signalling on WSS 443 and provides TURN/TLS on TCP 443 when UDP is
not viable, which avoids running a separate TURN server.

Self-hosting is possible but you would have to front both signalling and TURN
on 443 yourself, which is most of the work.

From the project settings, take the WebSocket URL and an API key and secret.

### 2. Environment variables

Client, at build time:

```
VITE_ENABLE_CALLS=true
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Server, on Vercel, never exposed to the browser:

```
ENABLE_CALLS=true
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
SUPABASE_URL=https://snpgmoedtkstbcpbtpcc.supabase.co
SUPABASE_ANON_KEY=...
```

Without `ENABLE_CALLS` the endpoint below never runs, whatever the other
variables say.

The API secret is what mints a seat in the room, so it stays server side.
`api/livekit-token.js` is the only thing that can issue one, and it verifies
the caller's Supabase session before resolving a room from database membership.
Before migration `0009` it supports the original `lifeos_members` allowlist;
after `0009` it derives an isolated room from `lifeos_space_members`, so people
in unrelated spaces can never meet in the same global room.

Mirror `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` into Supabase
Edge Function secrets if a Supabase-hosted call function needs them. The current
token endpoint runs on Vercel and uses the Vercel variables above.

Signed-in member tokens last 15 minutes. Browser-guest tokens last 10 minutes,
long enough to connect without becoming reusable long-term credentials.

### 3. Browser invitations and LifeOS IDs

Run `0012_lifeos_call_invites.sql` before enabling the invitation controls.
It adds three deliberately small pieces of call identity:

- Every account receives a stable, human-readable LifeOS ID on registration.
  The ID includes part of the account UUID so common names do not collide.
- A signed-in person can save another registered person by entering that exact
  ID. There is no public directory or partial-name search to enumerate users.
- Audio or video invitations create a 256-bit random browser link that expires
  after 24 hours and can be disabled from the call screen.

The raw invitation token is returned once and placed in `/join/<token>`; only
its SHA-256 digest is stored in Supabase. The join route is resolved before app
authentication, so a recipient can type their display name and call from a
normal browser without installing LifeOS or creating an account. Redeeming the
link produces a random guest identity and a short-lived LiveKit grant scoped to
the invitation's one room. It does not grant room listing, creation, admin, or
data-publishing permissions.

The anonymous `lifeos_redeem_call_invite` RPC is intentionally the only public
`security definer` exception. Its 256-bit bearer token is the authorization;
the function returns only call-safe metadata, locks the row while incrementing
usage, and refuses expired, revoked, exhausted, or malformed links. The invite
tables themselves remain inaccessible to anonymous clients.

### 4. iOS

`UIBackgroundModes` already includes `audio`, so call audio keeps running when
the phone locks mid-call. Camera and microphone permissions explicitly mention
calls in `Info.plist`. Capacitor enables inline playback and element fullscreen
for the WKWebView; the call screen still has a viewport-filling focus fallback
for iPhone browser versions that refuse element fullscreen.

## What is in the call

Each space gets an isolated server-derived room. Before the spaces migration is
applied, allowlisted members temporarily share the legacy `lifeos-two` room.
Every participant gets independent camera and microphone attachments, so a
third or fourth person is subscribed, heard, and rendered in the responsive
grid instead of being discarded after the first remote participant. The grid
highlights the active speaker, shows camera/microphone state, and can expand to
fullscreen while keeping mute, camera, hang-up, and fullscreen controls in a
single floating dock. Drag its grip with a mouse or finger, use arrow keys when
the grip has keyboard focus, or double-click/press Home to reset it. Four
participants render as four equal quadrants; larger rooms add rows and columns
without dropping anyone.

The call lobby offers both video and audio-only calling. Audio-only publishes
the microphone without starting the camera, which reduces data use and gives
the room a better fallback on weak mobile connections. Remote audio elements
stay mounted (not `display:none`), and the client listens for LiveKit's
`AudioPlaybackStatusChanged` event. If Safari blocks autoplay, a visible
"Tap to hear everyone" button calls `Room.startAudio()` directly from the
required user gesture.

Video is deliberately modest: 540p capture with simulcast layers at 180p and
360p. Adaptive stream asks for the appropriate incoming layer for each tile,
dynacast avoids publishing unused layers, RED protects voice from short packet
loss bursts, and DTX avoids continuously sending silence.

## Falling back to a video note

When quality stays poor or lost for twelve continuous seconds, the screen
offers to send a video note instead, which hangs up and opens the Phase 1
recorder.

The threshold matters: a single bad sample is a blip, not a broken call. Once
suggested, it does not nag again until the connection recovers and degrades
afresh. That logic is pure and tested in `src/lifeos/call.test.ts`.

## Troubleshooting

**Nothing in the app offers a call.** That is the shipped default. Calling is
hidden for UAE compliance until `VITE_ENABLE_CALLS=true` is set for the client
build. See [Switching calling on](#switching-calling-on).

**Token request returns 404.** `ENABLE_CALLS` is not `true` on the server. The
client build and the server flag are set independently, so a client with calling
switched on still gets nothing until the server agrees.

**"Calling is not set up".** `VITE_LIVEKIT_URL` is missing or is not `wss:` on
443. The message names which.

**Token request returns 403.** The signed-in account has no legacy membership
or, after `0009`, no current space membership. Complete the relevant migration
and membership/pairing setup.

**A browser link says it is invalid or expired.** The invitation is malformed,
older than 24 hours, disabled by its creator, or has exhausted its reconnect
allowance. Create and send a fresh link from the Call screen.

**Token request returns 503.** Either a required server environment variable is
missing or the membership lookup failed. Check the Vercel function log; the
server records the database error code without returning sensitive details to
the browser.

**Only works on one network.** Confirm `<project>.livekit.cloud` and
`<project>.turn.livekit.cloud` are reachable on TCP 443. A "Direct encrypted
route" is the normal low-latency path; "Secure TURN/TLS fallback on port 443"
means the restricted-network path is active. Carrier or managed-network policy
can still prevent realtime calling, so test on the actual Wi-Fi and data plans.

**Video but no sound.** Tap "Tap to hear everyone" if it appears. Safari on
iPhone can require this explicit gesture even after camera and microphone
permission was granted. If it persists, confirm the browser/site microphone
permission and that the other participant is not muted. Each remote microphone
is attached to its own mounted audio element.

**Only one remote person appears.** The client must iterate
`room.remoteParticipants` and react to participant, track, mute, and active
speaker events. Do not select only the first map value. Invitations allow up to
32 redemptions so the same link can be used by a small group and for reconnects.
