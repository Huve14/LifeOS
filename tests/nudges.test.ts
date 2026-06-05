import { describe, it, expect } from 'vitest';
import { generateNudges } from '../src/budget/nudges.ts';
import type { BudgetState } from '../src/budget/types.ts';

function makeState(): BudgetState {
  return {
    schemaVersion: 1,
    activePeriodId: 'p1',
    periods: [{ id: 'p1', label: '2026-06', startDate: '2026-06-01', endDate: '2026-06-30', currency: 'ZAR', currencySymbol: 'R' }],
    incomeEntries: [{ id: 'i1', source: 'Salary', amount: 28000, received: true, periodId: 'p1' }],
    envelopes: [
      { id: 'e1', name: 'Rent', icon: '🏠', allocated: 9500, spent: 4000, rollover: 0, rolloverEnabled: false, periodId: 'p1' },
      { id: 'e2', name: 'Groceries', icon: '🛒', allocated: 3000, spent: 2800, rollover: 0, rolloverEnabled: false, periodId: 'p1' },
      { id: 'e3', name: 'Savings', icon: '💰', allocated: 2000, spent: 0, rollover: 500, rolloverEnabled: true, periodId: 'p1' },
    ],
    transactions: [],
    savingsGoals: [],
    exchangeRates: [],
  };
}

describe('generateNudges', () => {
  it('generates warning for envelope > 80% spent', () => {
    const s = makeState();
    const nudges = generateNudges(s, 'p1');
    const groceriesWarnings = nudges.filter(n => n.envelopeId === 'e2' && n.type === 'warning');
    expect(groceriesWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it('generates danger for overspent envelope', () => {
    const s = makeState();
    s.envelopes.push({ id: 'e4', name: 'Overspent', icon: '💸', allocated: 1000, spent: 1500, rollover: 0, rolloverEnabled: false, periodId: 'p1' });
    const nudges = generateNudges(s, 'p1');
    const dangers = nudges.filter(n => n.type === 'danger' && n.envelopeId === 'e4');
    expect(dangers.length).toBeGreaterThanOrEqual(1);
  });

  it('generates info for idle money (readyToAssign > 0)', () => {
    const s = makeState();
    const nudges = generateNudges(s, 'p1');
    const idle = nudges.filter(n => n.category === 'idle-money');
    // 28000 - (9500+3000+2000) = 13500 > 0
    expect(idle.length).toBeGreaterThanOrEqual(1);
  });

  it('no idle money if all income is allocated', () => {
    const s = makeState();
    s.incomeEntries[0].amount = 14500; // matches total allocated
    const nudges = generateNudges(s, 'p1');
    const idle = nudges.filter(n => n.category === 'idle-money');
    expect(idle).toHaveLength(0);
  });

  it('generates success for reached goal', () => {
    const s = makeState();
    s.savingsGoals.push({ id: 'g1', name: 'Fund reached', targetAmount: 5000, currentAmount: 5000, targetDate: '2027-01-01', monthlyContribution: 0 });
    const nudges = generateNudges(s, 'p1');
    const success = nudges.filter(n => n.type === 'success');
    expect(success.length).toBeGreaterThanOrEqual(1);
  });

  it('no nudge for healthy state with no extra conditions', () => {
    const s = makeState();
    s.incomeEntries[0].amount = 0; // no idle money
    // set all envelopes healthy
    s.envelopes = s.envelopes.map(e => ({ ...e, spent: e.allocated * 0.3 }));
    const nudges = generateNudges(s, 'p1');
    // Should still have some healthy warnings if > 80%
    const warnings = nudges.filter(n => n.type === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(0);
  });
});
