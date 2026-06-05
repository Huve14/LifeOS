import type { BudgetState, Envelope, Transaction, IncomeEntry, SavingsGoal, BudgetPeriod } from './types.ts';
import { getEnvelopeAvailable } from './computed.ts';
import { EnvelopeNotFoundError, PeriodNotFoundError, InsufficientBudgetError } from './errors.ts';

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

/* ── Period Management ── */

export function createPeriod(label: string, startDate: string, endDate: string, currency: string): BudgetPeriod {
  return { id: crypto.randomUUID(), label, startDate, endDate, currency, currencySymbol: currency === 'ZAR' ? 'R' : currency === 'AED' ? 'د.إ' : '$' };
}

export function rolloverPeriod(state: BudgetState, fromPeriodId: string, toPeriodId: string): BudgetState {
  const fromPeriod = state.periods.find(p => p.id === fromPeriodId);
  if (!fromPeriod) throw new PeriodNotFoundError(fromPeriodId);
  const toPeriod = state.periods.find(p => p.id === toPeriodId);
  if (!toPeriod) throw new PeriodNotFoundError(toPeriodId);

  const s = clone(state);
  const fromEnvelopes = s.envelopes.filter(e => e.periodId === fromPeriodId);

  const newEnvelopes: Envelope[] = fromEnvelopes.map(e => ({
    ...e,
    id: crypto.randomUUID(),
    periodId: toPeriodId,
    rollover: e.rolloverEnabled ? e.allocated + e.rollover - e.spent : 0,
    spent: 0,
  }));

  s.envelopes.push(...newEnvelopes);
  s.activePeriodId = toPeriodId;
  return s;
}

/* ── Envelope Operations ── */

export function addEnvelope(state: BudgetState, envelope: Envelope): BudgetState {
  const s = clone(state);
  s.envelopes.push(envelope);
  return s;
}

export function updateEnvelope(state: BudgetState, id: string, patch: Partial<Envelope>): BudgetState {
  const idx = state.envelopes.findIndex(e => e.id === id);
  if (idx === -1) throw new EnvelopeNotFoundError(id);
  const s = clone(state);
  s.envelopes[idx] = { ...s.envelopes[idx], ...patch };
  return s;
}

export function deleteEnvelope(state: BudgetState, id: string): BudgetState {
  const idx = state.envelopes.findIndex(e => e.id === id);
  if (idx === -1) throw new EnvelopeNotFoundError(id);
  const s = clone(state);
  s.envelopes.splice(idx, 1);
  return s;
}

export function allocateBudget(state: BudgetState, envelopeId: string, amount: number): BudgetState {
  return updateEnvelope(state, envelopeId, { allocated: amount });
}

export function moveMoneyBetweenEnvelopes(state: BudgetState, fromId: string, toId: string, amount: number): BudgetState {
  const from = state.envelopes.find(e => e.id === fromId);
  if (!from) throw new EnvelopeNotFoundError(fromId);
  const to = state.envelopes.find(e => e.id === toId);
  if (!to) throw new EnvelopeNotFoundError(toId);
  if (from.allocated < amount) throw new InsufficientBudgetError(`Source envelope "${from.name}" only has ${from.allocated} allocated`);

  let s = updateEnvelope(state, fromId, { allocated: from.allocated - amount });
  s = updateEnvelope(s, toId, { allocated: to.allocated + amount });
  return s;
}

/* ── Transaction Operations ── */

function updateEnvelopeSpent(state: BudgetState, envelopeId: string | undefined, delta: number): BudgetState {
  if (!envelopeId) return state;
  const idx = state.envelopes.findIndex(e => e.id === envelopeId);
  if (idx === -1) throw new EnvelopeNotFoundError(envelopeId);
  const s = clone(state);
  s.envelopes[idx] = { ...s.envelopes[idx], spent: Math.max(0, s.envelopes[idx].spent + delta) };
  return s;
}

export function addTransaction(state: BudgetState, tx: Transaction): BudgetState {
  let s = clone(state);
  if (tx.type === 'expense' && tx.categoryId) {
    const envelope = s.envelopes.find(e => e.id === tx.categoryId);
    if (envelope) {
      const avail = getEnvelopeAvailable(envelope);
      if (avail - Math.abs(tx.amount) < 0) {
        throw new InsufficientBudgetError(
          `Transaction would overspend "${envelope.name}" by ${Math.abs(avail - Math.abs(tx.amount)).toFixed(2)}`,
          true,
        );
      }
    }
    s = updateEnvelopeSpent(s, tx.categoryId, Math.abs(tx.amount));
  }
  s.transactions.push(tx);
  return s;
}

