// Outbox drain.
//
// One queue, one drain, one place that decides when it is worth trying the
// network again. Each surface registers a sender for its own entry kind, so
// adding a queued write does not mean adding another retry loop.

import { getCurrentUser, hasConfig } from '../supabase';
import { isOnline, onNetworkChange, setBusy } from './net';
import {
  deleteEntry,
  listEntries,
  resetStalled,
  updateEntry,
  type OutboxEntry,
  type OutboxKind,
} from './outbox';

/**
 * Sends one entry. Throwing leaves it queued with the error attached; it is
 * retried on the next drain rather than dropped.
 */
export type Sender = (entry: OutboxEntry) => Promise<void>;

const senders = new Map<OutboxKind, Sender>();

function currentUserId(): string | null {
  return getCurrentUser()?.id ?? null;
}

export function registerSender(kind: OutboxKind, sender: Sender): void {
  senders.set(kind, sender);
}

const CHANGED = 'lifeos:outbox-sent';

/** Fired after an entry lands on the server, so timelines can refetch. */
export function notifySent(kind: OutboxKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: { kind } }));
}

export function subscribeSent(kind: OutboxKind, onSent: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ kind: OutboxKind }>).detail;
    if (!detail || detail.kind === kind) onSent();
  };
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}

let activeFlush: Promise<void> | null = null;

/**
 * Drains oldest first, one at a time so two uploads do not fight over the same
 * connection. Marks the app busy for the duration, which holds off a service
 * worker reload until unsent work is safe.
 */
async function drainOutbox(): Promise<void> {
  setBusy(true, 'outbox');

  try {
    const entries = await listEntries();
    for (const entry of entries) {
      if (!isOnline()) break;
      if (entry.status === 'uploading') continue;

      const sender = senders.get(entry.kind);
      if (!sender) continue;

      await updateEntry(entry.id, { status: 'uploading', lastError: null });
      try {
        await sender(entry);
        await deleteEntry(entry.id);
        notifySent(entry.kind);
      } catch (error) {
        await updateEntry(entry.id, {
          status: 'failed',
          attempts: entry.attempts + 1,
          progress: 0,
          lastError: error instanceof Error ? error.message : 'Could not send',
        });
      }
    }
  } finally {
    setBusy(false, 'outbox');
  }
}

export function flushOutbox(): Promise<void> {
  // A manual sync must be able to await a flush already started by an auto
  // save or network-resume event. Returning the active promise also prevents
  // duplicate uploads without reporting success too early.
  if (activeFlush) return activeFlush;
  if (!hasConfig || !isOnline() || !currentUserId()) return Promise.resolve();

  activeFlush = drainOutbox().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}

export type ManualSyncResult = {
  sent: number;
  pending: number;
};

type ManualSyncDependencies = {
  configured: boolean;
  online: () => boolean;
  userId: () => string | null;
  flush: () => Promise<void>;
  entries: () => Promise<OutboxEntry[]>;
};

/**
 * Saves the current app snapshot, then waits for every queued upload. The UI
 * only shows success after a second outbox read proves nothing was left behind.
 */
export async function syncNow(
  saveSnapshot: () => Promise<void>,
  overrides: Partial<ManualSyncDependencies> = {},
): Promise<ManualSyncResult> {
  const dependencies: ManualSyncDependencies = {
    configured: hasConfig,
    online: isOnline,
    userId: currentUserId,
    flush: flushOutbox,
    entries: listEntries,
    ...overrides,
  };

  if (!dependencies.configured) throw new Error('Sync is not configured');
  if (!dependencies.userId()) throw new Error('Not signed in');
  if (!dependencies.online()) throw new Error('You are offline');

  const before = await dependencies.entries();
  await saveSnapshot();
  await dependencies.flush();
  const remaining = await dependencies.entries();

  if (remaining.length > 0) {
    const failed = remaining.find((entry) => entry.status === 'failed');
    throw new Error(failed?.lastError || `${remaining.length} item${remaining.length === 1 ? '' : 's'} still waiting to sync`);
  }

  return {
    sent: Math.max(0, before.length - remaining.length),
    pending: remaining.length,
  };
}

export async function retryEntry(id: string): Promise<void> {
  await updateEntry(id, { status: 'queued', lastError: null, progress: 0 });
  void flushOutbox();
}

export async function discardEntry(id: string): Promise<void> {
  await deleteEntry(id);
}

let initialised = false;

/** Requeue anything interrupted last session, then drain whenever we are up. */
export async function initSync(): Promise<void> {
  if (initialised) return;
  initialised = true;

  await resetStalled();
  onNetworkChange((online) => {
    if (online) void flushOutbox();
  });
  void flushOutbox();
}
