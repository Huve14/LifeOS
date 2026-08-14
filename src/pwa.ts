const SERVICE_WORKER_URL = '/sw.js';
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

let initialized = false;
let reloadStarted = false;

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
