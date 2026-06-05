import type { BudgetState, ExchangeRate } from './types.ts';

export function setExchangeRate(state: BudgetState, from: string, to: string, rate: number, isEstimated: boolean): BudgetState {
  const s = { ...state, exchangeRates: [...state.exchangeRates] };
  const idx = s.exchangeRates.findIndex(r => r.fromCurrency === from && r.toCurrency === to);
  const entry: ExchangeRate = { fromCurrency: from, toCurrency: to, rate, isEstimated, lastUpdated: new Date().toISOString() };
  if (idx >= 0) {
    s.exchangeRates[idx] = entry;
  } else {
    s.exchangeRates.push(entry);
  }
  return s;
}

function findRate(state: BudgetState, from: string, to: string): ExchangeRate | undefined {
  return state.exchangeRates.find(r => r.fromCurrency === from && r.toCurrency === to);
}

export function convertAmount(amount: number, from: string, to: string, state: BudgetState): number {
  if (from === to) return amount;
  const direct = findRate(state, from, to);
  if (direct) return amount * direct.rate;
  const reverse = findRate(state, to, from);
  if (reverse) return amount / reverse.rate;
  const viaUsd = findRate(state, from, 'USD');
  const usdToTarget = findRate(state, 'USD', to);
  if (viaUsd && usdToTarget) return amount * viaUsd.rate * usdToTarget.rate;
  return amount;
}

export function getSecondaryAmount(primaryAmount: number, state: BudgetState): { amount: number; currency: string; isEstimated: boolean } {
  const activePeriod = state.periods.find(p => p.id === state.activePeriodId);
  if (!activePeriod) return { amount: primaryAmount, currency: 'ZAR', isEstimated: false };

  const from = activePeriod.currency;
  const to = from === 'ZAR' ? 'AED' : 'ZAR';
  const rate = findRate(state, from, to);
  if (!rate) return { amount: primaryAmount, currency: to, isEstimated: false };

  return {
    amount: primaryAmount * rate.rate,
    currency: to,
    isEstimated: rate.isEstimated,
  };
}
