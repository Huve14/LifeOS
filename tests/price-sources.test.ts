import { describe, expect, it } from 'vitest';

import {
  checkOffer,
  dedupeOffers,
  detectEmirate,
  discountPercent,
  normaliseBarcode,
  normaliseProductName,
  offerReference,
  parseMoney,
  toIsoDate,
} from '../supabase/functions/prices/sources/normalize.ts';
import {
  extractJsonLdBlocks,
  offerFromMetaTags,
  offersFromHtml,
} from '../supabase/functions/prices/sources/structured-data.ts';
import { isPathAllowed, parseRobots, pathOf } from '../supabase/functions/prices/sources/robots.ts';
import {
  type FetchPage,
  collectFromSource,
  collectFromSources,
} from '../supabase/functions/prices/sources/ingest.ts';
import { SOURCE_CATALOGUE, findSource } from '../supabase/functions/prices/sources/catalogue.ts';

describe('parseMoney', () => {
  it('reads the dirham formats UAE retailers actually print', () => {
    expect(parseMoney('AED 12.50')).toBe(12.5);
    expect(parseMoney('12.50 AED')).toBe(12.5);
    expect(parseMoney('Dhs. 9.95')).toBe(9.95);
    expect(parseMoney('Dh 7')).toBe(7);
    expect(parseMoney('د.إ 24.00')).toBe(24);
    expect(parseMoney(19.99)).toBe(19.99);
  });

  it('handles both decimal conventions and thousands groups', () => {
    expect(parseMoney('12,50')).toBe(12.5);
    expect(parseMoney('1,234')).toBe(1234);
    expect(parseMoney('1,234.56')).toBe(1234.56);
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney("1'234.50")).toBe(1234.5);
  });

  it('refuses anything that is not a usable dirham amount', () => {
    expect(parseMoney('USD 12.50')).toBeNull();
    expect(parseMoney('€ 9,99')).toBeNull();
    expect(parseMoney('call for price')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(-5)).toBeNull();
    expect(parseMoney(Number.NaN)).toBeNull();
  });
});

describe('detectEmirate', () => {
  it('recognises Abu Dhabi and Dubai areas', () => {
    expect(detectEmirate('Khalifa City')).toBe('Abu Dhabi');
    expect(detectEmirate('Yas Island')).toBe('Abu Dhabi');
    expect(detectEmirate('Mall of the Emirates')).toBe('Dubai');
    expect(detectEmirate('Deira')).toBe('Dubai');
    expect(detectEmirate('JLT')).toBe('Dubai');
    expect(detectEmirate('Ibn Battuta')).toBe('Dubai');
  });

  it('returns null rather than guessing, which is what mislabelled Dubai stores', () => {
    expect(detectEmirate('Somewhere else')).toBeNull();
    expect(detectEmirate('')).toBeNull();
    expect(detectEmirate(null, undefined)).toBeNull();
  });
});

