const SERVICE_WORKER_URL = '/sw.js';
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type PwaInstallPlatform = 'ios' | 'android' | 'desktop';
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';
export type PwaUpdatePhase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'downloading'
  | 'ready'
  | 'deferred'
  | 'offline'
  | 'unsupported'
  | 'error';

export type PwaUpdateStatus = {
  phase: PwaUpdatePhase;
  automatic: true;
  lastCheckedAt: number | null;
};

export type PwaInstallGuide = {
  platform: PwaInstallPlatform;
  label: string;
  steps: [string, string, string];
};

let initialized = false;
let reloadStarted = false;
let deferralWatched = false;
let installPromptInitialized = false;
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let updateRegistration: ServiceWorkerRegistration | null = null;
let lastUpdateAttemptAt = 0;
let updateStatus: PwaUpdateStatus = {
  phase: 'idle',
  automatic: true,
  lastCheckedAt: null,
};
const updateListeners = new Set<(status: PwaUpdateStatus) => void>();

function setPwaUpdateStatus(patch: Partial<PwaUpdateStatus>): PwaUpdateStatus {
  updateStatus = { ...updateStatus, ...patch, automatic: true };
  const snapshot = getPwaUpdateStatus();
  updateListeners.forEach(listener => listener(snapshot));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lifeos:pwa-update-status', { detail: snapshot }));
  }
  return snapshot;
}

export function getPwaUpdateStatus(): PwaUpdateStatus {
  return { ...updateStatus };
}

export function subscribePwaUpdateStatus(
  listener: (status: PwaUpdateStatus) => void,
): () => void {
  updateListeners.add(listener);
  listener(getPwaUpdateStatus());
  return () => updateListeners.delete(listener);
}

export function pwaUpdateMessage(status: PwaUpdateStatus): string {
  switch (status.phase) {
    case 'checking': return 'Checking for a newer release…';
    case 'current': return 'You have the latest release.';
    case 'downloading': return 'A new release is downloading in the background…';
    case 'ready': return 'A new release is ready and opening automatically…';
    case 'deferred': return 'Update ready. It will open automatically as soon as your current work is safe.';
    case 'offline': return 'You are offline. Life OS will check again automatically when you reconnect.';
    case 'unsupported': return 'Automatic web updates are not available in this browser.';
    case 'error': return 'Could not check right now. Life OS will retry automatically.';
    default: return 'Life OS checks whenever you open or return to the app.';
  }
}

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

/**
 * Whether the person is part-way through typing something.
 *
 * The busy flag covers recordings, uploads, syncs and calls, but not a
 * half-written note or a date label. An update that reloads the page out from
 * under a filled-in field silently destroys work, which is a worse experience
 * than not updating at all — so an empty field is fair game and a field with
 * something in it is not.
 */
export function hasUnfinishedTyping(active: Element | null = document.activeElement): boolean {
  if (!active) return false;

  if (active instanceof HTMLTextAreaElement) return active.value.trim() !== '';
  if (active instanceof HTMLInputElement) {
    // Buttons, checkboxes, ranges and the like carry no text to lose. The app
    // uses no contenteditable regions, so there is nothing else to cover.
    const typed = ['text', 'search', 'url', 'email', 'tel', 'password', 'number', 'date'];
    return typed.includes(active.type) && active.value.trim() !== '';
  }
  return false;
}

/** An update may take the page now only if nothing would be lost by it. */
export function isSafeToReload(): boolean {
  return !window.__lifeosBusy && !hasUnfinishedTyping();
}

/**
 * Retry the deferred reload the moment the reason for deferring goes away.
 *
 * Without this a pending update waits for setBusy(false), which never comes if
 * the deferral was typing rather than an upload.
 */
function watchForSafeMoment(): void {
  if (deferralWatched) return;
  deferralWatched = true;

  const retry = () => {
    if (!window.__lifeosPendingReload) return;
    if (!isSafeToReload()) return;
    window.__lifeosPendingReload = false;
    setPwaUpdateStatus({ phase: 'ready' });
    window.location.reload();
  };

  // focusout fires as they leave the field; the visibility and pagehide checks
  // catch the case where they simply put the phone down mid-sentence.
  window.addEventListener('focusout', () => window.setTimeout(retry, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retry();
  });
}

function refreshWhenSafe(): void {
  if (reloadStarted) return;
  reloadStarted = true;

  // Never interrupt a recording, upload, sync, active call, or a field someone
  // is still typing into. setBusy(false) and watchForSafeMoment() each perform
  // the pending refresh as soon as their reason for waiting clears.
  if (!isSafeToReload()) {
    window.__lifeosPendingReload = true;
    setPwaUpdateStatus({ phase: 'deferred' });
    watchForSafeMoment();
    return;
  }

  setPwaUpdateStatus({ phase: 'ready' });
  window.location.reload();
}

function activateWaitingWorker(registration: ServiceWorkerRegistration): void {
  if (!registration.waiting) return;
  setPwaUpdateStatus({ phase: 'ready' });
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

function watchInstallation(registration: ServiceWorkerRegistration): void {
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    if (navigator.serviceWorker.controller) {
      setPwaUpdateStatus({ phase: 'downloading' });
    }

    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        setPwaUpdateStatus({ phase: 'ready' });
        activateWaitingWorker(registration);
      }
    });
  });
}

async function runUpdateCheck(
  registration: ServiceWorkerRegistration,
  force = false,
  announce = false,
): Promise<PwaUpdateStatus> {
  if (!navigator.onLine) {
    return setPwaUpdateStatus({ phase: 'offline' });
  }
  const now = Date.now();
  if (!force && now - lastUpdateAttemptAt < MIN_CHECK_GAP_MS) return getPwaUpdateStatus();
  lastUpdateAttemptAt = now;
  if (announce) setPwaUpdateStatus({ phase: 'checking' });

  try {
    await registration.update();
    const checkedAt = Date.now();
    if (registration.waiting) {
      setPwaUpdateStatus({ phase: 'ready', lastCheckedAt: checkedAt });
      activateWaitingWorker(registration);
    } else if (registration.installing) {
      setPwaUpdateStatus({ phase: 'downloading', lastCheckedAt: checkedAt });
    } else {
      setPwaUpdateStatus({ phase: 'current', lastCheckedAt: checkedAt });
    }
  } catch {
    // Offline transitions and restrictive mobile networks can interrupt a
    // check. The next focus/online/interval event will try again.
    setPwaUpdateStatus({ phase: navigator.onLine ? 'error' : 'offline' });
  }

  return getPwaUpdateStatus();
}

export async function checkForPwaUpdate(): Promise<PwaUpdateStatus> {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return setPwaUpdateStatus({ phase: 'unsupported' });
  }

  const registration = updateRegistration
    ?? await navigator.serviceWorker.getRegistration('/');
  if (!registration) return setPwaUpdateStatus({ phase: 'error' });
  updateRegistration = registration;
  return runUpdateCheck(registration, true, true);
}

function installUpdateChecks(registration: ServiceWorkerRegistration): void {
  const check = (force = false) => {
    void runUpdateCheck(registration, force);
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
  if (initialized) return;
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    setPwaUpdateStatus({ phase: 'unsupported' });
    return;
  }
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
        updateRegistration = registration;
        watchInstallation(registration);
        activateWaitingWorker(registration);
        installUpdateChecks(registration);
      })
      .catch(() => {
        // The web app remains usable if a browser blocks PWA registration.
        setPwaUpdateStatus({ phase: 'error' });
      });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
