// Native shell integration.
//
// Everything here is optional. The same build runs as a web app in a browser
// and as a native iOS app under Capacitor, and every call degrades to a no-op
// off-device, so nothing in the feature code needs to branch on platform.

import { Capacitor } from '@capacitor/core';
import { App, type AppState } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { BackgroundTask } from '@capawesome/capacitor-background-task';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function platform(): string {
  return Capacitor.getPlatform();
}

// ---------- Connectivity ----------
//
// navigator.onLine is unreliable on iOS: it reports true on a wifi network
// that has no route out, which is exactly the hotel captive portal case this
// app is built for. The native Network plugin reflects the real state.

let networkConnected: boolean | null = null;

export function nativeOnline(): boolean | null {
  return networkConnected;
}

async function watchNetwork(onChange: (online: boolean) => void): Promise<void> {
  const status = await Network.getStatus();
  networkConnected = status.connected;

  await Network.addListener('networkStatusChange', (next) => {
    const was = networkConnected;
    networkConnected = next.connected;
    if (was !== next.connected) onChange(next.connected);
  });
}

// ---------- Haptics ----------

export async function tap(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  if (window.__lifeosPreferences?.haptics === false) return;
  if (!isNative()) return;
  const styles = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
  };
  try {
    await Haptics.impact({ style: styles[style] });
  } catch {
    // Haptics are decoration. Never let them break a flow.
  }
}

export async function notifyHaptic(kind: 'success' | 'warning' | 'error'): Promise<void> {
  if (window.__lifeosPreferences?.haptics === false) return;
  if (!isNative()) return;
  const types = {
    success: NotificationType.Success,
    warning: NotificationType.Warning,
    error: NotificationType.Error,
  };
  try {
    await Haptics.notification({ type: types[kind] });
  } catch {
    // As above.
  }
}

// ---------- Background continuation ----------
//
// iOS suspends the app shortly after it goes to the background, which would
// freeze an upload mid-flight. This asks for the extra execution window so a
// queued video note can finish rather than waiting for the next launch.
//
// This is a continuation, not true out-of-process upload: iOS grants tens of
// seconds, not minutes. A large clip on weak wifi still finishes on the next
// open, which is what the outbox is for.

export async function runInBackground(work: () => Promise<void>): Promise<void> {
  if (!isNative()) {
    await work();
    return;
  }

  const taskId = await BackgroundTask.beforeExit(async () => {
    try {
      await work();
    } finally {
      await BackgroundTask.finish({ taskId });
    }
  });
}

// ---------- Lifecycle ----------

export type NativeHooks = {
  /** Called when the app returns to the foreground. */
  onResume: () => void;
  /** Called when the app is backgrounded, inside a background task window. */
  onBackground: () => Promise<void>;
  /** Called when connectivity actually changes. */
  onNetworkChange: (online: boolean) => void;
};

let initialised = false;

export async function initNative(hooks: NativeHooks): Promise<void> {
  if (initialised || !isNative()) return;
  initialised = true;

  try {
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    // Not fatal if the platform does not support it.
  }

  await watchNetwork(hooks.onNetworkChange).catch(() => {});

  await App.addListener('appStateChange', (state: AppState) => {
    if (state.isActive) {
      hooks.onResume();
    } else {
      void runInBackground(hooks.onBackground);
    }
  });

  // Hidden by the app once it has decided what to render, so there is no gap
  // between the splash and real content.
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // As above.
  }
}

/** Follows the in-app dark mode toggle so the clock and battery stay legible. */
export async function setStatusBarForTheme(dark: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    // As above.
  }
}
