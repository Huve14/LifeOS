// Face ID lock.
//
// This app holds video notes and answers neither of us would want read by
// whoever picks the phone up. The lock is a front door, not encryption: the
// data is still protected by the device passcode and by RLS on the server.
//
// Off-device, or on a device with no enrolled biometry, the lock reports
// itself unavailable and the app opens normally rather than locking anyone out.

import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';
import { Preferences } from '@capacitor/preferences';
import { isNative } from './native';

const ENABLED_KEY = 'lifeos:lock-enabled';

export type LockAvailability = {
  available: boolean;
  /** 'Face ID', 'Touch ID' or null, for naming the button honestly. */
  label: string | null;
};

export async function lockAvailability(): Promise<LockAvailability> {
  if (!isNative()) return { available: false, label: null };

  try {
    const info = await BiometricAuth.checkBiometry();
    if (!info.isAvailable) return { available: false, label: null };

    const labels: Partial<Record<BiometryType, string>> = {
      [BiometryType.faceId]: 'Face ID',
      [BiometryType.touchId]: 'Touch ID',
    };
    return { available: true, label: labels[info.biometryType] ?? 'Biometrics' };
  } catch {
    return { available: false, label: null };
  }
}

export async function isLockEnabled(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { value } = await Preferences.get({ key: ENABLED_KEY });
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.set({ key: ENABLED_KEY, value: enabled ? 'true' : 'false' });
  } catch {
    // Nothing useful to do; the lock simply stays as it was.
  }
}

export type UnlockResult = 'unlocked' | 'failed' | 'unavailable';

/**
 * Falls back to the device passcode, so a failed face scan in bad light does
 * not lock someone out of their own app.
 */
export async function unlock(reason = 'Unlock Life OS'): Promise<UnlockResult> {
  if (!isNative()) return 'unavailable';

  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Use passcode',
    });
    return 'unlocked';
  } catch {
    return 'failed';
  }
}

/**
 * Re-locking is time based rather than on every background. Glancing at a
 * notification and coming straight back should not mean scanning your face
 * again, but leaving the phone on a table should.
 */
export const RELOCK_AFTER_MS = 2 * 60 * 1000;

let lastUnlockAt = 0;

export function markUnlocked(): void {
  lastUnlockAt = Date.now();
}

export function needsUnlock(now = Date.now()): boolean {
  return now - lastUnlockAt > RELOCK_AFTER_MS;
}

export function clearUnlock(): void {
  lastUnlockAt = 0;
}
