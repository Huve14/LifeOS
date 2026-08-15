export type BudgetBucket = 'essentials' | 'lifestyle' | 'future' | 'covered';

export type BudgetCategory = {
  id: string;
  label: string;
  emoji: string;
  planned: number;
  spent: number;
  bucket: BudgetBucket;
  note?: string;
  dueDay?: number;
  rollover?: boolean;
  rolloverBalance?: number;
  savedTotal?: number;
  fixed?: boolean;
  coveredByEmployer?: boolean;
};

export type BudgetTransaction = {
  id: string;
  categoryId: string;
  amount: number;
  note: string;
  date: string;
};

export type BudgetState = {
  version: number;
  currency: 'AED';
  monthlyIncome: number;
  monthly: BudgetCategory[];
  transactions: BudgetTransaction[];
  period: string;
  [key: string]: unknown;
};

export const BUDGET_VERSION = 4;

const STARTER_CATEGORIES: ReadonlyArray<Readonly<BudgetCategory>> = [
  { id: 'rent', label: 'Housing', emoji: '🏠', planned: 0, spent: 0, bucket: 'covered', note: 'Employer-provided housing', fixed: true, coveredByEmployer: true },
  { id: 'medical', label: 'Health insurance', emoji: '🩺', planned: 0, spent: 0, bucket: 'covered', note: 'Employer-provided medical cover', fixed: true, coveredByEmployer: true },
  { id: 'work-transport', label: 'Work transport', emoji: '🚌', planned: 0, spent: 0, bucket: 'covered', note: 'Employer-provided transport to work', fixed: true, coveredByEmployer: true },
  { id: 'groceries', label: 'Groceries', emoji: '🛒', planned: 1200, spent: 0, bucket: 'essentials', note: 'A practical one-person grocery basket', rollover: false },
  { id: 'mobile', label: 'Mobile plan', emoji: '📱', planned: 125, spent: 0, bucket: 'essentials', note: 'Mid-range UAE plan with data', dueDay: 2, fixed: true },
  { id: 'internet', label: 'Home Wi-Fi share', emoji: '📶', planned: 150, spent: 0, bucket: 'essentials', note: 'About half of an entry home-internet plan', dueDay: 5, fixed: true },
  { id: 'utilities', label: 'Utilities & housing extras', emoji: '⚡', planned: 250, spent: 0, bucket: 'essentials', note: 'Electricity, water or shared household costs', dueDay: 8, fixed: true },
  { id: 'personal-care', label: 'Personal care & pharmacy', emoji: '🧴', planned: 300, spent: 0, bucket: 'essentials', note: 'Toiletries, pharmacy and small health costs', rollover: false },
  { id: 'local-transport', label: 'Local trips & taxis', emoji: '🚕', planned: 300, spent: 0, bucket: 'essentials', note: 'For trips outside employer transport', rollover: false },
  { id: 'fun', label: 'Dining & coffee', emoji: '☕', planned: 600, spent: 0, bucket: 'lifestyle', note: 'Roughly four inexpensive meals plus coffee each week', rollover: false },
  { id: 'social', label: 'Social & entertainment', emoji: '🎟️', planned: 400, spent: 0, bucket: 'lifestyle', note: 'Plans, movies and time with friends', rollover: false },
  { id: 'clothing', label: 'Clothing & beauty', emoji: '✨', planned: 350, spent: 0, bucket: 'lifestyle', note: 'A flexible monthly cap', rollover: true },
  { id: 'experiences', label: 'UAE experiences', emoji: '🌴', planned: 300, spent: 0, bucket: 'lifestyle', note: 'One new local experience at a time', rollover: true },
  { id: 'flexible', label: 'Gifts & flexible', emoji: '🎁', planned: 225, spent: 0, bucket: 'lifestyle', note: 'A small buffer for real life', rollover: true },
  { id: 'emergency', label: 'Emergency reserve', emoji: '🛟', planned: 1600, spent: 0, bucket: 'future', note: 'Build toward three months of personal expenses', dueDay: 1, rollover: true, fixed: true },
  { id: 'flight-home', label: 'Flight home fund', emoji: '✈️', planned: 1000, spent: 0, bucket: 'future', note: 'A sinking fund for travel home', dueDay: 1, rollover: true, fixed: true },
  { id: 'savings', label: 'Long-term savings', emoji: '🌱', planned: 1700, spent: 0, bucket: 'future', note: 'Transfer after payday before spending', dueDay: 1, rollover: true, fixed: true },
  { id: 'annual-admin', label: 'Annual & admin fund', emoji: '📆', planned: 300, spent: 0, bucket: 'future', note: 'Renewals, fees and irregular costs', dueDay: 1, rollover: true, fixed: true },
];

