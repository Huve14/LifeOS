// Offline outbox.
//
// A recording is written here before any network call happens, so closing the
// app, losing wifi or a service worker update cannot lose a clip. The queue
// survives restarts because it lives in IndexedDB, which unlike localStorage
// can hold a Blob.
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

export type OutboxEntry = {
  id: string;
  kind: 'video-note';
  status: OutboxStatus;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  /** 0 to 1, for the progress bar on the pending card. */
  progress: number;
  bytes: ArrayBuffer;
  /** Cached so the pending card can show a size without rebuilding the blob. */
  size: number;
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

type Listener = (entries: OutboxEntry[]) => void;

const listeners = new Set<Listener>();

/** Rebuild the recording for upload. */
export function entryBlob(entry: OutboxEntry): Blob {
  return new Blob([entry.bytes], { type: entry.meta.mimeType });
}

export function entryPoster(entry: OutboxEntry): Blob | null {
  if (!entry.posterBytes) return null;
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

export async function updateEntry(id: string, patch: Partial<OutboxEntry>): Promise<OutboxEntry | null> {
  const existing = await getEntry(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await run('readwrite', (store) => store.put(next) as IDBRequest<IDBValidKey>);
  await notify();
  return next;
}

export async function deleteEntry(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
  await notify();
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
