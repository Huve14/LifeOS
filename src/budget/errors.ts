export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetError';
  }
}

export class BudgetValidationError extends BudgetError {
  issues: unknown[];
  constructor(message: string, issues?: unknown[]) {
    super(message);
    this.name = 'BudgetValidationError';
    this.issues = issues || [];
  }
}

export class EnvelopeNotFoundError extends BudgetError {
  constructor(id: string) {
    super(`Envelope not found: ${id}`);
    this.name = 'EnvelopeNotFoundError';
  }
}

export class PeriodNotFoundError extends BudgetError {
  constructor(id: string) {
    super(`Period not found: ${id}`);
    this.name = 'PeriodNotFoundError';
  }
}

export class InsufficientBudgetError extends BudgetError {
  public readonly warning: boolean;
  constructor(message: string, warning = true) {
    super(message);
    this.name = 'InsufficientBudgetError';
    this.warning = warning;
  }
}
