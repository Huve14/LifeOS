import { describe, expect, it } from 'vitest';
import { CALLS_DISABLED_NOTICE, CALLS_ENABLED, isFlagEnabled } from './features';

describe('regional feature flags', () => {
  it('only opts in on an explicit true', () => {
    expect(isFlagEnabled('true')).toBe(true);
    expect(isFlagEnabled(' TRUE ')).toBe(true);
    expect(isFlagEnabled('false')).toBe(false);
    expect(isFlagEnabled('1')).toBe(false);
    expect(isFlagEnabled('yes')).toBe(false);
  });

  it('treats a missing or non-string value as off', () => {
    expect(isFlagEnabled(undefined)).toBe(false);
    expect(isFlagEnabled(null)).toBe(false);
    expect(isFlagEnabled(true)).toBe(false);
    expect(isFlagEnabled(1)).toBe(false);
  });

  it('hides live calling unless a deployment sets VITE_ENABLE_CALLS', () => {
    // No .env is committed, so an ordinary build sees the flag unset and
    // calling stays hidden. A deployment that opts in flips both together.
    expect(CALLS_ENABLED).toBe(isFlagEnabled(import.meta.env.VITE_ENABLE_CALLS));
    if (!import.meta.env.VITE_ENABLE_CALLS) expect(CALLS_ENABLED).toBe(false);
  });

  it('explains the absence in plain language', () => {
    expect(CALLS_DISABLED_NOTICE).toMatch(/calling is switched off/i);
  });
});
