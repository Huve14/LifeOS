import type { BudgetState, MonthlyReport, CategorySpendHistory, NetWorthSnapshot } from './types.ts';
import { getTotalIncome, getTotalBudgeted, getTotalSpend, getEnvelopeStatus } from './computed.ts';
import { generateNudges } from './nudges.ts';

export function getMonthlyReport(state: BudgetState, periodId: string): MonthlyReport {
  const income = getTotalIncome(state, periodId);
  const budgeted = getTotalBudgeted(state, periodId);
  const spent = getTotalSpend(state, periodId);
  const saved = income.total - spent;
  const savingsRate = income.total > 0 ? Math.round((saved / income.total) * 100) : 0;

  const periodEnvelopes = state.envelopes.filter(e => e.periodId === periodId);
  const envelopeSummaries = periodEnvelopes.map(e => ({
    envelopeId: e.id,
    name: e.name,
    allocated: e.allocated,
    spent: e.spent,
    status: getEnvelopeStatus(e),
  }));

  const topSpendCategories = [...envelopeSummaries]
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5)
    .map(e => ({ envelopeId: e.envelopeId, name: e.name, spent: e.spent }));

  const nudges = generateNudges(state, periodId);

  return {
    income: income.total,
    budgeted,
    spent,
    saved,
    savingsRate,
    envelopeSummaries,
    topSpendCategories,
    nudges,
  };
}

export function getCategorySpendHistory(state: BudgetState, envelopeId: string, nPeriods: number): CategorySpendHistory[] {
  const envelope = state.envelopes.find(e => e.id === envelopeId);
  if (!envelope) return [];

  const sortedPeriods = [...state.periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const relevant = sortedPeriods.filter(p => {
    const env = state.envelopes.find(e => e.id === envelopeId && e.periodId === p.id);
    return env;
  }).slice(-nPeriods);

  return relevant.map(p => {
    const env = state.envelopes.find(e => e.id === envelopeId && e.periodId === p.id)!;
    return {
      periodId: p.id,
      periodLabel: p.label,
      spent: env.spent,
      allocated: env.allocated,
    };
  });
}

export function getNetWorthSnapshot(state: BudgetState): NetWorthSnapshot {
  const totalSavings = state.envelopes
    .filter(e => e.periodId === state.activePeriodId)
    .reduce((s, e) => s + e.allocated + e.rollover - e.spent, 0);

  const goalProgress = state.savingsGoals.map(g => ({
    goalId: g.id,
    name: g.name,
    currentAmount: g.currentAmount,
    targetAmount: g.targetAmount,
    pct: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
  }));

  return {
    totalSavings,
    goalProgress,
    date: new Date().toISOString().slice(0, 10),
  };
}
