import { getAuthClient, getCurrentUser, hasConfig } from '../supabase';

export type CommunityProfile = {
  userId: string;
  displayName: string;
  homeTown: string;
  emirate: string;
  arrivedOn: string | null;
  status: 'landing_soon' | 'just_landed' | 'settled' | null;
  interests: string[];
  visibleInDirectory: boolean;
};

export type CommunityEvent = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  area: string;
  capacity: number | null;
  hidden: boolean;
  createdAt: string;
  attendees: Array<{ userId: string; response: 'going' | 'interested' }>;
};

export type CommunityAnswer = {
  id: string;
  questionId: string;
  authorId: string;
  parentAnswerId: string | null;
  body: string;
  accepted: boolean;
  hidden: boolean;
  createdAt: string;
};

export type CommunityQuestion = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  resolvedAnswerId: string | null;
  hidden: boolean;
  createdAt: string;
  answers: CommunityAnswer[];
};

export type CommunityClassified = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: 'AED';
  area: string;
  photoPath: string | null;
  photoUrl: string | null;
  soldAt: string | null;
  hidden: boolean;
  createdAt: string;
};

export type CommunityPoll = {
  id: string;
  authorId: string;
  question: string;
  endsAt: string | null;
  hidden: boolean;
  createdAt: string;
  options: Array<{ id: string; label: string; votes: number }>;
  myVote: string | null;
  totalVotes: number;
};

export type CommunityPlace = {
  id: string;
  authorId: string;
  name: string;
  category: string;
  description: string;
  area: string;
  emirate: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
  status: 'pending' | 'approved';
  hidden: boolean;
  createdAt: string;
};

export type CommunitySnapshot = {
  memberCount: number;
  me: CommunityProfile | null;
  profiles: CommunityProfile[];
  events: CommunityEvent[];
  questions: CommunityQuestion[];
  classifieds: CommunityClassified[];
  polls: CommunityPoll[];
  places: CommunityPlace[];
};

export type CommunityFeedItem = {
  id: string;
  kind: 'event' | 'question' | 'classified' | 'place';
  title: string;
  detail: string;
  authorId: string;
  createdAt: string;
};

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function displayCommunityName(profiles: CommunityProfile[], userId: string): string {
  if (getCurrentUser()?.id === userId) return 'You';
  return profiles.find((profile) => profile.userId === userId)?.displayName || 'Community member';
}

export function pollPercentage(votes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, votes) / total) * 100);
}

