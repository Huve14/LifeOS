export type PerformanceMode = 'lite' | 'balanced';

export type PerformanceSignals = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
  reducedMotion?: boolean;
};

export function classifyPerformance(signals: PerformanceSignals): PerformanceMode {
  if (signals.saveData || signals.reducedMotion) return 'lite';
  if (typeof signals.deviceMemory === 'number' && signals.deviceMemory <= 4) return 'lite';
  if (typeof signals.hardwareConcurrency === 'number' && signals.hardwareConcurrency <= 4) return 'lite';
  return 'balanced';
}

export function getPerformanceMode(): PerformanceMode {
  if (typeof navigator === 'undefined') return 'balanced';
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean };
  }).connection;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return classifyPerformance({
    deviceMemory: memory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    saveData: connection?.saveData,
    reducedMotion,
  });
}

export function shouldUseLiteVisuals(): boolean {
  return getPerformanceMode() === 'lite';
}
