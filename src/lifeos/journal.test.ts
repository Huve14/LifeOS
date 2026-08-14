import { describe, expect, it } from 'vitest';
import {
  formatFlightCountdown,
  prepareJournalEntries,
  prepareNextFlight,
  removeJournalEntry,
  saveJournalEntry,
  saveNextFlight,
} from './journal';

describe('written journal model', () => {
  it('keeps legacy entries, applies mood defaults, and sorts them by date', () => {
    expect(prepareJournalEntries([
      { id: 'later', date: '2026-08-17', text: ' Later ', mood: 9 },
      { id: 'earlier', date: '2026-08-13', text: 'Earlier' },
      { id: 'broken', date: 'today', text: '' },
    ])).toEqual([
      { id: 'earlier', date: '2026-08-13', text: 'Earlier', mood: 3 },
      { id: 'later', date: '2026-08-17', text: 'Later', mood: 5 },
    ]);
  });

  it('creates and updates entries without mutating the source array', () => {
    const source = [{ id: 'one', date: '2026-08-14', text: 'Before', mood: 3 }];
    const result = saveJournalEntry(source, {
      id: 'one', date: '2026-08-15', text: ' After ', mood: 4,
    }, '2026-08-15T10:00:00.000Z');

    expect(source[0].text).toBe('Before');
    expect(result[0]).toMatchObject({
      id: 'one', date: '2026-08-15', text: 'After', mood: 4,
      createdAt: '2026-08-15T10:00:00.000Z', updatedAt: '2026-08-15T10:00:00.000Z',
    });
  });

  it('removes only the selected journal entry', () => {
    expect(removeJournalEntry([
      { id: 'one', date: '2026-08-14', text: 'One', mood: 3 },
      { id: 'two', date: '2026-08-15', text: 'Two', mood: 4 },
    ], 'one').map(entry => entry.id)).toEqual(['two']);
  });

  it('normalises a valid next flight and rejects incomplete drafts', () => {
    expect(saveNextFlight({
      from: ' auh ',
      to: 'Cape Town',
      departureAt: '2026-09-04T18:30:00.000Z',
      flightNumber: ' ey 123 ',
      terminal: ' Terminal A ',
    }, '2026-08-14T10:00:00.000Z')).toEqual({
      from: 'AUH',
      to: 'Cape Town',
      departureAt: '2026-09-04T18:30:00.000Z',
      flightNumber: 'EY 123',
      terminal: 'Terminal A',
      updatedAt: '2026-08-14T10:00:00.000Z',
    });
    expect(prepareNextFlight({ from: 'AUH', to: '', departureAt: 'later' })).toBeNull();
  });

  it('turns a departure into a helpful live countdown', () => {
    const now = new Date('2026-08-14T10:00:00.000Z');
    expect(formatFlightCountdown({ from: 'AUH', to: 'CPT', departureAt: '2026-08-16T09:00:00.000Z' }, now)).toBe('In 2 days');
    expect(formatFlightCountdown({ from: 'AUH', to: 'CPT', departureAt: '2026-08-14T12:15:00.000Z' }, now)).toBe('In 2 hr 15 min');
    expect(formatFlightCountdown({ from: 'AUH', to: 'CPT', departureAt: '2026-08-14T09:30:00.000Z' }, now)).toBe('Departing now');
    expect(formatFlightCountdown({ from: 'AUH', to: 'CPT', departureAt: '2026-08-14T08:00:00.000Z' }, now)).toBe('Departed');
  });
});
