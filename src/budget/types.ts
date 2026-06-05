import { z } from 'zod';

export const CurrencySchema = z.string().min(1).max(10);

export const BudgetPeriodSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: CurrencySchema,
  currencySymbol: z.string().min(1).max(5),
});

export const IncomeEntrySchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  amount: z.number().nonnegative(),
  received: z.boolean(),
  periodId: z.string().min(1),
});

export const EnvelopeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().optional(),
  allocated: z.number().nonnegative(),
  spent: z.number().nonnegative(),
  rollover: z.number().nonnegative(),
  rolloverEnabled: z.boolean(),
  periodId: z.string().min(1),
});

export const TransactionSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  amount: z.number(),
  categoryId: z.string().optional(),
  type: z.enum(['expense', 'income', 'transfer']),
  isRecurring: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  periodId: z.string().min(1),
});

export const SavingsGoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  monthlyContribution: z.number().nonnegative(),
  linkedEnvelopeId: z.string().optional(),
});

export const ExchangeRateSchema = z.object({
  fromCurrency: z.string().min(1),
  toCurrency: z.string().min(1),
  rate: z.number().positive(),
  isEstimated: z.boolean(),
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
});

export const BudgetStateSchema = z.object({
  schemaVersion: z.number().int().positive(),
  activePeriodId: z.string().min(1),
  periods: z.array(BudgetPeriodSchema),
  incomeEntries: z.array(IncomeEntrySchema),
  envelopes: z.array(EnvelopeSchema),
  transactions: z.array(TransactionSchema),
  savingsGoals: z.array(SavingsGoalSchema),
  exchangeRates: z.array(ExchangeRateSchema),
});

export type BudgetPeriod = z.infer<typeof BudgetPeriodSchema>;
export type IncomeEntry = z.infer<typeof IncomeEntrySchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type SavingsGoal = z.infer<typeof SavingsGoalSchema>;
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;
export type BudgetState = z.infer<typeof BudgetStateSchema>;

export interface MonthlyProjection {
  month: string;
  label: string;
  projectedSavings: number;
  projectedBalance: number;
}

export interface Nudge {
  id: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  category: string;
  message: string;
  envelopeId?: string;
  goalId?: string;
}

export interface PeriodSummary {
  period: BudgetPeriod;
  income: { received: number; pending: number; total: number };
  budgeted: number;
  spent: number;
  remaining: number;
  readyToAssign: number;
  spentPct: number;
  envelopeCount: number;
  transactionCount: number;
}

export interface MonthlyReport {
  income: number;
  budgeted: number;
  spent: number;
  saved: number;
  savingsRate: number;
  envelopeSummaries: { envelopeId: string; name: string; allocated: number; spent: number; status: string }[];
  topSpendCategories: { envelopeId: string; name: string; spent: number }[];
  nudges: Nudge[];
}

export interface CategorySpendHistory {
  periodId: string;
  periodLabel: string;
  spent: number;
  allocated: number;
}

export interface NetWorthSnapshot {
  totalSavings: number;
  goalProgress: { goalId: string; name: string; currentAmount: number; targetAmount: number; pct: number }[];
  date: string;
}

export const CURRENT_SCHEMA_VERSION = 1;
