// Spaces: who you are, and who you share with.
//
// Replaces the two-person allowlist. Every account gets a profile and a space
// of its own at signup, so single user mode is a space of one and needs no
// special handling. Pairing merges two spaces into one.
//
// Nothing here decides access. The policies do. These are reads of state the
// server has already agreed the caller may see.

import { getAuthClient, hasConfig } from '../supabase';
import { setZones } from './time';
import { setPromptZone } from './prompts';

export type Profile = {
  user_id: string;
  display_name: string;
  time_zone: string;
  home_town?: string | null;
  emirate?: string | null;
  arrived_on?: string | null;
  status?: 'landing_soon' | 'just_landed' | 'settled' | null;
  interests?: string[];
  visible_in_directory?: boolean;
  employer_name?: string | null;
};

export type Space = {
  id: string;
  name: string;
};

export type SpaceState = {
  space: Space | null;
  me: Profile | null;
  members: Profile[];
  /** True once a second person is in the space. */
  paired: boolean;
};

const EMPTY: SpaceState = { space: null, me: null, members: [], paired: false };

let cache: SpaceState | null = null;

export function currentUserId(): string | null {
  return window.__suvedaUser?.id ?? null;
}

/** The reader's own zone, used when they have not set one. */
function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function loadSpace(force = false): Promise<SpaceState> {
  if (cache && !force) return cache;
  if (!hasConfig || !currentUserId()) return EMPTY;

  const client = getAuthClient();

  const [{ data: members }, { data: profiles }] = await Promise.all([
    client.from('lifeos_space_members').select('space_id, user_id'),
    client.from('lifeos_profiles').select('user_id, display_name, time_zone'),
  ]);

  if (!members || members.length === 0) return EMPTY;

  const spaceId = members[0].space_id as string;
  const { data: spaceRow } = await client
    .from('lifeos_spaces')
    .select('id, name')
    .eq('id', spaceId)
    .maybeSingle();

  cache = createSpaceState(
    (spaceRow as Space) ?? { id: spaceId, name: '' },
    (profiles ?? []) as Profile[],
    members.map((member) => member.user_id as string),
    currentUserId(),
  );
  applyZones(cache);
  return cache;
}

/** Build a stable, de-duplicated member view from rows already allowed by RLS. */
export function createSpaceState(
  space: Space | null,
  profiles: Profile[],
  memberIds: string[],
  meId: string | null,
): SpaceState {
  const ids = new Set(memberIds);
  const members = profiles
    .filter((profile) => ids.has(profile.user_id))
    .filter((profile, index, all) => all.findIndex((candidate) => candidate.user_id === profile.user_id) === index)
    .sort((left, right) => left.user_id.localeCompare(right.user_id));

  return {
    space,
    me: members.find((profile) => profile.user_id === meId) ?? null,
    members,
    paired: members.length > 1,
  };
}

/**
 * Both devices must agree on the prompt anchor without asking the server, so
 * it is the zone of whichever member's id sorts first. Deterministic, and
 * stable as long as the pair is.
 */
function applyZones(state: SpaceState): void {
  const people = state.members;

  setZones(
    people
      .filter((p) => p.time_zone)
      .map((p) => ({ zone: p.time_zone, label: cityFor(p.time_zone) })),
  );

  const anchor = [...people].sort((a, b) => a.user_id.localeCompare(b.user_id))[0];
  if (anchor?.time_zone) setPromptZone(anchor.time_zone);
}

export function clearSpaceCache(): void {
  cache = null;
}

/**
 * Everyone signed in has a space, so unlike the old allowlist there is no
 * "not permitted" state to render. Kept as a named check because the screens
 * still need to know whether the space has loaded.
 */
export async function hasSpace(): Promise<boolean> {
  return (await loadSpace()).space !== null;
}

export async function myProfile(): Promise<Profile | null> {
  return (await loadSpace()).me;
}

export async function myTimeZone(): Promise<string> {
  const me = await myProfile();
  return me?.time_zone || deviceZone();
}

/** Every distinct member zone in the space, for clocks and author names. */
export async function zonesInSpace(): Promise<Array<{ zone: string; label: string }>> {
  const state = await loadSpace();
  const zones: Array<{ zone: string; label: string }> = [];

  const add = (profile: Profile | null) => {
    if (!profile?.time_zone) return;
    if (zones.some((z) => z.zone === profile.time_zone)) return;
    zones.push({ zone: profile.time_zone, label: cityFor(profile.time_zone) });
  };

  state.members.forEach(add);

  if (zones.length === 0) zones.push({ zone: deviceZone(), label: cityFor(deviceZone()) });
  return zones;
}

/** "Africa/Johannesburg" reads badly on a card. The city does not. */
export function cityFor(zone: string): string {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

export async function displayNameFor(userId: string): Promise<string> {
  const state = await loadSpace();
  if (state.me?.user_id === userId) return state.me.display_name || 'You';
  const member = state.members.find((profile) => profile.user_id === userId);
  return member?.display_name || 'Community member';
}

export async function updateMyProfile(patch: {
  display_name?: string;
  time_zone?: string;
}): Promise<boolean> {
  const id = currentUserId();
  if (!id || !hasConfig) return false;

  const { error } = await getAuthClient()
    .from('lifeos_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', id);

  if (error) return false;
  clearSpaceCache();
  return true;
}

// ---------- Pairing ----------

export type Invite = { code: string; expires_at: string };

export async function createInvite(): Promise<Invite | null> {
  if (!hasConfig) return null;
  const { data, error } = await getAuthClient().rpc('lifeos_create_invite');
  if (error || !data || data.length === 0) return null;
  return data[0] as Invite;
}

export async function activeInvite(): Promise<Invite | null> {
  if (!hasConfig) return null;
  const { data } = await getAuthClient()
    .from('lifeos_invites')
    .select('code, expires_at')
    .is('redeemed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  return data[0] as Invite;
}

export type RedeemResult = { ok: true } | { ok: false; reason: string };

export async function redeemInvite(code: string): Promise<RedeemResult> {
  if (!hasConfig) return { ok: false, reason: 'Not connected' };

  const trimmed = code.trim().toUpperCase();
  if (trimmed.length < 6) return { ok: false, reason: 'That code looks too short' };

  const { error } = await getAuthClient().rpc('lifeos_redeem_invite', { input_code: trimmed });
  if (error) return { ok: false, reason: error.message };

  clearSpaceCache();
  notifySpaceChanged();
  return { ok: true };
}

export async function leaveSpace(): Promise<boolean> {
  if (!hasConfig) return false;
  const { error } = await getAuthClient().rpc('lifeos_leave_space');
  if (error) return false;
  clearSpaceCache();
  notifySpaceChanged();
  return true;
}

// ---------- Change notification ----------

const SPACE_CHANGED = 'lifeos:space-changed';

export function notifySpaceChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SPACE_CHANGED));
}

export function subscribeSpace(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SPACE_CHANGED, onChange);
  return () => window.removeEventListener(SPACE_CHANGED, onChange);
}
