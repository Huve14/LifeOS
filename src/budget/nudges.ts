import type { BudgetState, Nudge } from './types.ts';
import { getEnvelopeStatus, getEnvelopeAvailable, getEnvelopeProgressPct, getReadyToAssign, getGoalStatus, isGoalBehind, getTotalSpend, calculateAgeOfMoney, getTotalIncome, getGoalRequiredMonthly } from './computed.ts';

let nudgeCounter = 0;

function nudgeId(): string {
  return `nudge-${++nudgeCounter}`;
}

export function generateNudges(state: BudgetState, periodId: string): Nudge[] {
  const nudges: Nudge[] = [];
  const periodEnvelopes = state.envelopes.filter(e => e.periodId === periodId);

  /* Envelope > 80% spent → warning */
  for (const env of periodEnvelopes) {
    const status = getEnvelopeStatus(env);
    const pct = getEnvelopeProgressPct(env);

    if (status === 'overspent') {
      nudges.push({
        id: nudgeId(),
        type: 'danger',
        category: 'overspent',
        message: `"${env.name}" is overspent by ${Math.abs(getEnvelopeAvailable(env)).toFixed(2)}`,
        envelopeId: env.id,
      });
    } else if (pct > 80 && status === 'warning') {
      nudges.push({
        id: nudgeId(),
        type: 'warning',
        category: 'nearly-depleted',
        message: `"${env.name}" is ${pct}% spent (${env.spent.toFixed(0)} of ${env.allocated.toFixed(0)})`,
        envelopeId: env.id,
      });
    }
  }

  /* ReadyToAssign > 0 → info (idle money) */
  const rta = getReadyToAssign(state, periodId);
  if (rta > 0) {
    nudges.push({
      id: nudgeId(),
      type: 'info',
      category: 'idle-money',
      message: `You have ${rta.toFixed(2)} ready to assign — consider allocating it to a envelope or goal`,
    });
  }

  /* Goal checks */
  for (const goal of state.savingsGoals) {
    const status = getGoalStatus(goal);
    if (status === 'reached') {
      nudges.push({
        id: nudgeId(),
        type: 'success',
        category: 'goal-reached',
        message: `Goal "${goal.name}" reached! 🎉`,
        goalId: goal.id,
      });
    } else if (status === 'behind' && isGoalBehind(goal, goal.monthlyContribution)) {
      nudges.push({
        id: nudgeId(),
        type: 'warning',
        category: 'goal-behind',
        message: `"${goal.name}" is behind — current contribution (${goal.monthlyContribution}) is less than required monthly (${getGoalRequiredMonthly(goal).toFixed(0)})`,
        goalId: goal.id,
      });
    }
  }

  /* Large transaction check */
  for (const tx of state.transactions.filter(t => t.periodId === periodId && t.type === 'expense')) {
    if (tx.categoryId) {
      const envTxs = state.transactions.filter(t => t.periodId === periodId && t.categoryId === tx.categoryId && t.type === 'expense');
      const avg = envTxs.length > 0 ? envTxs.reduce((s, t) => s + Math.abs(t.amount), 0) / envTxs.length : 0;
      if (avg > 0 && Math.abs(tx.amount) > avg * 2) {
        const envelope = state.envelopes.find(e => e.id === tx.categoryId);
        nudges.push({
          id: nudgeId(),
          type: 'info',
          category: 'large-transaction',
          message: `Large transaction: ${tx.description} (${Math.abs(tx.amount).toFixed(2)}) in ${envelope?.name || 'unknown'} — double the average of ${avg.toFixed(2)}`,
          envelopeId: tx.categoryId,
        });
      }
    }
  }

  /* Age of money < 15 days */
  const aom = calculateAgeOfMoney(state);
  if (aom > 0 && aom < 15) {
    nudges.push({
      id: nudgeId(),
      type: 'warning',
      category: 'low-age-of-money',
      message: `Age of money is only ${aom} days — try to build a 30-day buffer`,
    });
  }

  /* Monthly savings below previous month */
  if (state.periods.length >= 2) {
    const sorted = [...state.periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const curIdx = sorted.findIndex(p => p.id === periodId);
    if (curIdx > 0) {
      const prevPeriod = sorted[curIdx - 1];
      const curIncome = getTotalIncome(state, periodId);
      const prevIncome = getTotalIncome(state, prevPeriod.id);
      const curSavings = curIncome.total - getTotalSpend(state, periodId);
      const prevSavings = prevIncome.total - getTotalSpend(state, prevPeriod.id);
      if (curSavings < prevSavings && curIncome.total > 0) {
        nudges.push({
          id: nudgeId(),
          type: 'warning',
          category: 'savings-declined',
          message: `Savings dropped from ${prevSavings.toFixed(0)} to ${curSavings.toFixed(0)} compared to last period`,
        });
      }
    }
  }

  return nudges;
}
