import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  daysUntilTrip,
  formatCost,
  groupByCategory,
  mergePending,
  sortItems,
  toRow,
  tripLengthDays,
  tripTotals,
  type Trip,
  type TripItem,
} from './trips';
import type { TripItemEntry } from './outbox';

function item(overrides: Partial<TripItem> = {}): TripItem {
  return {
    id: overrides.client_id ?? 'i1',
    trip_id: 't1',
    client_id: 'i1',
    category: 'idea',
    title: 'Something',
    starts_at: null,
    ends_at: null,
    cost_amount: null,
    cost_currency: 'AED',
    booking_ref: '',
    status: 'tentative',
    notes: '',
    url: '',
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

const trip: Trip = {
  id: 't1',
  title: 'October in Abu Dhabi',
  origin: 'Johannesburg',
  destination: 'Abu Dhabi',
  start_date: '2026-10-02',
  end_date: '2026-10-12',
  notes: '',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('sortItems', () => {
  it('orders by start time', () => {
    const sorted = sortItems([
      item({ client_id: 'b', starts_at: '2026-10-05T08:00:00Z' }),
      item({ client_id: 'a', starts_at: '2026-10-02T08:00:00Z' }),
      item({ client_id: 'c', starts_at: '2026-10-09T08:00:00Z' }),
    ]);
    expect(sorted.map((i) => i.client_id)).toEqual(['a', 'b', 'c']);
  });

  it('puts undated items last, not first', () => {
    const sorted = sortItems([
      item({ client_id: 'idea', starts_at: null }),
      item({ client_id: 'flight', starts_at: '2026-10-02T08:00:00Z' }),
    ]);
    expect(sorted.map((i) => i.client_id)).toEqual(['flight', 'idea']);
  });

  it('falls back to title so the order is stable', () => {
    const sorted = sortItems([
      item({ client_id: 'z', title: 'Zoo', starts_at: null }),
      item({ client_id: 'a', title: 'Aquarium', starts_at: null }),
    ]);
    expect(sorted.map((i) => i.title)).toEqual(['Aquarium', 'Zoo']);
  });

  it('breaks a time tie by title', () => {
    const at = '2026-10-02T08:00:00Z';
    const sorted = sortItems([
      item({ client_id: 'b', title: 'Second', starts_at: at }),
      item({ client_id: 'a', title: 'First', starts_at: at }),
    ]);
    expect(sorted.map((i) => i.title)).toEqual(['First', 'Second']);
  });

  it('does not mutate the input', () => {
    const input = [
      item({ client_id: 'b', starts_at: '2026-10-05T08:00:00Z' }),
      item({ client_id: 'a', starts_at: '2026-10-02T08:00:00Z' }),
    ];
    sortItems(input);
    expect(input[0].client_id).toBe('b');
  });
});

describe('groupByCategory', () => {
  it('uses a fixed category order regardless of input order', () => {
    const groups = groupByCategory([
      item({ client_id: '1', category: 'idea' }),
      item({ client_id: '2', category: 'flight' }),
      item({ client_id: '3', category: 'hotel' }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['flight', 'hotel', 'idea']);
  });

  it('drops empty categories', () => {
    const groups = groupByCategory([item({ category: 'flight' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Flights');
  });

  it('sorts within each group', () => {
    const groups = groupByCategory([
      item({ client_id: 'late', category: 'flight', starts_at: '2026-10-12T08:00:00Z' }),
      item({ client_id: 'early', category: 'flight', starts_at: '2026-10-02T08:00:00Z' }),
    ]);
    expect(groups[0].items.map((i) => i.client_id)).toEqual(['early', 'late']);
  });

  it('returns nothing for an empty board', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it('covers every category the schema allows', () => {
    expect(CATEGORIES.map((c) => c.id).sort()).toEqual(['booking', 'flight', 'hotel', 'idea']);
  });
});

describe('tripTotals', () => {
  it('keeps confirmed and tentative apart', () => {
    const totals = tripTotals([
      item({ client_id: '1', status: 'confirmed', cost_amount: 1000, cost_currency: 'AED' }),
      item({ client_id: '2', status: 'tentative', cost_amount: 500, cost_currency: 'AED' }),
    ]);
    expect(totals.confirmed.AED).toBe(1000);
    expect(totals.tentative.AED).toBe(500);
  });

  it('totals each currency separately', () => {
    const totals = tripTotals([
      item({ client_id: '1', status: 'confirmed', cost_amount: 1000, cost_currency: 'AED' }),
      item({ client_id: '2', status: 'confirmed', cost_amount: 8000, cost_currency: 'ZAR' }),
    ]);
    expect(totals.confirmed).toEqual({ AED: 1000, ZAR: 8000 });
    expect(totals.currencies).toEqual(['AED', 'ZAR']);
  });

  it('ignores items with no cost', () => {
    const totals = tripTotals([
      item({ client_id: '1', cost_amount: null }),
      item({ client_id: '2', status: 'confirmed', cost_amount: 250 }),
    ]);
    expect(totals.confirmed.AED).toBe(250);
    expect(totals.tentative).toEqual({});
  });

  it('counts a zero cost rather than skipping it', () => {
    const totals = tripTotals([item({ status: 'confirmed', cost_amount: 0 })]);
    expect(totals.confirmed.AED).toBe(0);
  });

  it('is empty for an empty board', () => {
    expect(tripTotals([])).toEqual({ confirmed: {}, tentative: {}, currencies: [] });
  });
});

describe('formatCost', () => {
  it('drops decimals on whole amounts', () => {
    expect(formatCost(1200, 'AED')).toBe('AED 1,200');
  });

  it('keeps two decimals otherwise', () => {
    expect(formatCost(1200.5, 'ZAR')).toBe('ZAR 1,200.50');
  });
});

describe('trip dates', () => {
  it('counts days inclusive of both ends', () => {
    expect(tripLengthDays(trip)).toBe(11);
    expect(tripLengthDays({ ...trip, end_date: trip.start_date })).toBe(1);
  });

  it('counts down to the start', () => {
    expect(daysUntilTrip(trip, new Date('2026-10-01T12:00:00Z'))).toBe(1);
    expect(daysUntilTrip(trip, new Date('2026-10-02T12:00:00Z'))).toBe(0);
  });

  it('goes negative once the trip has started', () => {
    expect(daysUntilTrip(trip, new Date('2026-10-05T12:00:00Z'))).toBe(-3);
  });
});

describe('mergePending', () => {
  function entry(id: string, row: Partial<TripItem>, deleted = false): TripItemEntry {
    return {
      id,
      kind: 'trip-item',
      status: 'queued',
      createdAt: 1,
      attempts: 0,
      lastError: null,
      progress: 0,
      bytes: null,
      size: 0,
      meta: { tripId: 't1', deleted, row: toRow(item({ client_id: id, ...row })) },
    };
  }

  it('adds a queued item that has no server row yet', () => {
    const merged = mergePending([], [entry('new', { title: 'Etihad EY 611' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Etihad EY 611');
    expect(merged[0].pending).toBe(true);
  });

  it('shadows the server row with a queued edit', () => {
    const saved = [item({ client_id: 'a', title: 'Old title', status: 'tentative' })];
    const merged = mergePending(saved, [entry('a', { title: 'New title', status: 'confirmed' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('New title');
    expect(merged[0].status).toBe('confirmed');
    expect(merged[0].pending).toBe(true);
  });

  it('keeps the server fields the edit does not touch', () => {
    const saved = [item({ client_id: 'a', created_by: 'someone-else' })];
    const merged = mergePending(saved, [entry('a', { title: 'Renamed' })]);
    expect(merged[0].created_by).toBe('someone-else');
  });

  it('removes a row with a queued delete', () => {
    const saved = [item({ client_id: 'a' }), item({ client_id: 'b' })];
    const merged = mergePending(saved, [entry('a', {}, true)]);
    expect(merged.map((i) => i.client_id)).toEqual(['b']);
  });

  it('leaves untouched rows alone and unmarked', () => {
    const saved = [item({ client_id: 'a' })];
    const merged = mergePending(saved, []);
    expect(merged[0].pending).toBeUndefined();
  });
});
