// Live video call.
//
// Relay only, always. The brief is explicit that plain STUN with peer to peer
// UDP is not an option: the UAE blocks calling protocols with DPI on Etisalat
// and du, so the media has to go over TURN on TCP 443 and look like HTTPS.
// iceTransportPolicy 'relay' means the browser never even gathers a host or
// srflx candidate, so there is no path where it silently works in testing and
// fails on her network.
//
// That costs some latency on a good connection. For two people, one of whom is
// behind the DPI, that is the right trade.
//
// livekit-client is around 400KB, so it is imported only when a call starts
// rather than on every app launch.

import { getAuthClient, hasConfig } from '../supabase';
import { installPeerConnectionProbe, inspectTransport, removePeerConnectionProbe } from './ice';
import type { TransportReport } from './ice';

export type Quality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

export type CallState =
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended';

export const ROOM_NAME = 'lifeos-two';

/**
 * Signalling must be WSS on 443. A non-standard port is the other half of what
 * DPI looks for, so a misconfigured URL is refused rather than half working.
 */
export function validateServerUrl(url: string): { ok: true } | { ok: false; reason: string } {
  if (!url) return { ok: false, reason: 'No LiveKit URL is configured' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'The LiveKit URL is not a valid URL' };
  }

  if (parsed.protocol !== 'wss:') {
    return { ok: false, reason: 'Signalling must use wss, not ' + parsed.protocol.replace(':', '') };
  }
  if (parsed.port && parsed.port !== '443') {
    return { ok: false, reason: `Signalling must be on port 443, not ${parsed.port}` };
  }
  return { ok: true };
}

export function serverUrl(): string {
  return (import.meta.env.VITE_LIVEKIT_URL ?? '').trim();
}

export function isConfigured(): boolean {
  return validateServerUrl(serverUrl()).ok;
}

// ---------- Degradation tracking ----------

/** How long quality must stay poor before suggesting a video note instead. */
export const POOR_THRESHOLD_MS = 12_000;

export type DegradationState = {
  poorSince: number | null;
  suggested: boolean;
};

export function newDegradationState(): DegradationState {
  return { poorSince: null, suggested: false };
}

/**
 * A single bad sample is a blip, not a broken call. The prompt only appears
 * once quality has been poor continuously, and once dismissed or recovered it
 * does not nag again until the connection recovers and degrades afresh.
 */
export function trackDegradation(
  state: DegradationState,
  quality: Quality,
  now: number,
): { state: DegradationState; suggest: boolean } {
  const bad = quality === 'poor' || quality === 'lost';

  if (!bad) {
    return { state: { poorSince: null, suggested: false }, suggest: false };
  }

  const poorSince = state.poorSince ?? now;
  const longEnough = now - poorSince >= POOR_THRESHOLD_MS;
  const suggest = longEnough && !state.suggested;

  return {
    state: { poorSince, suggested: state.suggested || suggest },
    suggest,
  };
}

// ---------- Token ----------

async function fetchToken(): Promise<string> {
  if (!hasConfig) throw new Error('Supabase is not configured');

  const { data } = await getAuthClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Not signed in');

  const response = await fetch('/api/livekit-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ room: ROOM_NAME }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Could not get a call token (${response.status})`);
  }

  const payload = await response.json();
  if (!payload.token) throw new Error('The call token was empty');
  return payload.token;
}

// ---------- Room ----------

export type CallHandlers = {
  onState: (state: CallState, detail?: string) => void;
  onQuality: (quality: Quality) => void;
  onRemoteTrack: (element: HTMLMediaElement | null) => void;
  /** Their microphone. A separate publication from the camera, and easy to
   *  forget, which produces a video call with no sound. */
  onRemoteAudio: (element: HTMLMediaElement | null) => void;
  onLocalTrack: (element: HTMLMediaElement | null) => void;
  onParticipantCount: (count: number) => void;
  onTransport: (report: TransportReport) => void;
};

type LiveKit = typeof import('livekit-client');

export type ActiveCall = {
  setMicEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
};

/**
 * track.attach() with no argument mints a fresh element every call, and the
 * track keeps a reference to each one. The attach handlers below fire on every
 * subscription change, so without detaching first this accumulates orphaned
 * media elements for the length of the call.
 */
type Attachment = { track: { detach: (el: HTMLMediaElement) => void } | null; element: HTMLMediaElement | null };

function reattach(
  current: Attachment,
  next: { attach: () => HTMLMediaElement; detach: (el: HTMLMediaElement) => void } | null,
): { changed: boolean; attachment: Attachment } {
  if (next === current.track) return { changed: false, attachment: current };

  if (current.track && current.element) {
    try {
      current.track.detach(current.element);
    } catch {
      // The track may already be gone. Nothing to clean up.
    }
  }

  return {
    changed: true,
    attachment: { track: next, element: next ? next.attach() : null },
  };
}

