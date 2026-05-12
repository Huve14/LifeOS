export const samplePacking = [
  { id: 'p1', name: 'Passport', category: 'Documents', checked: true },
  { id: 'p2', name: 'Health Insurance Card', category: 'Documents', checked: false },
  { id: 'p3', name: 'Phone + Charger', category: 'Electronics', checked: true },
  { id: 'p4', name: 'Power Adapter (UAE)', category: 'Electronics', checked: false },
  { id: 'p5', name: 'Light Jacket', category: 'Clothing', checked: false },
];

export const sampleMilestones = [
  { id: 'm1', title: 'Book flights', done: true, dueISO: null },
  { id: 'm2', title: 'Apply for visa', done: false, dueISO: null },
  { id: 'm3', title: 'Schedule medical check', done: false, dueISO: null },
];

export const sampleBudget = {
  salary: { monthlyAED: 12000, currency: 'AED', exchangeToINR: 22.45 },
  rent: { monthlyAED: 3000 },
  groceries: { monthlyAED: 800 },
};

export const countries = [
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', flag: '🇦🇪' },
  { code: 'IN', name: 'India', currency: 'INR', flag: '🇮🇳' },
  { code: 'US', name: 'United States', currency: 'USD', flag: '🇺🇸' },
];
