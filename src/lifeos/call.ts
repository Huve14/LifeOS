// Live group video and audio calls.
//
// LiveKit Cloud chooses the best available encrypted WebRTC route. UDP is
// preferred for quality; when it is not viable, Cloud advertises TURN/TLS on
// TCP 443. Leaving ICE candidate selection enabled is important for people who
// move between Wi-Fi and mobile data because the SDK can reconnect using the
// route that is actually available instead of forcing every call through a
// higher-latency relay.
//
// livekit-client is around 400KB, so it is imported only when a call starts
// rather than on every app launch.

import { getAuthClient, hasConfig } from '../supabase';
import { installPeerConnectionProbe, inspectTransport, removePeerConnectionProbe } from './ice';
import type { TransportReport } from './ice';

export type Quality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
export type CallMode = 'video' | 'audio';
export type CameraFacingMode = 'user' | 'environment';

export type CallState =
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended';

/** Signalling must use the standard secure LiveKit Cloud endpoint. */
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

/** Turn browser, auth, and network failures into instructions a person can act on. */
export function friendlyCallError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  if (
    normalized.includes('notallowederror')
    || normalized.includes('permission denied')
    || normalized.includes('permission was denied')
    || normalized.includes('permissions policy')
  ) {
    return 'Camera or microphone access is blocked. Allow it in this site’s settings, then try again.';
  }
  if (normalized.includes('not signed in') || normalized.includes('session is not valid')) {
    return 'Your session expired. Sign in again, then start the call.';
  }
  if (normalized.includes('does not have a call space')) {
    return 'This account is not paired for calls yet.';
  }
  if (normalized.includes('membership') || normalized.includes('verify this account')) {
    return 'The app could not verify your call access. Wait a moment and try again.';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return 'The network could not reach the call service. Check your connection and try audio instead.';
  }
  if (
    normalized.includes('notfounderror')
    || normalized.includes('overconstrainederror')
    || normalized.includes('requested device not found')
  ) {
    return 'No other camera was found on this device. Your current camera is still connected.';
  }

  return message || 'The call could not connect. Try again or use audio mode.';
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

export type CallJoinOptions = {
  mode?: CallMode;
  /** A 256-bit bearer token from /join/:token. When present, no LifeOS
   * account is required; the server restricts the LiveKit grant to the
   * invitation's single room. */
  inviteToken?: string;
  guestName?: string;
};

export function isCallInviteToken(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value.trim());
}

async function fetchToken(options: CallJoinOptions = {}): Promise<string> {
  if (!hasConfig) throw new Error('Calls are not configured');

  const { data } = await getAuthClient().auth.getSession();
  const accessToken = data.session?.access_token;
  const inviteToken = options.inviteToken?.trim().toLowerCase() ?? '';
  if (!inviteToken && !accessToken) throw new Error('Not signed in');
  if (inviteToken && !isCallInviteToken(inviteToken)) throw new Error('This call link is not valid');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const response = await fetch('/api/livekit-token', {
    method: 'POST',
    headers,
    // Without an invite the server derives the room from authenticated
    // membership. With an invite, the random bearer token selects exactly one
    // expiring room and the guest name is only presentation metadata.
    body: JSON.stringify(inviteToken ? {
      inviteToken,
      guestName: options.guestName?.trim().slice(0, 60) || 'Guest',
    } : {}),
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
  /** A complete snapshot, including the local participant and every remote
   * participant. Each remote microphone has its own audio element so group
   * calls never silently drop the third or fourth person. */
  onParticipants: (participants: CallParticipant[]) => void;
  /** Safari, especially on iPhone, may require one more explicit tap before it
   * will play remote audio. The UI keeps that recovery action visible. */
  onAudioPlaybackBlocked: (blocked: boolean) => void;
  onTransport: (report: TransportReport) => void;
};

export type CallParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  videoElement: HTMLMediaElement | null;
  audioElement: HTMLMediaElement | null;
  cameraOn: boolean;
  microphoneOn: boolean;
  speaking: boolean;
};

type LiveKit = typeof import('livekit-client');

export type ActiveCall = {
  setMicEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  /** Restart the published camera in place without leaving the room. */
  switchCamera: (facingMode: CameraFacingMode) => Promise<CameraFacingMode>;
  /** Must be called directly from a click/tap when Safari blocks autoplay. */
  startAudio: () => Promise<void>;
  disconnect: () => Promise<void>;
};

/**
 * track.attach() with no argument mints a fresh element every call, and the
 * track keeps a reference to each one. The attach handlers below fire on every
 * subscription change, so without detaching first this accumulates orphaned
 * media elements for the length of the call.
 */
type Attachment = { track: { detach: (el: HTMLMediaElement) => void } | null; element: HTMLMediaElement | null };

const emptyAttachment = (): Attachment => ({ track: null, element: null });

function detachAttachment(attachment: Attachment): void {
  if (!attachment.track || !attachment.element) return;
  try {
    attachment.track.detach(attachment.element);
  } catch {
    // The publication may already have disappeared during a reconnect.
  }
}

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

  const element = next ? next.attach() : null;
  if (element) {
    element.autoplay = true;
    element.setAttribute('playsinline', 'true');
  }

  return {
    changed: true,
    attachment: { track: next, element },
  };
}

