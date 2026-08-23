import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_ROOM,
  callingEnabled,
  isMissingSpacesRpc,
  resolveCallContext,
  spaceRoomName,
} from '../api/livekit-context.js';

function queryResult(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

describe('LiveKit calling availability', () => {
  it('stays off unless a deployment sets ENABLE_CALLS to true', () => {
    expect(callingEnabled({})).toBe(false);
    expect(callingEnabled({ ENABLE_CALLS: '' })).toBe(false);
    expect(callingEnabled({ ENABLE_CALLS: 'false' })).toBe(false);
    expect(callingEnabled({ ENABLE_CALLS: '1' })).toBe(false);
    expect(callingEnabled({ ENABLE_CALLS: 'yes' })).toBe(false);
  });

  it('opts in on an explicit true regardless of casing or padding', () => {
    expect(callingEnabled({ ENABLE_CALLS: 'true' })).toBe(true);
    expect(callingEnabled({ ENABLE_CALLS: ' TRUE ' })).toBe(true);
  });

  it('stays off when no environment is available', () => {
    expect(callingEnabled(null as never)).toBe(false);
  });
});

describe('LiveKit call context', () => {
  it('derives a stable isolated room from the authenticated space', () => {
    expect(spaceRoomName('4a0c')).toBe('lifeos-space-4a0c');
  });

  it('recognizes a missing spaces RPC without swallowing other errors', () => {
    expect(isMissingSpacesRpc({ code: 'PGRST202', message: 'missing' })).toBe(true);
    expect(isMissingSpacesRpc({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  it('uses a space-scoped room after migration 0009', async () => {
    const profileQuery = queryResult({ data: { display_name: 'Huve' }, error: null });
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: 'space-123', error: null }),
      from: vi.fn().mockReturnValue(profileQuery),
    };

    await expect(resolveCallContext(client as never, { id: 'user-1' } as never)).resolves.toEqual({
      member: true,
      room: 'lifeos-space-space-123',
      displayName: 'Huve',
    });
    expect(client.from).toHaveBeenCalledWith('lifeos_profiles');
  });

  it('falls back to the legacy allowlist before migration 0009', async () => {
    const memberQuery = queryResult({ data: { user_id: 'user-1', display_name: 'Huve' }, error: null });
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }),
      from: vi.fn().mockReturnValue(memberQuery),
    };

    await expect(resolveCallContext(client as never, { id: 'user-1' } as never)).resolves.toEqual({
      member: true,
      room: LEGACY_ROOM,
      displayName: 'Huve',
    });
    expect(client.from).toHaveBeenCalledWith('lifeos_members');
  });

  it('fails closed on unexpected membership errors', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error }),
      from: vi.fn(),
    };

    await expect(resolveCallContext(client as never, { id: 'user-1' } as never)).resolves.toEqual({
      member: false,
      error,
    });
    expect(client.from).not.toHaveBeenCalled();
  });
});
