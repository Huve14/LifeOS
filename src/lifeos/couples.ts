import { getAuthClient, getCurrentUser, hasConfig } from '../supabase';
import { shiftDateKey } from './closeness';
import type { CoupleDateKind, ThoughtGesture } from './closeness';

export type CoupleMember = {
  userId: string;
  displayName: string;
  timeZone: string;
  joinedAt: string;
};

export type CoupleSnapshot = {
  coupleId: number;
  name: string;
  members: CoupleMember[];
  paired: boolean;
};

export type CoupleInvite = {
  code: string;
  expiresAt: string;
  coupleId: number;
};

export type SharedNoteKind = 'note' | 'gratitude' | 'celebration';

export type SharedNote = {
  id: number;
  couple_id: number;
  author_id: string | null;
  kind: SharedNoteKind;
  body: string;
  created_at: string;
  updated_at: string;
};

export type SharedReaction = {
  note_id: number;
  couple_id: number;
  user_id: string;
  emoji: 'heart' | 'hug' | 'smile' | 'spark';
  created_at: string;
};

export type CoupleMood = 'bright' | 'steady' | 'soft' | 'tired' | 'stretched';

export type CoupleCheckIn = {
  couple_id: number;
  user_id: string;
  checkin_date: string;
  mood: CoupleMood;
  energy: number;
  need: string;
  updated_at: string;
};

export type CoupleIdeaCategory = 'date' | 'home' | 'travel' | 'kindness';
export type CoupleIdeaStatus = 'idea' | 'picked' | 'done';

export type CoupleIdea = {
  id: number;
  couple_id: number;
  added_by: string | null;
  title: string;
  category: CoupleIdeaCategory;
  status: CoupleIdeaStatus;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
};

export type CouplePromptAnswer = {
  couple_id: number;
  user_id: string;
  answer_date: string;
  prompt_key: string;
  answer: string;
  updated_at: string;
};

export type CoupleThought = {
  id: number;
  couple_id: number;
  sender_id: string;
  gesture: ThoughtGesture;
  created_at: string;
  seen_at: string | null;
};

export type CoupleDate = {
  id: number;
  couple_id: number;
  created_by: string | null;
  kind: CoupleDateKind;
  label: string;
  happens_on: string;
  repeats_annually: boolean;
  created_at: string;
  updated_at: string;
};

export type CoupleSharedData = {
  notes: SharedNote[];
  reactions: SharedReaction[];
  /** Today's check-ins, the pair the Today panel renders. */
  checkIns: CoupleCheckIn[];
  /** The last PULSE_WINDOW_DAYS of check-ins, for the rhythm strip. */
  checkInHistory: CoupleCheckIn[];
  ideas: CoupleIdea[];
  promptAnswers: CouplePromptAnswer[];
  thoughts: CoupleThought[];
  dates: CoupleDate[];
};

/** How far back the pulse rhythm looks. Matches the strip the space renders. */
export const PULSE_WINDOW_DAYS = 14;

/** How many recent thoughts to keep on screen. */
export const THOUGHT_FEED_LIMIT = 20;

export type CoupleSyncStatus = 'connecting' | 'live' | 'offline' | 'error';

type SnapshotRow = {
  couple_id: number;
  couple_name: string;
  member_user_id: string;
  member_display_name: string;
  member_time_zone: string;
  member_joined_at: string;
};

export const COUPLE_PROMPTS = [
  'What small moment with me made you smile recently?',
  'What would make this week feel lighter for us?',
  'Where should we disappear to for one unplanned afternoon?',
  'What is one thing you feel proud of in us?',
  'Which ordinary ritual should become our little tradition?',
  'What do you need more of from me today: listening, help, space, or affection?',
  'What memory of us would you happily relive tonight?',
  'What is one future plan that feels exciting rather than stressful?',
  'What have I done lately that made you feel understood?',
  'If tonight had no obligations, what would we do together?',
] as const;

export function normalizePairCode(value: unknown): string {
  return typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 12)
    : '';
}

