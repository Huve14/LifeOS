const SERVICE_WORKER_URL = '/sw.js';
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type PwaInstallPlatform = 'ios' | 'android' | 'desktop';
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export type PwaInstallGuide = {
  platform: PwaInstallPlatform;
  label: string;
  steps: [string, string, string];
};

let initialized = false;
let reloadStarted = false;
let installPromptInitialized = false;
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

export function detectPwaInstallPlatform(
  userAgent = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints,
): PwaInstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export function getPwaInstallGuide(platform: PwaInstallPlatform): PwaInstallGuide {
  if (platform === 'ios') {
    return {
      platform,
      label: 'On iPhone or iPad',
      steps: [
        'Open Life OS in Safari and tap the Share button.',
        'Scroll down and choose “Add to Home Screen”.',
        'Tap “Add” — Life OS will appear with your other apps.',
      ],
    };
  }
  if (platform === 'android') {
    return {
      platform,
      label: 'On Android',
      steps: [
        'Tap “Install Life OS” below, or open your browser menu.',
        'Choose “Install app” or “Add to Home screen”.',
        'Confirm Install, then open Life OS from your Home Screen.',
      ],
    };
  }
  return {
    platform,
    label: 'On this computer',
    steps: [
      'Select “Install Life OS” below or the install icon in the address bar.',
      'Confirm Install when your browser asks.',
      'Open Life OS from your desktop, Dock, or Start menu.',
    ],
  };
}

export function isPwaInstalled(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || standaloneNavigator.standalone === true;
}

export function canPromptPwaInstall(): boolean {
  return deferredInstallPrompt !== null;
}

export async function promptPwaInstall(): Promise<PwaInstallOutcome> {
  const prompt = deferredInstallPrompt;
  if (!prompt) return 'unavailable';
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === 'accepted') deferredInstallPrompt = null;
  return choice.outcome;
}

/** Capture the browser's one-time install prompt before the React shell mounts. */
export function initPwaInstallPrompt(): void {
  if (installPromptInitialized || typeof window === 'undefined') return;
  installPromptInitialized = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('lifeos:pwa-install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('lifeos:pwa-installed'));
  });
}

function refreshWhenSafe(): void {
  if (reloadStarted) return;
  reloadStarted = true;

  // Never interrupt a recording, upload, sync, or active call. setBusy(false)
  // performs the pending refresh as soon as that work finishes.
  if (window.__lifeosBusy) {
    window.__lifeosPendingReload = true;
    return;
  }

  window.location.reload();
}

function activateWaitingWorker(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

function watchInstallation(registration: ServiceWorkerRegistration): void {
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        activateWaitingWorker(registration);
      }
    });
  });
}

function installUpdateChecks(registration: ServiceWorkerRegistration): void {
  let lastCheckedAt = 0;

  const check = (force = false) => {
    if (!navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastCheckedAt < MIN_CHECK_GAP_MS) return;
    lastCheckedAt = now;
    void registration.update().catch(() => {
      // Offline transitions and restrictive mobile networks can interrupt a
      // check. The next focus/online/interval event will try again.
    });
  };

  check(true);
  window.setInterval(check, UPDATE_INTERVAL_MS);
  window.addEventListener('focus', () => check());
  window.addEventListener('online', () => check(true));
  window.addEventListener('pageshow', () => check());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

/**
 * Keep the installed PWA on the same release as the deployed web app.
 * Development is excluded so local HMR never competes with a service worker.
 */
export function initPwaUpdates(): void {
  if (initialized || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  initialized = true;

  // A first install may claim this page too. Only reload when the page already
  // had a controller, which means a newer release has replaced an older one.
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    refreshWhenSafe();
  });

  const register = () => {
    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: '/', updateViaCache: 'none' })
      .then(registration => {
        watchInstallation(registration);
        activateWaitingWorker(registration);
        installUpdateChecks(registration);
      })
      .catch(() => {
        // The web app remains usable if a browser blocks PWA registration.
      });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
