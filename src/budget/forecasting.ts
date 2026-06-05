import type { BudgetState, SavingsGoal, MonthlyProjection } from './types.ts';
import { getTotalSpend, getTotalIncome } from './computed.ts';

export function projectSavings(state: BudgetState, months: number): MonthlyProjection[] {
  const projections: MonthlyProjection[] = [];
  const activePeriod = state.periods.find(p => p.id === state.activePeriodId);
  if (!activePeriod) return projections;

  const income = getTotalIncome(state, activePeriod.id);
  const monthlyIncome = income.received || income.total;
  const monthlySpend = getTotalSpend(state, activePeriod.id);
  const monthlySavings = monthlyIncome - monthlySpend;

  let balance = state.envelopes
    .filter(e => e.periodId === state.activePeriodId)
    .reduce((s, e) => s + e.allocated + e.rollover - e.spent, 0);

  const startDate = new Date(activePeriod.startDate + 'T00:00:00');

  for (let i = 0; i < months; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i + 1);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const label = `${year}-${month}`;
    balance += monthlySavings;
    projections.push({
      month: `${year}-${month}`,
      label,
      projectedSavings: Math.max(0, monthlySavings),
      projectedBalance: Math.max(0, balance),
    });
  }

  return projections;
}

export function projectGoalCompletion(goal: SavingsGoal, monthlyContribution: number): { date: Date; monthsNeeded: number } | null {
  if (monthlyContribution <= 0) return null;
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return { date: new Date(), monthsNeeded: 0 };
  const monthsNeeded = Math.ceil(remaining / monthlyContribution);
  const d = new Date();
  d.setMonth(d.getMonth() + monthsNeeded);
  return { date: d, monthsNeeded };
}
