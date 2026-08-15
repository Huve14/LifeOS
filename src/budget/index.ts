export { loadState, saveState, migrateState, seedState, registerMigrator } from './store.ts';
export {
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
  getGoalProjectedDate,
  getGoalStatus,
  isGoalBehind,
  getActivePeriod,
  getPeriodSummary,
  calculateAgeOfMoney,
} from './computed.ts';
export {
  createPeriod,
  rolloverPeriod,
  addEnvelope,
  updateEnvelope,
  deleteEnvelope,
  allocateBudget,
  moveMoneyBetweenEnvelopes,
  addTransaction,
  editTransaction,
  deleteTransaction,
  bulkImportTransactions,
  categoriseTransaction,
  addIncomeEntry,
  markIncomeReceived,
  deleteIncomeEntry,
  addGoal,
  updateGoal,
  contributeToGoal,
  linkGoalToEnvelope,
} from './mutations.ts';
export { generateNudges } from './nudges.ts';
export { projectSavings, projectGoalCompletion } from './forecasting.ts';
export { getMonthlyReport, getCategorySpendHistory, getNetWorthSnapshot } from './reporting.ts';
export { setExchangeRate, convertAmount, convertAmountAtRate, getSecondaryAmount } from './currency.ts';
export {
  BudgetError,
  BudgetValidationError,
  EnvelopeNotFoundError,
  PeriodNotFoundError,
  InsufficientBudgetError,
} from './errors.ts';
export type {
  BudgetState,
  BudgetPeriod,
  IncomeEntry,
  Envelope,
  Transaction,
  SavingsGoal,
  ExchangeRate,
  MonthlyProjection,
  Nudge,
  PeriodSummary,
  MonthlyReport,
  CategorySpendHistory,
  NetWorthSnapshot,
} from './types.ts';
export { CURRENT_SCHEMA_VERSION } from './types.ts';