export function buildCommunityFeed(snapshot: CommunitySnapshot): CommunityFeedItem[] {
  return [
    ...snapshot.events.map((event): CommunityFeedItem => ({
      id: event.id, kind: 'event', title: event.title,
      detail: `${new Intl.DateTimeFormat('en-AE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(event.startsAt))}${event.area ? ` · ${event.area}` : ''}`,
      authorId: event.authorId, createdAt: event.createdAt,
    })),
    ...snapshot.questions.map((question): CommunityFeedItem => ({
      id: question.id, kind: 'question', title: question.title,
      detail: `${question.answers.length} answer${question.answers.length === 1 ? '' : 's'}`,
      authorId: question.authorId, createdAt: question.createdAt,
    })),
    ...snapshot.classifieds.map((item): CommunityFeedItem => ({
      id: item.id, kind: 'classified', title: item.title,
      detail: item.soldAt ? 'Sold' : `${item.currency} ${item.price.toLocaleString('en-AE', { maximumFractionDigits: 2 })}${item.area ? ` · ${item.area}` : ''}`,
      authorId: item.authorId, createdAt: item.createdAt,
    })),
    ...snapshot.places.map((place): CommunityFeedItem => ({
      id: place.id, kind: 'place', title: place.name,
      detail: `${place.category}${place.area ? ` · ${place.area}` : ''}`,
      authorId: place.authorId, createdAt: place.createdAt,
    })),
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function currentUserId(): string {
  const id = getCurrentUser()?.id;
  if (!hasConfig || !id) throw new Error('Sign in to use Community.');
  return id;
}

export async function communityMediaUrl(path: string | null): Promise<string | null> {
  if (!hasConfig || !path) return null;
  const { data, error } = await getAuthClient().storage.from('community-media').createSignedUrl(path, 3_600);
  return error ? null : data?.signedUrl ?? null;
}

export async function uploadCommunityPhoto(file: File): Promise<string> {
  const userId = currentUserId();
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await getAuthClient().storage.from('community-media').upload(path, file, {
    cacheControl: '3600', contentType: file.type, upsert: false,
  });
  if (error || !data) throw error ?? new Error('Could not upload that photo.');
  return data.path;
}

export async function loadCommunity(): Promise<CommunitySnapshot> {
  if (!hasConfig || !getCurrentUser()) return { memberCount: 0, me: null, profiles: [], events: [], questions: [], classifieds: [], polls: [], places: [] };
  const client = getAuthClient();
  const [memberCountResult, profileResult, eventResult, rsvpResult, questionResult, answerResult, classifiedResult, pollResult, optionResult, voteResult, placeResult] = await Promise.all([
    client.rpc('lifeos_community_member_count'),
    client.from('lifeos_profiles').select('user_id, display_name, home_town, emirate, arrived_on, status, interests, visible_in_directory').order('display_name'),
    client.from('lifeos_community_events').select('*').order('starts_at').limit(80),
    client.from('lifeos_event_rsvps').select('event_id, user_id, response'),
    client.from('lifeos_questions').select('*').order('created_at', { ascending: false }).limit(80),
    client.from('lifeos_answers').select('*').order('created_at').limit(400),
    client.from('lifeos_classifieds').select('*').order('created_at', { ascending: false }).limit(80),
    client.from('lifeos_polls').select('*').order('created_at', { ascending: false }).limit(40),
    client.from('lifeos_poll_options').select('*').order('sort_order'),
    client.from('lifeos_poll_votes').select('poll_id, option_id, user_id'),
    client.from('lifeos_community_places').select('*').order('created_at', { ascending: false }).limit(100),
  ]);
  const failure = [memberCountResult, profileResult, eventResult, rsvpResult, questionResult, answerResult, classifiedResult, pollResult, optionResult, voteResult, placeResult].find((result) => result.error);
  if (failure?.error) throw failure.error;

  const readableProfiles = (profileResult.data ?? []).map((source): CommunityProfile => {
    const row = source as Row;
    return {
      userId: text(row.user_id), displayName: text(row.display_name) || 'Community member',
      homeTown: text(row.home_town), emirate: text(row.emirate), arrivedOn: text(row.arrived_on) || null,
      status: (text(row.status) || null) as CommunityProfile['status'],
      interests: Array.isArray(row.interests) ? row.interests.filter((item): item is string => typeof item === 'string') : [],
      visibleInDirectory: row.visible_in_directory === true,
    };
  });
  const rsvps = (rsvpResult.data ?? []) as Row[];
  const answers = (answerResult.data ?? []).map((source): CommunityAnswer => {
    const row = source as Row;
    return {
      id: text(row.id), questionId: text(row.question_id), authorId: text(row.author_id),
      parentAnswerId: text(row.parent_answer_id) || null, body: text(row.body), accepted: row.accepted === true,
      hidden: row.hidden === true, createdAt: text(row.created_at),
    };
  });
  const votes = (voteResult.data ?? []) as Row[];
  const myId = getCurrentUser()?.id;
  const profiles = readableProfiles.filter((profile) => profile.visibleInDirectory);
  const classifiedRows = (classifiedResult.data ?? []) as Row[];
  const photoUrls = await Promise.all(classifiedRows.map((row) => communityMediaUrl(text(row.photo_path) || null)));

  return {
    memberCount: Number(memberCountResult.data ?? 0),
    me: readableProfiles.find((profile) => profile.userId === myId) ?? null,
    profiles,
    events: ((eventResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id), authorId: text(row.author_id), title: text(row.title), description: text(row.description),
      startsAt: text(row.starts_at), endsAt: text(row.ends_at) || null, location: text(row.location), area: text(row.area),
      capacity: numberOrNull(row.capacity), hidden: row.hidden === true, createdAt: text(row.created_at),
      attendees: rsvps.filter((rsvp) => rsvp.event_id === row.id).map((rsvp) => ({
        userId: text(rsvp.user_id), response: text(rsvp.response) as 'going' | 'interested',
      })),
    })),
    questions: ((questionResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id), authorId: text(row.author_id), title: text(row.title), body: text(row.body),
      resolvedAnswerId: text(row.resolved_answer_id) || null, hidden: row.hidden === true,
      createdAt: text(row.created_at), answers: answers.filter((answer) => answer.questionId === row.id),
    })),
    classifieds: classifiedRows.map((row, index) => ({
      id: text(row.id), authorId: text(row.author_id), title: text(row.title), description: text(row.description),
      category: text(row.category), price: numberOrNull(row.price) ?? 0, currency: 'AED', area: text(row.area),
      photoPath: text(row.photo_path) || null, photoUrl: photoUrls[index], soldAt: text(row.sold_at) || null,
      hidden: row.hidden === true, createdAt: text(row.created_at),
    })),
    polls: ((pollResult.data ?? []) as Row[]).map((row) => {
      const pollVotes = votes.filter((vote) => vote.poll_id === row.id);
      return {
        id: text(row.id), authorId: text(row.author_id), question: text(row.question), endsAt: text(row.ends_at) || null,
        hidden: row.hidden === true, createdAt: text(row.created_at), totalVotes: pollVotes.length,
        myVote: text(pollVotes.find((vote) => vote.user_id === myId)?.option_id) || null,
        options: ((optionResult.data ?? []) as Row[]).filter((option) => option.poll_id === row.id).map((option) => ({
          id: text(option.id), label: text(option.label), votes: pollVotes.filter((vote) => vote.option_id === option.id).length,
        })),
      };
    }),
    places: ((placeResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id), authorId: text(row.author_id), name: text(row.name), category: text(row.category),
      description: text(row.description), area: text(row.area), emirate: text(row.emirate), address: text(row.address),
      longitude: numberOrNull(row.longitude), latitude: numberOrNull(row.latitude),
      status: text(row.status) as 'pending' | 'approved', hidden: row.hidden === true, createdAt: text(row.created_at),
    })),
  };
}

