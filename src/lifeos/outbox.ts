// Offline outbox.
//
// Every write in the shared surfaces lands here before any network call, so
// closing the app, losing wifi or a service worker update cannot lose a video
// note or a prompt answer. The queue survives restarts because it lives in
// IndexedDB, which unlike localStorage can hold binary.
//
// This module is storage only. Sending is in sync.ts, which dispatches on the
// entry kind, so the queue does not need to know what any given write means.
//
// Entries are keyed by the device-generated client id, which is also what the
// storage path and the row's unique constraint are built from. That makes the
// whole pipeline idempotent: replaying an entry overwrites the same object and
// conflicts on the same row instead of producing a duplicate.
//
// Bytes are stored as ArrayBuffer rather than Blob. IndexedDB is specified to
// structured-clone a Blob, but several iOS Safari versions store one that reads
// back empty, and this queue exists specifically to be trusted on her phone.
// ArrayBuffer round-trips everywhere.

const DB_NAME = 'lifeos';
const DB_VERSION = 1;
const STORE = 'outbox';

export type OutboxStatus = 'queued' | 'uploading' | 'failed';

export type OutboxKind = 'video-note' | 'prompt-answer' | 'trip-item';

type BaseEntry = {
  id: string;
  status: OutboxStatus;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  /** 0 to 1, for the progress bar on the pending card. */
  progress: number;
  /** Media payload, if the write carries one. Null for a text-only answer. */
  bytes: ArrayBuffer | null;
  /** Cached so a pending card can show a size without rebuilding the blob. */
  size: number;
};

export type VideoNoteEntry = BaseEntry & {
  kind: 'video-note';
  bytes: ArrayBuffer;
  posterBytes: ArrayBuffer | null;
  meta: {
    durationSeconds: number;
    mimeType: string;
    width: number | null;
    height: number | null;
    caption: string;
    recordedAt: string;
  };
};

export type PromptAnswerEntry = BaseEntry & {
  kind: 'prompt-answer';
  meta: {
    /** Calendar date the prompt belongs to, in the prompt's anchor zone. */
    promptDate: string;
    body: string;
    /** Null when the answer is text only. */
    mimeType: string | null;
    durationSeconds: number | null;
  };
};

/**
 * A create, an edit and a delete are all the same shape here: the full row as
 * it should end up, upserted on client_id, or removed if deleted is set. That
 * keeps a retry idempotent whichever of the three it was.
 */
export type TripItemEntry = BaseEntry & {
  kind: 'trip-item';
  bytes: null;
  meta: {
    tripId: string;
    deleted: boolean;
    row: TripItemRow;
  };
};

export type TripItemRow = {
  category: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  cost_amount: number | null;
  cost_currency: string;
  booking_ref: string;
  status: string;
  notes: string;
  url: string;
  is_complete: boolean;
};

export type OutboxEntry = VideoNoteEntry | PromptAnswerEntry | TripItemEntry;

type Listener = (entries: OutboxEntry[]) => void;

const listeners = new Set<Listener>();

export function isVideoNote(entry: OutboxEntry): entry is VideoNoteEntry {
  return entry.kind === 'video-note';
}

export function isPromptAnswer(entry: OutboxEntry): entry is PromptAnswerEntry {
  return entry.kind === 'prompt-answer';
}

export function isTripItem(entry: OutboxEntry): entry is TripItemEntry {
  return entry.kind === 'trip-item';
}

/** Rebuild the media payload for upload. Null when there is none. */
export function entryBlob(entry: OutboxEntry): Blob | null {
  if (!entry.bytes) return null;
  const mimeType = 'mimeType' in entry.meta ? entry.meta.mimeType : null;
  if (!mimeType) return null;
  return new Blob([entry.bytes], { type: mimeType });
}

export function entryPoster(entry: OutboxEntry): Blob | null {
  if (!isVideoNote(entry) || !entry.posterBytes) return null;
  return new Blob([entry.posterBytes], { type: 'image/jpeg' });
}

export function supportsOutbox(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!supportsOutbox()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // A failed open should not poison every later call.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = fn(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

async function notify(): Promise<void> {
  if (listeners.size === 0) return;
  const entries = await listEntries();
  listeners.forEach((fn) => {
    try {
      fn(entries);
    } catch {
      // A broken listener should not stop the others.
    }
  });
}

export function subscribeOutbox(fn: Listener): () => void {
  listeners.add(fn);
  // The first read is async, so re-check membership before delivering it.
  // Otherwise a component that unmounts straight away still gets a callback.
  void listEntries().then((entries) => {
    if (listeners.has(fn)) fn(entries);
  });
  return () => {
    listeners.delete(fn);
  };
}

/** Oldest first, so the queue drains in the order things were recorded. */
export async function listEntries(): Promise<OutboxEntry[]> {
  if (!supportsOutbox()) return [];
  try {
    const all = await run<OutboxEntry[]>('readonly', (store) => store.getAll() as IDBRequest<OutboxEntry[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function getEntry(id: string): Promise<OutboxEntry | null> {
  if (!supportsOutbox()) return null;
  try {
    const entry = await run<OutboxEntry | undefined>(
      'readonly',
      (store) => store.get(id) as IDBRequest<OutboxEntry | undefined>,
    );
    return entry ?? null;
  } catch {
    return null;
  }
}

export async function putEntry(entry: OutboxEntry): Promise<void> {
  await run('readwrite', (store) => store.put(entry) as IDBRequest<IDBValidKey>);
  await notify();
}

/**
 * Only the progress fields are patchable. The payload and its meta are fixed
 * at queue time, so a retry always sends exactly what was recorded.
 */
export type OutboxPatch = Partial<
  Pick<OutboxEntry, 'status' | 'progress' | 'attempts' | 'lastError'>
>;

export async function updateEntry(id: string, patch: OutboxPatch): Promise<OutboxEntry | null> {
  const existing = await getEntry(id);
  if (!existing) return null;
  const next = { ...existing, ...patch } as OutboxEntry;
  await run('readwrite', (store) => store.put(next) as IDBRequest<IDBValidKey>);
  await notify();
  return next;
}

export async function deleteEntry(id: string): Promise<void> {
  lastProgress.delete(id);
  await run('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
  await notify();
}

const lastProgress = new Map<string, number>();

/**
 * Throttled, because every write re-reads the entry to patch it, and an entry
 * carries the whole recording. Updating on each byte would mean shuttling
 * megabytes through IndexedDB to move a progress bar.
 */
export async function updateProgress(id: string, fraction: number): Promise<void> {
  const previous = lastProgress.get(id) ?? -1;
  if (fraction < 1 && fraction - previous < 0.05) return;
  lastProgress.set(id, fraction);
  await updateEntry(id, { progress: fraction });
}

export async function countPending(): Promise<number> {
  const entries = await listEntries();
  return entries.length;
}

/**
 * Anything left as 'uploading' when the app starts was interrupted mid-flight,
 * so it goes back on the queue rather than sitting in a state nothing will
 * advance.
 */
export async function resetStalled(): Promise<void> {
  const entries = await listEntries();
  await Promise.all(
    entries
      .filter((entry) => entry.status === 'uploading')
      .map((entry) => updateEntry(entry.id, { status: 'queued', progress: 0 })),
  );
}
