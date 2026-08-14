// Push notifications.
//
// The point of this is one thing: she records something at 23:00 Abu Dhabi
// time and it is actually seen, rather than sitting unread until someone
// happens to open the app. Web push on iOS only works once installed and is
// unreliable, which is most of why the app is wrapped natively at all.
//
// The device token is stored per user in lifeos_devices and used by the
// notify Edge Function. Tokens rotate, so registration runs on every launch
// and upserts rather than inserting.

import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { getAuthClient, hasConfig } from '../supabase';
import { currentUserId } from './spaces';
import { isNative, platform } from './native';

export type PushStatus = 'unsupported' | 'denied' | 'granted';

let registered = false;

async function saveToken(token: string): Promise<void> {
  const userId = currentUserId();
  if (!userId || !hasConfig) return;

  await getAuthClient()
    .from('lifeos_devices')
    .upsert(
      {
        user_id: userId,
        token,
        platform: platform(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
}

/**
 * Asks for permission and registers. Safe to call repeatedly; the listeners
 * are attached once.
 */
export async function registerPush(
  onOpened?: (data: Record<string, unknown>) => void,
): Promise<PushStatus> {
  if (!isNative()) return 'unsupported';

  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') return 'denied';

    if (!registered) {
      registered = true;

      await PushNotifications.addListener('registration', (token: Token) => {
        void saveToken(token.value);
      });

      await PushNotifications.addListener('registrationError', () => {
        // Nothing actionable in the UI. The app works without push.
        registered = false;
      });

      // Tapping a notification should land on the thing it was about.
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        onOpened?.(action.notification.data ?? {});
      });
    }

    await PushNotifications.register();
    return 'granted';
  } catch {
    return 'unsupported';
  }
}

/** Clear the badge when the app is opened and everything has been seen. */
export async function clearBadge(): Promise<void> {
  if (!isNative()) return;
  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Not worth surfacing.
  }
}

/** Drop this device's tokens on sign out so notifications stop following it. */
export async function unregisterPush(): Promise<void> {
  const userId = currentUserId();
  if (!userId || !hasConfig) return;
  await getAuthClient().from('lifeos_devices').delete().eq('user_id', userId);
}
