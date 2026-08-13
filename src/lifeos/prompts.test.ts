import { describe, it, expect } from 'vitest';
import {
  PROMPT_COUNT,
  PROMPT_EPOCH,
  PROMPT_ZONE,
  bothAnswered,
  promptDateFor,
  promptForDate,
  promptIndexFor,
} from './prompts';
import { ABU_DHABI } from './time';

describe('prompt day anchor', () => {
  it('is anchored to Abu Dhabi so both of us get the same question', () => {
    expect(PROMPT_ZONE).toBe(ABU_DHABI);
  });

  it('rolls over at 20:00 UTC, which is midnight in Abu Dhabi', () => {
    expect(promptDateFor(new Date('2026-08-13T19:59:00Z'))).toBe('2026-08-13');
    expect(promptDateFor(new Date('2026-08-13T20:00:00Z'))).toBe('2026-08-14');
  });

  it('gives both of us the same date at the same instant', () => {
    // 22:30 in Johannesburg is 00:30 the next day in Abu Dhabi. Both devices
    // resolve the anchor zone, so both see the same prompt date regardless.
    const instant = new Date('2026-08-13T20:30:00Z');
    expect(promptDateFor(instant)).toBe('2026-08-14');
  });
});

describe('promptIndexFor', () => {
  it('starts the rotation at the epoch', () => {
    expect(promptIndexFor(PROMPT_EPOCH)).toBe(0);
  });

  it('advances one per day', () => {
    expect(promptIndexFor('2026-01-02')).toBe(1);
    expect(promptIndexFor('2026-01-31')).toBe(30);
    expect(promptIndexFor('2026-02-01')).toBe(31);
  });

  it('crosses month and year boundaries', () => {
    expect(promptIndexFor('2026-12-31')).toBe(364);
    expect(promptIndexFor('2027-01-01')).toBe(0);
  });

  it('wraps rather than running off the end', () => {
    for (const date of ['2026-01-01', '2027-06-15', '2030-11-02']) {
      const index = promptIndexFor(date);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PROMPT_COUNT);
    }
  });

  it('handles dates before the epoch without going negative', () => {
    expect(promptIndexFor('2025-12-31')).toBe(364);
    expect(promptIndexFor('2025-12-30')).toBe(363);
  });

  it('is stable, so both devices land on the same question', () => {
    expect(promptIndexFor('2026-08-13')).toBe(promptIndexFor('2026-08-13'));
  });

  it('never repeats within a single cycle', () => {
    const seen = new Set<number>();
    const start = Date.UTC(2026, 0, 1);
    for (let day = 0; day < PROMPT_COUNT; day += 1) {
      const date = new Date(start + day * 86400000).toISOString().slice(0, 10);
      seen.add(promptIndexFor(date));
    }
    expect(seen.size).toBe(PROMPT_COUNT);
  });
});

describe('promptForDate', () => {
  const prompts = Array.from({ length: PROMPT_COUNT }, (_, i) => ({
    day_index: i,
    text: `Question ${i}`,
  }));

  it('resolves a date to its question', () => {
    expect(promptForDate(prompts, PROMPT_EPOCH)?.text).toBe('Question 0');
    expect(promptForDate(prompts, '2026-01-15')?.text).toBe('Question 14');
  });

  it('gives the same question on the same day next cycle', () => {
    expect(promptForDate(prompts, '2026-03-01')?.text).toBe(
      promptForDate(prompts, '2027-03-01')?.text,
    );
  });

  it('returns null when the prompts have not loaded', () => {
    expect(promptForDate([], '2026-01-01')).toBeNull();
  });

  it('returns null when the matching index is missing', () => {
    expect(promptForDate([{ day_index: 5, text: 'Only one' }], '2026-01-01')).toBeNull();
  });
});

describe('bothAnswered', () => {
  const date = '2026-08-13';

  it('is the only state that reveals anything', () => {
    expect(bothAnswered({ prompt_date: date, mine: true, theirs: true })).toBe(true);
  });

  it('stays closed until both have submitted', () => {
    expect(bothAnswered({ prompt_date: date, mine: true, theirs: false })).toBe(false);
    expect(bothAnswered({ prompt_date: date, mine: false, theirs: true })).toBe(false);
    expect(bothAnswered({ prompt_date: date, mine: false, theirs: false })).toBe(false);
  });

  it('treats an untouched day as closed', () => {
    expect(bothAnswered(undefined)).toBe(false);
  });
});
