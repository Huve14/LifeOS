// Private, offline-friendly trip board data layer.
//
// Every row belongs to the signed-in account. Item writes go through the
// outbox as a full-row upsert keyed on a device-generated client_id, so a retry
// is idempotent and a weak mobile connection never loses a travel update.

import { getAuthClient, hasConfig } from '../supabase';
import { currentUserId } from './spaces';
import {
  putEntry,
  type OutboxEntry,
  type TripItemEntry,
  type TripItemRow,
} from './outbox';
import { newClientId } from './recording';
import { flushOutbox, notifySent, registerSender, subscribeSent } from './sync';

export type TripCategory =
  | 'flight'
  | 'hotel'
  | 'transport'
  | 'booking'
  | 'activity'
  | 'checklist'
  | 'idea';
export type TripStatus = 'confirmed' | 'tentative';

export const CATEGORIES: Array<{ id: TripCategory; label: string; icon: string }> = [
  { id: 'flight', label: 'Flights', icon: 'Plane' },
  { id: 'hotel', label: 'Stays', icon: 'BedDouble' },
  { id: 'transport', label: 'Transport', icon: 'CarFront' },
  { id: 'booking', label: 'Bookings', icon: 'Ticket' },
  { id: 'activity', label: 'Plans', icon: 'MapPinned' },
  { id: 'checklist', label: 'Checklist', icon: 'ListChecks' },
  { id: 'idea', label: 'Ideas', icon: 'Lightbulb' },
];

export const CURRENCIES = ['AED', 'ZAR', 'USD', 'EUR', 'GBP'];

export type Trip = {
  id: string;
  owner_id: string;
  title: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type TripItem = {
  id: string;
  owner_id: string;
  trip_id: string;
  client_id: string;
  category: TripCategory;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  cost_amount: number | null;
  cost_currency: string;
  booking_ref: string;
  status: TripStatus;
  notes: string;
  url: string;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
  /** Set on locally queued rows that have not reached the server yet. */
  pending?: boolean;
};

const TRIP_COLUMNS =
  'id, owner_id, title, origin, destination, start_date, end_date, notes, created_at, updated_at';

const ITEM_COLUMNS =
  'id, owner_id, trip_id, client_id, category, title, starts_at, ends_at, cost_amount, cost_currency, booking_ref, status, notes, url, is_complete, created_at, updated_at';

// ---------- Reads ----------

export async function loadTrips(): Promise<Trip[]> {
  if (!hasConfig) return [];
  const ownerId = currentUserId();
  if (!ownerId) return [];
  const { data, error } = await getAuthClient()
    .from('lifeos_trips')
    .select(TRIP_COLUMNS)
    .eq('owner_id', ownerId)
    .order('start_date', { ascending: true });

  if (error) throw error;
  if (!data) return [];
  return data as Trip[];
}

export async function loadItems(tripId: string): Promise<TripItem[]> {
  if (!hasConfig || !tripId) return [];
  const ownerId = currentUserId();
  if (!ownerId) return [];
  const { data, error } = await getAuthClient()
    .from('lifeos_trip_items')
    .select(ITEM_COLUMNS)
    .eq('trip_id', tripId)
    .eq('owner_id', ownerId);

  if (error) throw error;
  if (!data) return [];
  return data as TripItem[];
}

// ---------- Sorting and grouping ----------

/**
 * Chronological, with undated items last rather than first. An idea without a
 * time is the least urgent thing on the board, not the most.
 */
export function sortItems(items: TripItem[]): TripItem[] {
  return [...items].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return a.title.localeCompare(b.title);
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;
    const diff = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    return diff !== 0 ? diff : a.title.localeCompare(b.title);
  });
}

export type CategoryGroup = {
  id: TripCategory;
  label: string;
  icon: string;
  items: TripItem[];
};

/** Every category in a fixed order, empty ones dropped. */
export function groupByCategory(items: TripItem[]): CategoryGroup[] {
  return CATEGORIES.map((category) => ({
    ...category,
    items: sortItems(items.filter((item) => item.category === category.id)),
  })).filter((group) => group.items.length > 0);
}

