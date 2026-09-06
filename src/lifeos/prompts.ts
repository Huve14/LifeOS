// Daily prompt data layer.
//
// One question a day, the same one for both of us, and neither answer is
// readable until both have been submitted. That gate is enforced in RLS rather
// than in the UI: until you have answered, the other person's row is not sent
// to your client at all.
//
// "Today" has to mean one thing for two people in different zones, so the
// prompt day is anchored to Abu Dhabi. In Johannesburg that means the new
// question arrives at 22:00 the evening before, which is the less disruptive
// of the two options.

import { getAuthClient, hasConfig } from '../supabase';
import { currentUserId } from './spaces';
import {
  entryBlob,
  putEntry,
  updateProgress,
  type OutboxEntry,
  type PromptAnswerEntry,
} from './outbox';
import { baseMime, voicePath } from './recording';
import { flushOutbox, registerSender, subscribeSent } from './sync';
import { ABU_DHABI, dayKey } from './time';
import { removeFiles, signedUrl, uploadFile } from './upload';

/**
 * "Today" has to mean one thing for two people in different zones, so the
 * prompt day is anchored to a single zone that both devices agree on. It is
 * set from the space, picking the member whose id sorts first so both sides
 * compute the same anchor without asking the server. Solo, it is your own.
 */
let promptZone = ABU_DHABI;

export function setPromptZone(zone: string): void {
  if (zone) promptZone = zone;
}

/** Back to the default anchor, for when there is no space to take one from. */
export function resetPromptZone(): void {
  promptZone = ABU_DHABI;
}

export function getPromptZone(): string {
  return promptZone;
}
export const VOICE_BUCKET = 'voice-notes';
export const PROMPT_COUNT = 365;

/** Day zero of the rotation. Kept here so the cycle is reproducible. */
export const PROMPT_EPOCH = '2026-01-01';

export type Prompt = {
  day_index: number;
  text: string;
};

