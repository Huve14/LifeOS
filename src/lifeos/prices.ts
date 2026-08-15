import { getAuthClient, getCurrentUser, hasConfig } from '../supabase';
import { convertAmountAtRate } from '../budget/currency';

export const PRICE_SOURCES = ['amazon', 'openprices', 'community', 'estimate'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export type Product = {
  id: string;
  name: string;
  brand: string;
  barcode: string | null;
  category: string;
  imageUrl: string | null;
  isSaFavourite: boolean;
};

export type Store = {
  id: string;
  name: string;
  area: string;
  emirate: string;
};

export type PricePoint = {
  id: string;
  productId: string;
  storeId: string;
  price: number;
  currency: string;
  source: PriceSource;
  seenAt: string;
  submittedBy: string | null;
  submittedName: string;
  confidence: number;
  photoPath: string | null;
  product: Product;
  store: Store;
};

export type ProductPrices = {
  product: Product;
  prices: PricePoint[];
  cheapest: PricePoint | null;
  priciest: PricePoint | null;
  savings: number;
};

export type Deal = {
  id: string;
  title: string;
  currentPrice: number;
  originalPrice: number | null;
  currency: string;
  source: PriceSource;
  startsAt: string;
  expiresAt: string | null;
  product: Product;
  store: Store;
};

export type PriceWatch = {
  id: string;
  ownerId: string;
  productId: string;
  targetPrice: number;
  currency: string;
  active: boolean;
  lastNotifiedAt: string | null;
  product: Product;
};

type ProductRow = {
  id: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  category?: string | null;
  image_url?: string | null;
  is_sa_favourite?: boolean | null;
};

type StoreRow = {
  id: string;
  name: string;
  area?: string | null;
  emirate?: string | null;
};

type PricePointRow = {
  id: string;
  product_id: string;
  store_id: string;
  price: number | string;
  currency: string;
  source: PriceSource;
  seen_at: string;
  submitted_by?: string | null;
  submitted_name?: string | null;
  confidence?: number | string | null;
  photo_path?: string | null;
  product?: ProductRow | ProductRow[] | null;
  store?: StoreRow | StoreRow[] | null;
};

const PRODUCT_SELECT = 'id, name, brand, barcode, category, image_url, is_sa_favourite';
const STORE_SELECT = 'id, name, area, emirate';
const PRICE_SELECT = `id, product_id, store_id, price, currency, source, seen_at, submitted_by, submitted_name, confidence, photo_path, product:lifeos_products(${PRODUCT_SELECT}), store:lifeos_stores(${STORE_SELECT})`;

export function parseMoneyInput(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const amount = typeof value === 'number' ? value : Number.parseFloat(value.replace(/,/g, '').trim());
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatAED(value: number, withCurrency = true): string {
  const formatted = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return withCurrency ? `AED ${formatted}` : formatted;
}

export function formatZAR(value: number, rate: number): string {
  const converted = convertAmountAtRate(value, rate);
  return `R ${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 }).format(converted)}`;
}

export function sourceLabel(source: PriceSource, submittedName = ''): string {
  if (source === 'amazon') return 'Amazon.ae';
  if (source === 'openprices') return 'Open Prices';
  if (source === 'estimate') return 'AI estimate';
  return submittedName.trim() || 'Community member';
}

export function ageLabel(value: string | Date, now = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (!Number.isFinite(date.getTime())) return 'date unavailable';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Intl.DateTimeFormat('en-AE', { day: 'numeric', month: 'short' }).format(date);
}

export function sortPricePoints(points: PricePoint[]): PricePoint[] {
  return [...points].sort((left, right) => left.price - right.price || Date.parse(right.seenAt) - Date.parse(left.seenAt));
}

export function savingsAgainstHighest(points: Pick<PricePoint, 'price'>[]): number {
  if (points.length < 2) return 0;
  const prices = points.map(point => point.price).filter(Number.isFinite);
  if (prices.length < 2) return 0;
  return Math.round((Math.max(...prices) - Math.min(...prices) + Number.EPSILON) * 100) / 100;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand ?? '',
    barcode: row.barcode ?? null,
    category: row.category ?? 'Groceries',
    imageUrl: row.image_url ?? null,
    isSaFavourite: row.is_sa_favourite === true,
  };
}

function mapStore(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    area: row.area ?? '',
    emirate: row.emirate ?? 'Abu Dhabi',
  };
}

function mapPricePoint(row: PricePointRow): PricePoint | null {
  const product = firstRelation(row.product);
  const store = firstRelation(row.store);
  const price = Number(row.price);
  if (!product || !store || !Number.isFinite(price)) return null;
  return {
    id: row.id,
    productId: row.product_id,
    storeId: row.store_id,
    price,
    currency: row.currency,
    source: row.source,
    seenAt: row.seen_at,
    submittedBy: row.submitted_by ?? null,
    submittedName: row.submitted_name ?? 'Community member',
    confidence: Number(row.confidence ?? 1),
    photoPath: row.photo_path ?? null,
    product: mapProduct(product),
    store: mapStore(store),
  };
}