export function editTransaction(state: BudgetState, id: string, patch: Partial<Transaction>): BudgetState {
  const idx = state.transactions.findIndex(t => t.id === id);
  if (idx === -1) return state;
  const tx = state.transactions[idx];
  let s = clone(state);

  if (tx.type === 'expense' && tx.categoryId) {
    s = updateEnvelopeSpent(s, tx.categoryId, -Math.abs(tx.amount));
  }

  const updated = { ...tx, ...patch };
  if (updated.type === 'expense' && updated.categoryId) {
    s = updateEnvelopeSpent(s, updated.categoryId, Math.abs(updated.amount));
  }

  s.transactions[idx] = updated;
  return s;
}

export function deleteTransaction(state: BudgetState, id: string): BudgetState {
  const idx = state.transactions.findIndex(t => t.id === id);
  if (idx === -1) return state;
  const tx = state.transactions[idx];
  let s = clone(state);
  if (tx.type === 'expense' && tx.categoryId) {
    s = updateEnvelopeSpent(s, tx.categoryId, -Math.abs(tx.amount));
  }
  s.transactions.splice(idx, 1);
  return s;
}

export function bulkImportTransactions(state: BudgetState, txs: Partial<Transaction>[]): BudgetState {
  let s = clone(state);
  for (const partial of txs) {
    const tx: Transaction = {
      id: partial.id || crypto.randomUUID(),
      date: partial.date || new Date().toISOString().slice(0, 10),
      description: partial.description || '',
      amount: partial.amount || 0,
      categoryId: partial.categoryId,
      type: partial.type || 'expense',
      isRecurring: partial.isRecurring ?? false,
      tags: partial.tags || [],
      periodId: partial.periodId || state.activePeriodId,
    };
    try {
      s = addTransaction(s, tx);
    } catch {
      // skip invalid entries
    }
  }
  return s;
}

export function categoriseTransaction(state: BudgetState, txId: string, envelopeId: string): BudgetState {
  return editTransaction(state, txId, { categoryId: envelopeId });
}

/* ── Income Operations ── */

export function addIncomeEntry(state: BudgetState, entry: IncomeEntry): BudgetState {
  const s = clone(state);
  s.incomeEntries.push(entry);
  return s;
}

export function markIncomeReceived(state: BudgetState, id: string, received: boolean): BudgetState {
  const s = clone(state);
  const idx = s.incomeEntries.findIndex(e => e.id === id);
  if (idx !== -1) s.incomeEntries[idx] = { ...s.incomeEntries[idx], received };
  return s;
}

export function deleteIncomeEntry(state: BudgetState, id: string): BudgetState {
  const s = clone(state);
  const idx = s.incomeEntries.findIndex(e => e.id === id);
  if (idx !== -1) s.incomeEntries.splice(idx, 1);
  return s;
}

/* ── Savings Goal Operations ── */

export function addGoal(state: BudgetState, goal: SavingsGoal): BudgetState {
  const s = clone(state);
  s.savingsGoals.push(goal);
  return s;
}

export function updateGoal(state: BudgetState, id: string, patch: Partial<SavingsGoal>): BudgetState {
  const s = clone(state);
  const idx = s.savingsGoals.findIndex(g => g.id === id);
  if (idx !== -1) s.savingsGoals[idx] = { ...s.savingsGoals[idx], ...patch };
  return s;
}

export function contributeToGoal(state: BudgetState, goalId: string, amount: number): BudgetState {
  const s = clone(state);
  const idx = s.savingsGoals.findIndex(g => g.id === goalId);
  if (idx !== -1) {
    s.savingsGoals[idx] = {
      ...s.savingsGoals[idx],
      currentAmount: Math.min(s.savingsGoals[idx].targetAmount, s.savingsGoals[idx].currentAmount + amount),
    };
  }
  return s;
}

export function linkGoalToEnvelope(state: BudgetState, goalId: string, envelopeId: string): BudgetState {
  return updateGoal(state, goalId, { linkedEnvelopeId: envelopeId });
}
