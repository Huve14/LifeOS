import { describe, expect, it } from 'vitest';
import {
  PULSE_WINDOW_DAYS,
  buildPairInviteLink,
  cleanSharedText,
  dailyPromptForDate,
  formatPairCode,
  isMissingRelation,
  normalizePairCode,
} from './couples';

describe('couple sharing helpers', () => {
  it('normalizes pasted and spoken invitation codes', () => {
    expect(normalizePairCode(' abcd12-34 ef56 ')).toBe('ABCD1234EF56');
    expect(formatPairCode('abcd1234ef56')).toBe('ABCD12 34EF56');
  });

  it('builds an account pairing link without leaking other URL state', () => {
    expect(buildPairInviteLink('abcd1234ef56', 'https://life.example/settings'))
      .toBe('https://life.example/?pair=ABCD1234EF56');
  });

  it('cleans shared text and enforces its client limit', () => {
    expect(cleanSharedText('  hello   \nworld  ', 20)).toBe('hello\nworld');
    expect(cleanSharedText('123456', 4)).toBe('1234');
  });

  it('uses the same daily prompt on every device', () => {
    expect(dailyPromptForDate('2026-08-14')).toEqual(dailyPromptForDate('2026-08-14'));
    expect(dailyPromptForDate('2026-08-14').key).toMatch(/^daily-/);
  });
});

describe('tolerating a deployment that has not run the closeness migration', () => {
  it('recognises every shape of missing relation PostgREST reports', () => {
    expect(isMissingRelation({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isMissingRelation({
      code: 'PGRST205',
      message: "Could not find the table 'public.lifeos_couple_dates' in the schema cache",
    })).toBe(true);
    expect(isMissingRelation({ code: 'PGRST202', message: 'function not found' })).toBe(true);
  });

  it('never mistakes a permission or network failure for a missing table', () => {
    expect(isMissingRelation({ code: '42501', message: 'permission denied for table' })).toBe(false);
    expect(isMissingRelation({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(isMissingRelation({ message: 'Failed to fetch' })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
    expect(isMissingRelation(undefined)).toBe(false);
  });

  it('keeps the pulse window and the rhythm strip on the same fortnight', () => {
    expect(PULSE_WINDOW_DAYS).toBe(14);
  });
});
