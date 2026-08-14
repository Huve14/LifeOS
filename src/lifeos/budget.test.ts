import { describe, expect, it } from 'vitest';
import { createAbuDhabiBudget, summarizeBudget, upgradeBudget } from './budget';

describe('Abu Dhabi budget plan', () => {
  it('assigns the full AED 8,800 income and protects over half for the future', () => {
    const categories = createAbuDhabiBudget();
    const summary = summarizeBudget(categories, 8800, new Date(2026, 7, 14));

    expect(summary.planned).toBe(8800);
    expect(summary.leftToAssign).toBe(0);
    expect(summary.savingsPlanned).toBe(4600);
    expect(summary.savingsRate).toBe(52);
  });

  it('does not count employer-covered benefits as spendable targets', () => {
    const categories = createAbuDhabiBudget();
    const covered = categories.filter(category => category.coveredByEmployer);
    const summary = summarizeBudget(categories, 8800, new Date(2026, 7, 14));

    expect(covered.map(category => category.id)).toEqual(['rent', 'medical', 'work-transport']);
    expect(summary.isBalanced).toBe(true);
  });

  it('upgrades the old four-category budget and preserves tracked amounts', () => {
    const upgraded = upgradeBudget({
      monthlyIncome: 8800,
      monthly: [
        { id: 'groceries', label: 'Food', planned: 1200, spent: 375 },
        { id: 'fun', label: 'Fun', planned: 700, spent: 120 },
      ],
    });

    expect(upgraded.version).toBe(4);
    expect(upgraded.monthly.find(category => category.id === 'groceries')?.spent).toBe(375);
    expect(upgraded.monthly.find(category => category.id === 'fun')?.spent).toBe(120);
    expect(upgraded.transactions).toEqual([]);
  });

  it('rolls unused sinking-fund money into a new month and resets spending', () => {
    const old = upgradeBudget({}, new Date(2026, 6, 20));
    old.monthly = old.monthly.map(category => category.id === 'clothing'
      ? { ...category, spent: 100 }
      : category);
    const next = upgradeBudget(old, new Date(2026, 7, 1));
    const clothing = next.monthly.find(category => category.id === 'clothing');

    expect(clothing?.spent).toBe(0);
    expect(clothing?.rolloverBalance).toBe(250);
    expect(next.period).toBe('2026-08');
  });

  it('calculates the safe daily pace from flexible money left', () => {
    const categories = createAbuDhabiBudget().map(category =>
      category.id === 'groceries' ? { ...category, spent: 300 } : category
    );
    const summary = summarizeBudget(categories, 8800, new Date(2026, 7, 14));

    expect(summary.flexibleRemaining).toBe(3375);
    expect(summary.daysRemaining).toBe(18);
    expect(summary.safePerDay).toBe(187);
  });
});
