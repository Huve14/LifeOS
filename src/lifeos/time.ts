// Dual-clock formatting and day grouping.
//
// Two people, two hours apart. Every timestamp in the shared surfaces is shown
// in both zones so neither of us has to do the arithmetic, and days are grouped
// by the reader's own calendar rather than a fixed one.

export const JOHANNESBURG = 'Africa/Johannesburg';
export const ABU_DHABI = 'Asia/Dubai';

export type Zone = { zone: string; label: string };

/**
 * Whose clocks to show. Set from the profiles in the current space, so a solo
 * user sees one clock and a couple sees both. Starts as the device's own zone
 * rather than anything hardcoded, so a new account is never shown someone
 * else's city.
 */
let zones: Zone[] = [];

export function setZones(next: Zone[]): void {
  zones = next.filter((z) => z.zone);
}

export function getZones(): Zone[] {
  if (zones.length > 0) return zones;
  const own = localZone();
  return [{ zone: own, label: own.split('/').pop()?.replace(/_/g, ' ') ?? own }];
}

/** The reader's own time zone, falling back to Johannesburg. */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || JOHANNESBURG;
  } catch {
    return JOHANNESBURG;
  }
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 24 hour clock in a given zone, for example "14:32". */
export function formatClock(value: string | number | Date, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: zone,
  }).format(toDate(value));
}

/**
 * Both clocks on one line, reader's zone first so the number they care about
 * leads: "14:32 Johannesburg · 16:32 Abu Dhabi".
 */
export function formatDualClock(value: string | number | Date, readerZone = localZone()): string {
  const ordered = [...getZones()].sort((a, b) => {
    if (a.zone === readerZone) return -1;
    if (b.zone === readerZone) return 1;
    return 0;
  });

  // One clock when there is only one person, or when both are in the same
  // zone. Repeating the same time twice would be noise.
  const unique = ordered.filter(
    (z, i) => ordered.findIndex((o) => formatClock(value, o.zone) === formatClock(value, z.zone)) === i,
  );
  if (unique.length <= 1) return formatClock(value, ordered[0]?.zone ?? readerZone);

  return unique.map((z) => `${formatClock(value, z.zone)} ${z.label}`).join(' · ');
}

/** Calendar day in a zone as YYYY-MM-DD. en-CA gives that ordering directly. */
export function dayKey(value: string | number | Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: zone,
  }).format(toDate(value));
}

function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}

/** "Today", "Yesterday", or "Thursday, 13 August". */
export function dayHeading(key: string, zone: string, now: Date = new Date()): string {
  const todayKey = dayKey(now, zone);
  if (key === todayKey) return 'Today';
  if (key === shiftDayKey(todayKey, -1)) return 'Yesterday';

  const [y, m, d] = key.split('-').map(Number);
  const sameYear = y === Number(todayKey.slice(0, 4));
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export type DayGroup<T> = { key: string; heading: string; items: T[] };

/**
 * Newest first, grouped into calendar days. Items are assumed to arrive in
 * reverse-chronological order but are sorted defensively, since offline entries
 * get spliced in from a local queue.
 */
export function groupByDay<T>(
  items: T[],
  getTime: (item: T) => string | number | Date,
  zone = localZone(),
  now: Date = new Date(),
): DayGroup<T>[] {
  const sorted = [...items].sort(
    (a, b) => toDate(getTime(b)).getTime() - toDate(getTime(a)).getTime(),
  );

  const groups: DayGroup<T>[] = [];
  let current: DayGroup<T> | null = null;

  for (const item of sorted) {
    const key = dayKey(getTime(item), zone);
    if (!current || current.key !== key) {
      current = { key, heading: dayHeading(key, zone, now), items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }

  return groups;
}

/** Seconds as m:ss, for durations and playback positions. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Rounded file size for the upload states, for example "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