export type PromptAnswer = {
  id: string;
  prompt_date: string;
  author_id: string;
  client_id: string;
  body: string;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

/** Which dates have any answer, and from whom. Content is not included. */
export type AnsweredDate = {
  prompt_date: string;
  mine: boolean;
  theirs: boolean;
};

// ---------- Date to prompt ----------

/** The calendar date the prompt belongs to, in the anchor zone. */
export function promptDateFor(now: Date = new Date()): string {
  return dayKey(now, promptZone);
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/**
 * Deterministic, so both devices land on the same question without asking the
 * server which one it is. Handles dates before the epoch too, which matters
 * only if the clock is wrong but costs nothing to get right.
 */
export function promptIndexFor(promptDate: string): number {
  const offset = daysBetween(PROMPT_EPOCH, promptDate);
  return ((offset % PROMPT_COUNT) + PROMPT_COUNT) % PROMPT_COUNT;
}

// ---------- Prompts ----------

const PROMPT_CACHE_KEY = 'lifeos:prompts';

let promptCache: Prompt[] | null = null;

function readCachedPrompts(): Prompt[] | null {
  try {
    const raw = window.localStorage.getItem(PROMPT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Prompt[];
    return Array.isArray(parsed) && parsed.length === PROMPT_COUNT ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * All 365 at once, cached locally. It is a few tens of kilobytes, and holding
 * the whole set means the archive and today's question both work offline.
 */
export async function loadPrompts(): Promise<Prompt[]> {
  if (promptCache) return promptCache;

  const cached = readCachedPrompts();
  if (cached) {
    promptCache = cached;
    return cached;
  }

  if (!hasConfig) return [];

  const { data, error } = await getAuthClient()
    .from('lifeos_prompts')
    .select('day_index, text')
    .order('day_index', { ascending: true });

  if (error || !data) return [];

  promptCache = data as Prompt[];
  try {
    window.localStorage.setItem(PROMPT_CACHE_KEY, JSON.stringify(promptCache));
  } catch {
    // Cache is an optimisation. Losing it is not an error.
  }
  return promptCache;
}

export function promptForDate(prompts: Prompt[], promptDate: string): Prompt | null {
  if (prompts.length === 0) return null;
  const index = promptIndexFor(promptDate);
  return prompts.find((p) => p.day_index === index) ?? null;
}

// ---------- Answers ----------

const ANSWER_COLUMNS =
  'id, prompt_date, author_id, client_id, body, audio_path, audio_duration_seconds, created_at, updated_at';

/**
 * Returns the caller's own answers always, and the other person's only for
 * dates the caller has answered. The filtering happens in the policy, so an
 * unrevealed answer never reaches this device.
 */
export async function loadAnswers(promptDates?: string[]): Promise<PromptAnswer[]> {
  if (!hasConfig) return [];

  let query = getAuthClient().from('lifeos_prompt_answers').select(ANSWER_COLUMNS);
  if (promptDates && promptDates.length > 0) {
    query = query.in('prompt_date', promptDates);
  }

  const { data, error } = await query.order('prompt_date', { ascending: false });
  if (error || !data) return [];
  return data as PromptAnswer[];
}

/**
 * The archive index. Says which days have answers and whether each side has
 * submitted, without leaking any text before the reveal.
 */
export async function loadAnsweredDates(): Promise<AnsweredDate[]> {
  if (!hasConfig) return [];
  const { data, error } = await getAuthClient().rpc('lifeos_answered_dates');
  if (error || !data) return [];
  return data as AnsweredDate[];
}

export function bothAnswered(status: AnsweredDate | undefined): boolean {
  return Boolean(status?.mine && status?.theirs);
}

export type QueueAnswerArgs = {
  promptDate: string;
  body: string;
  audio: Blob | null;
  audioDurationSeconds: number | null;
  mimeType: string | null;
  clientId: string;
};

/** Queue an answer. Local first, same as a video note. */
export async function queueAnswer(args: QueueAnswerArgs): Promise<PromptAnswerEntry> {
  const bytes = await args.audio?.arrayBuffer() ?? null;

  const entry: PromptAnswerEntry = {
    id: args.clientId,
    kind: 'prompt-answer',
    status: 'queued',
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    progress: 0,
    bytes,
    size: args.audio?.size ?? 0,
    meta: {
      promptDate: args.promptDate,
      body: args.body,
      mimeType: args.mimeType,
      durationSeconds: args.audioDurationSeconds,
    },
  };

  await putEntry(entry);
  void flushOutbox();
  return entry;
}

async function sendEntry(queued: OutboxEntry): Promise<void> {
  const entry = queued as PromptAnswerEntry;
  const authorId = currentUserId();
  if (!authorId) throw new Error('Not signed in');

  let audioPath: string | null = null;
  const audio = entryBlob(entry);

  if (audio && entry.meta.mimeType) {
    audioPath = voicePath(authorId, entry.id, entry.meta.mimeType);
    await uploadFile({
      bucket: VOICE_BUCKET,
      path: audioPath,
      blob: audio,
      contentType: baseMime(entry.meta.mimeType),
      onProgress: (fraction) => {
        void updateProgress(entry.id, fraction * 0.9);
      },
    });
  }

  // One answer per person per day. Resubmitting edits in place rather than
  // adding a second row, which is also what makes a retry safe.
  const { error } = await getAuthClient()
    .from('lifeos_prompt_answers')
    .upsert(
      {
        prompt_date: entry.meta.promptDate,
        author_id: authorId,
        client_id: entry.id,
        body: entry.meta.body,
        audio_path: audioPath,
        audio_duration_seconds: entry.meta.durationSeconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'prompt_date,author_id' },
    );

  if (error) throw error;
}

registerSender('prompt-answer', sendEntry);

export function voiceUrl(path: string | null): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  return signedUrl(VOICE_BUCKET, path);
}

export async function deleteAnswer(answer: PromptAnswer): Promise<boolean> {
  if (!hasConfig) return false;
  const { error } = await getAuthClient()
    .from('lifeos_prompt_answers')
    .delete()
    .eq('id', answer.id);
  if (error) return false;

  if (answer.audio_path) await removeFiles(VOICE_BUCKET, [answer.audio_path]);
  notifyPromptsChanged();
  return true;
}

// ---------- Change notification ----------

const PROMPTS_CHANGED = 'lifeos:prompts-changed';

export function notifyPromptsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROMPTS_CHANGED));
}

/**
 * Realtime matters more here than elsewhere: the moment the other person
 * submits, the reveal should happen without either of us reloading.
 */
export function subscribePromptAnswers(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(PROMPTS_CHANGED, onChange);
  const unsubscribeSent = subscribeSent('prompt-answer', onChange);

  let removeChannel = () => {};
  if (hasConfig) {
    const client = getAuthClient();
    const channel = client
      .channel('lifeos-prompt-answers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lifeos_prompt_answers' },
        () => onChange(),
      )
      .subscribe();
    removeChannel = () => {
      void client.removeChannel(channel);
    };
  }

  return () => {
    window.removeEventListener(PROMPTS_CHANGED, onChange);
    unsubscribeSent();
    removeChannel();
  };
}

/** Notify on the prompt rollover so an open app picks up the new question. */
export function scheduleDayRollover(onRollover: () => void): () => void {
  let current = promptDateFor();
  const timer = setInterval(() => {
    const next = promptDateFor();
    if (next !== current) {
      current = next;
      onRollover();
    }
  }, 60_000);
  return () => clearInterval(timer);
}