export async function createCommunityEvent(input: { title: string; description?: string; startsAt: string; location?: string; area?: string; capacity?: number | null }): Promise<void> {
  const authorId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_community_events').insert({
    author_id: authorId, title: input.title.trim(), description: input.description?.trim() || '',
    starts_at: new Date(input.startsAt).toISOString(), location: input.location?.trim() || '',
    area: input.area?.trim() || '', capacity: input.capacity || null,
  });
  if (error) throw error;
}

export async function setEventRsvp(eventId: string, response: 'going' | 'interested' | null): Promise<void> {
  const userId = currentUserId();
  const query = getAuthClient().from('lifeos_event_rsvps');
  const result = response
    ? await query.upsert({ event_id: eventId, user_id: userId, response }, { onConflict: 'event_id,user_id' })
    : await query.delete().eq('event_id', eventId).eq('user_id', userId);
  if (result.error) throw result.error;
}

export async function askCommunity(title: string, body = ''): Promise<void> {
  const authorId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_questions').insert({ author_id: authorId, title: title.trim(), body: body.trim() });
  if (error) throw error;
}

export async function answerQuestion(questionId: string, body: string, parentAnswerId?: string | null): Promise<void> {
  const authorId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_answers').insert({
    question_id: questionId, author_id: authorId, parent_answer_id: parentAnswerId || null, body: body.trim(),
  });
  if (error) throw error;
}

