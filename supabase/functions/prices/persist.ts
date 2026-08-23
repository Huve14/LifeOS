// Write ingested offers into the shared price tables.
//
// Every write is idempotent on (source, source_reference) so the scheduled run
// can re-read the same promotions every few hours without duplicating a single
// special.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { type RawOffer, discountPercent } from './sources/normalize.ts';
import type { SourceResult } from './sources/ingest.ts';

// Used when the branch is genuinely unknown -- an online-only retailer, or a
// promotion page that never names a store. The previous ingest stamped every
// row "Abu Dhabi", which quietly mislabelled every Dubai branch.
export const UNKNOWN_EMIRATE = 'UAE';

// Structured data is published by the retailer, so it is a stronger signal than
// a crowd submission but weaker than a receipt.
const FEED_CONFIDENCE = 0.8;

export type PersistSummary = {
  slug: string;
  status: SourceResult['status'];
  prices: number;
  deals: number;
  error: string | null;
};

async function ensureProduct(client: SupabaseClient, offer: RawOffer): Promise<string | null> {
  if (offer.barcode) {
    const byBarcode = await client
      .from('lifeos_products')
      .select('id')
      .eq('barcode', offer.barcode)
      .maybeSingle();
    if (byBarcode.data?.id) return byBarcode.data.id;
  }

  const byName = await client
    .from('lifeos_products')
    .select('id')
    .ilike('name', offer.name)
    .limit(1)
    .maybeSingle();
  if (byName.data?.id) return byName.data.id;

  const created = await client
    .from('lifeos_products')
    .insert({
      name: offer.name,
      brand: offer.brand ?? '',
      barcode: offer.barcode,
      category: 'Groceries',
      image_url: offer.imageUrl ?? null,
    })
    .select('id')
    .single();
  return created.data?.id ?? null;
}

async function ensureStore(
  client: SupabaseClient,
  name: string,
  area: string,
  emirate: string,
): Promise<string | null> {
  const existing = await client
    .from('lifeos_stores')
    .select('id')
    .ilike('name', name)
    .ilike('area', area)
    .ilike('emirate', emirate)
    .limit(1)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id;

  const created = await client
    .from('lifeos_stores')
    .insert({ name, area, emirate })
    .select('id')
    .single();
  return created.data?.id ?? null;
}

/** References already stored for this source, so re-runs skip cheaply. */
async function knownReferences(
  client: SupabaseClient,
  table: 'lifeos_price_points' | 'lifeos_deals',
  slug: string,
): Promise<Set<string>> {
  const { data } = await client
    .from(table)
    .select('source_reference')
    .eq('source', slug)
    .not('source_reference', 'is', null)
    .limit(5000);
  return new Set((data ?? []).map(row => String((row as { source_reference: string }).source_reference)));
}

/**
 * Store one source's offers. Returns what was actually written rather than
 * what was attempted, so the health row reflects reality.
 */
export async function persistOffers(
  client: SupabaseClient,
  result: SourceResult,
): Promise<PersistSummary> {
  const summary: PersistSummary = {
    slug: result.slug,
    status: result.status,
    prices: 0,
    deals: 0,
    error: result.error,
  };

  if (result.offers.length > 0) {
    const seenPrices = await knownReferences(client, 'lifeos_price_points', result.slug);
    const seenDeals = await knownReferences(client, 'lifeos_deals', result.slug);
    const now = new Date().toISOString();

    for (const offer of result.offers) {
      try {
        const productId = await ensureProduct(client, offer);
        if (!productId) continue;

        const storeId = await ensureStore(
          client,
          offer.storeName ?? result.slug,
          offer.area ?? '',
          offer.emirate ?? UNKNOWN_EMIRATE,
        );
        if (!storeId) continue;

        if (!seenPrices.has(offer.reference)) {
          const insert = await client.from('lifeos_price_points').insert({
            product_id: productId,
            store_id: storeId,
            price: offer.price,
            currency: 'AED',
            source: result.slug,
            seen_at: offer.startsAt ?? now,
            submitted_name: offer.storeName ?? result.slug,
            confidence: FEED_CONFIDENCE,
            source_reference: offer.reference,
          });
          if (!insert.error) {
            summary.prices += 1;
            seenPrices.add(offer.reference);
          }
        }

        // Only a genuine markdown becomes a special; checkOffer has already
        // discarded "original" prices that were not above the current one.
        const discount = discountPercent(offer.price, offer.originalPrice);
        if (discount !== null && !seenDeals.has(offer.reference)) {
          const insert = await client.from('lifeos_deals').insert({
            product_id: productId,
            store_id: storeId,
            title: offer.name,
            current_price: offer.price,
            original_price: offer.originalPrice,
            currency: 'AED',
            source: result.slug,
            starts_at: offer.startsAt ?? now,
            expires_at: offer.expiresAt ?? null,
            source_reference: offer.reference,
          });
          if (!insert.error) {
            summary.deals += 1;
            seenDeals.add(offer.reference);
          }
        }
      } catch (error) {
        // One bad offer must not lose the rest of the source's batch.
        summary.error = summary.error
          ?? (error instanceof Error ? error.message : 'Offer could not be stored');
      }
    }
  }

  await recordHealth(client, summary);
  return summary;
}

/** Write the source's outcome so the app can show which feeds are alive. */
export async function recordHealth(client: SupabaseClient, summary: PersistSummary): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    last_run_at: now,
    last_status: summary.status,
    last_error: summary.error,
    items_last_run: summary.prices + summary.deals,
  };
  if (summary.status === 'ok') patch.last_success_at = now;
  await client.from('lifeos_price_sources').update(patch).eq('slug', summary.slug);
}