function groupPrices(products: Product[], points: PricePoint[]): ProductPrices[] {
  return products.map(product => {
    const prices = sortPricePoints(points.filter(point => point.productId === product.id));
    return {
      product,
      prices,
      cheapest: prices[0] ?? null,
      priciest: prices.at(-1) ?? null,
      savings: savingsAgainstHighest(prices),
    };
  });
}

async function loadPointsForProducts(products: Product[]): Promise<ProductPrices[]> {
  if (products.length === 0) return [];
  const { data, error } = await getAuthClient()
    .from('lifeos_price_points')
    .select(PRICE_SELECT)
    .in('product_id', products.map(product => product.id))
    .order('seen_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  const points = (data ?? [])
    .map(row => mapPricePoint(row as unknown as PricePointRow))
    .filter((point): point is PricePoint => point !== null);
  return groupPrices(products, points);
}

export async function searchPrices(query: string): Promise<ProductPrices[]> {
  if (!hasConfig || !getCurrentUser()) return [];
  const value = query.trim();
  if (!value) return [];
  const base = getAuthClient().from('lifeos_products').select(PRODUCT_SELECT);
  const productQuery = /^\d{8,14}$/.test(value)
    ? base.eq('barcode', value)
    : base.ilike('name', `%${value.replace(/[%_]/g, '')}%`);
  const { data, error } = await productQuery.order('name').limit(20);
  if (error) throw error;
  return loadPointsForProducts((data ?? []).map(row => mapProduct(row as ProductRow)));
}

export async function loadSaBasket(): Promise<ProductPrices[]> {
  if (!hasConfig || !getCurrentUser()) return [];
  const { data, error } = await getAuthClient()
    .from('lifeos_products')
    .select(PRODUCT_SELECT)
    .eq('is_sa_favourite', true)
    .order('name');
  if (error) throw error;
  return loadPointsForProducts((data ?? []).map(row => mapProduct(row as ProductRow)));
}

export async function loadDeals(): Promise<Deal[]> {
  if (!hasConfig || !getCurrentUser()) return [];
  const now = new Date().toISOString();
  const { data, error } = await getAuthClient()
    .from('lifeos_deals')
    .select(`id, title, current_price, original_price, currency, source, starts_at, expires_at, product:lifeos_products(${PRODUCT_SELECT}), store:lifeos_stores(${STORE_SELECT})`)
    .lte('starts_at', now)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('expires_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).flatMap(row => {
    const record = row as unknown as {
      id: string; title: string; current_price: number | string; original_price: number | string | null;
      currency: string; source: PriceSource; starts_at: string; expires_at: string | null;
      product: ProductRow | ProductRow[] | null; store: StoreRow | StoreRow[] | null;
    };
    const product = firstRelation(record.product);
    const store = firstRelation(record.store);
    if (!product || !store) return [];
    return [{
      id: record.id,
      title: record.title,
      currentPrice: Number(record.current_price),
      originalPrice: record.original_price == null ? null : Number(record.original_price),
      currency: record.currency,
      source: record.source,
      startsAt: record.starts_at,
      expiresAt: record.expires_at,
      product: mapProduct(product),
      store: mapStore(store),
    }];
  });
}

