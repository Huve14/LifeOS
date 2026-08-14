import { describe, it, expect, beforeEach } from 'vitest';
import {
  ABU_DHABI,
  JOHANNESBURG,
  dayHeading,
  dayKey,
  formatBytes,
  formatClock,
  formatDualClock,
  formatDuration,
  groupByDay,
  setZones,
} from './time';

describe('formatClock', () => {
  it('renders the two zones two hours apart', () => {
    const at = '2026-08-13T12:32:00Z';
    expect(formatClock(at, JOHANNESBURG)).toBe('14:32');
    expect(formatClock(at, ABU_DHABI)).toBe('16:32');
  });

  it('uses a 24 hour clock past midday', () => {
    expect(formatClock('2026-08-13T20:05:00Z', JOHANNESBURG)).toBe('22:05');
  });
});

describe('formatDualClock', () => {
  beforeEach(() => {
    setZones([
      { zone: JOHANNESBURG, label: 'Johannesburg' },
      { zone: ABU_DHABI, label: 'Abu Dhabi' },
    ]);
  });

  it('shows one clock when there is nobody to compare against', () => {
    setZones([{ zone: JOHANNESBURG, label: 'Johannesburg' }]);
    expect(formatDualClock('2026-08-13T12:32:00Z', JOHANNESBURG)).toBe('14:32');
  });

  it('collapses to one clock when both people are in the same zone', () => {
    setZones([
      { zone: JOHANNESBURG, label: 'Johannesburg' },
      { zone: 'Africa/Maputo', label: 'Maputo' },
    ]);
    expect(formatDualClock('2026-08-13T12:32:00Z', JOHANNESBURG)).toBe('14:32');
  });
  it("puts the reader's own zone first", () => {
    const at = '2026-08-13T12:32:00Z';
    expect(formatDualClock(at, ABU_DHABI)).toBe('16:32 Abu Dhabi · 14:32 Johannesburg');
    expect(formatDualClock(at, JOHANNESBURG)).toBe('14:32 Johannesburg · 16:32 Abu Dhabi');
  });

  it('still shows both zones for a reader somewhere else', () => {
    const out = formatDualClock('2026-08-13T12:32:00Z', 'Europe/London');
    expect(out).toContain('Johannesburg');
    expect(out).toContain('Abu Dhabi');
  });
});

describe('dayKey', () => {
  it('is zone dependent across the date boundary', () => {
    // 22:30 UTC is the 13th in Johannesburg and already the 14th in Abu Dhabi.
    const at = '2026-08-13T22:30:00Z';
    expect(dayKey(at, JOHANNESBURG)).toBe('2026-08-14');
    expect(dayKey(at, ABU_DHABI)).toBe('2026-08-14');

    const earlier = '2026-08-13T20:30:00Z';
    expect(dayKey(earlier, JOHANNESBURG)).toBe('2026-08-13');
    expect(dayKey(earlier, ABU_DHABI)).toBe('2026-08-14');
  });
});

describe('dayHeading', () => {
  const now = new Date('2026-08-13T10:00:00Z');

  it('names today and yesterday', () => {
    expect(dayHeading('2026-08-13', JOHANNESBURG, now)).toBe('Today');
    expect(dayHeading('2026-08-12', JOHANNESBURG, now)).toBe('Yesterday');
  });

  it('spells out older days without the year', () => {
    // Punctuation between the parts varies by ICU build, so assert the parts.
    const heading = dayHeading('2026-08-09', JOHANNESBURG, now);
    expect(heading).toContain('Sunday');
    expect(heading).toContain('9 August');
    expect(heading).not.toContain('2026');
  });

  it('includes the year once it is a different one', () => {
    expect(dayHeading('2025-12-24', JOHANNESBURG, now)).toContain('2025');
  });

  it('handles a month boundary', () => {
    const firstOfMonth = new Date('2026-09-01T10:00:00Z');
    expect(dayHeading('2026-08-31', JOHANNESBURG, firstOfMonth)).toBe('Yesterday');
  });
});

describe('groupByDay', () => {
  const now = new Date('2026-08-13T10:00:00Z');
  const items = [
    { id: 'a', at: '2026-08-13T06:00:00Z' },
    { id: 'b', at: '2026-08-12T21:00:00Z' },
    { id: 'c', at: '2026-08-13T08:00:00Z' },
    { id: 'd', at: '2026-08-11T05:00:00Z' },
  ];

  it('groups newest first, and newest first within a day', () => {
    const groups = groupByDay(items, (i) => i.at, JOHANNESBURG, now);
    expect(groups.map((g) => g.key)).toEqual(['2026-08-13', '2026-08-12', '2026-08-11']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('labels the leading groups', () => {
    const groups = groupByDay(items, (i) => i.at, JOHANNESBURG, now);
    expect(groups[0].heading).toBe('Today');
    expect(groups[1].heading).toBe('Yesterday');
  });

  it('regroups when the reader is in the other zone', () => {
    // 21:00 UTC on the 12th is 23:00 in Johannesburg but already 01:00 on the
    // 13th in Abu Dhabi, so that clip files under a different day for each of
    // them. This is the tradeoff of grouping by the reader's own calendar.
    const groups = groupByDay(items, (i) => i.at, ABU_DHABI, now);
    expect(groups.map((g) => g.key)).toEqual(['2026-08-13', '2026-08-11']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByDay([], (i: { at: string }) => i.at, JOHANNESBURG, now)).toEqual([]);
  });
});

describe('formatting helpers', () => {
  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9.4)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(120)).toBe('2:00');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(13_000_000)).toBe('12.4 MB');
  });
});
