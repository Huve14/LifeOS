import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSpaceCache, createSpaceState, loadSpace, type Profile } from './spaces';
import { ABU_DHABI, getZones, localZone } from './time';
import { getPromptZone } from './prompts';

// One account's rows per user id, so a read made as the wrong user is visible
// in the result rather than silently plausible.
const ROWS: Record<string, { profile: Profile; space: { id: string; name: string } }> = {
  'user-a': {
    profile: { user_id: 'user-a', display_name: 'Thabo', time_zone: 'Africa/Johannesburg' },
    space: { id: 'space-a', name: "Thabo's space" },
  },
  'user-b': {
    profile: { user_id: 'user-b', display_name: 'Naledi', time_zone: 'Asia/Dubai' },
    space: { id: 'space-b', name: "Naledi's space" },
  },
};

function signedInAs(): string {
  return (window as unknown as { __suvedaUser?: { id: string } }).__suvedaUser?.id ?? '';
}

vi.mock('../supabase', () => ({
  hasConfig: true,
  getAuthClient: () => ({
    from(table: string) {
      const rows = ROWS[signedInAs()];
      if (table === 'lifeos_space_members') {
        return { select: () => Promise.resolve({ data: rows ? [{ space_id: rows.space.id, user_id: rows.profile.user_id }] : [] }) };
      }
      if (table === 'lifeos_profiles') {
        return { select: () => Promise.resolve({ data: rows ? [rows.profile] : [] }) };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows?.space ?? null }) }) }),
      };
    },
  }),
}));

function signIn(userId: string | null): void {
  (window as unknown as { __suvedaUser: { id: string } | null }).__suvedaUser =
    userId ? { id: userId } : null;
}

const profiles: Profile[] = [
  { user_id: 'c-user', display_name: 'Naledi', time_zone: 'Asia/Dubai' },
  { user_id: 'a-user', display_name: 'Thabo', time_zone: 'Africa/Johannesburg' },
  { user_id: 'b-user', display_name: 'Aisha', time_zone: 'Asia/Dubai' },
];

describe('createSpaceState', () => {
  it('keeps every profile in a three-member space and derives paired state', () => {
    const state = createSpaceState(
      { id: 'space-1', name: 'Abu Dhabi friends' },
      profiles,
      ['c-user', 'a-user', 'b-user'],
      'b-user',
    );

    expect(state.members.map((member) => member.display_name)).toEqual(['Thabo', 'Aisha', 'Naledi']);
    expect(state.me?.display_name).toBe('Aisha');
    expect(state.paired).toBe(true);
  });

  it('does not include readable profiles that are outside the current space', () => {
    const state = createSpaceState(null, profiles, ['a-user'], 'a-user');

    expect(state.members).toHaveLength(1);
    expect(state.members[0].display_name).toBe('Thabo');
    expect(state.paired).toBe(false);
  });
});

// Signing out and back in does not reload the page, so anything cached in a
// module outlives the account it was read for.
describe('space cache across accounts', () => {
  beforeEach(() => {
    clearSpaceCache();
    signIn(null);
  });

  it('reads the second account’s own space, not the first one’s', async () => {
    signIn('user-a');
    const first = await loadSpace();
    expect(first.space?.name).toBe("Thabo's space");
    expect(first.me?.display_name).toBe('Thabo');

    signIn('user-b');
    const second = await loadSpace();
    expect(second.space?.name).toBe("Naledi's space");
    expect(second.me?.display_name).toBe('Naledi');
  });

  it('does not carry the previous member’s clocks or prompt anchor over', async () => {
    signIn('user-a');
    await loadSpace();
    expect(getZones().map((zone) => zone.zone)).toEqual(['Africa/Johannesburg']);
    expect(getPromptZone()).toBe('Africa/Johannesburg');

    // Back to the defaults a signed-out app should show: this device's own
    // clock, and the default prompt anchor.
    signIn(null);
    await loadSpace();
    expect(getZones().map((zone) => zone.zone)).toEqual([localZone()]);
    expect(getPromptZone()).toBe(ABU_DHABI);
  });

  it('still serves the cache for repeat reads by the same account', async () => {
    signIn('user-a');
    const first = await loadSpace();
    const second = await loadSpace();
    expect(second).toBe(first);
  });
});
