import { describe, it, expect } from 'vitest';
import {
  MAX_BYTES,
  MAX_SECONDS,
  MIN_SECONDS,
  baseMime,
  estimateBytes,
  extensionForMime,
  isWithinSizeBudget,
  newClientId,
  pickMimeType,
  posterPath,
  recorderOptions,
  storagePath,
  videoBitrateFor,
} from './recording';

describe('mime selection', () => {
  it('prefers vp9 when the device supports everything', () => {
    expect(pickMimeType(() => true)).toBe('video/webm;codecs=vp9,opus');
  });

  it('falls back to mp4 on a device that only does mp4, as iOS does', () => {
    expect(pickMimeType((type) => type.includes('mp4'))).toBe('video/mp4;codecs=h264,aac');
  });

  it('returns null when nothing is supported', () => {
    expect(pickMimeType(() => false)).toBeNull();
  });

  it('treats a throwing isTypeSupported as unsupported', () => {
    expect(
      pickMimeType((type) => {
        if (type.includes('vp9')) throw new Error('nope');
        return type === 'video/webm';
      }),
    ).toBe('video/webm');
  });
});

describe('mime helpers', () => {
  it('maps to a file extension', () => {
    expect(extensionForMime('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extensionForMime('video/mp4;codecs=h264,aac')).toBe('mp4');
    expect(extensionForMime('video/quicktime')).toBe('mov');
  });

  it('strips the codecs parameter for the stored content type', () => {
    expect(baseMime('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(baseMime('video/mp4')).toBe('video/mp4');
  });
});

describe('bitrate budget', () => {
  it('keeps a full length clip under the 15MB ceiling', () => {
    const bytes = estimateBytes(MAX_SECONDS);
    expect(bytes).toBeLessThan(MAX_BYTES);
    expect(isWithinSizeBudget(bytes)).toBe(true);
  });

  it('leaves headroom for encoder overshoot', () => {
    // Comfortably under, not scraping the ceiling.
    expect(estimateBytes(MAX_SECONDS)).toBeLessThan(MAX_BYTES * 0.95);
  });

  it('a minimum length clip is far smaller', () => {
    expect(estimateBytes(MIN_SECONDS)).toBeLessThan(estimateBytes(MAX_SECONDS) / 4);
  });

  it('clamps to a watchable range', () => {
    expect(videoBitrateFor(1)).toBeLessThanOrEqual(2_500_000);
    expect(videoBitrateFor(100_000)).toBeGreaterThanOrEqual(300_000);
  });

  it('hands the encoder both bitrates', () => {
    const options = recorderOptions('video/webm', MAX_SECONDS);
    expect(options.mimeType).toBe('video/webm');
    expect(options.videoBitsPerSecond).toBeGreaterThan(0);
    expect(options.audioBitsPerSecond).toBe(64_000);
  });
});

describe('size budget', () => {
  it('rejects empty and oversized blobs', () => {
    expect(isWithinSizeBudget(0)).toBe(false);
    expect(isWithinSizeBudget(MAX_BYTES + 1)).toBe(false);
    expect(isWithinSizeBudget(MAX_BYTES)).toBe(true);
  });
});

describe('paths', () => {
  const author = '11111111-2222-3333-4444-555555555555';

  it('puts objects under the author uid so storage RLS can check the prefix', () => {
    const path = storagePath(author, 'abc', 'video/webm;codecs=vp9,opus');
    expect(path).toBe(`${author}/abc.webm`);
    expect(path.split('/')[0]).toBe(author);
  });

  it('derives the poster from the same client id', () => {
    expect(posterPath(author, 'abc')).toBe(`${author}/abc.jpg`);
  });

  it('is stable for the same client id, so a retry overwrites', () => {
    expect(storagePath(author, 'abc', 'video/mp4')).toBe(storagePath(author, 'abc', 'video/mp4'));
  });
});

describe('newClientId', () => {
  it('is unique', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newClientId()));
    expect(ids.size).toBe(200);
  });
});
