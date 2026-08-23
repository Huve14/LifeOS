// Server-side price ingestion for Shop & Save.
//
// The browser invokes this authenticated function on the Supabase domain. It
// never receives external API credentials. Open Food Facts identifies barcodes,
// Open Prices supplies attributed price observations, Frankfurter supplies
// AED/ZAR, and NVIDIA is the explicitly labelled last-resort estimate tier.
//
// `refresh-deals` additionally reads the Abu Dhabi and Dubai retailers and
// flyer aggregators listed in sources/catalogue.ts. Those are read through the
// shared schema.org parser, honour robots.txt, and report per-source health
// into lifeos_price_sources so a dead feed is visible rather than silent.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { SOURCE_CATALOGUE, findSource } from './sources/catalogue.ts';
import { collectFromSources } from './sources/ingest.ts';
import { detectEmirate } from './sources/normalize.ts';
import { UNKNOWN_EMIRATE, persistOffers, recordHealth } from './persist.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPEN_PRICES_URL = 'https://prices.openfoodfacts.org/api/v1/prices';
const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/api/v3/product';
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/rate/AED/ZAR';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const USER_AGENT = 'LifeOS/1.0 (https://life-os-hs.vercel.app)';

type LookupBody = { action?: string; query?: string; barcode?: string; slugs?: string[] };
type ProductIdentity = {
  name: string;
  brand: string;
  barcode: string | null;
  category: string;
  imageUrl: string | null;
};

type OpenPrice = {
  id?: number | string;
  product_code?: string;
  product_name?: string;
  price?: number | string;
  price_is_discounted?: boolean;
  price_without_discount?: number | string | null;
  currency?: string;
  date?: string;
  owner?: string;
  location_id?: number | string;
  location?: Record<string, unknown> | null;
};

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function cleanText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function firstText(value: unknown): string {
  if (Array.isArray(value)) return cleanText(value[0]);
  return cleanText(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function authenticate(request: Request): Promise<{ client: SupabaseClient; userId: string } | null> {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

async function loadProductIdentity(barcode: string, query: string): Promise<ProductIdentity> {
  const fallback: ProductIdentity = {
    name: query || `Product ${barcode}`,
    brand: '',
    barcode: barcode || null,
    category: 'Groceries',
    imageUrl: null,
  };
  if (!barcode) return fallback;
  try {
    const url = `${OPEN_FOOD_FACTS_URL}/${encodeURIComponent(barcode)}?fields=code,product_name,brands,categories,image_front_small_url`;
    const apiResponse = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!apiResponse.ok) return fallback;
    const payload = asObject(await apiResponse.json());
    const product = asObject(payload.product);
    return {
      name: cleanText(product.product_name, fallback.name),
      brand: firstText(product.brands),
      barcode: cleanText(product.code, barcode),
      category: firstText(product.categories) || 'Groceries',
      imageUrl: cleanText(product.image_front_small_url) || null,
    };
  } catch {
    return fallback;
  }
}

async function ensureProduct(client: SupabaseClient, identity: ProductIdentity): Promise<string> {
  if (identity.barcode) {
    const byBarcode = await client.from('lifeos_products').select('id').eq('barcode', identity.barcode).maybeSingle();
    if (byBarcode.data?.id) {
      await client.from('lifeos_products').update({
        name: identity.name,
        brand: identity.brand,
        category: identity.category,
        image_url: identity.imageUrl,
      }).eq('id', byBarcode.data.id);
      return byBarcode.data.id;
    }
  }
  const existing = await client.from('lifeos_products').select('id').ilike('name', identity.name).limit(1).maybeSingle();
  if (existing.data?.id) return existing.data.id;
  const created = await client.from('lifeos_products').insert({
    name: identity.name,
    brand: identity.brand,
    barcode: identity.barcode,
    category: identity.category,
    image_url: identity.imageUrl,
  }).select('id').single();
  if (created.error || !created.data) throw created.error ?? new Error('Could not store product identity');
  return created.data.id;
}

function storeIdentity(row: OpenPrice): { name: string; area: string; emirate: string } {
  const location = asObject(row.location);
  const name = cleanText(location.osm_name)
    || cleanText(location.name)
    || cleanText(location.display_name)
    || 'Open Prices contributor';
  const area = cleanText(location.city)
    || cleanText(location.locality)
    || cleanText(location.address)
    || (row.location_id ? `Location ${row.location_id}` : '');
  // Open Prices is a worldwide dataset, so the emirate has to be derived from
  // the record rather than assumed. Anything unrecognised stays unknown.
  return { name, area, emirate: detectEmirate(area, name) ?? UNKNOWN_EMIRATE };
}

async function ensureStore(
  client: SupabaseClient,
  name: string,
  area: string,
  emirate: string,
): Promise<string> {
  const existing = await client
    .from('lifeos_stores')
    .select('id')
    .ilike('name', name)
    .ilike('area', area)
    .ilike('emirate', emirate)
    .limit(1)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id;
  const created = await client.from('lifeos_stores').insert({ name, area, emirate }).select('id').single();
  if (created.error || !created.data) throw created.error ?? new Error('Could not store location');
  return created.data.id;
}

function openPriceRows(payload: unknown): OpenPrice[] {
  if (Array.isArray(payload)) return payload as OpenPrice[];
  const object = asObject(payload);
  const values = object.items ?? object.results ?? object.data;
  return Array.isArray(values) ? values as OpenPrice[] : [];
}

async function importOpenPrices(
  client: SupabaseClient,
  productId: string,
  barcode: string,
): Promise<{ imported: number; deals: number }> {
  if (!barcode) return { imported: 0, deals: 0 };
  const params = new URLSearchParams({ product_code: barcode, currency: 'AED', page_size: '100' });
  const apiResponse = await fetch(`${OPEN_PRICES_URL}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!apiResponse.ok) throw new Error(`Open Prices returned ${apiResponse.status}`);
  const rows = openPriceRows(await apiResponse.json()).filter(row =>
    String(row.currency ?? '').toUpperCase() === 'AED' && Number.isFinite(Number(row.price))
  );
  let imported = 0;
  let deals = 0;
  for (const row of rows) {
    const reference = `openprices:${row.id ?? `${barcode}:${row.location_id}:${row.date}:${row.price}`}`;
    const alreadyThere = await client
      .from('lifeos_price_points')
      .select('id')
      .eq('source', 'openprices')
      .eq('source_reference', reference)
      .maybeSingle();
    if (alreadyThere.data) continue;
    const store = storeIdentity(row);
    const storeId = await ensureStore(client, store.name, store.area, store.emirate);
    const seenAt = row.date ? `${row.date}T12:00:00.000Z` : new Date().toISOString();
    const insert = await client.from('lifeos_price_points').insert({
      product_id: productId,
      store_id: storeId,
      price: Number(row.price),
      currency: 'AED',
      source: 'openprices',
      seen_at: seenAt,
      submitted_name: cleanText(row.owner, 'Open Prices contributor'),
      confidence: 0.9,
      source_reference: reference,
    });
    if (!insert.error) imported += 1;
    const original = Number(row.price_without_discount);
    if (row.price_is_discounted && Number.isFinite(original) && original >= Number(row.price)) {
      const deal = await client.from('lifeos_deals').insert({
        product_id: productId,
        store_id: storeId,
        title: `${cleanText(row.product_name, 'Product')} special`,
        current_price: Number(row.price),
        original_price: original,
        currency: 'AED',
        source: 'openprices',
        starts_at: seenAt,
      });
      if (!deal.error) deals += 1;
    }
  }
  return { imported, deals };
}

async function importAiEstimate(
  client: SupabaseClient,
  productId: string,
  productName: string,
): Promise<number> {
  const apiKey = Deno.env.get('NVIDIA_API_KEY');
  if (!apiKey || !productName) return 0;
  const apiResponse = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: Deno.env.get('NVIDIA_MODEL') ?? 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
      temperature: 0.2,
      max_tokens: 160,
      messages: [{
        role: 'user',
        content: `Estimate the current Abu Dhabi retail price band in AED for: ${productName}. Return JSON only: {"low":number,"high":number}. Do not include prose.`,
      }],
    }),
  });
  if (!apiResponse.ok) return 0;
  const payload = asObject(await apiResponse.json());
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = asObject(asObject(choices[0]).message);
  const content = cleanText(message.content);
  const match = content.match(/\{[\s\S]*?\}/);
  if (!match) return 0;
  let estimate: Record<string, unknown>;
  try {
    estimate = asObject(JSON.parse(match[0]));
  } catch {
    return 0;
  }
  const low = Number(estimate.low);
  const high = Number(estimate.high);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) return 0;
  const price = Math.round(((low + high) / 2 + Number.EPSILON) * 100) / 100;
  const storeId = await ensureStore(client, 'Abu Dhabi estimate', 'Market-wide', 'Abu Dhabi');
  const day = new Date().toISOString().slice(0, 10);
  const reference = `estimate:${productId}:${day}`;
  const existing = await client.from('lifeos_price_points').select('id').eq('source', 'estimate').eq('source_reference', reference).maybeSingle();
  if (existing.data) return 0;
  const insert = await client.from('lifeos_price_points').insert({
    product_id: productId,
    store_id: storeId,
    price,
    currency: 'AED',
    source: 'estimate',
    seen_at: new Date().toISOString(),
    submitted_name: 'AI estimate',
    confidence: 0.35,
    source_reference: reference,
  });
  return insert.error ? 0 : 1;
}

async function handleLookup(client: SupabaseClient, body: LookupBody): Promise<Response> {
  const query = cleanText(body.query);
  const barcode = cleanText(body.barcode).replace(/\D/g, '');
  if (!query && !barcode) return response({ error: 'Enter a product name or barcode.' }, 400);
  const identity = await loadProductIdentity(barcode, query);
  const productId = await ensureProduct(client, identity);
  const warnings: string[] = [];
  let imported = 0;
  let deals = 0;
  try {
    const open = await importOpenPrices(client, productId, identity.barcode ?? '');
    imported += open.imported;
    deals += open.deals;
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Open Prices is temporarily unavailable.');
  }

  // Amazon PA-API was retired in May 2026. The adapter boundary remains here
  // for Amazon's credentialed successor feed without exposing credentials or
  // changing the client/data model.
  if (!Deno.env.get('AMAZON_CREATORS_CREDENTIALS')) {
    warnings.push('Amazon.ae feed is not connected yet.');
  }

  if (imported === 0) imported += await importAiEstimate(client, productId, identity.name);
  return response({ productId, imported, deals, warnings });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/** The scheduled refresh authenticates with the shared cron secret, not a JWT. */
async function authorizedCron(request: Request, client: SupabaseClient): Promise<boolean> {
  const supplied = request.headers.get('x-cron-secret')?.trim() ?? '';
  if (!supplied) return false;

  const configured = Deno.env.get('PRICES_CRON_SECRET')?.trim()
    ?? Deno.env.get('AUTOMATIONS_CRON_SECRET')?.trim()
    ?? '';
  if (configured && constantTimeEqual(supplied, configured)) return true;

  const stored = await client
    .from('lifeos_automation_cron_tokens')
    .select('secret_digest')
    .eq('id', true)
    .maybeSingle();
  if (stored.error || !stored.data?.secret_digest) return false;
  return constantTimeEqual(await sha256(supplied), stored.data.secret_digest);
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Read every enabled source and store what they publish.
 *
 * Sources are isolated from one another, so a retailer that blocks us, changes
 * its markup or goes down shows up as one 'error' row in lifeos_price_sources
 * while the rest of the run still delivers specials.
 */
// A member tapping refresh must not be able to hammer retailer sites. The
// scheduled run is exempt: it owns the cadence.
const MANUAL_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

async function handleRefreshDeals(
  client: SupabaseClient,
  body: LookupBody,
  viaCron: boolean,
): Promise<Response> {
  const requested = Array.isArray(body.slugs)
    ? body.slugs.map(slug => findSource(String(slug))).filter(source => source !== null)
    : null;
  const wanted = requested && requested.length > 0 ? requested : SOURCE_CATALOGUE;

  const { data: registry } = await client
    .from('lifeos_price_sources')
    .select('slug, enabled, last_run_at')
    .in('slug', wanted.map(source => source.slug));
  const rows = (registry ?? []) as Array<{ slug: string; enabled: boolean; last_run_at: string | null }>;

  // A source disabled in the registry stays untouched until it is re-enabled.
  const disabled = new Set(rows.filter(row => row.enabled === false).map(row => row.slug));

  const cooling = new Set(
    viaCron
      ? []
      : rows
        .filter(row => {
          if (!row.last_run_at) return false;
          const age = Date.now() - Date.parse(row.last_run_at);
          return Number.isFinite(age) && age < MANUAL_REFRESH_COOLDOWN_MS;
        })
        .map(row => row.slug),
  );

  const definitions = wanted.filter(
    source => !disabled.has(source.slug) && !cooling.has(source.slug),
  );

  // Only disabled sources get their health rewritten; a source skipped purely
  // for cooldown keeps the status from its last real run.
  for (const source of wanted.filter(candidate => disabled.has(candidate.slug))) {
    await recordHealth(client, { slug: source.slug, status: 'skipped', prices: 0, deals: 0, error: null });
  }

  const results = await collectFromSources(definitions, {
    userAgent: USER_AGENT,
    fetchPage: async (url, init) => {
      const apiResponse = await fetch(url, {
        signal: init.signal,
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-AE,en' },
      });
      // Only read the payload when it is worth parsing.
      const payload = apiResponse.ok ? await apiResponse.text() : '';
      return { ok: apiResponse.ok, status: apiResponse.status, body: payload };
    },
  });

  const summaries = [];
  for (const result of results) {
    summaries.push(await persistOffers(client, result));
  }

  return response({
    sources: summaries.length,
    prices: summaries.reduce((total, summary) => total + summary.prices, 0),
    deals: summaries.reduce((total, summary) => total + summary.deals, 0),
    live: summaries.filter(summary => summary.status === 'ok').map(summary => summary.slug),
    failing: summaries.filter(summary => summary.status === 'error').map(summary => summary.slug),
    empty: summaries.filter(summary => summary.status === 'empty').map(summary => summary.slug),
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  let body: LookupBody;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'JSON body required' }, 400);
  }

  try {
    // The scheduler calls in with the cron secret and no user session.
    if (body.action === 'refresh-deals') {
      const client = serviceClient();
      const viaCron = await authorizedCron(request, client);
      const viaUser = viaCron ? null : await authenticate(request);
      if (!viaCron && !viaUser) return response({ error: 'Unauthorized' }, 401);
      return await handleRefreshDeals(client, body, viaCron);
    }

    const auth = await authenticate(request);
    if (!auth) return response({ error: 'Unauthorized' }, 401);

    if (body.action === 'fx') {
      const apiResponse = await fetch(FRANKFURTER_URL);
      if (!apiResponse.ok) return response({ error: 'Exchange rate unavailable' }, 502);
      const rate = asObject(await apiResponse.json());
      return response({ rate: Number(rate.rate), date: cleanText(rate.date) });
    }
    if (body.action === 'lookup') return handleLookup(auth.client, body);
    return response({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('prices function failed', error);
    return response({ error: error instanceof Error ? error.message : 'Price lookup failed' }, 500);
  }
});