export function formatPairCode(value: unknown): string {
  const code = normalizePairCode(value);
  return code.length > 6 ? `${code.slice(0, 6)} ${code.slice(6)}` : code;
}

export function buildPairInviteLink(code: string, origin?: string): string {
  const normalized = normalizePairCode(code);
  if (!normalized) return '';
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://life-os-hs.vercel.app');
  const url = new URL('/', base);
  url.searchParams.set('pair', normalized);
  return url.toString();
}

export function cleanSharedText(value: unknown, maxLength = 800): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, maxLength);
}

export function localDateKey(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dailyPromptForDate(dateKey: string): { key: string; text: string } {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : localDateKey();
  const hash = [...normalized].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
  const index = hash % COUPLE_PROMPTS.length;
  return { key: `daily-${index}`, text: COUPLE_PROMPTS[index] };
}

export function myUserId(): string | null {
  return getCurrentUser()?.id ?? null;
}

export async function loadCoupleSnapshot(): Promise<CoupleSnapshot | null> {
  if (!hasConfig || !myUserId()) return null;
  const { data, error } = await getAuthClient().rpc('lifeos_couple_snapshot');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SnapshotRow[];
  if (rows.length === 0) return null;
  return {
    coupleId: rows[0].couple_id,
    name: rows[0].couple_name || 'Our space',
    members: rows.map((row) => ({
      userId: row.member_user_id,
      displayName: row.member_display_name || 'Partner',
      timeZone: row.member_time_zone || 'UTC',
      joinedAt: row.member_joined_at,
    })),
    paired: rows.length === 2,
  };
}

export async function createInvite(): Promise<CoupleInvite> {
  if (!hasConfig || !myUserId()) throw new Error('Sign in to create an invitation.');
  const { data, error } = await getAuthClient().rpc('lifeos_create_couple_invite');
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invite_code) throw new Error('The invitation could not be created.');
  return {
    code: row.invite_code,
    expiresAt: row.invite_expires_at,
    coupleId: row.invite_couple_id,
  };
}

