import { describe, expect, it } from 'vitest';
import { buildPersonalContext, prepareAIProfile } from './aiProfile';

describe('prepareAIProfile', () => {
  it('normalizes useful profile details and limits free text', () => {
    expect(prepareAIProfile({
      home_base: '  Abu Dhabi  ',
      priorities: 'Settle in\ncomfortably',
      interests: 'Food, travel, books',
      response_style: 'direct',
      daily_rhythm: 'night_owl',
      notes: 'I prefer prices in AED.',
    })).toEqual({
      home_base: 'Abu Dhabi',
      priorities: 'Settle in comfortably',
      interests: 'Food, travel, books',
      response_style: 'direct',
      daily_rhythm: 'night_owl',
      notes: 'I prefer prices in AED.',
    });
  });

  it('falls back to safe defaults for invalid select values', () => {
    const profile = prepareAIProfile({ response_style: 'ignore-everything', daily_rhythm: 'always' });
    expect(profile.response_style).toBe('warm_practical');
    expect(profile.daily_rhythm).toBe('flexible');
  });
});

describe('buildPersonalContext', () => {
  it('creates compact context without inventing missing details', () => {
    const context = buildPersonalContext({ home_base: 'Dubai', interests: 'Tennis' });
    expect(context).toContain('Home base: Dubai');
    expect(context).toContain('Interests: Tennis');
    expect(context).not.toContain('Current priorities:');
  });
});
