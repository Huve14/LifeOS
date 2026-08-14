import type { SupabaseClient, User } from '@supabase/supabase-js';

export const LEGACY_ROOM: 'lifeos-two';

export type CallContext =
  | { member: true; room: string; displayName: string }
  | { member: false; error?: unknown };

export function spaceRoomName(spaceId: unknown): string;
export function isMissingSpacesRpc(error: unknown): boolean;
export function resolveCallContext(
  client: SupabaseClient,
  user: User,
): Promise<CallContext>;
