import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkForPwaUpdate,
  detectPwaInstallPlatform,
  getPwaInstallGuide,
  getPwaUpdateStatus,
  hasUnfinishedTyping,
  isSafeToReload,
  pwaUpdateMessage,
  subscribePwaUpdateStatus,
} from './pwa';

describe('PWA install guidance', () => {
  it('recognises iPhone, iPadOS, Android and desktop browsers', () => {
    expect(detectPwaInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('ios');
    expect(detectPwaInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5)).toBe('ios');
    expect(detectPwaInstallPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5)).toBe('android');
    expect(detectPwaInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0)).toBe('desktop');
  });

  it('provides three clear, platform-specific install steps', () => {
    const ios = getPwaInstallGuide('ios');
    const android = getPwaInstallGuide('android');
    const desktop = getPwaInstallGuide('desktop');

    expect(ios.steps).toHaveLength(3);
    expect(ios.steps.join(' ')).toContain('Add to Home Screen');
    expect(android.steps.join(' ')).toContain('Install app');
    expect(desktop.steps.join(' ')).toContain('address bar');
  });
});

describe('deferring an update so it cannot destroy work', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.__lifeosBusy = false;
  });

  function focused<T extends HTMLElement>(element: T, value?: string): T {
    if (value !== undefined && 'value' in element) {
      (element as unknown as { value: string }).value = value;
    }
    document.body.appendChild(element);
    element.focus();
    return element;
  }

  it('holds the reload while a textarea has something in it', () => {
    const notes = focused(document.createElement('textarea'), 'Half a note about');
    expect(hasUnfinishedTyping(notes)).toBe(true);
    expect(isSafeToReload()).toBe(false);
  });

  it('lets the reload through once the field is empty again', () => {
    const notes = focused(document.createElement('textarea'), '');
    expect(hasUnfinishedTyping(notes)).toBe(false);
    expect(isSafeToReload()).toBe(true);
  });

  it('treats whitespace as empty rather than as work', () => {
    expect(hasUnfinishedTyping(focused(document.createElement('textarea'), '   \n  '))).toBe(false);
  });

  it('protects the text-bearing input types', () => {
    // Each value has to be valid for its own type: a browser discards one that
    // is not, so 'something' in a date field would read back as empty.
    const fields: [string, string][] = [
      ['text', 'a label'], ['search', 'biltong'], ['email', 'sam@example.com'],
      ['tel', '+971500000000'], ['password', 'hunter2'],
      ['number', '42'], ['date', '2026-09-04'],
    ];
    for (const [type, value] of fields) {
      const field = document.createElement('input');
      field.type = type;
      expect(hasUnfinishedTyping(focused(field, value))).toBe(true);
      document.body.innerHTML = '';
    }
  });

  it('ignores controls that carry no text to lose', () => {
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'range']) {
      const control = document.createElement('input');
      control.type = type;
      expect(hasUnfinishedTyping(focused(control, 'on'))).toBe(false);
      document.body.innerHTML = '';
    }
  });

  it('is safe when nothing at all is focused', () => {
    expect(hasUnfinishedTyping(null)).toBe(false);
    expect(hasUnfinishedTyping(document.createElement('div'))).toBe(false);
  });

  it('still defers for a recording, upload or call even with no field focused', () => {
    window.__lifeosBusy = true;
    expect(hasUnfinishedTyping(null)).toBe(false);
    expect(isSafeToReload()).toBe(false);
  });
});

describe('PWA update settings', () => {
  it('keeps automatic updates permanently enabled and exposes their status', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePwaUpdateStatus(listener);

    expect(getPwaUpdateStatus().automatic).toBe(true);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ automatic: true }));
    unsubscribe();
  });

  it('explains when an update is waiting for a safe moment', () => {
    expect(pwaUpdateMessage({
      phase: 'deferred',
      automatic: true,
      lastCheckedAt: Date.now(),
    })).toContain('automatically');
  });

  it('reports unsupported in development instead of pretending to update', async () => {
    const status = await checkForPwaUpdate();
    expect(status).toMatchObject({ phase: 'unsupported', automatic: true });
  });
});
