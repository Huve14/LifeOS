export const LEGACY_ROOM = 'lifeos-two';

export function spaceRoomName(spaceId) {
  const id = String(spaceId || '').trim();
  if (!id) throw new Error('A space id is required to create a call room');
  return `lifeos-space-${id}`;
}

export function isMissingSpacesRpc(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return code === 'PGRST202'
    || code === '42883'
    || message.includes('current_space_id') && (
      message.includes('could not find') || message.includes('does not exist')
    );
}

function fallbackDisplayName(user) {
  const metadataName = user?.user_metadata?.name;
  if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.trim();
  const emailName = user?.email?.split('@')[0];
  return emailName || 'Life OS';
}

/**
 * Resolves the room entirely from authenticated database state.
 *
 * Before migration 0009, the two-person allowlist shares one fixed room. Once
 * spaces exist, the database function returns the caller's space and the room
 * is derived from that id. The client never gets to choose another room.
 */
export async function resolveCallContext(client, user) {
  const { data: spaceId, error: spaceError } = await client.rpc('current_space_id');

  if (!spaceError) {
    if (!spaceId) return { member: false };

    const { data: profile } = await client
      .from('lifeos_profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();

    return {
      member: true,
      room: spaceRoomName(spaceId),
      displayName: profile?.display_name || fallbackDisplayName(user),
    };
  }

  // The production database may briefly be on the pre-spaces schema while
  // the new client is already deployed. Only a missing RPC triggers this
  // fallback; permission and database errors still fail closed.
  if (!isMissingSpacesRpc(spaceError)) {
    return { member: false, error: spaceError };
  }

  const { data: legacyMember, error: legacyError } = await client
    .from('lifeos_members')
    .select('user_id, display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (legacyError) return { member: false, error: legacyError };
  if (!legacyMember) return { member: false };

  return {
    member: true,
    room: LEGACY_ROOM,
    displayName: legacyMember.display_name || fallbackDisplayName(user),
  };
}
