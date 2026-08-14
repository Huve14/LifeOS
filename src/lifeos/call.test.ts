import { describe, it, expect } from 'vitest';
import {
  POOR_THRESHOLD_MS,
  callGridColumns,
  clampFloatingBarPosition,
  friendlyCallError,
  isCallInviteToken,
  nextCameraFacingMode,
  newDegradationState,
  trackDegradation,
  validateServerUrl,
} from './call';

describe('callGridColumns', () => {
  it('keeps one caller full-size and arranges up to four people in a 2-column grid', () => {
    expect(callGridColumns(1)).toBe(1);
    expect(callGridColumns(2)).toBe(2);
    expect(callGridColumns(3)).toBe(2);
    expect(callGridColumns(4)).toBe(2);
  });

  it('adds columns gradually for links shared beyond the four-person design', () => {
    expect(callGridColumns(5)).toBe(3);
    expect(callGridColumns(9)).toBe(3);
    expect(callGridColumns(10)).toBe(4);
  });
});

describe('clampFloatingBarPosition', () => {
  const bounds = { width: 800, height: 600 };
  const bar = { width: 260, height: 66 };

  it('keeps a dragged toolbar inside every edge of the stage', () => {
    expect(clampFloatingBarPosition({ x: -100, y: -20 }, bounds, bar))
      .toEqual({ x: 12, y: 12 });
    expect(clampFloatingBarPosition({ x: 900, y: 900 }, bounds, bar))
      .toEqual({ x: 528, y: 522 });
  });

  it('preserves a position that is already safe', () => {
    expect(clampFloatingBarPosition({ x: 140.4, y: 230.6 }, bounds, bar))
      .toEqual({ x: 140, y: 231 });
  });
});

describe('friendlyCallError', () => {
  it('explains a blocked camera or microphone permission', () => {
    expect(friendlyCallError(new Error('NotAllowedError: Permission denied')))
      .toContain('Allow it');
  });

  it('suggests audio mode for a network failure', () => {
    expect(friendlyCallError(new Error('Failed to fetch'))).toContain('audio');
  });

  it('preserves an actionable provider message', () => {
    expect(friendlyCallError(new Error('Room connection timed out')))
      .toBe('Room connection timed out');
  });

  it('explains when a phone has no second camera to switch to', () => {
    expect(friendlyCallError(new Error('OverconstrainedError: facingMode')))
      .toContain('No other camera');
  });
});

describe('nextCameraFacingMode', () => {
  it('alternates between the selfie and outward-facing cameras', () => {
    expect(nextCameraFacingMode('user')).toBe('environment');
    expect(nextCameraFacingMode('environment')).toBe('user');
  });
});

describe('browser call invitations', () => {
  it('accepts only a complete 256-bit hexadecimal bearer token', () => {
    expect(isCallInviteToken('a'.repeat(64))).toBe(true);
    expect(isCallInviteToken('A1'.repeat(32))).toBe(true);
    expect(isCallInviteToken('a'.repeat(63))).toBe(false);
    expect(isCallInviteToken('../not-a-token')).toBe(false);
  });
});

describe('validateServerUrl', () => {
  it('accepts wss on the implicit 443', () => {
    expect(validateServerUrl('wss://lifeos.livekit.cloud')).toEqual({ ok: true });
  });

  it('accepts wss with 443 spelled out', () => {
    expect(validateServerUrl('wss://lifeos.livekit.cloud:443')).toEqual({ ok: true });
  });

  it('refuses insecure websocket signalling', () => {
    const result = validateServerUrl('ws://lifeos.livekit.cloud');
    expect(result.ok).toBe(false);
  });

  it('refuses a non-standard signalling port', () => {
    const result = validateServerUrl('wss://lifeos.livekit.cloud:7880');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('7880');
  });

  it('refuses https, since signalling is a websocket', () => {
    expect(validateServerUrl('https://lifeos.livekit.cloud').ok).toBe(false);
  });

  it('refuses an empty or malformed URL', () => {
    expect(validateServerUrl('').ok).toBe(false);
    expect(validateServerUrl('not a url').ok).toBe(false);
  });
});

describe('trackDegradation', () => {
  const start = 1_000_000;

  it('says nothing while quality is fine', () => {
    const result = trackDegradation(newDegradationState(), 'good', start);
    expect(result.suggest).toBe(false);
    expect(result.state.poorSince).toBeNull();
  });

  it('does not fire on a single bad sample', () => {
    const result = trackDegradation(newDegradationState(), 'poor', start);
    expect(result.suggest).toBe(false);
    expect(result.state.poorSince).toBe(start);
  });

  it('fires once quality has been poor long enough', () => {
    let state = newDegradationState();
    ({ state } = trackDegradation(state, 'poor', start));

    const result = trackDegradation(state, 'poor', start + POOR_THRESHOLD_MS);
    expect(result.suggest).toBe(true);
  });

  it('does not fire a moment early', () => {
    let state = newDegradationState();
    ({ state } = trackDegradation(state, 'poor', start));

    const result = trackDegradation(state, 'poor', start + POOR_THRESHOLD_MS - 1);
    expect(result.suggest).toBe(false);
  });

  it('does not nag once it has already suggested', () => {
    let state = newDegradationState();
    ({ state } = trackDegradation(state, 'poor', start));
    ({ state } = trackDegradation(state, 'poor', start + POOR_THRESHOLD_MS));

    const again = trackDegradation(state, 'poor', start + POOR_THRESHOLD_MS + 5000);
    expect(again.suggest).toBe(false);
  });

  it('resets when the connection recovers, and can fire again later', () => {
    let state = newDegradationState();
    ({ state } = trackDegradation(state, 'poor', start));
    ({ state } = trackDegradation(state, 'poor', start + POOR_THRESHOLD_MS));

    ({ state } = trackDegradation(state, 'good', start + 20_000));
    expect(state.poorSince).toBeNull();
    expect(state.suggested).toBe(false);

    ({ state } = trackDegradation(state, 'poor', start + 30_000));
    const later = trackDegradation(state, 'poor', start + 30_000 + POOR_THRESHOLD_MS);
    expect(later.suggest).toBe(true);
  });

  it('treats a lost connection as poor', () => {
    let state = newDegradationState();
    ({ state } = trackDegradation(state, 'lost', start));
    expect(trackDegradation(state, 'lost', start + POOR_THRESHOLD_MS).suggest).toBe(true);
  });

  it('does not count an unknown sample as bad', () => {
    const result = trackDegradation(newDegradationState(), 'unknown', start);
    expect(result.state.poorSince).toBeNull();
  });
});