export async function acceptAnswer(questionId: string, answerId: string): Promise<void> {
  currentUserId();
  const { data, error } = await getAuthClient().rpc('lifeos_accept_community_answer', {
    input_question_id: questionId, input_answer_id: answerId,
  });
  if (error || data !== true) throw error ?? new Error('Only the question author can accept an answer.');
}

export async function createClassified(input: { title: string; description?: string; category?: string; price: number; area?: string; photoPath?: string | null }): Promise<void> {
  const authorId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_classifieds').insert({
    author_id: authorId, title: input.title.trim(), description: input.description?.trim() || '',
    category: input.category?.trim() || 'Furniture', price: Math.round(input.price * 100) / 100,
    currency: 'AED', area: input.area?.trim() || '', photo_path: input.photoPath || null,
  });
  if (error) throw error;
}

export async function markClassifiedSold(id: string, sold: boolean): Promise<void> {
  currentUserId();
  const { error } = await getAuthClient().from('lifeos_classifieds').update({ sold_at: sold ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
}

export async function createPoll(question: string, options: string[]): Promise<void> {
  const authorId = currentUserId();
  const labels = options.map((option) => option.trim()).filter(Boolean).slice(0, 6);
  if (labels.length < 2) throw new Error('Add at least two poll choices.');
  const poll = await getAuthClient().from('lifeos_polls').insert({ author_id: authorId, question: question.trim() }).select('id').single();
  if (poll.error || !poll.data) throw poll.error ?? new Error('Could not create the poll.');
  const { error } = await getAuthClient().from('lifeos_poll_options').insert(labels.map((label, index) => ({
    poll_id: poll.data.id, author_id: authorId, label, sort_order: index,
  })));
  if (error) {
    await getAuthClient().from('lifeos_polls').delete().eq('id', poll.data.id);
    throw error;
  }
}

export async function voteInPoll(pollId: string, optionId: string): Promise<void> {
  const userId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_poll_votes').upsert({
    poll_id: pollId, option_id: optionId, user_id: userId,
  }, { onConflict: 'poll_id,user_id' });
  if (error) throw error;
}

export async function createCommunityPlace(input: { name: string; category?: string; description?: string; area?: string; address?: string; longitude?: number | null; latitude?: number | null }): Promise<void> {
  const authorId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_community_places').insert({
    author_id: authorId, name: input.name.trim(), category: input.category?.trim() || 'community',
    description: input.description?.trim() || '', area: input.area?.trim() || '', address: input.address?.trim() || '',
    longitude: input.longitude ?? null, latitude: input.latitude ?? null, status: 'pending',
  });
  if (error) throw error;
}

export async function reportCommunityContent(targetTable: 'places' | 'events' | 'questions' | 'answers' | 'classifieds' | 'polls', targetId: string, reason: string): Promise<void> {
  const reporterId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_reports').insert({
    target_table: targetTable, target_id: targetId, reason: reason.trim(), reporter_id: reporterId,
  });
  if (error) throw error;
}

export function subscribeCommunity(onChange: () => void): () => void {
  if (!hasConfig || !getCurrentUser()) return () => {};
  const client = getAuthClient();
  let timer: number | undefined;
  const refresh = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 100);
  };
  const channel = [
    'lifeos_community_places', 'lifeos_community_events', 'lifeos_event_rsvps', 'lifeos_questions',
    'lifeos_answers', 'lifeos_classifieds', 'lifeos_polls', 'lifeos_poll_options', 'lifeos_poll_votes',
  ].reduce((next, table) => next.on('postgres_changes', { event: '*', schema: 'public', table }, refresh), client.channel('lifeos-community')).subscribe();
  return () => {
    if (timer) window.clearTimeout(timer);
    void client.removeChannel(channel);
  };
}
