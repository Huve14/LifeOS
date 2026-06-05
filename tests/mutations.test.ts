import { describe, it, expect } from 'vitest';
import {
  addEnvelope,
  updateEnvelope,
  deleteEnvelope,
  allocateBudget,
  moveMoneyBetweenEnvelopes,
  addTransaction,
  editTransaction,
  deleteTransaction,
  bulkImportTransactions,
  addIncomeEntry,
  markIncomeReceived,
  deleteIncomeEntry,
  addGoal,
  contributeToGoal,
  linkGoalToEnvelope,
  createPeriod,
  rolloverPeriod,
} from '../src/budget/mutations.ts';
import type { BudgetState, Envelope, Transaction, IncomeEntry } from '../src/budget/types.ts';

function makeState(): BudgetState {
  return {
    schemaVersion: 1,
    activePeriodId: 'p1',
    periods: [
      { id: 'p1', label: '2026-06', startDate: '2026-06-01', endDate: '2026-06-30', currency: 'ZAR', currencySymbol: 'R' },
      { id: 'p2', label: '2026-07', startDate: '2026-07-01', endDate: '2026-07-31', currency: 'ZAR', currencySymbol: 'R' },
    ],
    incomeEntries: [
      { id: 'i1', source: 'Salary', amount: 28000, received: true, periodId: 'p1' },
    ],
    envelopes: [
      { id: 'e1', name: 'Rent', icon: '🏠', allocated: 9500, spent: 4000, rollover: 0, rolloverEnabled: false, periodId: 'p1' },
      { id: 'e2', name: 'Groceries', icon: '🛒', allocated: 3000, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'p1' },
      { id: 'e3', name: 'Savings', icon: '💰', allocated: 2000, spent: 0, rollover: 500, rolloverEnabled: true, periodId: 'p1' },
    ],
    transactions: [],
    savingsGoals: [],
    exchangeRates: [],
  };
}

