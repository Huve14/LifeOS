export type JournalEntry = {
  id: string;
  date: string;
  text: string;
  mood: number;
  createdAt?: string;
  updatedAt?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
