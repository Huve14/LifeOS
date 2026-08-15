// Server-side price ingestion for Shop & Save.
//
// The browser invokes this authenticated function on the Supabase domain. It
// never receives external API credentials and never contacts retailer sites.
// Open Food Facts identifies barcodes, Open Prices supplies attributed price
// observations, Frankfurter supplies AED/ZAR, and NVIDIA is the explicitly
// labelled last-resort estimate tier.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPEN_PRICES_URL = 'https://prices.openfoodfacts.org/api/v1/prices';
const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/api/v3/product';
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/rate/AED/ZAR';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const USER_AGENT = 'LifeOS/1.0 (https://life-os-hs.vercel.app)';

type LookupBody = { action?: string; query?: string; barcode?: string };
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

function storeIdentity(row: OpenPrice): { name: string; area: string } {
  const location = asObject(row.location);
  const name = cleanText(location.osm_name)
    || cleanText(location.name)
    || cleanText(location.display_name)
    || 'Open Prices contributor';
  const area = cleanText(location.city)
    || cleanText(location.locality)
    || cleanText(location.address)
    || (row.location_id ? `Location ${row.location_id}` : '');
  return { name, area };
}

async function ensureStore(client: SupabaseClient, name: string, area: string): Promise<string> {
  const existing = await client
    .from('lifeos_stores')
    .select('id')
    .ilike('name', name)
    .ilike('area', area)
    .limit(1)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id;
  const created = await client.from('lifeos_stores').insert({ name, area, emirate: 'Abu Dhabi' }).select('id').single();
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
    const storeId = await ensureStore(client, store.name, store.area);
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
  const storeId = await ensureStore(client, 'Abu Dhabi estimate', 'Market-wide');
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const auth = await authenticate(request);
  if (!auth) return response({ error: 'Unauthorized' }, 401);
  let body: LookupBody;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'JSON body required' }, 400);
  }
  try {
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
