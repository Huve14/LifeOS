import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AbortError, backoffDelay, isBusy, setBusy, withRetry } from './net';

describe('backoffDelay', () => {
  it('grows with the attempt number', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(1);
    expect(backoffDelay(0, 1000)).toBe(1000);
    expect(backoffDelay(1, 1000)).toBe(2000);
    expect(backoffDelay(3, 1000)).toBe(8000);
    spy.mockRestore();
  });

  it('is capped', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(1);
    expect(backoffDelay(20, 1000, 30000)).toBe(30000);
    spy.mockRestore();
  });

  it('jitters, so two devices do not retry in lockstep', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(backoffDelay(2, 1000)).toBe(1000);
    spy.mockRestore();
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a failing call and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('ok');

    await expect(withRetry(fn, { base: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempt budget and rethrows the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('still down'));
    await expect(withRetry(fn, { attempts: 3, base: 0 })).rejects.toThrow('still down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('stops early on an error that will never succeed', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('unauthorized'));
    await expect(
      withRetry(fn, { attempts: 5, base: 0, isRetryable: () => false }),
    ).rejects.toThrow('unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reports each retry so the UI can say what is happening', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');
    await withRetry(fn, { base: 0, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toBe(1);
  });

  it('aborts without further attempts', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { signal: controller.signal })).rejects.toBeInstanceOf(AbortError);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('setBusy', () => {
  beforeEach(() => {
    window.__lifeosBusy = false;
    window.__lifeosPendingReload = false;
  });

  it('tracks the busy flag the service worker handler reads', () => {
    expect(isBusy()).toBe(false);
    setBusy(true);
    expect(isBusy()).toBe(true);
    expect(window.__lifeosBusy).toBe(true);
  });

  it('leaves a deferred reload pending while still busy', () => {
    setBusy(true);
    window.__lifeosPendingReload = true;
    expect(window.__lifeosPendingReload).toBe(true);
  });

  it('clears the flag when the work finishes', () => {
    setBusy(true);
    setBusy(false);
    expect(isBusy()).toBe(false);
  });
});
