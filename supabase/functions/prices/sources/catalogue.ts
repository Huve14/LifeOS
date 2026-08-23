// Where each Abu Dhabi / Dubai source publishes its specials.
//
// These are configuration, not bespoke scrapers: every entry is read by the
// same schema.org parser. Adding a retailer is a row here plus a row in
// lifeos_price_sources, and a retailer that stops publishing usable structured
// data degrades to `empty` in the registry instead of breaking the run.
//
// The URLs are starting points. Nothing in CI can reach these hosts, so the
// first scheduled run against production is what confirms which ones pay out --
// read lifeos_price_sources.last_status rather than assuming.

import type { Emirate } from './normalize.ts';

export type SourceDefinition = {
  slug: string;
  label: string;
  emirates: Emirate[];
  /** Store name recorded against imported prices. */
  storeName: string;
  /** Pages that list current promotions. */
  offerUrls: string[];
  /** Optional per-source area hint when the pages are branch specific. */
  area?: string;
  /** Some hosts reject the default agent; kept configurable per source. */
  acceptLanguage?: string;
};

const AD_DXB: Emirate[] = ['Abu Dhabi', 'Dubai'];

/**
 * Flyer aggregators first: each one carries many retailers, so they are the
 * widest coverage per unit of maintenance.
 */
const AGGREGATORS: SourceDefinition[] = [
  {
    slug: 'clicflyer',
    label: 'ClicFlyer',
    emirates: AD_DXB,
    storeName: 'ClicFlyer',
    offerUrls: [
      'https://clicflyer.com/shoppers/en/united-arab-emirates/abu-dhabi/home',
      'https://clicflyer.com/shoppers/en/united-arab-emirates/dubai/home',
    ],
  },
  {
    slug: 'tiendeo',
    label: 'Tiendeo UAE',
    emirates: AD_DXB,
    storeName: 'Tiendeo',
    offerUrls: [
      'https://www.tiendeo.ae/abu-dhabi/hypermarkets-supermarkets',
      'https://www.tiendeo.ae/dubai/hypermarkets-supermarkets',
    ],
  },
  {
    slug: 'clicoffer',
    label: 'ClicOffer',
    emirates: AD_DXB,
    storeName: 'ClicOffer',
    offerUrls: [
      'https://www.clicoffer.com/en/uae/abu-dhabi/offers/',
      'https://www.clicoffer.com/en/uae/dubai/offers/',
    ],
  },
  {
    slug: 'leafletstore',
    label: 'Leaflet Store',
    emirates: AD_DXB,
    storeName: 'Leaflet Store',
    offerUrls: [
      'https://leafletstore.com/location/uae/abu-dhabi/',
      'https://leafletstore.com/location/uae/dubai/',
    ],
  },
];

/** Direct retailers, both emirates unless the chain is Dubai-only. */
const RETAILERS: SourceDefinition[] = [
  {
    slug: 'carrefour',
    label: 'Carrefour UAE',
    emirates: AD_DXB,
    storeName: 'Carrefour',
    offerUrls: [
      'https://www.carrefouruae.com/mafuae/en/n/c/clp_online-deals-promotion',
      'https://www.carrefouruae.com/mafuae/en/n/c/clp_coupons',
    ],
  },
  {
    slug: 'lulu',
    label: 'Lulu Hypermarket',
    emirates: AD_DXB,
    storeName: 'Lulu Hypermarket',
    offerUrls: [
      'https://www.luluhypermarket.com/en-ae/offers',
      'https://www.luluhypermarket.com/en-ae/promotions',
    ],
  },
  {
    slug: 'spinneys',
    label: 'Spinneys',
    emirates: AD_DXB,
    storeName: 'Spinneys',
    offerUrls: [
      'https://www.spinneys.com/en-ae/offers/',
      'https://www.spinneys.com/en-ae/promotions/',
    ],
  },
  {
    slug: 'choithrams',
    label: 'Choithrams',
    emirates: AD_DXB,
    storeName: 'Choithrams',
    offerUrls: ['https://www.choithrams.com/en/offers', 'https://www.choithrams.com/en/promotions'],
  },
  {
    slug: 'nesto',
    label: 'Nesto Hypermarket',
    emirates: AD_DXB,
    storeName: 'Nesto Hypermarket',
    offerUrls: ['https://nestogroup.com/offers', 'https://nesto.ae/offers'],
  },
  {
    slug: 'viva',
    label: 'Viva Supermarket',
    emirates: AD_DXB,
    storeName: 'Viva Supermarket',
    offerUrls: ['https://www.viva.luluhypermarket.com/en-ae/offers'],
  },
  {
    slug: 'almaya',
    label: 'Al Maya Supermarket',
    emirates: AD_DXB,
    storeName: 'Al Maya',
    offerUrls: ['https://www.almaya.ae/offers', 'https://shop.almaya.ae/offers'],
  },
  {
    slug: 'westzone',
    label: 'West Zone Fresh',
    emirates: AD_DXB,
    storeName: 'West Zone Fresh',
    offerUrls: ['https://westzonefresh.com/offers', 'https://westzonesupermarket.com/offers'],
  },
  {
    slug: 'earth',
    label: 'Earth Supermarket',
    emirates: AD_DXB,
    storeName: 'Earth Supermarket',
    offerUrls: ['https://earthsupermarket.com/offers'],
  },
  {
    slug: 'grandiose',
    label: 'Grandiose Supermarket',
    emirates: AD_DXB,
    storeName: 'Grandiose',
    offerUrls: ['https://www.grandiose.ae/offers', 'https://www.grandiose.ae/promotions'],
  },
  {
    slug: 'unioncoop',
    label: 'Union Coop',
    emirates: ['Dubai'],
    storeName: 'Union Coop',
    area: 'Dubai',
    offerUrls: ['https://www.unioncoop.ae/en/offers/', 'https://www.unioncoop.ae/en/promotions/'],
  },
  {
    slug: 'aswaaq',
    label: 'Aswaaq',
    emirates: ['Dubai'],
    storeName: 'Aswaaq',
    area: 'Dubai',
    offerUrls: ['https://www.aswaaq.ae/en/offers'],
  },
  {
    slug: 'kibsons',
    label: 'Kibsons',
    emirates: ['Dubai'],
    storeName: 'Kibsons',
    area: 'Dubai',
    offerUrls: ['https://www.kibsons.com/deals', 'https://www.kibsons.com/offers'],
  },
  {
    slug: 'noon',
    label: 'noon',
    emirates: AD_DXB,
    storeName: 'noon',
    area: 'Online',
    offerUrls: ['https://www.noon.com/uae-en/deals/', 'https://www.noon.com/uae-en/grocery/'],
  },
  {
    slug: 'talabat',
    label: 'talabat mart',
    emirates: AD_DXB,
    storeName: 'talabat mart',
    area: 'Online',
    offerUrls: ['https://www.talabat.com/uae/grocery-deals'],
  },
  {
    slug: 'instashop',
    label: 'InstaShop',
    emirates: AD_DXB,
    storeName: 'InstaShop',
    area: 'Online',
    offerUrls: ['https://instashop.com/en-ae/offers'],
  },
];

export const SOURCE_CATALOGUE: SourceDefinition[] = [...AGGREGATORS, ...RETAILERS];

export function findSource(slug: string): SourceDefinition | null {
  return SOURCE_CATALOGUE.find(source => source.slug === slug) ?? null;
}
