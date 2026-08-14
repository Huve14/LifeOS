import { describe, expect, it } from 'vitest';
import {
  buildPairInviteLink,
  cleanSharedText,
  dailyPromptForDate,
  formatPairCode,
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
