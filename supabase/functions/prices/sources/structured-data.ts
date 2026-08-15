// Extract offers from schema.org structured data.
//
// Almost every retail platform publishes Product/Offer JSON-LD for search
// engines, so one spec-shaped parser reads many sites without reverse
// engineering a private API per retailer. A site that publishes nothing usable
// yields an empty list and reports itself as `empty` in the source registry,
// which is the signal that it needs bespoke work.

import {
  type Emirate,
  type RawOffer,
  checkOffer,
  normaliseProductName,
  offerReference,
  parseMoney,
  toIsoDate,
} from './normalize.ts';

type Json = unknown;
type JsonObject = Record<string, Json>;

function isObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: Json): Json[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function text(value: Json): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (isObject(value)) {
    const named = value['name'] ?? value['@value'] ?? value['url'];
    if (typeof named === 'string') return named;
  }
  return '';
}

/** Pull the raw bodies of every ld+json script block out of an HTML document. */
export function extractJsonLdBlocks(html: string): JsonObject[] {
  if (typeof html !== 'string' || !html) return [];
  const blocks: JsonObject[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match !== null) {
    const body = match[1]
      // Strip CDATA wrappers and HTML comments some CMSs emit inside the tag.
      .replace(/^\s*<!\[CDATA\[/, '')
      .replace(/\]\]>\s*$/, '')
      .replace(/^\s*<!--/, '')
      .replace(/-->\s*$/, '')
      .trim();
    if (body) {
      try {
        for (const entry of asArray(JSON.parse(body))) {
          if (isObject(entry)) blocks.push(entry);
        }
      } catch {
        // A single malformed block must not lose the rest of the page.
      }
    }
    match = pattern.exec(html);
  }
  return blocks;
}

/** Walk @graph / ItemList / nested arrays and yield every node of a type. */
function collectNodes(roots: JsonObject[]): JsonObject[] {
  const found: JsonObject[] = [];
  const queue: Json[] = [...roots];
  const seen = new Set<JsonObject>();
  while (queue.length > 0) {
    const node = queue.shift();
    if (!isObject(node) || seen.has(node)) continue;
    seen.add(node);
    found.push(node);
    for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity', 'hasPart', 'offers', 'makesOffer']) {
      for (const child of asArray(node[key])) queue.push(child);
    }
  }
  return found;
}

function hasType(node: JsonObject, ...types: string[]): boolean {
  const declared = asArray(node['@type']).map(value => String(value).toLowerCase());
  return types.some(type => declared.includes(type.toLowerCase()));
}

function offerPrices(offer: JsonObject): { price: number | null; original: number | null } {
  const price = parseMoney(offer['price'])
    ?? parseMoney(offer['lowPrice'])
    ?? parseMoney((isObject(offer['priceSpecification']) ? offer['priceSpecification']['price'] : undefined));

  // schema.org has no single "was" price; these are the fields retailers use.
  const original = parseMoney(offer['listPrice'])
    ?? parseMoney(offer['highPrice'])
    ?? parseMoney(offer['strikethroughPrice'])
    ?? parseMoney((isObject(offer['priceSpecification'])
      ? offer['priceSpecification']['strikethroughPrice'] ?? offer['priceSpecification']['listPrice']
      : undefined));

  return { price, original };
}

function offerCurrency(offer: JsonObject, fallback: string): string {
  const declared = text(offer['priceCurrency'])
    || text(isObject(offer['priceSpecification']) ? offer['priceSpecification']['priceCurrency'] : '');
  return (declared || fallback).toUpperCase();
}

export type StructuredDataContext = {
  sourceSlug: string;
  storeName?: string;
  area?: string;
  emirate?: Emirate | null;
  /** Currency assumed when the markup omits priceCurrency. */
  defaultCurrency?: string;
  pageUrl?: string;
};

/**
 * Read every usable Product/Offer pair out of an HTML page.
 *
 * Only offers that survive `checkOffer` are returned, so callers never have to
 * re-validate. Offers without a discount are still returned; the caller
 * decides whether it wants a price observation, a special, or both.
 */
export function offersFromHtml(html: string, context: StructuredDataContext): RawOffer[] {
  const nodes = collectNodes(extractJsonLdBlocks(html));
  const results: RawOffer[] = [];

  for (const node of nodes) {
    if (!hasType(node, 'Product', 'IndividualProduct', 'ProductModel')) continue;

    const name = normaliseProductName(text(node['name']));
    if (!name) continue;

    const brand = normaliseProductName(text(node['brand']));
    const image = asArray(node['image']).map(text).find(value => value.startsWith('http')) ?? null;
    const barcode = text(node['gtin13']) || text(node['gtin']) || text(node['gtin12']) || text(node['gtin8']) || null;
    const productUrl = text(node['url']) || context.pageUrl || null;

    for (const candidate of asArray(node['offers'])) {
      if (!isObject(candidate)) continue;
      if (!hasType(candidate, 'Offer', 'AggregateOffer') && candidate['price'] === undefined) continue;

      const { price, original } = offerPrices(candidate);
      if (price === null) continue;

      const checked = checkOffer({
        name,
        brand: brand || undefined,
        price,
        originalPrice: original,
        currency: offerCurrency(candidate, context.defaultCurrency ?? 'AED'),
        storeName: text(candidate['seller']) || context.storeName,
        area: context.area,
        emirate: context.emirate ?? null,
        imageUrl: image,
        barcode,
        url: text(candidate['url']) || productUrl,
        expiresAt: toIsoDate(candidate['priceValidUntil']),
        reference: offerReference(
          context.sourceSlug,
          barcode || text(candidate['sku']) || text(node['sku']) || name,
          context.storeName ?? '',
        ),
      });

      if (checked.ok) results.push(checked.offer);
    }
  }

  return results;
}

/**
 * Fallback for pages that expose a price only through OpenGraph/product meta
 * tags. Returns at most one offer, because these tags describe a single page.
 */
export function offerFromMetaTags(html: string, context: StructuredDataContext): RawOffer | null {
  if (typeof html !== 'string' || !html) return null;

  const meta = (...names: string[]): string => {
    for (const name of names) {
      const pattern = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
        'i',
      );
      const tag = html.match(pattern)?.[0];
      const content = tag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
      if (content && content.trim()) return content.trim();
    }
    return '';
  };

  const name = normaliseProductName(meta('og:title', 'twitter:title'));
  const amount = meta('product:price:amount', 'og:price:amount');
  if (!name || !amount) return null;

  const checked = checkOffer({
    name,
    price: parseMoney(amount) ?? 0,
    currency: meta('product:price:currency', 'og:price:currency') || context.defaultCurrency || 'AED',
    storeName: context.storeName,
    area: context.area,
    emirate: context.emirate ?? null,
    imageUrl: meta('og:image') || null,
    url: meta('og:url') || context.pageUrl || null,
    reference: offerReference(context.sourceSlug, name, context.storeName ?? ''),
  });

  return checked.ok ? checked.offer : null;
}