export type CallLayoutMode = 'solo' | 'duo' | 'group';

/** Two-person calls use a FaceTime-style stage: the other person fills the
 * screen while the local camera floats above it. Grids begin at three people. */
export function callLayoutMode(participantCount: number): CallLayoutMode {
  const count = Math.max(1, Math.floor(participantCount));
  if (count === 1) return 'solo';
  if (count === 2) return 'duo';
  return 'group';
}

/** The group grid stays legible for small calls while still degrading
 * sensibly if a link is shared more widely. */
export function callGridColumns(participantCount: number): number {
  const count = Math.max(1, Math.floor(participantCount));
  if (count === 1) return 1;
  if (count <= 4) return 2;
  return count <= 9 ? 3 : 4;
}

export type FloatingBarPoint = { x: number; y: number };
export type FloatingBarSize = { width: number; height: number };

/** Keep the movable call toolbar fully inside the video stage. */
export function clampFloatingBarPosition(
  point: FloatingBarPoint,
  bounds: FloatingBarSize,
  bar: FloatingBarSize,
  inset = 12,
): FloatingBarPoint {
  const safeInset = Math.max(0, Number.isFinite(inset) ? inset : 0);
  const maxX = Math.max(safeInset, bounds.width - bar.width - safeInset);
  const maxY = Math.max(safeInset, bounds.height - bar.height - safeInset);

  return {
    x: Math.round(Math.min(Math.max(point.x, safeInset), maxX)),
    y: Math.round(Math.min(Math.max(point.y, safeInset), maxY)),
  };
}

/** The camera control always alternates between mobile-facing modes. */
export function nextCameraFacingMode(current: CameraFacingMode): CameraFacingMode {
  return current === 'environment' ? 'user' : 'environment';
}

function mapQuality(livekit: LiveKit, value: unknown): Quality {
  const { ConnectionQuality } = livekit;
  if (value === ConnectionQuality.Excellent) return 'excellent';
  if (value === ConnectionQuality.Good) return 'good';
  if (value === ConnectionQuality.Poor) return 'poor';
  if (value === ConnectionQuality.Lost) return 'lost';
  return 'unknown';
}

