import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  deleteEntry,
  entryBlob,
  entryPoster,
  getEntry,
  listEntries,
  putEntry,
  resetStalled,
  subscribeOutbox,
  supportsOutbox,
  updateEntry,
  updateProgress,
  type OutboxEntry,
} from './outbox';

const VIDEO_BYTES = new TextEncoder().encode('video bytes').buffer;

function entry(id: string, overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id,
    kind: 'video-note',
    status: 'queued',
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    progress: 0,
    bytes: VIDEO_BYTES.slice(0),
    size: VIDEO_BYTES.byteLength,
    posterBytes: null,
    meta: {
      durationSeconds: 20,
      mimeType: 'video/webm',
      width: 720,
      height: 1280,
      caption: '',
      recordedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

async function clear() {
  const all = await listEntries();
  await Promise.all(all.map((e) => deleteEntry(e.id)));
}

beforeEach(clear);

describe('upload progress', () => {
  it('throttles small steps so a megabyte entry is not rewritten per byte', async () => {
    await putEntry(entry('p'));
    await updateProgress('p', 0.2);
    await updateProgress('p', 0.21);
    expect((await getEntry('p'))?.progress).toBe(0.2);

    await updateProgress('p', 0.3);
    expect((await getEntry('p'))?.progress).toBe(0.3);
  });

  // A failed upload goes back on the queue at zero. Every step of the retry
  // sits below the first attempt's high-water mark, so throttling alone left
  // the bar frozen for the whole second attempt.
  it('follows a retry that starts over from zero', async () => {
    await putEntry(entry('q'));
    await updateProgress('q', 0.9);

    await updateEntry('q', { status: 'queued', progress: 0 });
    await updateProgress('q', 0.1);
    expect((await getEntry('q'))?.progress).toBe(0.1);

    await updateProgress('q', 0.2);
    expect((await getEntry('q'))?.progress).toBe(0.2);
  });
});

describe('outbox', () => {
  it('reports IndexedDB availability', () => {
    expect(supportsOutbox()).toBe(true);
  });

  it('stores and reads back an entry with the recorded bytes intact', async () => {
    await putEntry(entry('a'));
    const stored = await getEntry('a');
    expect(stored).not.toBeNull();
    expect(stored?.bytes.byteLength).toBe(VIDEO_BYTES.byteLength);
    expect(stored?.meta.durationSeconds).toBe(20);
  });

  it('rebuilds an uploadable blob from the stored bytes', async () => {
    await putEntry(entry('a', { posterBytes: new TextEncoder().encode('jpeg').buffer }));
    const stored = await getEntry('a');

    const blob = entryBlob(stored!);
    expect(blob.size).toBe(VIDEO_BYTES.byteLength);
    expect(blob.type).toBe('video/webm');
    expect(await blob.text()).toBe('video bytes');

    expect(entryPoster(stored!)?.type).toBe('image/jpeg');
  });

  it('has no poster blob when none was captured', async () => {
    await putEntry(entry('a'));
    expect(entryPoster((await getEntry('a'))!)).toBeNull();
  });

  it('returns null for an id that is not queued', async () => {
    expect(await getEntry('missing')).toBeNull();
  });

  it('drains oldest first', async () => {
    await putEntry(entry('second', { createdAt: 2000 }));
    await putEntry(entry('first', { createdAt: 1000 }));
    await putEntry(entry('third', { createdAt: 3000 }));

    const all = await listEntries();
    expect(all.map((e) => e.id)).toEqual(['first', 'second', 'third']);
  });

  it('keys by client id, so requeueing the same recording does not duplicate', async () => {
    await putEntry(entry('same'));
    await putEntry(entry('same'));
    expect((await listEntries())).toHaveLength(1);
  });

  it('patches an entry without losing the recording', async () => {
    await putEntry(entry('a'));
    const updated = await updateEntry('a', { status: 'failed', lastError: 'timeout', attempts: 2 });
    expect(updated?.status).toBe('failed');
    expect(updated?.lastError).toBe('timeout');
    expect(updated?.bytes.byteLength).toBe(VIDEO_BYTES.byteLength);
  });

  it('ignores a patch for an entry that is gone', async () => {
    expect(await updateEntry('nope', { status: 'failed' })).toBeNull();
  });

  it('requeues uploads interrupted by a restart', async () => {
    await putEntry(entry('interrupted', { status: 'uploading', progress: 0.6 }));
    await putEntry(entry('waiting', { status: 'queued' }));
    await putEntry(entry('broken', { status: 'failed' }));

    await resetStalled();

    expect((await getEntry('interrupted'))?.status).toBe('queued');
    expect((await getEntry('interrupted'))?.progress).toBe(0);
    // A failure is a decision the reader has seen; leave it alone.
    expect((await getEntry('broken'))?.status).toBe('failed');
  });

  it('notifies subscribers on every change', async () => {
    const seen = vi.fn();
    const unsubscribe = subscribeOutbox(seen);

    await putEntry(entry('a'));
    await updateEntry('a', { status: 'uploading' });
    await deleteEntry('a');

    expect(seen.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(seen.mock.calls.at(-1)?.[0]).toEqual([]);
    unsubscribe();
  });

  it('stops notifying after unsubscribe, including the initial read', async () => {
    const seen = vi.fn();
    // Unsubscribing immediately must also cancel the async first delivery.
    subscribeOutbox(seen)();
    await putEntry(entry('a'));
    await listEntries();
    expect(seen).not.toHaveBeenCalled();
  });
});
