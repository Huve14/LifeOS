import { describe, it, expect, beforeEach } from 'vitest';
import { RELOCK_AFTER_MS, clearUnlock, markUnlocked, needsUnlock } from './lock';

describe('re-lock timing', () => {
  beforeEach(() => {
    clearUnlock();
  });

  it('starts locked', () => {
    expect(needsUnlock()).toBe(true);
  });

  it('is open straight after unlocking', () => {
    markUnlocked();
    expect(needsUnlock()).toBe(false);
  });

  it('stays open for a glance away at a notification', () => {
    markUnlocked();
    const soon = Date.now() + 30_000;
    expect(needsUnlock(soon)).toBe(false);
  });

  it('re-locks once the phone has been left alone', () => {
    markUnlocked();
    const later = Date.now() + RELOCK_AFTER_MS + 1000;
    expect(needsUnlock(later)).toBe(true);
  });

  it('re-locks exactly at the boundary, not before', () => {
    const now = Date.now();
    markUnlocked();
    expect(needsUnlock(now + RELOCK_AFTER_MS - 1)).toBe(false);
  });

  it('locks again when the unlock is cleared', () => {
    markUnlocked();
    clearUnlock();
    expect(needsUnlock()).toBe(true);
  });
});