export async function startCall(
  handlers: CallHandlers,
  options: CallJoinOptions = {},
): Promise<ActiveCall> {
  const url = serverUrl();
  const check = validateServerUrl(url);
  if (!check.ok) throw new Error(check.reason);
  const mode = options.mode ?? 'video';

  handlers.onState('requesting');
  const token = await fetchToken(options);

  const livekit = await import('livekit-client');
  const { Room, RoomEvent, Track, VideoPresets } = livekit;

  // Watch what the connection actually negotiates, so the screen can report
  // the real transport rather than the configured one.
  installPeerConnectionProbe();

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
      voiceIsolation: true,
    },
    // Modest by design. It remains clear in a four-person grid without making
    // a mobile connection upload a 720p or 1080p camera feed.
    videoCaptureDefaults: {
      resolution: VideoPresets.h540.resolution,
    },
    publishDefaults: {
      // RED repairs short bursts of packet loss and DTX avoids sending silent
      // audio continuously, which helps both calls and mobile-data usage.
      red: true,
      dtx: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
    },
  });

  let transportTimer: ReturnType<typeof setInterval> | null = null;

  type ParticipantAttachments = { video: Attachment; audio: Attachment };
  const remoteMedia = new Map<string, ParticipantAttachments>();
  let localVideo = emptyAttachment();
  let cleanedUp = false;

  function cleanUpMedia() {
    if (cleanedUp) return;
    cleanedUp = true;
    detachAttachment(localVideo);
    for (const media of remoteMedia.values()) {
      detachAttachment(media.video);
      detachAttachment(media.audio);
    }
    remoteMedia.clear();
    handlers.onParticipants([]);
  }

  function syncParticipants() {
    const currentRemoteIds = new Set(room.remoteParticipants.keys());

    for (const [identity, media] of remoteMedia) {
      if (currentRemoteIds.has(identity)) continue;
      detachAttachment(media.video);
      detachAttachment(media.audio);
      remoteMedia.delete(identity);
    }

    const localCamera = room.localParticipant.getTrackPublication(Track.Source.Camera);
    localVideo = reattach(localVideo, localCamera?.track ?? null).attachment;

    const snapshots: CallParticipant[] = [{
      identity: room.localParticipant.identity || 'local',
      name: room.localParticipant.name?.trim() || 'You',
      isLocal: true,
      videoElement: localVideo.element,
      audioElement: null,
      cameraOn: Boolean(localCamera && !localCamera.isMuted),
      microphoneOn: room.localParticipant.isMicrophoneEnabled,
      speaking: room.localParticipant.isSpeaking,
    }];

    let guestNumber = 0;
    for (const remote of room.remoteParticipants.values()) {
      guestNumber += 1;
      const current = remoteMedia.get(remote.identity) ?? {
        video: emptyAttachment(),
        audio: emptyAttachment(),
      };
      const camera = remote.getTrackPublication(Track.Source.Camera);
      const microphone = remote.getTrackPublication(Track.Source.Microphone);
      const nextVideo = reattach(current.video, camera?.track ?? null).attachment;
      const nextAudioResult = reattach(current.audio, microphone?.track ?? null);
      const nextAudio = nextAudioResult.attachment;
      remoteMedia.set(remote.identity, { video: nextVideo, audio: nextAudio });

      // Once the first tap has unlocked audio, tracks added later can start
      // without another prompt. If Safari still refuses, the room event below
      // turns the sound-recovery button back on.
      if (nextAudioResult.changed && nextAudio.element) {
        void room.startAudio().catch(() => {
          handlers.onAudioPlaybackBlocked(true);
        });
      }

      snapshots.push({
        identity: remote.identity,
        name: remote.name?.trim() || `Guest ${guestNumber}`,
        isLocal: false,
        videoElement: nextVideo.element,
        audioElement: nextAudio.element,
        cameraOn: Boolean(camera && !camera.isMuted),
        microphoneOn: Boolean(microphone && !microphone.isMuted),
        speaking: remote.isSpeaking,
      });
    }

    handlers.onParticipants(snapshots);
  }

  room
    .on(RoomEvent.Connected, () => {
      handlers.onState('connected');
      void inspectTransport().then(handlers.onTransport);
      transportTimer = setInterval(() => {
        void inspectTransport().then(handlers.onTransport);
      }, 5000);
      syncParticipants();
    })
    .on(RoomEvent.Reconnecting, () => handlers.onState('reconnecting'))
    .on(RoomEvent.Reconnected, () => {
      handlers.onState('connected');
      syncParticipants();
    })
    .on(RoomEvent.Disconnected, (reason) => {
      if (transportTimer) clearInterval(transportTimer);
      removePeerConnectionProbe();
      cleanUpMedia();
      handlers.onState('ended', reason ? String(reason) : undefined);
    })
    .on(RoomEvent.ParticipantConnected, syncParticipants)
    .on(RoomEvent.ParticipantDisconnected, syncParticipants)
    .on(RoomEvent.ParticipantNameChanged, syncParticipants)
    .on(RoomEvent.TrackPublished, syncParticipants)
    .on(RoomEvent.TrackUnpublished, syncParticipants)
    .on(RoomEvent.TrackSubscribed, syncParticipants)
    .on(RoomEvent.TrackUnsubscribed, syncParticipants)
    .on(RoomEvent.TrackMuted, syncParticipants)
    .on(RoomEvent.TrackUnmuted, syncParticipants)
    .on(RoomEvent.LocalTrackPublished, syncParticipants)
    .on(RoomEvent.LocalTrackUnpublished, syncParticipants)
    .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
    .on(RoomEvent.AudioPlaybackStatusChanged, (playing) => {
      handlers.onAudioPlaybackBlocked(!playing || !room.canPlaybackAudio);
    })
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
      autoSubscribe: true,
      // Allow a little more time and retry budget for mobile handovers and
      // congested networks. LiveKit's reconnect policy continues from there
      // if Wi-Fi or cellular changes during an active call.
      maxRetries: 3,
      peerConnectionTimeout: 30_000,
      websocketTimeout: 20_000,
    });

    if (mode === 'audio') {
      await room.localParticipant.setMicrophoneEnabled(true);
    } else {
      await room.localParticipant.enableCameraAndMicrophone();
    }
    syncParticipants();

    // This primes WebKit's audio session. Safari can still decide that the
    // asynchronous join was too far removed from the original tap; in that
    // case the non-fatal fallback button calls the same method synchronously.
    try {
      await room.startAudio();
      handlers.onAudioPlaybackBlocked(false);
    } catch {
      handlers.onAudioPlaybackBlocked(true);
    }
  } catch (error) {
    if (transportTimer) clearInterval(transportTimer);
    removePeerConnectionProbe();
    cleanUpMedia();
    try {
      await room.disconnect();
    } catch {
      // Connection setup may have failed before the room was fully joined.
    }
    handlers.onState('failed', error instanceof Error ? error.message : 'Could not connect');
    throw error;
  }

  return {
    async setMicEnabled(enabled: boolean) {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      syncParticipants();
    },
    async setCameraEnabled(enabled: boolean) {
      await room.localParticipant.setCameraEnabled(enabled);
      syncParticipants();
    },
    async switchCamera(facingMode: CameraFacingMode) {
      const camera = room.localParticipant
        .getTrackPublication(Track.Source.Camera)
        ?.videoTrack;
      if (!camera || camera.isMuted) {
        throw new Error('Turn your camera on before switching cameras.');
      }

      // Only the underlying capture device restarts. Room membership, audio,
      // subscriptions and the published video track all stay connected.
      await camera.restartTrack({
        facingMode,
        resolution: VideoPresets.h540.resolution,
      });
      syncParticipants();

      const actual = camera.mediaStreamTrack.getSettings().facingMode;
      return actual === 'user' || actual === 'environment' ? actual : facingMode;
    },
    async startAudio() {
      await room.startAudio();
      handlers.onAudioPlaybackBlocked(false);
    },
    async disconnect() {
      if (transportTimer) clearInterval(transportTimer);
      removePeerConnectionProbe();
      cleanUpMedia();
      await room.disconnect();
    },
  };
}
