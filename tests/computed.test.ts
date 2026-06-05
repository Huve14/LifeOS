import { describe, it, expect } from 'vitest';
import {
  getReadyToAssign,
  getEnvelopeAvailable,
  getEnvelopeStatus,
  getEnvelopeProgressPct,
  getTotalIncome,
  getTotalSpend,
  getTotalBudgeted,
  getBudgetHealth,
  getGoalMonthsRemaining,
  getGoalRequiredMonthly,
  getGoalStatus,
  getActivePeriod,
  calculateAgeOfMoney,
} from '../src/budget/computed.ts';
import type { BudgetState, Envelope, SavingsGoal } from '../src/budget/types.ts';

function makeState(overrides?: Partial<BudgetState>): BudgetState {
  return {
    schemaVersion: 1,
    activePeriodId: 'p1',
    periods: [
      { id: 'p1', label: '2026-06', startDate: '2026-06-01', endDate: '2026-06-30', currency: 'ZAR', currencySymbol: 'R' },
      { id: 'p2', label: '2026-07', startDate: '2026-07-01', endDate: '2026-07-31', currency: 'ZAR', currencySymbol: 'R' },
    ],
    incomeEntries: [
      { id: 'i1', source: 'Salary', amount: 28000, received: true, periodId: 'p1' },
      { id: 'i2', source: 'Freelance', amount: 5000, received: false, periodId: 'p1' },
    ],
    envelopes: [
      { id: 'e1', name: 'Rent', icon: '🏠', allocated: 9500, spent: 4000, rollover: 0, rolloverEnabled: false, periodId: 'p1' },
      { id: 'e2', name: 'Groceries', icon: '🛒', allocated: 3000, spent: 2800, rollover: 0, rolloverEnabled: false, periodId: 'p1' },
      { id: 'e3', name: 'Savings', icon: '💰', allocated: 2000, spent: 0, rollover: 500, rolloverEnabled: true, periodId: 'p1' },
      { id: 'e4', name: 'Fun', icon: '🎮', allocated: 0, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'p1' },
    ],
    transactions: [
      { id: 't1', date: '2026-06-05', description: 'Rent', amount: 4000, categoryId: 'e1', type: 'expense', isRecurring: true, tags: ['rent'], periodId: 'p1' },
      { id: 't2', date: '2026-06-10', description: 'Groceries', amount: 2800, categoryId: 'e2', type: 'expense', isRecurring: false, tags: [], periodId: 'p1' },
    ],
    savingsGoals: [
      { id: 'g1', name: 'Emergency Fund', targetAmount: 50000, currentAmount: 10000, targetDate: '2027-06-01', monthlyContribution: 3000, linkedEnvelopeId: 'e3' },
      { id: 'g2', name: 'No target date', targetAmount: 10000, currentAmount: 2000, targetDate: null, monthlyContribution: 500 },
    ],
    exchangeRates: [],
    ...overrides,
  };
}

describe('getReadyToAssign', () => {
  it('returns received income minus allocated for period', () => {
    const state = makeState();
    const rta = getReadyToAssign(state, 'p1');
    // received: 28000, allocated: 9500+3000+2000+0=14500
    expect(rta).toBe(28000 - 14500);
  });

  it('returns negative if allocated exceeds income', () => {
    const state = makeState();
    state.incomeEntries[0].amount = 5000;
    expect(getReadyToAssign(state, 'p1')).toBe(5000 - 14500);
  });
});

describe('getEnvelopeAvailable', () => {
  it('allocated + rollover - spent', () => {
    const env: Envelope = { id: 'e1', name: 'Rent', icon: '🏠', allocated: 9500, spent: 4000, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeAvailable(env)).toBe(5500);
  });

  it('includes rollover when present', () => {
    const env: Envelope = { id: 'e1', name: 'Savings', icon: '💰', allocated: 2000, spent: 0, rollover: 500, rolloverEnabled: true, periodId: 'p1' };
    expect(getEnvelopeAvailable(env)).toBe(2500);
  });
});

