import type { BudgetState, BudgetPeriod, Envelope, SavingsGoal, PeriodSummary } from './types.ts';

export function getReadyToAssign(state: BudgetState, periodId: string): number {
  const periodIncomes = state.incomeEntries.filter(e => e.periodId === periodId && e.received);
  const received = periodIncomes.reduce((s, e) => s + e.amount, 0);
  const periodEnvelopes = state.envelopes.filter(e => e.periodId === periodId);
  const allocated = periodEnvelopes.reduce((s, e) => s + e.allocated, 0);
  return received - allocated;
}

export function getEnvelopeAvailable(envelope: Envelope): number {
  return envelope.allocated + envelope.rollover - envelope.spent;
}

export function getEnvelopeStatus(envelope: Envelope): 'healthy' | 'warning' | 'overspent' | 'unfunded' {
  if (envelope.allocated === 0 && envelope.spent === 0) return 'unfunded';
  const avail = getEnvelopeAvailable(envelope);
  if (avail < 0) return 'overspent';
  const pct = envelope.allocated > 0 ? (envelope.spent / envelope.allocated) * 100 : 0;
  if (pct > 80) return 'warning';
  return 'healthy';
}

export function getEnvelopeProgressPct(envelope: Envelope): number {
  if (envelope.allocated === 0) return 0;
  return Math.min(100, Math.round((envelope.spent / envelope.allocated) * 100));
}

export function getTotalIncome(state: BudgetState, periodId: string): { received: number; pending: number; total: number } {
  const entries = state.incomeEntries.filter(e => e.periodId === periodId);
  const received = entries.filter(e => e.received).reduce((s, e) => s + e.amount, 0);
  const pending = entries.filter(e => !e.received).reduce((s, e) => s + e.amount, 0);
  return { received, pending, total: received + pending };
}

export function getTotalSpend(state: BudgetState, periodId: string): number {
  return state.transactions
    .filter(t => t.periodId === periodId && t.type === 'expense')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
}

export function getTotalBudgeted(state: BudgetState, periodId: string): number {
  return state.envelopes
    .filter(e => e.periodId === periodId)
    .reduce((s, e) => s + e.allocated, 0);
}

export function getBudgetHealth(state: BudgetState, periodId: string) {
  const income = getTotalIncome(state, periodId);
  const budgeted = getTotalBudgeted(state, periodId);
  const spent = getTotalSpend(state, periodId);
  const readyToAssign = getReadyToAssign(state, periodId);
  const remaining = budgeted - spent;
  const spentPct = budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0;
  return { income, budgeted, spent, remaining, readyToAssign, spentPct };
}

export function getGoalMonthsRemaining(goal: SavingsGoal): number {
  if (!goal.targetDate) return Infinity;
  const now = new Date();
  const target = new Date(goal.targetDate + 'T00:00:00');
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(0, months);
}

export function getGoalRequiredMonthly(goal: SavingsGoal): number {
  const months = getGoalMonthsRemaining(goal);
  if (months <= 0) return goal.targetAmount - goal.currentAmount;
  return Math.max(0, (goal.targetAmount - goal.currentAmount) / months);
}

export function getGoalProjectedDate(goal: SavingsGoal, monthlyContribution: number): Date | null {
  if (monthlyContribution <= 0) return null;
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return new Date();
  const months = Math.ceil(remaining / monthlyContribution);
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

export function getGoalStatus(goal: SavingsGoal): 'on-track' | 'behind' | 'reached' | 'no-date' {
  if (goal.currentAmount >= goal.targetAmount) return 'reached';
  if (!goal.targetDate) return 'no-date';
  const required = getGoalRequiredMonthly(goal);
  if (goal.monthlyContribution >= required) return 'on-track';
  return 'behind';
}

export function isGoalBehind(goal: SavingsGoal, currentMonthlyContribution: number): boolean {
  if (!goal.targetDate) return false;
  const required = getGoalRequiredMonthly(goal);
  return currentMonthlyContribution < required * 0.9;
}

export function getActivePeriod(state: BudgetState): BudgetPeriod | undefined {
  return state.periods.find(p => p.id === state.activePeriodId);
}

export function getPeriodSummary(state: BudgetState, periodId: string): PeriodSummary {
  const period = state.periods.find(p => p.id === periodId);
  if (!period) throw new Error(`Period not found: ${periodId}`);
  const health = getBudgetHealth(state, periodId);
  const envelopeCount = state.envelopes.filter(e => e.periodId === periodId).length;
  const transactionCount = state.transactions.filter(t => t.periodId === periodId).length;
  return { period, ...health, envelopeCount, transactionCount };
}

export function calculateAgeOfMoney(state: BudgetState): number {
  const incomeDates = state.incomeEntries
    .filter(e => e.received && e.amount > 0)
    .map(() => new Date().getTime());
  const expenseDates = state.transactions
    .filter(t => t.type === 'expense' && t.amount > 0)
    .map(t => new Date(t.date + 'T00:00:00').getTime());

  if (incomeDates.length === 0 || expenseDates.length === 0) return 0;

  const avgIncome = incomeDates.reduce((s, d) => s + d, 0) / incomeDates.length;
  const avgExpense = expenseDates.reduce((s, d) => s + d, 0) / expenseDates.length;
  const diffMs = avgExpense - avgIncome;
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}