describe('checkOffer', () => {
  const base = { name: 'Rooibos tea', price: 18.5, currency: 'AED', reference: 'x:1' };

  it('accepts a well formed dirham offer', () => {
    const result = checkOffer(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.offer.price).toBe(18.5);
  });

  it('drops an "original" price that is not actually a saving', () => {
    const equal = checkOffer({ ...base, originalPrice: 18.5 });
    const lower = checkOffer({ ...base, originalPrice: 12 });
    expect(equal.ok && equal.offer.originalPrice).toBeNull();
    expect(lower.ok && lower.offer.originalPrice).toBeNull();

    const real = checkOffer({ ...base, originalPrice: 25 });
    expect(real.ok && real.offer.originalPrice).toBe(25);
  });

  it('rejects unusable offers instead of showing a wrong special', () => {
    expect(checkOffer({ ...base, name: '   ' }).ok).toBe(false);
    expect(checkOffer({ ...base, price: 0 }).ok).toBe(false);
    expect(checkOffer({ ...base, currency: 'USD' }).ok).toBe(false);
    expect(checkOffer({ ...base, price: 999_999 }).ok).toBe(false);
  });

  it('reports why it rejected, so a source can be diagnosed', () => {
    const result = checkOffer({ ...base, currency: 'EUR' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-aed');
  });

  it('infers the emirate from the store area', () => {
    const result = checkOffer({ ...base, storeName: 'Carrefour', area: 'Mirdif' });
    expect(result.ok && result.offer.emirate).toBe('Dubai');
  });
});

describe('offer helpers', () => {
  it('computes a discount only when there is one', () => {
    expect(discountPercent(75, 100)).toBe(25);
    expect(discountPercent(100, 100)).toBeNull();
    expect(discountPercent(100, 75)).toBeNull();
    expect(discountPercent(10, null)).toBeNull();
  });

  it('builds a stable reference so a re-run cannot duplicate a deal', () => {
    const first = offerReference('carrefour', '6001234567890', 'Carrefour Marina');
    const second = offerReference('carrefour', '6001234567890', 'Carrefour Marina');
    expect(first).toBe(second);
    expect(first).not.toBe(offerReference('lulu', '6001234567890', 'Carrefour Marina'));
    expect(offerReference('x', null, undefined, '')).toBe('x:');
  });

  it('keeps the cheapest row when a reference repeats', () => {
    const make = (price: number) => ({ name: 'Biltong', price, currency: 'AED', reference: 'a:1' });
    expect(dedupeOffers([make(30), make(19), make(25)])).toHaveLength(1);
    expect(dedupeOffers([make(30), make(19), make(25)])[0].price).toBe(19);
  });

  it('cleans markup out of retailer titles', () => {
    expect(normaliseProductName('<b>Biltong</b>&nbsp;250g')).toBe('Biltong 250g');
    expect(normaliseProductName('  - Rooibos -  ')).toBe('Rooibos');
    expect(normaliseProductName(null)).toBe('');
  });

  it('only accepts plausible barcodes', () => {
    expect(normaliseBarcode('6001234567890')).toBe('6001234567890');
    expect(normaliseBarcode('12345678')).toBe('12345678');
    expect(normaliseBarcode('123')).toBeNull();
    expect(normaliseBarcode('not a barcode')).toBeNull();
  });

  it('rejects unusable dates', () => {
    expect(toIsoDate('2026-09-01')).toBe('2026-09-01T00:00:00.000Z');
    expect(toIsoDate('not a date')).toBeNull();
    expect(toIsoDate('1400-01-01')).toBeNull();
    expect(toIsoDate('')).toBeNull();
  });
});

describe('structured data extraction', () => {
  it('reads a Product/Offer pair', () => {
    const html = `
      <html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Rooibos Tea 80 bags",
       "brand":{"@type":"Brand","name":"Freshpak"},"gtin13":"6001234567890",
       "image":["https://cdn.example.com/rooibos.jpg"],
       "offers":{"@type":"Offer","price":"18.50","priceCurrency":"AED",
                 "listPrice":"24.00","priceValidUntil":"2026-09-30","url":"https://example.com/p/1"}}
      </script></head><body></body></html>`;

    const offers = offersFromHtml(html, { sourceSlug: 'carrefour', storeName: 'Carrefour', area: 'Marina' });
    expect(offers).toHaveLength(1);
    expect(offers[0].name).toBe('Rooibos Tea 80 bags');
    expect(offers[0].price).toBe(18.5);
    expect(offers[0].originalPrice).toBe(24);
    expect(offers[0].barcode).toBe('6001234567890');
    expect(offers[0].emirate).toBe('Dubai');
    expect(offers[0].expiresAt).toBe('2026-09-30T00:00:00.000Z');
  });

  it('walks @graph and ItemList wrappers', () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"ItemList","itemListElement":[
          {"@type":"Product","name":"Biltong 100g","offers":{"@type":"Offer","price":"32.00","priceCurrency":"AED"}},
          {"@type":"Product","name":"Boerewors 500g","offers":{"@type":"Offer","price":"28.50","priceCurrency":"AED"}}
        ]}]}
      </script>`;
    const offers = offersFromHtml(html, { sourceSlug: 'spinneys', storeName: 'Spinneys' });
    expect(offers.map(offer => offer.name).sort()).toEqual(['Biltong 100g', 'Boerewors 500g']);
  });

  it('survives a malformed block without losing the good ones', () => {
    const html = `
      <script type="application/ld+json">{ this is not json }</script>
      <script type="application/ld+json">
        {"@type":"Product","name":"Mrs Balls Chutney","offers":{"@type":"Offer","price":"21.00","priceCurrency":"AED"}}
      </script>`;
    expect(extractJsonLdBlocks(html)).toHaveLength(1);
    expect(offersFromHtml(html, { sourceSlug: 'lulu' })).toHaveLength(1);
  });

  it('ignores offers priced in another currency', () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Imported cheese","offers":{"@type":"Offer","price":"9.99","priceCurrency":"USD"}}
      </script>`;
    expect(offersFromHtml(html, { sourceSlug: 'noon' })).toHaveLength(0);
  });

  it('returns nothing for a page with no structured data', () => {
    expect(offersFromHtml('<html><body><p>Weekly offers</p></body></html>', { sourceSlug: 'nesto' })).toEqual([]);
    expect(offersFromHtml('', { sourceSlug: 'nesto' })).toEqual([]);
  });

  it('falls back to product meta tags', () => {
    const html = `<head>
      <meta property="og:title" content="Rooibos Tea"/>
      <meta property="product:price:amount" content="18.50"/>
      <meta property="product:price:currency" content="AED"/>
      <meta property="og:image" content="https://cdn.example.com/x.jpg"/>
    </head>`;
    const offer = offerFromMetaTags(html, { sourceSlug: 'choithrams', storeName: 'Choithrams' });
    expect(offer?.price).toBe(18.5);
    expect(offer?.name).toBe('Rooibos Tea');
  });

  it('returns null from meta tags when there is no price', () => {
    expect(offerFromMetaTags('<meta property="og:title" content="Just a page"/>', { sourceSlug: 'x' })).toBeNull();
  });
});

