export type LifeOSRuntime = 'browser' | 'standalone' | 'native';
export type LifeOSInput = 'pointer' | 'touch';

export function detectLifeOSRuntime(
  protocol: string,
  displayModeStandalone: boolean,
  iosStandalone: boolean,
): LifeOSRuntime {
  if (protocol === 'capacitor:' || protocol === 'ionic:') return 'native';
  if (displayModeStandalone || iosStandalone) return 'standalone';
  return 'browser';
}

export function detectLifeOSInput(coarsePointer: boolean, maxTouchPoints: number): LifeOSInput {
  return coarsePointer || maxTouchPoints > 0 ? 'touch' : 'pointer';
}

/**
 * Expose the host shape to CSS before the React shell mounts. The same build
 * runs in a browser, as an installed PWA and inside Capacitor, and each needs
 * the same mobile layout with slightly different system-chrome boundaries.
 */
export function installMobileShellMetadata(
  doc: Document = document,
  win: Window = window,
  nav: Navigator = navigator,
): void {
  const iosNavigator = nav as Navigator & { standalone?: boolean };
  const displayModeStandalone = win.matchMedia?.('(display-mode: standalone)').matches === true;
  const coarsePointer = win.matchMedia?.('(pointer: coarse)').matches === true;

  doc.documentElement.dataset.lifeosRuntime = detectLifeOSRuntime(
    win.location.protocol,
    displayModeStandalone,
    iosNavigator.standalone === true,
  );
  doc.documentElement.dataset.lifeosInput = detectLifeOSInput(
    coarsePointer,
    nav.maxTouchPoints || 0,
  );
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  installMobileShellMetadata();
}
