// Network helpers. Everything that touches the wire in the shared surfaces is
// assumed to be on hotel or school wifi, so retry and backoff are the default
// rather than an error path.

import { nativeOnline } from './native';
import { hasUnfinishedTyping } from '../pwa';

/**
 * navigator.onLine reports true on a wifi network with no route out, which is
 * the hotel captive portal case exactly. On device the native signal is
 * authoritative; in a browser it is all we have.
 */
export function isOnline(): boolean {
  const native = nativeOnline();
  if (native !== null) return native;
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function onNetworkChange(fn: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const up = () => fn(true);
  const down = () => fn(false);
  window.addEventListener('online', up);
  window.addEventListener('offline', down);
  return () => {
    window.removeEventListener('online', up);
    window.removeEventListener('offline', down);
  };
}

/**
 * Exponential backoff with full jitter. Jitter matters here because both
 * devices retry against the same project and can otherwise sync up their
 * attempts after a shared outage.
 */
export function backoffDelay(attempt: number, base = 1000, max = 30000): number {
  const ceiling = Math.min(max, base * 2 ** Math.max(0, attempt));
  return Math.round(Math.random() * ceiling);
}

export class AbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortError';
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new AbortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type RetryOptions = {
  attempts?: number;
  base?: number;
  max?: number;
  signal?: AbortSignal;
  /** Called before each wait, so callers can surface "retrying in a moment". */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  /** Return false to give up early on an error that will never succeed. */
  isRetryable?: (error: unknown) => boolean;
};

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 5,
    base = 1000,
    max = 30000,
    signal,
    onRetry,
    isRetryable = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new AbortError();
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof AbortError || signal?.aborted) throw error;
      if (!isRetryable(error)) throw error;
      if (attempt === attempts - 1) break;

      const delay = backoffDelay(attempt, base, max);
      onRetry?.(attempt + 1, error, delay);
      await sleep(delay, signal);
    }
  }

  throw lastError;
}

/**
 * Set while a recording, upload or call is in flight. The service worker
 * update handler reads this and defers its reload, so an update cannot destroy
 * a clip that has not reached the server yet.
 */
export function setBusy(busy: boolean): void {
  if (typeof window === 'undefined') return;
  window.__lifeosBusy = busy;
  // A pending update takes the page as soon as the work finishes — unless the
  // person has meanwhile started typing something. The service worker handler
  // watches for that field to clear and reloads then, so the update is only
  // ever postponed, never dropped.
  if (!busy && window.__lifeosPendingReload && !hasUnfinishedTyping()) {
    window.__lifeosPendingReload = false;
    window.location.reload();
  }
}

export function isBusy(): boolean {
  return typeof window !== 'undefined' && window.__lifeosBusy === true;
}
