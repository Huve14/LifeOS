import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { BudgetState } from './types.ts';
import { BudgetStateSchema, CURRENT_SCHEMA_VERSION } from './types.ts';
import { BudgetValidationError } from './errors.ts';

const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'budget.json');
const TMP_FILE = join(DATA_DIR, 'budget.json.tmp');

const SCHEMA_MIGRATORS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function registerMigrator(fromVersion: number, fn: (raw: Record<string, unknown>) => Record<string, unknown>) {
  SCHEMA_MIGRATORS[fromVersion] = fn;
}

export function migrateState(raw: Record<string, unknown>): Record<string, unknown> {
  let data = { ...raw };
  const version = (data.schemaVersion as number) || 1;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new BudgetValidationError(`Schema version ${version} is newer than supported ${CURRENT_SCHEMA_VERSION}`);
  }
  let v = version;
  while (v < CURRENT_SCHEMA_VERSION) {
    const migrator = SCHEMA_MIGRATORS[v];
    if (migrator) {
      data = migrator(data);
    }
    v++;
  }
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  return data;
}

export function seedState(): BudgetState {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const startDate = `${y}-${m}-01`;
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  const endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activePeriodId: 'period-1',
    periods: [
      { id: 'period-1', label: `${y}-${m}`, startDate, endDate, currency: 'ZAR', currencySymbol: 'R' },
    ],
    incomeEntries: [
      { id: 'income-1', source: 'M2M Salary', amount: 28000, received: true, periodId: 'period-1' },
    ],
    envelopes: [
      { id: 'env-1', name: 'Rent & Bond', icon: '🏠', allocated: 9500, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'period-1' },
      { id: 'env-2', name: 'Groceries', icon: '🛒', allocated: 3000, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'period-1' },
      { id: 'env-3', name: 'Transport', icon: '🚗', allocated: 2000, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'period-1' },
      { id: 'env-4', name: 'Utilities', icon: '⚡', allocated: 1500, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'period-1' },
      { id: 'env-5', name: 'UAE Relocation Fund', icon: '✈️', allocated: 5000, spent: 0, rollover: 0, rolloverEnabled: true, periodId: 'period-1' },
      { id: 'env-6', name: 'Emergency Fund', icon: '🛡️', allocated: 2000, spent: 0, rollover: 0, rolloverEnabled: true, periodId: 'period-1' },
      { id: 'env-7', name: 'ClearScan Development', icon: '💻', allocated: 3000, spent: 0, rollover: 0, rolloverEnabled: true, periodId: 'period-1' },
      { id: 'env-8', name: 'Personal/Leisure', icon: '🎮', allocated: 1500, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'period-1' },
      { id: 'env-9', name: 'Education & Certs', icon: '📚', allocated: 1200, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'period-1' },
    ],
    transactions: [],
    savingsGoals: [],
    exchangeRates: [
      { fromCurrency: 'ZAR', toCurrency: 'AED', rate: 0.205, isEstimated: true, lastUpdated: new Date().toISOString() },
    ],
  };
}

export async function loadState(): Promise<BudgetState> {
  try {
    if (!existsSync(DATA_FILE)) {
      await mkdir(DATA_DIR, { recursive: true });
      const seeded = seedState();
      await saveState(seeded);
      return seeded;
    }
    const raw = JSON.parse(await readFile(DATA_FILE, 'utf-8'));
    const migrated = migrateState(raw);
    const parsed = BudgetStateSchema.safeParse(migrated);
    if (!parsed.success) {
      throw new BudgetValidationError('Budget state validation failed', parsed.error.issues);
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof BudgetValidationError) throw err;
    throw new BudgetValidationError(`Failed to load budget state: ${(err as Error).message}`);
  }
}

export async function saveState(state: BudgetState): Promise<void> {
  const validated = BudgetStateSchema.safeParse(state);
  if (!validated.success) {
    throw new BudgetValidationError('Cannot save invalid budget state', validated.error.issues);
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TMP_FILE, JSON.stringify(validated.data, null, 2), 'utf-8');
  await rename(TMP_FILE, DATA_FILE);
}
