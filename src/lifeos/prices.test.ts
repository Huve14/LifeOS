import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  emirateForArea,
  formatAED,
  isFeedSource,
  parseMoneyInput,
  savingsAgainstHighest,
  sourceLabel,
  sourceLabelMap,
} from './prices';

describe('Shop & Save price helpers', () => {
  it('keeps decimal AED prices instead of truncating them', () => {
    expect(parseMoneyInput('12.99')).toBe(12.99);
    expect(parseMoneyInput('1,204.50')).toBe(1204.5);
    expect(parseMoneyInput('-1')).toBeNull();
    expect(parseMoneyInput(undefined)).toBeNull();
    expect(parseMoneyInput(null)).toBeNull();
    expect(parseMoneyInput({ amount: 12.99 })).toBeNull();
    expect(formatAED(12.99)).toBe('AED 12.99');
  });

  it('labels every source honestly', () => {
    expect(sourceLabel('amazon')).toBe('Amazon.ae');
    expect(sourceLabel('openprices')).toBe('Open Prices');
    expect(sourceLabel('community', 'Thabo')).toBe('Thabo');
    expect(sourceLabel('estimate')).toBe('AI estimate');
  });

  it('renders human-readable price age', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    expect(ageLabel('2026-08-15T10:00:00.000Z', now)).toBe('2 h ago');
    expect(ageLabel('2026-08-12T12:00:00.000Z', now)).toBe('3 days ago');
  });

  it('calculates the saving against the priciest observation', () => {
    expect(savingsAgainstHighest([{ price: 34 }, { price: 28.5 }, { price: 31 }])).toBe(5.5);
    expect(savingsAgainstHighest([{ price: 34 }])).toBe(0);
  });

  it('names retailer sources from the registry, never a raw slug', () => {
    const registry = [
      { slug: 'carrefour', label: 'Carrefour UAE' },
      { slug: 'clicflyer', label: 'ClicFlyer' },
    ] as Parameters<typeof sourceLabelMap>[0];
    const labels = sourceLabelMap(registry);

    expect(sourceLabel('carrefour', '', labels)).toBe('Carrefour UAE');
    // A source added to the registry after this release still reads sensibly.
    expect(sourceLabel('union-coop', '', labels)).toBe('Union Coop');
    expect(sourceLabel('community', 'Thabo', labels)).toBe('Thabo');
  });

  it('separates retailer feeds from people and guesses', () => {
    expect(isFeedSource('carrefour')).toBe(true);
    expect(isFeedSource('openprices')).toBe(true);
    expect(isFeedSource('community')).toBe(false);
    expect(isFeedSource('estimate')).toBe(false);
  });

  it('files a Dubai store under Dubai instead of defaulting to Abu Dhabi', () => {
    expect(emirateForArea('Mirdif')).toBe('Dubai');
    expect(emirateForArea('', 'Carrefour Mall of the Emirates')).toBe('Dubai');
    expect(emirateForArea('Khalifa City')).toBe('Abu Dhabi');
    expect(emirateForArea('')).toBe('Abu Dhabi');
  });
});