describe('robots.txt', () => {
  it('applies the wildcard group', () => {
    const policy = parseRobots('User-agent: *\nDisallow: /checkout\nAllow: /offers\n');
    expect(isPathAllowed(policy, '/offers')).toBe(true);
    expect(isPathAllowed(policy, '/checkout')).toBe(false);
    expect(isPathAllowed(policy, '/anything-else')).toBe(true);
  });

  it('prefers a group naming our agent', () => {
    const body = 'User-agent: *\nDisallow: /\n\nUser-agent: LifeOS\nDisallow: /admin\n';
    const policy = parseRobots(body, 'LifeOS/1.0');
    expect(isPathAllowed(policy, '/offers')).toBe(true);
    expect(isPathAllowed(policy, '/admin')).toBe(false);
  });

  it('lets the longest pattern win', () => {
    const policy = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/b\n');
    expect(isPathAllowed(policy, '/a/c')).toBe(false);
    expect(isPathAllowed(policy, '/a/b')).toBe(true);
  });

  it('understands wildcards, end anchors and an empty Disallow', () => {
    const wild = parseRobots('User-agent: *\nDisallow: /*.pdf$\n');
    expect(isPathAllowed(wild, '/flyers/week.pdf')).toBe(false);
    expect(isPathAllowed(wild, '/flyers/week.html')).toBe(true);

    const open = parseRobots('User-agent: *\nDisallow:\n');
    expect(isPathAllowed(open, '/anything')).toBe(true);
  });

  it('reads crawl-delay and ignores comments', () => {
    const policy = parseRobots('# hello\nUser-agent: *\nCrawl-delay: 2\nDisallow: /x # trailing\n');
    expect(policy.crawlDelaySeconds).toBe(2);
    expect(isPathAllowed(policy, '/x')).toBe(false);
  });

  it('extracts the path to test', () => {
    expect(pathOf('https://example.com/offers?page=2')).toBe('/offers?page=2');
    expect(pathOf('nonsense')).toBe('/');
  });
});

const PRODUCT_PAGE = `<script type="application/ld+json">
  {"@type":"Product","name":"Biltong 100g","offers":{"@type":"Offer","price":"32.00","priceCurrency":"AED","listPrice":"40.00"}}
  </script>`;

function stubFetch(routes: Record<string, { ok?: boolean; status?: number; body?: string }>): FetchPage {
  return (url: string) => {
    const route = routes[url];
    if (!route) return Promise.resolve({ ok: false, status: 404, body: '' });
    return Promise.resolve({ ok: route.ok ?? true, status: route.status ?? 200, body: route.body ?? '' });
  };
}

