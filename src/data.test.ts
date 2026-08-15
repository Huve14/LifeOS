import { describe, it, expect } from 'vitest';
import { samplePacking, sampleMilestones, sampleBudget, getMedicationDropdownOptions } from './data';

describe('samplePacking', () => {
  it('has 10 items', () => {
    expect(samplePacking).toHaveLength(10);
  });

  it('each item has required fields', () => {
    for (const item of samplePacking) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('checked');
    }
  });

  it('has unique IDs', () => {
    const ids = samplePacking.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('sampleMilestones', () => {
  it('has 3 items', () => {
    expect(sampleMilestones).toHaveLength(3);
  });
});

describe('sampleBudget', () => {
  it('has salary with AED and ZAR conversion', () => {
    expect(sampleBudget.salary.monthlyAED).toBe(0);
    expect(sampleBudget.salary.exchangeToZAR).toBeNull();
  });

  it('has all required budget categories', () => {
    const categories = ['rent', 'groceries', 'dining', 'transport', 'entertainment', 'wifi'];
    for (const cat of categories) {
      expect(sampleBudget).toHaveProperty(cat);
      expect(sampleBudget[cat as keyof typeof sampleBudget]).toHaveProperty('monthlyAED');
    }
  });
});

describe('getMedicationDropdownOptions', () => {
  it('returns 6 medication options', () => {
    const options = getMedicationDropdownOptions();
    expect(options).toHaveLength(6);
  });

  it('each option has id and label', () => {
    for (const opt of getMedicationDropdownOptions()) {
      expect(opt).toHaveProperty('id');
      expect(opt).toHaveProperty('label');
    }
  });
});
