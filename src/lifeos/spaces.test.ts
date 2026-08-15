import { describe, expect, it } from 'vitest';
import { createSpaceState, type Profile } from './spaces';

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