export async function loadPriceWatches(): Promise<PriceWatch[]> {
  if (!hasConfig || !getCurrentUser()) return [];
  const { data, error } = await getAuthClient()
    .from('lifeos_price_watches')
    .select(`id, owner_id, product_id, target_price, currency, active, last_notified_at, product:lifeos_products(${PRODUCT_SELECT})`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap(row => {
    const record = row as unknown as {
      id: string; owner_id: string; product_id: string; target_price: number | string;
      currency: string; active: boolean; last_notified_at: string | null;
      product: ProductRow | ProductRow[] | null;
    };
    const product = firstRelation(record.product);
    if (!product) return [];
    return [{
      id: record.id,
      ownerId: record.owner_id,
      productId: record.product_id,
      targetPrice: Number(record.target_price),
      currency: record.currency,
      active: record.active,
      lastNotifiedAt: record.last_notified_at,
      product: mapProduct(product),
    }];
  });
}

export async function setPriceWatch(productId: string, target: string | number): Promise<void> {
  const ownerId = getCurrentUser()?.id;
  const targetPrice = parseMoneyInput(target);
  if (!hasConfig || !ownerId) throw new Error('Sign in to create a price watch.');
  if (!productId || targetPrice == null) throw new Error('Choose a product and enter a valid target.');
  const { error } = await getAuthClient().from('lifeos_price_watches').upsert({
    owner_id: ownerId,
    product_id: productId,
    target_price: targetPrice,
    currency: 'AED',
    active: true,
  }, { onConflict: 'owner_id,product_id' });
  if (error) throw error;
}

export async function deletePriceWatch(id: string): Promise<void> {
  if (!hasConfig || !getCurrentUser()) return;
  const { error } = await getAuthClient().from('lifeos_price_watches').delete().eq('id', id);
  if (error) throw error;
}

async function findOrCreateProduct(name: string, category: string, barcode = ''): Promise<ProductRow> {
  const userId = getCurrentUser()?.id;
  if (!userId) throw new Error('Sign in to log a price.');
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter a product name.');
  if (barcode.trim()) {
    const byBarcode = await getAuthClient().from('lifeos_products').select(PRODUCT_SELECT).eq('barcode', barcode.trim()).maybeSingle();
    if (byBarcode.error) throw byBarcode.error;
    if (byBarcode.data) return byBarcode.data as ProductRow;
  }
  const existing = await getAuthClient().from('lifeos_products').select(PRODUCT_SELECT).ilike('name', cleanName).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as ProductRow;
  const created = await getAuthClient().from('lifeos_products').insert({
    name: cleanName,
    barcode: barcode.trim() || null,
    category: category.trim() || 'Groceries',
    submitted_by: userId,
  }).select(PRODUCT_SELECT).single();
  if (created.error || !created.data) throw created.error ?? new Error('Could not create the product.');
  return created.data as ProductRow;
}

async function findOrCreateStore(name: string, area: string): Promise<StoreRow> {
  const userId = getCurrentUser()?.id;
  if (!userId) throw new Error('Sign in to log a price.');
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter the store name.');
  const cleanArea = area.trim();
  const query = getAuthClient().from('lifeos_stores').select(STORE_SELECT).ilike('name', cleanName).ilike('area', cleanArea).limit(1);
  const existing = await query.maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as StoreRow;
  const created = await getAuthClient().from('lifeos_stores').insert({
    name: cleanName,
    area: cleanArea,
    emirate: 'Abu Dhabi',
    submitted_by: userId,
  }).select(STORE_SELECT).single();
  if (created.error || !created.data) throw created.error ?? new Error('Could not create the store.');
  return created.data as StoreRow;
}

export type CommunityPriceInput = {
  productName: string;
  category?: string;
  barcode?: string;
  storeName: string;
  area?: string;
  price: string | number;
  seenAt?: string;
  photoPath?: string | null;
  isDeal?: boolean;
  originalPrice?: string | number;
  expiresAt?: string | null;
};

export async function logCommunityPrice(input: CommunityPriceInput): Promise<PricePoint> {
  const userId = getCurrentUser()?.id;
  const price = parseMoneyInput(input.price);
  if (!hasConfig || !userId) throw new Error('Sign in to log a price.');
  if (price == null) throw new Error('Enter a valid AED price.');
  const [product, store] = await Promise.all([
    findOrCreateProduct(input.productName, input.category ?? 'Groceries', input.barcode),
    findOrCreateStore(input.storeName, input.area ?? ''),
  ]);
  const inserted = await getAuthClient().from('lifeos_price_points').insert({
    product_id: product.id,
    store_id: store.id,
    price,
    currency: 'AED',
    source: 'community',
    seen_at: input.seenAt ? new Date(input.seenAt).toISOString() : new Date().toISOString(),
    submitted_by: userId,
    confidence: input.photoPath ? 1 : 0.85,
    photo_path: input.photoPath ?? null,
  }).select(PRICE_SELECT).single();
  if (inserted.error || !inserted.data) throw inserted.error ?? new Error('Could not save the price.');

  if (input.isDeal) {
    const original = parseMoneyInput(input.originalPrice ?? '');
    const { error } = await getAuthClient().from('lifeos_deals').insert({
      product_id: product.id,
      store_id: store.id,
      title: `${product.name} special`,
      current_price: price,
      original_price: original != null && original >= price ? original : null,
      currency: 'AED',
      source: 'community',
      expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
      submitted_by: userId,
    });
    if (error) throw error;
  }

  const mapped = mapPricePoint(inserted.data as unknown as PricePointRow);
  if (!mapped) throw new Error('The saved price could not be read back.');
  return mapped;
}

export async function refreshExternalPrices(query: string, barcode = ''): Promise<{ imported: number; warnings: string[] }> {
  if (!hasConfig || !getCurrentUser()) throw new Error('Sign in to refresh prices.');
  const { data, error } = await getAuthClient().functions.invoke('prices', {
    body: { action: 'lookup', query: query.trim(), barcode: barcode.trim() },
  });
  if (error) throw error;
  return {
    imported: Number(data?.imported ?? 0),
    warnings: Array.isArray(data?.warnings) ? data.warnings.map(String) : [],
  };
}

export async function loadFxRate(): Promise<{ rate: number; date: string } | null> {
  if (!hasConfig || !getCurrentUser()) return null;
  const { data, error } = await getAuthClient().functions.invoke('prices', { body: { action: 'fx' } });
  if (error || !Number.isFinite(Number(data?.rate))) return null;
  return { rate: Number(data.rate), date: String(data.date ?? '') };
}