export async function loadActiveInvite(coupleId: number): Promise<CoupleInvite | null> {
  if (!hasConfig || !myUserId()) return null;
  const { data, error } = await getAuthClient()
    .from('lifeos_couple_invites')
    .select('code, expires_at, couple_id')
    .eq('couple_id', coupleId)
    .is('redeemed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { code: data.code, expiresAt: data.expires_at, coupleId: data.couple_id };
}

export async function joinCouple(code: string): Promise<number> {
  const normalized = normalizePairCode(code);
  if (normalized.length !== 12) throw new Error('Enter the complete 12-character code.');
  const { data, error } = await getAuthClient().rpc('lifeos_join_couple', { input_code: normalized });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function leaveCouple(): Promise<boolean> {
  const { data, error } = await getAuthClient().rpc('lifeos_leave_couple');
  if (error) throw new Error(error.message);
  return data === true;
}

type QueryResult<T> = { data: T[] | null; error: { code?: string; message: string } | null };

/**
 * Whether a PostgREST error means "this table does not exist yet".
 *
 * The closeness tables arrive in a migration the deployment has to run, and a
 * client can reach production before that happens. Treating a missing relation
 * as "no rows" keeps the rest of the couple space working instead of taking
 * the whole screen down over a feature nobody has enabled yet. Every other
 * error still surfaces — a permission problem must not look like an empty list.
 */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') return true;
  const message = String(error.message ?? '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find the table');
}

/** Rows from a table that may not have been migrated in yet. */
function optionalRows<T>(result: QueryResult<T>): T[] {
  if (result.error) {
    if (isMissingRelation(result.error)) return [];
    throw new Error(result.error.message);
  }
  return result.data ?? [];
}

export async function loadSharedData(coupleId: number, dateKey = localDateKey()): Promise<CoupleSharedData> {
  const client = getAuthClient();
  const windowStart = shiftDateKey(dateKey, -(PULSE_WINDOW_DAYS - 1));
  const [notes, reactions, checkIns, ideas, promptAnswers, thoughts, dates] = await Promise.all([
    client.from('lifeos_couple_notes')
      .select('id, couple_id, author_id, kind, body, created_at, updated_at')
      .eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(80),
    client.from('lifeos_couple_reactions')
      .select('note_id, couple_id, user_id, emoji, created_at')
      .eq('couple_id', coupleId).order('created_at', { ascending: true }).limit(400),
    // A fortnight rather than a single day: the rhythm strip needs the history
    // and today's pair is simply the last entry in it, so this stays one query.
    client.from('lifeos_couple_checkins')
      .select('couple_id, user_id, checkin_date, mood, energy, need, updated_at')
      .eq('couple_id', coupleId)
      .gte('checkin_date', windowStart)
      .lte('checkin_date', dateKey),
    client.from('lifeos_couple_ideas')
      .select('id, couple_id, added_by, title, category, status, scheduled_for, created_at, updated_at')
      .eq('couple_id', coupleId).order('updated_at', { ascending: false }).limit(80),
    client.from('lifeos_couple_prompt_answers')
      .select('couple_id, user_id, answer_date, prompt_key, answer, updated_at')
      .eq('couple_id', coupleId).eq('answer_date', dateKey),
    client.from('lifeos_couple_thoughts')
      .select('id, couple_id, sender_id, gesture, created_at, seen_at')
      .eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(THOUGHT_FEED_LIMIT),
    client.from('lifeos_couple_dates')
      .select('id, couple_id, created_by, kind, label, happens_on, repeats_annually, created_at, updated_at')
      .eq('couple_id', coupleId).order('happens_on', { ascending: true }).limit(60),
  ]);

  const firstError = [notes.error, reactions.error, checkIns.error, ideas.error, promptAnswers.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);
  const checkInHistory = (checkIns.data ?? []) as CoupleCheckIn[];
  return {
    notes: (notes.data ?? []) as SharedNote[],
    reactions: (reactions.data ?? []) as SharedReaction[],
    checkIns: checkInHistory.filter((item) => item.checkin_date === dateKey),
    checkInHistory,
    ideas: (ideas.data ?? []) as CoupleIdea[],
    promptAnswers: (promptAnswers.data ?? []) as CouplePromptAnswer[],
    thoughts: optionalRows(thoughts as QueryResult<CoupleThought>),
    dates: optionalRows(dates as QueryResult<CoupleDate>),
  };
}

export async function addSharedNote(coupleId: number, body: string, kind: SharedNoteKind = 'note'): Promise<void> {
  const authorId = myUserId();
  const cleaned = cleanSharedText(body);
  if (!authorId) throw new Error('Sign in to share a note.');
  if (!cleaned) throw new Error('Write something before sharing it.');
  const { error } = await getAuthClient().from('lifeos_couple_notes').insert({
    couple_id: coupleId,
    author_id: authorId,
    body: cleaned,
    kind,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSharedNote(noteId: number): Promise<void> {
  const { error } = await getAuthClient().from('lifeos_couple_notes').delete().eq('id', noteId);
  if (error) throw new Error(error.message);
}

export async function setReaction(
  coupleId: number,
  noteId: number,
  emoji: SharedReaction['emoji'],
  active: boolean,
): Promise<void> {
  const userId = myUserId();
  if (!userId) throw new Error('Sign in to react.');
  const query = active
    ? getAuthClient().from('lifeos_couple_reactions').upsert(
      { couple_id: coupleId, note_id: noteId, user_id: userId, emoji },
      { onConflict: 'note_id,user_id,emoji' },
    )
    : getAuthClient().from('lifeos_couple_reactions').delete()
      .eq('note_id', noteId).eq('user_id', userId).eq('emoji', emoji);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function saveCheckIn(options: {
  coupleId: number;
  dateKey?: string;
  mood: CoupleMood;
  energy: number;
  need: string;
}): Promise<void> {
  const userId = myUserId();
  if (!userId) throw new Error('Sign in to check in.');
  const { error } = await getAuthClient().from('lifeos_couple_checkins').upsert({
    couple_id: options.coupleId,
    user_id: userId,
    checkin_date: options.dateKey || localDateKey(),
    mood: options.mood,
    energy: Math.max(1, Math.min(5, Math.round(options.energy))),
    need: cleanSharedText(options.need, 240),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'couple_id,user_id,checkin_date' });
  if (error) throw new Error(error.message);
}

export async function savePromptAnswer(coupleId: number, answer: string, dateKey = localDateKey()): Promise<void> {
  const userId = myUserId();
  const cleaned = cleanSharedText(answer, 600);
  if (!userId) throw new Error('Sign in to answer.');
  if (!cleaned) throw new Error('Add an answer first.');
  const prompt = dailyPromptForDate(dateKey);
  const { error } = await getAuthClient().from('lifeos_couple_prompt_answers').upsert({
    couple_id: coupleId,
    user_id: userId,
    answer_date: dateKey,
    prompt_key: prompt.key,
    answer: cleaned,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'couple_id,user_id,answer_date' });
  if (error) throw new Error(error.message);
}

export async function addIdea(
  coupleId: number,
  title: string,
  category: CoupleIdeaCategory,
): Promise<void> {
  const userId = myUserId();
  const cleaned = cleanSharedText(title, 160);
  if (!userId) throw new Error('Sign in to add an idea.');
  if (!cleaned) throw new Error('Add an idea first.');
  const { error } = await getAuthClient().from('lifeos_couple_ideas').insert({
    couple_id: coupleId,
    added_by: userId,
    title: cleaned,
    category,
  });
  if (error) throw new Error(error.message);
}

export async function updateIdea(
  ideaId: number,
  patch: { status?: CoupleIdeaStatus; scheduled_for?: string | null },
): Promise<void> {
  const { error } = await getAuthClient().from('lifeos_couple_ideas').update({
    ...patch,
    updated_at: new Date().toISOString(),
  }).eq('id', ideaId);
  if (error) throw new Error(error.message);
}

export async function deleteIdea(ideaId: number): Promise<void> {
  const { error } = await getAuthClient().from('lifeos_couple_ideas').delete().eq('id', ideaId);
  if (error) throw new Error(error.message);
}

/**
 * The couple's shared dates on their own, without loading a snapshot first.
 *
 * RLS already scopes lifeos_couple_dates to the caller's couple, so Home can
 * ask for "my dates" in a single round trip. Home must never break over an
 * optional card, so every failure — no couple, no migration, no network —
 * returns an empty list rather than throwing.
 */
export async function loadMyCoupleDates(): Promise<CoupleDate[]> {
  if (!hasConfig || !myUserId()) return [];
  try {
    const { data, error } = await getAuthClient()
      .from('lifeos_couple_dates')
      .select('id, couple_id, created_by, kind, label, happens_on, repeats_annually, created_at, updated_at')
      .order('happens_on', { ascending: true })
      .limit(60);
    if (error) {
      if (!isMissingRelation(error)) console.warn('couple dates:', error.message);
      return [];
    }
    return (data ?? []) as CoupleDate[];
  } catch {
    return [];
  }
}

/**
 * The message a failed closeness write should show.
 *
 * A missing table means the deployment has not run the migration yet, which is
 * an operator problem rather than something the person tapping can fix, so say
 * that plainly instead of surfacing a PostgREST code.
 */
function closenessError(error: { code?: string; message: string }, action: string): Error {
  if (isMissingRelation(error)) {
    return new Error(`${action} is not switched on for this space yet.`);
  }
  return new Error(error.message);
}

/**
 * Sends a wordless gesture. The database enforces the cooldown, so a second
 * device or a stale client cannot get around it; the UI countdown is only
 * there to make the wait legible.
 */
export async function sendThought(coupleId: number, gesture: ThoughtGesture): Promise<void> {
  const senderId = myUserId();
  if (!senderId) throw new Error('Sign in to send a thought.');
  const { error } = await getAuthClient().from('lifeos_couple_thoughts').insert({
    couple_id: coupleId,
    sender_id: senderId,
    gesture,
  });
  if (error) throw closenessError(error, 'Sending a thought');
}

/**
 * Marks everything they sent as seen. Only ever touches the partner's rows —
 * the policy would refuse your own, and "seen" means nothing if the sender can
 * set it.
 */
export async function markThoughtsSeen(coupleId: number): Promise<void> {
  const userId = myUserId();
  if (!userId) return;
  const { error } = await getAuthClient()
    .from('lifeos_couple_thoughts')
    .update({ seen_at: new Date().toISOString() })
    .eq('couple_id', coupleId)
    .neq('sender_id', userId)
    .is('seen_at', null);
  // Nothing on screen depends on this succeeding, so a failure stays quiet.
  if (error && !isMissingRelation(error)) console.warn('couple thoughts seen:', error.message);
}

export async function addCoupleDate(options: {
  coupleId: number;
  kind: CoupleDateKind;
  label: string;
  happensOn: string;
  repeatsAnnually: boolean;
}): Promise<void> {
  const userId = myUserId();
  const label = cleanSharedText(options.label, 80);
  if (!userId) throw new Error('Sign in to add a date.');
  if (!label) throw new Error('Give the date a name first.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.happensOn)) throw new Error('Choose a date first.');
  const { error } = await getAuthClient().from('lifeos_couple_dates').insert({
    couple_id: options.coupleId,
    created_by: userId,
    kind: options.kind,
    label,
    happens_on: options.happensOn,
    repeats_annually: options.repeatsAnnually,
  });
  if (error) throw closenessError(error, 'Shared dates');
}

/** Either partner may correct any shared date; the policy allows both. */
export async function updateCoupleDate(
  dateId: number,
  patch: { label?: string; happens_on?: string; kind?: CoupleDateKind; repeats_annually?: boolean },
): Promise<void> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) {
    const label = cleanSharedText(patch.label, 80);
    if (!label) throw new Error('Give the date a name first.');
    next.label = label;
  }
  if (patch.happens_on !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.happens_on)) throw new Error('Choose a date first.');
    next.happens_on = patch.happens_on;
  }
  if (patch.kind !== undefined) next.kind = patch.kind;
  if (patch.repeats_annually !== undefined) next.repeats_annually = patch.repeats_annually;

  const { error } = await getAuthClient().from('lifeos_couple_dates').update(next).eq('id', dateId);
  if (error) throw closenessError(error, 'Shared dates');
}

export async function deleteCoupleDate(dateId: number): Promise<void> {
  const { error } = await getAuthClient().from('lifeos_couple_dates').delete().eq('id', dateId);
  if (error) throw closenessError(error, 'Shared dates');
}

export function subscribeCouple(
  coupleId: number,
  onChange: () => void,
  onStatus?: (status: CoupleSyncStatus) => void,
): () => void {
  let active = true;
  let refreshTimer: number | undefined;
  const client = getAuthClient();
  const refresh = () => {
    if (!active) return;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(onChange, 80);
  };
  const channel = client
    .channel(`lifeos-couple-${coupleId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_members', filter: `couple_id=eq.${coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_notes', filter: `couple_id=eq.${coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_reactions', filter: `couple_id=eq.${coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_checkins', filter: `couple_id=eq.${coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_ideas', filter: `couple_id=eq.${coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_prompt_answers', filter: `couple_id=eq.${coupleId}` }, refresh)
    // Present only once the closeness migration has run. Subscribing to a
    // table that does not exist is inert rather than fatal, so this needs no
    // feature check of its own.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_thoughts', filter: `couple_id=eq.${coupleId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lifeos_couple_dates', filter: `couple_id=eq.${coupleId}` }, refresh)
    .subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') onStatus?.('live');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus?.('error');
      else if (status === 'CLOSED') onStatus?.('offline');
      else onStatus?.('connecting');
    });

  return () => {
    active = false;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    void client.removeChannel(channel);
  };
}