const testSource = {
  slug: 'test',
  label: 'Test Mart',
  emirates: ['Dubai' as const],
  storeName: 'Test Mart',
  offerUrls: ['https://shop.example.com/offers'],
};

describe('collectFromSource', () => {
  const noWait = { politenessMs: 0, sleep: () => Promise.resolve() };

  it('reports ok and returns offers on a good page', async () => {
    const result = await collectFromSource(testSource, {
      ...noWait,
      fetchPage: stubFetch({
        'https://shop.example.com/robots.txt': { body: 'User-agent: *\nAllow: /\n' },
        'https://shop.example.com/offers': { body: PRODUCT_PAGE },
      }),
    });
    expect(result.status).toBe('ok');
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].originalPrice).toBe(40);
    expect(result.offers[0].emirate).toBe('Dubai');
  });

  it('reports empty when the page is reachable but publishes nothing usable', async () => {
    const result = await collectFromSource(testSource, {
      ...noWait,
      fetchPage: stubFetch({
        'https://shop.example.com/robots.txt': { body: '' },
        'https://shop.example.com/offers': { body: '<html><body>Offers coming soon</body></html>' },
      }),
    });
    expect(result.status).toBe('empty');
    expect(result.error).toBeNull();
  });

  it('reports error with the status code when the page fails', async () => {
    const result = await collectFromSource(testSource, {
      ...noWait,
      fetchPage: stubFetch({
        'https://shop.example.com/robots.txt': { body: '' },
        'https://shop.example.com/offers': { ok: false, status: 503 },
      }),
    });
    expect(result.status).toBe('error');
    expect(result.error).toContain('503');
  });

  it('skips rather than fetches when robots.txt disallows the path', async () => {
    const result = await collectFromSource(testSource, {
      ...noWait,
      fetchPage: stubFetch({
        'https://shop.example.com/robots.txt': { body: 'User-agent: *\nDisallow: /offers\n' },
        'https://shop.example.com/offers': { body: PRODUCT_PAGE },
      }),
    });
    expect(result.status).toBe('skipped');
    expect(result.pagesBlocked).toBe(1);
    expect(result.pagesFetched).toBe(0);
  });

  it('turns a thrown fetch into a result instead of propagating', async () => {
    const result = await collectFromSource(testSource, {
      ...noWait,
      fetchPage: () => Promise.reject(new Error('connection reset')),
    });
    expect(result.status).toBe('error');
    expect(result.error).toContain('connection reset');
  });
});

describe('collectFromSources', () => {
  it('isolates a failing source so the batch still returns the rest', async () => {
    const good = { ...testSource, slug: 'good', offerUrls: ['https://good.example.com/offers'] };
    const bad = { ...testSource, slug: 'bad', offerUrls: ['https://bad.example.com/offers'] };

    const results = await collectFromSources([good, bad], {
      politenessMs: 0,
      sleep: () => Promise.resolve(),
      fetchPage: (url: string) => {
        if (url.startsWith('https://bad.')) throw new Error('host unreachable');
        if (url.endsWith('robots.txt')) return Promise.resolve({ ok: true, status: 200, body: '' });
        return Promise.resolve({ ok: true, status: 200, body: PRODUCT_PAGE });
      },
    });

    expect(results).toHaveLength(2);
    expect(results.find(result => result.slug === 'good')?.status).toBe('ok');
    expect(results.find(result => result.slug === 'bad')?.status).toBe('error');
  });
});

describe('source catalogue', () => {
  it('covers both emirates the app serves', () => {
    const abuDhabi = SOURCE_CATALOGUE.filter(source => source.emirates.includes('Abu Dhabi'));
    const dubai = SOURCE_CATALOGUE.filter(source => source.emirates.includes('Dubai'));
    expect(abuDhabi.length).toBeGreaterThan(5);
    expect(dubai.length).toBeGreaterThan(5);
  });

  it('has unique slugs and at least one offer URL each', () => {
    const slugs = SOURCE_CATALOGUE.map(source => source.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const source of SOURCE_CATALOGUE) {
      expect(source.offerUrls.length).toBeGreaterThan(0);
      for (const url of source.offerUrls) expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('looks a source up by slug', () => {
    expect(findSource('carrefour')?.label).toBe('Carrefour UAE');
    expect(findSource('nope')).toBeNull();
  });
});