describe('envelope operations', () => {
  it('addEnvelope appends and returns new state', () => {
    const s = makeState();
    const env: Envelope = { id: 'e4', name: 'Fun', icon: '🎮', allocated: 1000, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    const r = addEnvelope(s, env);
    expect(r.envelopes).toHaveLength(4);
    expect(r.envelopes[3].name).toBe('Fun');
    expect(s.envelopes).toHaveLength(3); // original unchanged
  });

  it('updateEnvelope patches fields', () => {
    const s = makeState();
    const r = updateEnvelope(s, 'e2', { allocated: 4000 });
    expect(r.envelopes.find(e => e.id === 'e2')?.allocated).toBe(4000);
  });

  it('deleteEnvelope removes envelope', () => {
    const s = makeState();
    const r = deleteEnvelope(s, 'e2');
    expect(r.envelopes.find(e => e.id === 'e2')).toBeUndefined();
    expect(r.envelopes).toHaveLength(2);
  });

  it('allocateBudget sets allocated amount', () => {
    const s = makeState();
    const r = allocateBudget(s, 'e2', 5000);
    expect(r.envelopes.find(e => e.id === 'e2')?.allocated).toBe(5000);
  });

  it('moveMoneyBetweenEnvelopes transfers allocation', () => {
    const s = makeState();
    const r = moveMoneyBetweenEnvelopes(s, 'e1', 'e2', 500);
    expect(r.envelopes.find(e => e.id === 'e1')?.allocated).toBe(9000);
    expect(r.envelopes.find(e => e.id === 'e2')?.allocated).toBe(3500);
  });
});

describe('transaction operations', () => {
  it('addTransaction adds and updates envelope spent', () => {
    const s = makeState();
    const tx: Transaction = { id: 't1', date: '2026-06-10', description: 'Groceries', amount: 500, categoryId: 'e2', type: 'expense', isRecurring: false, tags: [], periodId: 'p1' };
    const r = addTransaction(s, tx);
    expect(r.transactions).toHaveLength(1);
    expect(r.envelopes.find(e => e.id === 'e2')?.spent).toBe(500);
  });

  it('addTransaction without categoryId does not update envelope', () => {
    const s = makeState();
    const tx: Transaction = { id: 't1', date: '2026-06-10', description: 'Income', amount: 1000, type: 'income', isRecurring: false, tags: [], periodId: 'p1' };
    const r = addTransaction(s, tx);
    expect(r.transactions).toHaveLength(1);
  });

  it('editTransaction reverses old, applies new', () => {
    const s = makeState();
    const tx: Transaction = { id: 't1', date: '2026-06-10', description: 'Groceries', amount: 500, categoryId: 'e2', type: 'expense', isRecurring: false, tags: [], periodId: 'p1' };
    let r = addTransaction(s, tx);
    r = editTransaction(r, 't1', { amount: 300 });
    expect(r.transactions[0].amount).toBe(300);
    expect(r.envelopes.find(e => e.id === 'e2')?.spent).toBe(300);
  });

  it('deleteTransaction reverses spend delta', () => {
    const s = makeState();
    const tx: Transaction = { id: 't1', date: '2026-06-10', description: 'Groceries', amount: 500, categoryId: 'e2', type: 'expense', isRecurring: false, tags: [], periodId: 'p1' };
    const r1 = addTransaction(s, tx);
    const r2 = deleteTransaction(r1, 't1');
    expect(r2.transactions).toHaveLength(0);
    expect(r2.envelopes.find(e => e.id === 'e2')?.spent).toBe(0);
  });

  it('bulkImportTransactions adds multiple', () => {
    const s = makeState();
    const txs = [
      { description: 'Milk', amount: 50, categoryId: 'e2', type: 'expense' as const, periodId: 'p1' },
      { description: 'Bread', amount: 30, categoryId: 'e2', type: 'expense' as const, periodId: 'p1' },
    ];
    const r = bulkImportTransactions(s, txs);
    expect(r.transactions).toHaveLength(2);
  });
});

describe('income operations', () => {
  it('addIncomeEntry appends', () => {
    const s = makeState();
    const entry: IncomeEntry = { id: 'i2', source: 'Freelance', amount: 5000, received: false, periodId: 'p1' };
    const r = addIncomeEntry(s, entry);
    expect(r.incomeEntries).toHaveLength(2);
  });

  it('markIncomeReceived toggles received', () => {
    const s = makeState();
    const r = markIncomeReceived(s, 'i1', false);
    expect(r.incomeEntries.find(e => e.id === 'i1')?.received).toBe(false);
  });

  it('deleteIncomeEntry removes entry', () => {
    const s = makeState();
    const r = deleteIncomeEntry(s, 'i1');
    expect(r.incomeEntries).toHaveLength(0);
  });
});

describe('savings goal operations', () => {
  it('addGoal adds goal', () => {
    const s = makeState();
    const r = addGoal(s, { id: 'g1', name: 'Test', targetAmount: 10000, currentAmount: 0, targetDate: '2027-01-01', monthlyContribution: 500 });
    expect(r.savingsGoals).toHaveLength(1);
  });

  it('contributeToGoal increments currentAmount', () => {
    const s = makeState();
    let r = addGoal(s, { id: 'g1', name: 'Test', targetAmount: 10000, currentAmount: 2000, targetDate: '2027-01-01', monthlyContribution: 500 });
    r = contributeToGoal(r, 'g1', 1000);
    const goal = r.savingsGoals.find(g => g.id === 'g1');
    expect(goal?.currentAmount).toBe(3000);
  });

  it('contributeToGoal does not exceed target', () => {
    const s = makeState();
    let r = addGoal(s, { id: 'g1', name: 'Test', targetAmount: 10000, currentAmount: 9500, targetDate: '2027-01-01', monthlyContribution: 500 });
    r = contributeToGoal(r, 'g1', 1000);
    expect(r.savingsGoals.find(g => g.id === 'g1')?.currentAmount).toBe(10000);
  });

  it('linkGoalToEnvelope sets linkedEnvelopeId', () => {
    const s = makeState();
    let r = addGoal(s, { id: 'g1', name: 'Test', targetAmount: 10000, currentAmount: 0, targetDate: '2027-01-01', monthlyContribution: 500 });
    r = linkGoalToEnvelope(r, 'g1', 'e3');
    expect(r.savingsGoals.find(g => g.id === 'g1')?.linkedEnvelopeId).toBe('e3');
  });
});

describe('period management', () => {
  it('createPeriod generates a new period', () => {
    const p = createPeriod('2026-08', '2026-08-01', '2026-08-31', 'ZAR');
    expect(p.label).toBe('2026-08');
    expect(p.currency).toBe('ZAR');
    expect(p.currencySymbol).toBe('R');
    expect(p.id).toBeTruthy();
  });

  it('rolloverPeriod copies envelopes with rollover amounts', () => {
    const s = makeState();
    const r = rolloverPeriod(s, 'p1', 'p2');

    // Should have 3 original + 3 new = 6 envelopes
    expect(r.envelopes).toHaveLength(6);

    const old = r.envelopes.filter(e => e.periodId === 'p1');
    const newEnv = r.envelopes.filter(e => e.periodId === 'p2');

    expect(old).toHaveLength(3);
    expect(newEnv).toHaveLength(3);

    // e3 (Savings) has rolloverEnabled=true, should carry over excess: 2000 + 500 - 0 = 2500
    const savings = newEnv.find(e => e.name === 'Savings');
    expect(savings?.rollover).toBe(2500);
    expect(savings?.spent).toBe(0);

    // e1 (Rent) has rolloverEnabled=false, rollover should be 0
    const rent = newEnv.find(e => e.name === 'Rent');
    expect(rent?.rollover).toBe(0);
  });

  it('rolloverPeriod throws for missing period', () => {
    const s = makeState();
    expect(() => rolloverPeriod(s, 'p1', 'nonexistent')).toThrow();
    expect(() => rolloverPeriod(s, 'nonexistent', 'p1')).toThrow();
  });
});
