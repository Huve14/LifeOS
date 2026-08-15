import { describe, expect, it } from 'vitest';
import { detectPwaInstallPlatform, getPwaInstallGuide } from './pwa';

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
