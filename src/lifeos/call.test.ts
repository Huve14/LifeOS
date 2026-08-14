import { describe, it, expect } from 'vitest';
import {
  POOR_THRESHOLD_MS,
  newDegradationState,
  trackDegradation,
  validateServerUrl,
} from './call';

describe('validateServerUrl', () => {
  it('accepts wss on the implicit 443', () => {
    expect(validateServerUrl('wss://lifeos.livekit.cloud')).toEqual({ ok: true });
  });

  it('accepts wss with 443 spelled out', () => {
    expect(validateServerUrl('wss://lifeos.livekit.cloud:443')).toEqual({ ok: true });
  });

  it('refuses ws, which would not look like HTTPS to the DPI', () => {
    const result = validateServerUrl('ws://lifeos.livekit.cloud');
    expect(result.ok).toBe(false);
  });

  it('refuses a non-standard signalling port, the other DPI tell', () => {
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