function mapQuality(livekit: LiveKit, value: unknown): Quality {
  const { ConnectionQuality } = livekit;
  if (value === ConnectionQuality.Excellent) return 'excellent';
  if (value === ConnectionQuality.Good) return 'good';
  if (value === ConnectionQuality.Poor) return 'poor';
  if (value === ConnectionQuality.Lost) return 'lost';
  return 'unknown';
}

export async function startCall(handlers: CallHandlers): Promise<ActiveCall> {
  const url = serverUrl();
  const check = validateServerUrl(url);
  if (!check.ok) throw new Error(check.reason);

  handlers.onState('requesting');
  const token = await fetchToken();

  const livekit = await import('livekit-client');
  const { Room, RoomEvent, Track, VideoPresets } = livekit;

  // Watch what the connection actually negotiates, so the screen can report
  // the real transport rather than the configured one.
  installPeerConnectionProbe();

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    // Modest by design. Both ends are on phone networks and every byte goes
    // through a relay, so chasing resolution here buys nothing but stalls.
    videoCaptureDefaults: {
      resolution: VideoPresets.h540.resolution,
    },
    publishDefaults: {
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
    },
  });

  let transportTimer: ReturnType<typeof setInterval> | null = null;

  let remoteVideo: Attachment = { track: null, element: null };
  let remoteAudio: Attachment = { track: null, element: null };
  let localVideo: Attachment = { track: null, element: null };

  function attachRemote() {
    const remote = [...room.remoteParticipants.values()][0];
    handlers.onParticipantCount(room.remoteParticipants.size);

    const video = remote?.getTrackPublication(Track.Source.Camera)?.track ?? null;
    const audio = remote?.getTrackPublication(Track.Source.Microphone)?.track ?? null;

    const nextVideo = reattach(remoteVideo, video);
    if (nextVideo.changed) {
      remoteVideo = nextVideo.attachment;
      handlers.onRemoteTrack(remoteVideo.element);
    }

    const nextAudio = reattach(remoteAudio, audio);
    if (nextAudio.changed) {
      remoteAudio = nextAudio.attachment;
      handlers.onRemoteAudio(remoteAudio.element);
    }
  }

  function attachLocal() {
    const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;
    const next = reattach(localVideo, track);
    if (next.changed) {
      localVideo = next.attachment;
      handlers.onLocalTrack(localVideo.element);
    }
  }

  room
    .on(RoomEvent.Connected, () => {
      handlers.onState('connected');
      void inspectTransport().then(handlers.onTransport);
      transportTimer = setInterval(() => {
        void inspectTransport().then(handlers.onTransport);
      }, 5000);
      attachRemote();
    })
    .on(RoomEvent.Reconnecting, () => handlers.onState('reconnecting'))
    .on(RoomEvent.Reconnected, () => handlers.onState('connected'))
    .on(RoomEvent.Disconnected, (reason) => {
      if (transportTimer) clearInterval(transportTimer);
      removePeerConnectionProbe();
      handlers.onState('ended', reason ? String(reason) : undefined);
    })
    .on(RoomEvent.ParticipantConnected, attachRemote)
    .on(RoomEvent.ParticipantDisconnected, attachRemote)
    .on(RoomEvent.TrackSubscribed, attachRemote)
    .on(RoomEvent.TrackUnsubscribed, attachRemote)
    .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      // Only our own quality drives the fallback prompt. Theirs is their
      // problem to see on their own screen.
      if (participant?.identity === room.localParticipant.identity) {
        handlers.onQuality(mapQuality(livekit, quality));
      }
    });

  handlers.onState('connecting');

  try {
    await room.connect(url, token, {
      // The whole point of this module. No host candidates, no srflx, relay
      // only, so there is no path where it works in testing and fails on her
      // network. rtcConfig lives on connect options in livekit-client v2, not
      // on the Room constructor, so this is the only place it takes effect.
      rtcConfig: { iceTransportPolicy: 'relay' },
    });

    await room.localParticipant.enableCameraAndMicrophone();
    attachLocal();
  } catch (error) {
    if (transportTimer) clearInterval(transportTimer);
    removePeerConnectionProbe();
    handlers.onState('failed', error instanceof Error ? error.message : 'Could not connect');
    throw error;
  }

  return {
    async setMicEnabled(enabled: boolean) {
      await room.localParticipant.setMicrophoneEnabled(enabled);
    },
    async setCameraEnabled(enabled: boolean) {
      await room.localParticipant.setCameraEnabled(enabled);
      attachLocal();
    },
    async disconnect() {
      if (transportTimer) clearInterval(transportTimer);
      removePeerConnectionProbe();
      await room.disconnect();
    },
  };
}
