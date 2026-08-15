// Pure normalisation helpers shared by every price source.
//
// Nothing in this file touches the network, Deno or Supabase, so the parsing
// rules that decide what reaches the Deals tab are unit-testable from the
// normal vitest suite. That matters more than usual here: retailer responses
// cannot be reached from CI, so the parsers are the only part that can be
// verified before deploy.

export type Emirate = 'Abu Dhabi' | 'Dubai' | 'Sharjah' | 'Ajman'
  | 'Ras Al Khaimah' | 'Fujairah' | 'Umm Al Quwain';

export const EMIRATES: readonly Emirate[] = [
  'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain',
];

/** An offer as scraped, before it is matched to a product and store. */
export type RawOffer = {
  name: string;
  brand?: string;
  price: number;
  originalPrice?: number | null;
  currency: string;
  storeName?: string;
  area?: string;
  emirate?: Emirate | null;
  imageUrl?: string | null;
  barcode?: string | null;
  url?: string | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  reference: string;
};

const AREA_TO_EMIRATE: ReadonlyArray<readonly [RegExp, Emirate]> = [
  [/\b(abu\s*dhabi|abudhabi|khalifa\s*city|al\s*reem|yas\s*island|saadiyat|mussafah|al\s*ain|shakhbout|khalidiya|corniche|reem\s*island|mbz|mohammed\s*bin\s*zayed)\b/i, 'Abu Dhabi'],
  [/\b(dubai|deira|bur\s*dubai|jumeirah|marina|jlt|jbr|business\s*bay|silicon\s*oasis|mirdif|karama|barsha|tecom|downtown|discovery\s*gardens|international\s*city|motor\s*city|damac|arabian\s*ranches|sports\s*city|festival\s*city|academic\s*city|nad\s*al\s*sheba|al\s*quoz|satwa|jebel\s*ali)\b/i, 'Dubai'],
  [/\b(sharjah|al\s*nahda|muweilah|al\s*majaz|al\s*qasimia)\b/i, 'Sharjah'],
  [/\bajman\b/i, 'Ajman'],
  [/\b(ras\s*al\s*khaimah|rak)\b/i, 'Ras Al Khaimah'],
  [/\bfujairah\b/i, 'Fujairah'],
  [/\b(umm\s*al\s*quwain|uaq)\b/i, 'Umm Al Quwain'],
];

/**
 * Work out which emirate a free-text location belongs to.
 *
 * The shipped ingest hardcoded every store to Abu Dhabi, which silently
 * mislabelled every Dubai branch, so this never guesses: an unrecognised area
 * returns null and the caller decides.
 */
export function detectEmirate(...parts: Array<string | null | undefined>): Emirate | null {
  const haystack = parts.filter(Boolean).join(' ');
  if (!haystack.trim()) return null;
  for (const [pattern, emirate] of AREA_TO_EMIRATE) {
    if (pattern.test(haystack)) return emirate;
  }
  return null;
}

const CURRENCY_WORDS = /(?:aed|d\.?h(?:s|ms)?\.?|dirhams?|د\.إ|درهم)/i;

/**
 * Parse a UAE price out of free text.
 *
 * Handles "AED 12.50", "Dhs. 12,50", "12.50 AED", "د.إ 1,234.50" and bare
 * numbers. Returns null rather than guessing when the text carries no usable
 * number, or names a currency that is not the dirham.
 */
