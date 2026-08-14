import { describe, expect, it, vi } from 'vitest';
import { syncNow } from './sync';
import type { OutboxEntry } from './outbox';

function queuedEntry(status: OutboxEntry['status'] = 'queued', lastError: string | null = null): OutboxEntry {
  return {
    id: 'queued-note',
    kind: 'prompt-answer',
    status,
    createdAt: 1,
    attempts: 0,
    lastError,
    progress: 0,
    bytes: null,
    size: 0,
    meta: {
      promptDate: '2026-08-14',
      body: 'Hello',
      mimeType: null,
      durationSeconds: null,
    },
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    online: () => true,
    userId: () => 'user-1',
    flush: vi.fn(async () => {}),
    entries: vi.fn(async () => [] as OutboxEntry[]),
    ...overrides,
  };
}

describe('syncNow', () => {
  it('saves the current snapshot and waits for the outbox before succeeding', async () => {
    const order: string[] = [];
    const entries = vi.fn()
      .mockImplementationOnce(async () => {
        order.push('read-before');
        return [queuedEntry()];
      })
      .mockImplementationOnce(async () => {
        order.push('read-after');
        return [];
      });
    const save = vi.fn(async () => { order.push('save'); });
    const flush = vi.fn(async () => { order.push('flush'); });

    await expect(syncNow(save, dependencies({ entries, flush })))
      .resolves.toEqual({ sent: 1, pending: 0 });
    expect(order).toEqual(['read-before', 'save', 'flush', 'read-after']);
  });

  it('does not attempt a Supabase write while offline', async () => {
    const save = vi.fn(async () => {});
    await expect(syncNow(save, dependencies({ online: () => false })))
      .rejects.toThrow('offline');
    expect(save).not.toHaveBeenCalled();
  });

  it('requires an authenticated account', async () => {
    await expect(syncNow(async () => {}, dependencies({ userId: () => null })))
      .rejects.toThrow('Not signed in');
  });

  it('does not report success when the snapshot upsert fails', async () => {
    const flush = vi.fn(async () => {});
    await expect(syncNow(
      async () => { throw new Error('Row-level security denied the write'); },
      dependencies({ flush }),
    )).rejects.toThrow('Row-level security');
    expect(flush).not.toHaveBeenCalled();
  });

  it('does not report success while a failed upload remains queued', async () => {
    const entries = vi.fn()
      .mockResolvedValueOnce([queuedEntry()])
      .mockResolvedValueOnce([queuedEntry('failed', 'Upload timed out')]);

    await expect(syncNow(async () => {}, dependencies({ entries })))
      .rejects.toThrow('Upload timed out');
  });
});
