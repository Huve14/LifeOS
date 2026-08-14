export type JournalEntry = {
  id: string;
  date: string;
  text: string;
  mood: number;
  createdAt?: string;
  updatedAt?: string;
};

export type NextFlight = {
  from: string;
  to: string;
  departureAt: string;
  flightNumber?: string;
  terminal?: string;
  updatedAt?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanFlightText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function cleanFlightPlace(value: unknown): string {
  const place = cleanFlightText(value, 80);
  return /^[a-z]{3}$/i.test(place) ? place.toUpperCase() : place;
}

/**
 * Normalises the small flight card stored inside the signed-in user's private
 * app-state row. Invalid legacy or partially written drafts stay hidden.
 */
export function prepareNextFlight(value: unknown): NextFlight | null {
  if (!isRecord(value)) return null;

  const from = cleanFlightPlace(value.from);
  const to = cleanFlightPlace(value.to);
  const departureAt = cleanFlightText(value.departureAt, 40);
  const departure = new Date(departureAt);
  if (!from || !to || !departureAt || Number.isNaN(departure.getTime())) return null;

  const flightNumber = cleanFlightText(value.flightNumber, 24).toUpperCase();
  const terminal = cleanFlightText(value.terminal, 40);
  const updatedAt = cleanFlightText(value.updatedAt, 40);

  return {
    from,
    to,
    departureAt: departure.toISOString(),
    ...(flightNumber ? { flightNumber } : {}),
    ...(terminal ? { terminal } : {}),
    ...(updatedAt && !Number.isNaN(new Date(updatedAt).getTime()) ? { updatedAt: new Date(updatedAt).toISOString() } : {}),
  };
}

export function saveNextFlight(value: unknown, now = new Date().toISOString()): NextFlight | null {
  if (!isRecord(value)) return null;
  return prepareNextFlight({ ...value, updatedAt: now });
}

export function formatFlightCountdown(value: unknown, now = new Date()): string {
  const flight = prepareNextFlight(value);
  if (!flight) return '';

  const minutes = Math.ceil((new Date(flight.departureAt).getTime() - now.getTime()) / 60_000);
  if (minutes < -60) return 'Departed';
  if (minutes <= 0) return 'Departing now';
  if (minutes < 60) return `In ${minutes} min`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `In ${hours} hr ${remainder} min` : `In ${hours} hr`;
  }

  const days = Math.ceil(minutes / (24 * 60));
  return `In ${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Keeps older dashboard journal entries readable while rejecting malformed
 * records that could break the date rail or editor.
 */
export function prepareJournalEntries(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((entry): JournalEntry | null => {
      const id = typeof entry.id === 'string' ? entry.id : '';
      const date = typeof entry.date === 'string' ? entry.date : '';
      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      if (!id || !DATE_PATTERN.test(date) || !text) return null;

      const rawMood = typeof entry.mood === 'number' ? entry.mood : 3;
      return {
        ...entry,
        id,
        date,
        text,
        mood: Math.min(5, Math.max(1, Math.round(rawMood))),
        ...(typeof entry.createdAt === 'string' ? { createdAt: entry.createdAt } : {}),
        ...(typeof entry.updatedAt === 'string' ? { updatedAt: entry.updatedAt } : {}),
      } as JournalEntry;
    })
    .filter((entry): entry is JournalEntry => entry !== null)
    .sort((left, right) => {
      const byDate = left.date.localeCompare(right.date);
      if (byDate !== 0) return byDate;
      return (left.createdAt ?? left.id).localeCompare(right.createdAt ?? right.id);
    });
}

export function saveJournalEntry(
  value: unknown,
  draft: JournalEntry,
  now = new Date().toISOString(),
): JournalEntry[] {
  const entries = prepareJournalEntries(value);
  const existing = entries.find(entry => entry.id === draft.id);
  const next: JournalEntry = {
    ...existing,
    ...draft,
    text: draft.text.trim(),
    mood: Math.min(5, Math.max(1, Math.round(draft.mood))),
    createdAt: existing?.createdAt ?? draft.createdAt ?? now,
    updatedAt: now,
  };

  if (!next.text || !DATE_PATTERN.test(next.date)) return entries;
  return prepareJournalEntries([
    ...entries.filter(entry => entry.id !== next.id),
    next,
  ]);
}

export function removeJournalEntry(value: unknown, id: string): JournalEntry[] {
  return prepareJournalEntries(value).filter(entry => entry.id !== id);
}