describe('getEnvelopeStatus', () => {
  it('healthy when under 80%', () => {
    const env: Envelope = { id: 'e1', name: 'Rent', icon: '🏠', allocated: 10000, spent: 3000, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeStatus(env)).toBe('healthy');
  });

  it('warning when over 80%', () => {
    const env: Envelope = { id: 'e1', name: 'Rent', icon: '🏠', allocated: 10000, spent: 8500, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeStatus(env)).toBe('warning');
  });

  it('overspent when spent exceeds allocated', () => {
    const env: Envelope = { id: 'e1', name: 'Rent', icon: '🏠', allocated: 10000, spent: 11000, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeStatus(env)).toBe('overspent');
  });

  it('unfunded when allocated and spent are zero', () => {
    const env: Envelope = { id: 'e1', name: 'Fun', icon: '🎮', allocated: 0, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeStatus(env)).toBe('unfunded');
  });
});

describe('getEnvelopeProgressPct', () => {
  it('returns percentage spent', () => {
    const env: Envelope = { id: 'e1', name: 'Rent', icon: '🏠', allocated: 10000, spent: 2500, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeProgressPct(env)).toBe(25);
  });

  it('caps at 100', () => {
    const env: Envelope = { id: 'e1', name: 'Rent', icon: '🏠', allocated: 10000, spent: 15000, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeProgressPct(env)).toBe(100);
  });

  it('returns 0 for zero allocation', () => {
    const env: Envelope = { id: 'e1', name: 'Fun', icon: '🎮', allocated: 0, spent: 0, rollover: 0, rolloverEnabled: false, periodId: 'p1' };
    expect(getEnvelopeProgressPct(env)).toBe(0);
  });
});

describe('getTotalIncome', () => {
  it('splits received and pending', () => {
    const state = makeState();
    const inc = getTotalIncome(state, 'p1');
    expect(inc.received).toBe(28000);
    expect(inc.pending).toBe(5000);
    expect(inc.total).toBe(33000);
  });
});

describe('getTotalSpend', () => {
  it('sums expense transactions', () => {
    const state = makeState();
    expect(getTotalSpend(state, 'p1')).toBe(6800);
  });
});

describe('getTotalBudgeted', () => {
  it('sums envelope allocations', () => {
    const state = makeState();
    expect(getTotalBudgeted(state, 'p1')).toBe(14500);
  });
});

describe('getBudgetHealth', () => {
  it('returns full health stats', () => {
    const state = makeState();
    const h = getBudgetHealth(state, 'p1');
    expect(h.income.total).toBe(33000);
    expect(h.budgeted).toBe(14500);
    expect(h.spent).toBe(6800);
    expect(h.readyToAssign).toBe(28000 - 14500);
    expect(h.spentPct).toBe(Math.round((6800 / 14500) * 100));
  });
});

describe('goal calculations', () => {
  it('getGoalMonthsRemaining returns months until target', () => {
    const goal: SavingsGoal = { id: 'g1', name: 'Test', targetAmount: 50000, currentAmount: 10000, targetDate: '2027-06-01', monthlyContribution: 3000 };
    const m = getGoalMonthsRemaining(goal);
    expect(m).toBeGreaterThan(0);
  });

  it('getGoalRequiredMonthly returns required contribution', () => {
    const goal: SavingsGoal = { id: 'g1', name: 'Test', targetAmount: 50000, currentAmount: 10000, targetDate: '2027-06-01', monthlyContribution: 3000 };
    const required = getGoalRequiredMonthly(goal);
    expect(required).toBeGreaterThan(0);
  });

  it('getGoalStatus returns reached when current >= target', () => {
    const goal: SavingsGoal = { id: 'g1', name: 'Test', targetAmount: 5000, currentAmount: 5000, targetDate: '2027-06-01', monthlyContribution: 0 };
    expect(getGoalStatus(goal)).toBe('reached');
  });
});

describe('getActivePeriod', () => {
  it('returns the active period', () => {
    const state = makeState();
    const p = getActivePeriod(state);
    expect(p?.id).toBe('p1');
  });
});

describe('calculateAgeOfMoney', () => {
  it('returns 0 when no income or expenses', () => {
    const state = makeState();
    state.incomeEntries = [];
    state.transactions = [];
    expect(calculateAgeOfMoney(state)).toBe(0);
  });
});
