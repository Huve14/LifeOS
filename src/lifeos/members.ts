// The two-person allowlist.
//
// Membership is seeded in SQL and cannot be created from the client. If the
// signed in account is not on the list, every shared surface says so plainly
// rather than rendering an empty timeline that looks broken.

import { getAuthClient, hasConfig } from '../supabase';
import { JOHANNESBURG } from './time';

export type Member = {
  user_id: string;
  display_name: string;
  time_zone: string;
};

let cache: Member[] | null = null;

export async function loadMembers(force = false): Promise<Member[]> {
  if (!hasConfig) return [];
  if (cache && !force) return cache;

  const { data, error } = await getAuthClient()
    .from('lifeos_members')
    .select('user_id, display_name, time_zone');

  if (error || !data) return cache ?? [];
  cache = data as Member[];
  return cache;
}

export function currentUserId(): string | null {
  return window.__suvedaUser?.id ?? null;
}

export async function currentMember(): Promise<Member | null> {
  const id = currentUserId();
  if (!id) return null;
  const members = await loadMembers();
  return members.find((m) => m.user_id === id) ?? null;
}

export async function isMember(): Promise<boolean> {
  return (await currentMember()) !== null;
}

/** Falls back to the id itself so a missing name never renders as blank. */
export async function displayNameFor(userId: string): Promise<string> {
  const members = await loadMembers();
  const match = members.find((m) => m.user_id === userId);
  if (match) return match.display_name;
  if (userId === currentUserId()) {
    return window.__suvedaUser?.user_metadata?.name || 'You';
  }
  return 'Them';
}

export async function myTimeZone(): Promise<string> {
  const member = await currentMember();
  return member?.time_zone || JOHANNESBURG;
}

export async function updateMyProfile(patch: {
  display_name?: string;
  time_zone?: string;
}): Promise<boolean> {
  const id = currentUserId();
  if (!id || !hasConfig) return false;

  const { error } = await getAuthClient()
    .from('lifeos_members')
    .update(patch)
    .eq('user_id', id);

  if (error) return false;
  cache = null;
  return true;
}

export function clearMemberCache(): void {
  cache = null;
}
