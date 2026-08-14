import { getAuthClient, getCurrentUser, hasConfig } from '../supabase';

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

export type CoupleSharedData = {
  notes: SharedNote[];
  reactions: SharedReaction[];
  checkIns: CoupleCheckIn[];
  ideas: CoupleIdea[];
  promptAnswers: CouplePromptAnswer[];
};

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

export async function loadSharedData(coupleId: number, dateKey = localDateKey()): Promise<CoupleSharedData> {
  const client = getAuthClient();
  const [notes, reactions, checkIns, ideas, promptAnswers] = await Promise.all([
    client.from('lifeos_couple_notes')
      .select('id, couple_id, author_id, kind, body, created_at, updated_at')
      .eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(80),
    client.from('lifeos_couple_reactions')
      .select('note_id, couple_id, user_id, emoji, created_at')
      .eq('couple_id', coupleId).order('created_at', { ascending: true }).limit(400),
    client.from('lifeos_couple_checkins')
      .select('couple_id, user_id, checkin_date, mood, energy, need, updated_at')
      .eq('couple_id', coupleId).eq('checkin_date', dateKey),
    client.from('lifeos_couple_ideas')
      .select('id, couple_id, added_by, title, category, status, scheduled_for, created_at, updated_at')
      .eq('couple_id', coupleId).order('updated_at', { ascending: false }).limit(80),
    client.from('lifeos_couple_prompt_answers')
      .select('couple_id, user_id, answer_date, prompt_key, answer, updated_at')
      .eq('couple_id', coupleId).eq('answer_date', dateKey),
  ]);

  const firstError = [notes.error, reactions.error, checkIns.error, ideas.error, promptAnswers.error].find(Boolean);
  if (firstError) throw new Error(firstError.message);
  return {
    notes: (notes.data ?? []) as SharedNote[],
    reactions: (reactions.data ?? []) as SharedReaction[],
    checkIns: (checkIns.data ?? []) as CoupleCheckIn[],
    ideas: (ideas.data ?? []) as CoupleIdea[],
    promptAnswers: (promptAnswers.data ?? []) as CouplePromptAnswer[],
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