export function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? round2(value) : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  // Reject explicitly foreign currencies rather than importing a wrong number.
  if (/(?:usd|eur|gbp|sar|inr|zar|\$|€|£|₹)/i.test(text) && !CURRENCY_WORDS.test(text)) return null;

  const cleaned = text.replace(CURRENCY_WORDS, ' ');
  const match = cleaned.match(/-?\d[\d\s,.']*/);
  if (!match) return null;

  let digits = match[0].replace(/[\s']/g, '');
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal point.
    digits = lastComma > lastDot
      ? digits.replace(/\./g, '').replace(',', '.')
      : digits.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "12,50" is decimal; "1,234" is a thousands group.
    digits = /,\d{1,2}$/.test(digits) ? digits.replace(',', '.') : digits.replace(/,/g, '');
  }

  const amount = Number.parseFloat(digits);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return round2(amount);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Collapse retailer title noise into something that groups across stores. */
export function normaliseProductName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|nbsp|quot|#39|apos);/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•*]+|[\s\-–—•*]+$/g, '')
    .slice(0, 180)
    .trim();
}

/** A barcode is only useful if it is a plausible EAN/UPC. */
export function normaliseBarcode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return /^\d{8}$|^\d{12,14}$/.test(digits) ? digits : null;
}

export function discountPercent(current: number, original: number | null | undefined): number | null {
  if (!Number.isFinite(current) || original == null || !Number.isFinite(original)) return null;
  if (original <= 0 || original <= current) return null;
  return Math.round((1 - current / original) * 100);
}

/**
 * Build the idempotency key for a deal. Scheduled ingestion re-reads the same
 * promotions every run, so this has to be stable across runs for the same
 * offer and different for a genuinely different one.
 */
export function offerReference(sourceSlug: string, ...parts: Array<string | number | null | undefined>): string {
  const tail = parts
    .filter(part => part !== null && part !== undefined && String(part).trim() !== '')
    .map(part => String(part).trim().toLowerCase().replace(/\s+/g, '-'))
    .join(':');
  return `${sourceSlug}:${tail}`.slice(0, 300);
}

export type OfferRejection =
  | 'missing-name' | 'missing-price' | 'not-aed' | 'not-a-discount' | 'implausible';

export type OfferCheck =
  | { ok: true; offer: RawOffer }
  | { ok: false; reason: OfferRejection };

// A grocery special above this is almost certainly a parsing error (a phone
// number, a weight in grams, a loyalty point balance) rather than a price.
const MAX_PLAUSIBLE_AED = 100_000;

/**
 * Validate a scraped offer before it is allowed near the Deals tab.
 *
 * Deliberately strict: a wrong price shown as a live special is worse than no
 * special at all, and the previous pipeline already had a habit of presenting
 * guessed numbers as real ones.
 */
export function checkOffer(input: Partial<RawOffer> & { reference: string }): OfferCheck {
  const name = normaliseProductName(input.name);
  if (!name) return { ok: false, reason: 'missing-name' };

  const price = typeof input.price === 'number' ? input.price : parseMoney(input.price);
  if (price === null || price <= 0) return { ok: false, reason: 'missing-price' };

  const currency = (input.currency ?? 'AED').toUpperCase();
  if (currency !== 'AED') return { ok: false, reason: 'not-aed' };

  if (price > MAX_PLAUSIBLE_AED) return { ok: false, reason: 'implausible' };

  const original = input.originalPrice == null ? null : parseMoney(input.originalPrice);
  // An "original" at or below the current price is not a saving. Drop the
  // claim rather than rendering a −0% badge.
  const usableOriginal = original !== null && original > price && original <= MAX_PLAUSIBLE_AED
    ? original
    : null;

  return {
    ok: true,
    offer: {
      ...input,
      name,
      price,
      originalPrice: usableOriginal,
      currency: 'AED',
      barcode: normaliseBarcode(input.barcode),
      emirate: input.emirate ?? detectEmirate(input.area, input.storeName),
      reference: input.reference,
    },
  };
}

/** Last-write-wins dedupe on the offer reference, keeping the cheapest. */
export function dedupeOffers(offers: RawOffer[]): RawOffer[] {
  const byReference = new Map<string, RawOffer>();
  for (const offer of offers) {
    const existing = byReference.get(offer.reference);
    if (!existing || offer.price < existing.price) byReference.set(offer.reference, offer);
  }
  return [...byReference.values()];
}

/** Coerce a scraped date into an ISO timestamp, or null if unusable. */
export function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value.trim());
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return null;
  // Guard against obviously wrong years from malformed markup.
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return parsed.toISOString();
}