export function createAbuDhabiBudget(): BudgetCategory[] {
  return STARTER_CATEGORIES.map(category => ({ ...category }));
}

function asMoney(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function upgradeBudget(input: unknown, now = new Date()): BudgetState {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const oldMonthly = Array.isArray(source.monthly) ? source.monthly as Array<Record<string, unknown>> : [];
  const period = monthKey(now);

  if (Number(source.version) >= BUDGET_VERSION && oldMonthly.length > 0) {
    const isNewMonth = typeof source.period === 'string' && source.period !== period;
    return {
      ...source,
      version: BUDGET_VERSION,
      currency: 'AED',
      monthlyIncome: asMoney(source.monthlyIncome),
      monthly: oldMonthly.map(category => ({
        ...(category as unknown as BudgetCategory),
        planned: asMoney(category.planned),
        spent: isNewMonth ? 0 : asMoney(category.spent),
        savedTotal: category.bucket === 'future'
          ? asMoney(category.savedTotal) + (isNewMonth ? asMoney(category.spent) : 0)
          : asMoney(category.savedTotal),
        rolloverBalance: isNewMonth
          ? (category.rollover && category.bucket !== 'future'
            ? Math.max(0, asMoney(category.planned) + asMoney(category.rolloverBalance) - asMoney(category.spent))
            : 0)
          : asMoney(category.rolloverBalance),
      })),
      transactions: Array.isArray(source.transactions) ? source.transactions as BudgetTransaction[] : [],
      period,
    } as BudgetState;
  }

  const previous = new Map(oldMonthly.map(category => [String(category.id || ''), category]));
  const defaults = createAbuDhabiBudget().map(category => {
    const old = previous.get(category.id);
    return old ? { ...category, spent: asMoney(old.spent) } : category;
  });
  const retiredIds = new Set(['utilities', 'groceries', 'fun', 'savings']);
  const starterIds = new Set(defaults.map(category => category.id));
  const custom = oldMonthly
    .filter(category => {
      const id = String(category.id || '');
      return id && !retiredIds.has(id) && !starterIds.has(id);
    })
    .map(category => ({
      id: String(category.id),
      label: String(category.label || 'Custom category'),
      emoji: String(category.emoji || '📌'),
      planned: asMoney(category.planned),
      spent: asMoney(category.spent),
      bucket: 'lifestyle' as const,
      note: 'Kept from your previous budget',
      rollover: Boolean(category.rollover),
      fixed: Boolean(category.fixed),
    }));

  return {
    ...source,
    version: BUDGET_VERSION,
    currency: 'AED',
    monthlyIncome: asMoney(source.monthlyIncome),
    monthly: [...defaults, ...custom],
    transactions: Array.isArray(source.transactions) ? source.transactions as BudgetTransaction[] : [],
    period,
  } as BudgetState;
}

export function summarizeBudget(categories: BudgetCategory[], income: number, now = new Date()) {
  const active = categories.filter(category => !category.coveredByEmployer && category.bucket !== 'covered');
  const planned = active.reduce((sum, category) => sum + asMoney(category.planned), 0);
  const tracked = active.reduce((sum, category) => sum + asMoney(category.spent), 0);
  const future = active.filter(category => category.bucket === 'future');
  const futurePlanned = future.reduce((sum, category) => sum + asMoney(category.planned), 0);
  const futureTracked = future.reduce((sum, category) => sum + asMoney(category.spent), 0);
  const flexible = active.filter(category => category.bucket === 'lifestyle' || (!category.fixed && category.bucket === 'essentials'));
  const flexibleRemaining = flexible.reduce((sum, category) => sum + Math.max(0, asMoney(category.planned) + asMoney(category.rolloverBalance) - asMoney(category.spent)), 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);

  return {
    planned,
    tracked,
    remainingIncome: income - tracked,
    leftToAssign: income - planned,
    savingsPlanned: futurePlanned,
    savingsTracked: futureTracked,
    savingsRate: income > 0 ? Math.round((futurePlanned / income) * 100) : 0,
    flexibleRemaining,
    safePerDay: Math.floor(flexibleRemaining / daysRemaining),
    daysRemaining,
    isBalanced: Math.abs(income - planned) < 0.01,
  };
}
