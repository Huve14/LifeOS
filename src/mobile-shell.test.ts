import { describe, expect, it } from 'vitest';
import { detectLifeOSInput, detectLifeOSRuntime, installMobileShellMetadata } from './mobile-shell';

describe('mobile shell metadata', () => {
  it('distinguishes browser, installed PWA and native hosts', () => {
    expect(detectLifeOSRuntime('https:', false, false)).toBe('browser');
    expect(detectLifeOSRuntime('https:', true, false)).toBe('standalone');
    expect(detectLifeOSRuntime('https:', false, true)).toBe('standalone');
    expect(detectLifeOSRuntime('capacitor:', false, false)).toBe('native');
  });

  it('treats either a coarse pointer or touch points as touch input', () => {
    expect(detectLifeOSInput(false, 0)).toBe('pointer');
    expect(detectLifeOSInput(true, 0)).toBe('touch');
    expect(detectLifeOSInput(false, 5)).toBe('touch');
  });

  it('writes the runtime and input mode for CSS to consume', () => {
    const mockWindow = {
      location: { protocol: 'capacitor:' },
      matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }),
    } as unknown as Window;
    const mockNavigator = { maxTouchPoints: 5 } as Navigator;

    installMobileShellMetadata(document, mockWindow, mockNavigator);

    expect(document.documentElement.dataset.lifeosRuntime).toBe('native');
    expect(document.documentElement.dataset.lifeosInput).toBe('touch');

    delete document.documentElement.dataset.lifeosRuntime;
    delete document.documentElement.dataset.lifeosInput;
  });
});
