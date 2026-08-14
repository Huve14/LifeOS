import { describe, expect, it } from 'vitest';
import { classifyPerformance } from './performance';

describe('performance profile', () => {
  it('uses lite visuals when the user enables data saver', () => {
    expect(classifyPerformance({ saveData: true, hardwareConcurrency: 12 })).toBe('lite');
  });

  it('uses lite visuals on lower-memory or lower-core phones', () => {
    expect(classifyPerformance({ deviceMemory: 4, hardwareConcurrency: 8 })).toBe('lite');
    expect(classifyPerformance({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe('lite');
  });

  it('keeps rich visuals for capable devices', () => {
    expect(classifyPerformance({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe('balanced');
  });
});
