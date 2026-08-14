// @vitest-environment node
//
// The seed migration is the content, so it is worth checking mechanically.
// A missing day would leave one date of the year with no question.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PROMPT_COUNT } from './prompts';

const SEED_FILE = join(process.cwd(), 'supabase/migrations/0005_lifeos_prompt_seed.sql');

let rows: Array<{ index: number; text: string }> = [];

beforeAll(() => {
  const sql = readFileSync(SEED_FILE, 'utf8');
  const matches = sql.matchAll(/^ {2}\((\d+), '(.*)'\)[,;]?$/gm);
  rows = [...matches].map((m) => ({ index: Number(m[1]), text: m[2].replace(/''/g, "'") }));
});

describe('prompt seed', () => {
  it('has one question for every day of the cycle', () => {
    expect(rows).toHaveLength(PROMPT_COUNT);
  });

  it('covers day_index 0 through 364 with no gaps', () => {
    const indexes = rows.map((r) => r.index).sort((a, b) => a - b);
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(PROMPT_COUNT - 1);
    expect(new Set(indexes).size).toBe(PROMPT_COUNT);
  });

  it('has no duplicate questions', () => {
    const texts = rows.map((r) => r.text);
    const duplicates = texts.filter((t, i) => texts.indexOf(t) !== i);
    expect(duplicates).toEqual([]);
  });

  it('uses no em dashes', () => {
    expect(rows.filter((r) => r.text.includes('—'))).toEqual([]);
  });

  it('uses no exclamation marks', () => {
    expect(rows.filter((r) => r.text.includes('!'))).toEqual([]);
  });

  it('has no empty or stub questions', () => {
    expect(rows.filter((r) => r.text.trim().length < 12)).toEqual([]);
  });

  it('ends every question with a question mark or a full stop', () => {
    expect(rows.filter((r) => !/[?.]$/.test(r.text))).toEqual([]);
  });

  it('keeps questions short enough to read on a phone', () => {
    expect(rows.filter((r) => r.text.length > 120)).toEqual([]);
  });
});
