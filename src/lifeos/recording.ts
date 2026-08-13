// Recording configuration.
//
// "Compress before upload" here means compressing at capture rather than
// transcoding afterwards. A real re-encode in the browser needs ffmpeg.wasm,
// which is tens of megabytes of wasm and minutes of phone CPU per clip. Instead
// the camera is constrained and the encoder is given a bitrate budget chosen so
// that a full length clip lands under the ceiling by construction.
//
// Everything in this file is pure so it can be tested without a camera.

export const MIN_SECONDS = 15;
export const MAX_SECONDS = 120;

/** Hard ceiling per clip. */
export const MAX_BYTES = 15 * 1024 * 1024;

/** Aim below the ceiling so encoder overshoot still fits. */
const TARGET_BYTES = Math.floor(MAX_BYTES * 0.92);

export const AUDIO_BITS_PER_SECOND = 64_000;

/**
 * Candidates in quality order. Chrome and Android take vp9, older Android takes
 * vp8, iOS Safari only produces mp4 with h264 and aac. Whichever wins is stored
 * on the row, because the two devices will not agree.
 */
export const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
];

export function pickMimeType(
  isSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
): string | null {
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (isSupported(candidate)) return candidate;
    } catch {
      // Some engines throw rather than returning false.
    }
  }
  return null;
}

export function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  return 'webm';
}

/** Strip the codecs parameter for the Content-Type we hand to storage. */
export function baseMime(mime: string): string {
  return mime.split(';')[0].trim();
}

/**
 * Video bitrate that keeps a clip of maxSeconds inside the byte budget, with
 * the audio track's share removed first. Clamped so short clips do not get an
 * absurdly high bitrate and long ones stay watchable.
 */
export function videoBitrateFor(maxSeconds: number = MAX_SECONDS, targetBytes = TARGET_BYTES): number {
  const seconds = Math.max(1, maxSeconds);
  const totalBits = targetBytes * 8;
  const videoBits = totalBits - AUDIO_BITS_PER_SECOND * seconds;
  const perSecond = Math.floor(videoBits / seconds);
  return Math.max(300_000, Math.min(2_500_000, perSecond));
}

export function recorderOptions(mimeType: string, maxSeconds: number = MAX_SECONDS) {
  return {
    mimeType,
    videoBitsPerSecond: videoBitrateFor(maxSeconds),
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  };
}

export function estimateBytes(seconds: number, maxSeconds: number = MAX_SECONDS): number {
  const bitsPerSecond = videoBitrateFor(maxSeconds) + AUDIO_BITS_PER_SECOND;
  return Math.round((bitsPerSecond * seconds) / 8);
}

export function isWithinSizeBudget(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_BYTES;
}

/**
 * Portrait, because this is used on a phone. Ideal rather than exact so a
 * device that cannot do 720x1280 still gives us something instead of failing.
 */
export function captureConstraints(facingMode: 'user' | 'environment'): MediaStreamConstraints {
  return {
    video: {
      facingMode,
      width: { ideal: 720 },
      height: { ideal: 1280 },
      frameRate: { ideal: 24, max: 30 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  };
}

export function supportsRecording(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** Device-generated idempotency key. Also becomes the storage file name. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function storagePath(authorId: string, clientId: string, mimeType: string): string {
  return `${authorId}/${clientId}.${extensionForMime(mimeType)}`;
}

export function posterPath(authorId: string, clientId: string): string {
  return `${authorId}/${clientId}.jpg`;
}

/**
 * A single frame as a small JPEG, so the timeline can render without pulling
 * any video down. Worth the extra request on a slow connection.
 */
export function posterFromVideo(
  video: HTMLVideoElement,
  maxEdge = 480,
  quality = 0.7,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      resolve(null);
      return;
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext('2d');
    if (!context) {
      resolve(null);
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}
