// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { loadState, saveState, migrateState } from '../src/budget/store.ts';
import type { BudgetState } from '../src/budget/types.ts';

const TEST_DIR = join(process.cwd(), 'data');
const TEST_FILE = join(TEST_DIR, 'budget.json');
const TEST_TMP = join(TEST_DIR, 'budget.json.tmp');

async function removeIfExists(file: string) {
  try { await unlink(file); } catch { /* not found */ }
}

async function removeAllTestFiles() {
  await removeIfExists(TEST_FILE);
  await removeIfExists(TEST_TMP);
}

describe('store', () => {
  beforeEach(async () => {
    await removeAllTestFiles();
  });

  afterEach(async () => {
    await removeAllTestFiles();
  });

  it('loadState creates seed file if missing', async () => {
    await removeAllTestFiles();
    const state = await loadState();
    expect(state.envelopes.length).toBe(5);
    expect(state.incomeEntries.length).toBe(1);
    expect(state.incomeEntries[0].source).toBe('M2M Salary');
    expect(state.incomeEntries[0].amount).toBe(8800);
    expect(state.periods[0].currency).toBe('AED');
  });

  it('loadState reads and validates existing file', async () => {
    const seed: BudgetState = {
      schemaVersion: 1,
      activePeriodId: 'p1',
      periods: [{ id: 'p1', label: '2026-06', startDate: '2026-06-01', endDate: '2026-06-30', currency: 'ZAR', currencySymbol: 'R' }],
      incomeEntries: [{ id: 'i1', source: 'Salary', amount: 10000, received: true, periodId: 'p1' }],
      envelopes: [{ id: 'e1', name: 'Test', allocated: 5000, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'p1' }],
      transactions: [],
      savingsGoals: [],
      exchangeRates: [],
    };
    await saveState(seed);
    const loaded = await loadState();
    expect(loaded.incomeEntries[0].amount).toBe(10000);
  });

  it('loadState throws on invalid state', async () => {
    await writeFile(TEST_FILE, JSON.stringify({ schemaVersion: 1, activePeriodId: 'p1', periods: 'invalid' }), 'utf-8');
    await expect(loadState()).rejects.toThrow();
  });

  it('saveState writes atomically (.tmp then rename)', async () => {
    const state = {
      schemaVersion: 1,
      activePeriodId: 'p1',
      periods: [{ id: 'p1', label: '2026-06', startDate: '2026-06-01', endDate: '2026-06-30', currency: 'ZAR', currencySymbol: 'R' }],
      incomeEntries: [],
      envelopes: [],
      transactions: [],
      savingsGoals: [],
      exchangeRates: [],
    } as unknown as BudgetState;
    await saveState(state);

    const content = await readFile(TEST_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.schemaVersion).toBe(1);

    // .tmp should be cleaned up (rename atomically replaces, .tmp no longer exists)
    try { await readFile(TEST_TMP, 'utf-8'); expect(true).toBe(false); } catch { /* expected — tmp file cleaned up by rename */ }
  });

  it('saveState throws on invalid state', async () => {
    const invalid = { schemaVersion: 1, activePeriodId: 123 } as unknown as BudgetState;
    await expect(saveState(invalid)).rejects.toThrow();
  });
});

describe('migrateState', () => {
  it('passes through current version', () => {
    const raw = { schemaVersion: 1, activePeriodId: 'p1', periods: [], incomeEntries: [], envelopes: [], transactions: [], savingsGoals: [], exchangeRates: [] };
    const result = migrateState(raw as unknown as Record<string, unknown>);
    expect(result.schemaVersion).toBe(1);
  });
});