export type Totals = {
  /** Per currency, since a trip spans two of them. */
  confirmed: Record<string, number>;
  tentative: Record<string, number>;
  currencies: string[];
};

/**
 * Confirmed and tentative are kept apart deliberately. A total that blends a
 * booked flight with a maybe hotel is not a number worth showing.
 */
export function tripTotals(items: TripItem[]): Totals {
  const confirmed: Record<string, number> = {};
  const tentative: Record<string, number> = {};

  for (const item of items) {
    if (item.cost_amount === null || item.cost_amount === undefined) continue;
    const bucket = item.status === 'confirmed' ? confirmed : tentative;
    const currency = item.cost_currency || 'AED';
    bucket[currency] = (bucket[currency] ?? 0) + Number(item.cost_amount);
  }

  const currencies = [...new Set([...Object.keys(confirmed), ...Object.keys(tentative)])].sort();
  return { confirmed, tentative, currencies };
}

export type TripProgress = {
  done: number;
  total: number;
  percent: number;
};

/**
 * Confirmed reservations and completed checklist rows are the two kinds of
 * progress a traveller can actually act on. Ideas stay out of the denominator
 * until they are confirmed, so brainstorming never makes a trip look behind.
 */
export function tripProgress(items: TripItem[]): TripProgress {
  const actionable = items.filter((item) => item.category !== 'idea');
  const done = actionable.filter((item) =>
    item.category === 'checklist' ? item.is_complete : item.status === 'confirmed',
  ).length;
  return {
    done,
    total: actionable.length,
    percent: actionable.length === 0 ? 0 : Math.round((done / actionable.length) * 100),
  };
}

export function formatCost(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const body = Number.isInteger(rounded)
    ? rounded.toLocaleString('en-GB')
    : rounded.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${body}`;
}

/** Whole days, inclusive of both ends, which is how a trip is counted. */
export function tripLengthDays(trip: Trip): number {
  const [sy, sm, sd] = trip.start_date.split('-').map(Number);
  const [ey, em, ed] = trip.end_date.split('-').map(Number);
  const days = (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000;
  return Math.max(0, Math.round(days)) + 1;
}

/** Counted from the reader's own calendar day, which is what a countdown means. */
export function daysUntilTrip(trip: Trip, now: Date = new Date()): number {
  const [sy, sm, sd] = trip.start_date.split('-').map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(sy, sm - 1, sd) - today) / 86400000);
}

/**
 * Locally queued rows shadow their server copy, so an edit shows immediately
 * and does not flicker back to the old value while the write is in flight.
 */
export function mergePending(saved: TripItem[], pending: TripItemEntry[]): TripItem[] {
  const byClientId = new Map(saved.map((item) => [item.client_id, item]));

  for (const entry of pending) {
    if (entry.meta.deleted) {
      byClientId.delete(entry.id);
      continue;
    }
    const existing = byClientId.get(entry.id);
    byClientId.set(entry.id, {
      ...(existing ?? blankItem(entry.id, entry.meta.tripId)),
      ...entry.meta.row,
      category: entry.meta.row.category as TripCategory,
      status: entry.meta.row.status as TripStatus,
      pending: true,
    });
  }

  return [...byClientId.values()];
}

function blankItem(clientId: string, tripId: string): TripItem {
  const now = new Date().toISOString();
  return {
    id: clientId,
    owner_id: currentUserId() ?? '',
    trip_id: tripId,
    client_id: clientId,
    category: 'idea',
    title: '',
    starts_at: null,
    ends_at: null,
    cost_amount: null,
    cost_currency: 'AED',
    booking_ref: '',
    status: 'tentative',
    notes: '',
    url: '',
    is_complete: false,
    created_at: now,
    updated_at: now,
  };
}

// ---------- Writes ----------

export function newItemClientId(): string {
  return newClientId();
}

export async function queueTripItem(
  tripId: string,
  clientId: string,
  row: TripItemRow,
): Promise<TripItemEntry> {
  const entry: TripItemEntry = {
    id: clientId,
    kind: 'trip-item',
    status: 'queued',
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    progress: 0,
    bytes: null,
    size: 0,
    meta: { tripId, deleted: false, row },
  };

  await putEntry(entry);
  void flushOutbox();
  return entry;
}

export async function queueTripItemDelete(item: TripItem): Promise<void> {
  const entry: TripItemEntry = {
    id: item.client_id,
    kind: 'trip-item',
    status: 'queued',
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    progress: 0,
    bytes: null,
    size: 0,
    meta: {
      tripId: item.trip_id,
      deleted: true,
      row: toRow(item),
    },
  };

  await putEntry(entry);
  void flushOutbox();
}

export function toRow(item: TripItem): TripItemRow {
  return {
    category: item.category,
    title: item.title,
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    cost_amount: item.cost_amount,
    cost_currency: item.cost_currency,
    booking_ref: item.booking_ref,
    status: item.status,
    notes: item.notes,
    url: item.url,
    is_complete: item.is_complete,
  };
}

async function sendEntry(queued: OutboxEntry): Promise<void> {
  const entry = queued as TripItemEntry;
  const userId = currentUserId();
  if (!userId) throw new Error('Not signed in');

  const client = getAuthClient();

  if (entry.meta.deleted) {
    const { error } = await client
      .from('lifeos_trip_items')
      .delete()
      .eq('client_id', entry.id)
      .eq('owner_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await client.from('lifeos_trip_items').upsert(
    {
      trip_id: entry.meta.tripId,
      owner_id: userId,
      client_id: entry.id,
      ...entry.meta.row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );

  if (error) throw error;
}

registerSender('trip-item', sendEntry);

export async function saveTrip(
  tripId: string,
  patch: Partial<Pick<Trip, 'title' | 'origin' | 'destination' | 'start_date' | 'end_date' | 'notes'>>,
): Promise<boolean> {
  if (!hasConfig) return false;
  const userId = currentUserId();
  if (!userId) return false;

  const { error } = await getAuthClient()
    .from('lifeos_trips')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('owner_id', userId);

  if (error) return false;
  notifyTripsChanged();
  return true;
}

export async function createTrip(
  trip: Pick<Trip, 'title' | 'origin' | 'destination' | 'start_date' | 'end_date' | 'notes'>,
): Promise<Trip | null> {
  if (!hasConfig) return null;
  const ownerId = currentUserId();
  if (!ownerId) return null;
  const { data, error } = await getAuthClient()
    .from('lifeos_trips')
    .insert({ ...trip, owner_id: ownerId })
    .select(TRIP_COLUMNS)
    .single();

  if (error || !data) return null;
  notifyTripsChanged();
  return data as Trip;
}

export async function deleteTrip(tripId: string): Promise<boolean> {
  if (!hasConfig) return false;
  const ownerId = currentUserId();
  if (!ownerId) return false;
  const { error } = await getAuthClient()
    .from('lifeos_trips')
    .delete()
    .eq('id', tripId)
    .eq('owner_id', ownerId);
  if (error) return false;
  notifyTripsChanged();
  return true;
}

// ---------- Change notification ----------

const TRIPS_CHANGED = 'lifeos:trips-changed';

export function notifyTripsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TRIPS_CHANGED));
  notifySent('trip-item');
}

export function subscribeTrips(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(TRIPS_CHANGED, onChange);
  const unsubscribeSent = subscribeSent('trip-item', onChange);

  let removeChannel = () => {};
  if (hasConfig) {
    const client = getAuthClient();
    const ownerId = currentUserId();
    const channel = client
      .channel('lifeos-trips')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_trips', filter: ownerId ? `owner_id=eq.${ownerId}` : undefined }, () =>
        onChange(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_trip_items', filter: ownerId ? `owner_id=eq.${ownerId}` : undefined }, () =>
        onChange(),
      )
      .subscribe();
    removeChannel = () => {
      void client.removeChannel(channel);
    };
  }

  return () => {
    window.removeEventListener(TRIPS_CHANGED, onChange);
    unsubscribeSent();
    removeChannel();
  };
}
